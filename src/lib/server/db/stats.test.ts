import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
// Replaces the database module wholesale, so nothing here can open a file.
vi.mock('./index', async () => {
	const { makeTestDb } = await import('./testdb');
	return makeTestDb();
});

import { db } from './index';
import { documents, expenses, users } from './schema';
import {
	auditReceipt,
	findDuplicateExpenseIds,
	getFilingYears,
	getUnreimbursedTotalCents,
	getVaultStats,
	listReceipts
} from './stats';

describe('against a real database', () => {
	const NOW = new Date('2026-09-13T12:00:00');
	const OWNER = 1;
	const STRANGER = 2;

	/**
	 * Re-seeded before every test, not once for the file. Several tests mutate
	 * these rows — one soft-deletes a receipt to prove its twin stops being
	 * flagged as a duplicate — and with a shared fixture that left the outcome
	 * of every later test depending on the order it happened to run in.
	 */
	beforeEach(() => {
		db.delete(documents).run();
		db.delete(expenses).run();
		db.delete(users).run();

		db.insert(users)
			.values([
				{ id: OWNER, email: 'owner@example.test' },
				{ id: STRANGER, email: 'stranger@example.test' }
			])
			.run();

		db.insert(expenses)
			.values([
				{
					id: 1,
					userId: OWNER,
					serviceDate: '2024-05-01',
					amountCents: 10000,
					provider: 'Complete Clinic'
				},
				{
					id: 2,
					userId: OWNER,
					serviceDate: '2026-02-01',
					amountCents: 5000,
					provider: 'Also Complete'
				},
				// each of the three ways a receipt can be incomplete
				{
					id: 3,
					userId: OWNER,
					serviceDate: '2026-03-01',
					amountCents: null,
					provider: 'LensCrafters'
				},
				{ id: 4, userId: OWNER, serviceDate: '2026-04-01', amountCents: 2500, provider: null },
				{
					id: 5,
					userId: OWNER,
					serviceDate: '2026-05-01',
					amountCents: 1000,
					provider: 'No Image Co'
				},
				// neither of these may reach any figure
				{
					id: 6,
					userId: OWNER,
					serviceDate: '2026-06-01',
					amountCents: 99999,
					provider: 'Reimbursed',
					reimbursedAt: new Date('2026-06-02')
				},
				{
					id: 7,
					userId: OWNER,
					serviceDate: '2026-07-01',
					amountCents: 88888,
					provider: 'Deleted',
					deletedAt: new Date('2026-07-02')
				},
				// nor may another user's ledger
				{
					id: 8,
					userId: STRANGER,
					serviceDate: '2026-01-01',
					amountCents: 77777,
					provider: 'Not Yours'
				}
			])
			.run();

		// Expense 5 deliberately has no document.
		db.insert(documents)
			.values(
				[1, 2, 3, 4].map((expenseId) => ({
					userId: OWNER,
					expenseId,
					storageKey: `${expenseId}.jpg`,
					mimeType: 'image/jpeg',
					byteSize: 10,
					sha256: `hash-${expenseId}`,
					isPrimary: 1
				}))
			)
			.run();
	});

	describe('getVaultStats', () => {
		it('totals only unreimbursed, undeleted rows with a known amount', () => {
			const v = getVaultStats(OWNER, NOW);
			expect(v.totalCents).toBe(10000 + 5000 + 2500 + 1000);
			expect(v.receiptCount).toBe(5);
			expect(v.oldestServiceDate).toBe('2024-05-01');
			expect(v.currentYearCents).toBe(5000 + 2500 + 1000);
		});

		it('splits what is provable from what is merely counted', () => {
			const v = getVaultStats(OWNER, NOW);
			expect(v.documentedCents).toBe(10000 + 5000);
			expect(v.undocumentedCents).toBe(2500 + 1000);
		});

		it('names every missing field, newest first', () => {
			const v = getVaultStats(OWNER, NOW);
			expect(v.incomplete.map((r) => r.id)).toEqual([5, 4, 3]);
			expect(v.incomplete.find((r) => r.id === 3)?.reasons).toEqual(['amount']);
			expect(v.incomplete.find((r) => r.id === 4)?.reasons).toEqual(['provider']);
			expect(v.incomplete.find((r) => r.id === 5)?.reasons).toEqual(['document']);
		});

		it('builds a daily line and an annual axis', () => {
			const v = getVaultStats(OWNER, NOW);
			expect(v.days.map((d) => d.date)).toEqual([
				'2024-05-01',
				'2026-02-01',
				'2026-04-01',
				'2026-05-01'
			]);
			expect(v.days.map((d) => d.cumulativeCents)).toEqual([10000, 15000, 17500, 18500]);
			expect(v.chart.ticks.map((t) => t.label)).toEqual(['2024', '2025', '2026']);
			expect(v.chart.years).toEqual([2024, 2025, 2026]);
			expect(v.chart.linePath.endsWith('H1000')).toBe(true);
		});

		it('keeps one user out of another’s ledger', () => {
			expect(getVaultStats(STRANGER, NOW).totalCents).toBe(77777);
		});

		it('returns zeroes rather than crashing on an empty ledger', () => {
			const v = getVaultStats(999, NOW);
			expect(v).toMatchObject({ totalCents: 0, receiptCount: 0, oldestServiceDate: null });
			expect(v.days).toEqual([]);
			expect(v.chart.linePath).toBe('');
		});
	});

	describe('listReceipts', () => {
		it('returns live receipts newest first, reimbursed ones included', () => {
			const rows = listReceipts(OWNER);
			expect(rows.map((r) => r.id)).toEqual([6, 5, 4, 3, 2, 1]);
		});

		it('leaves out deleted receipts and other people\u2019s', () => {
			const ids = listReceipts(OWNER).map((r) => r.id);
			expect(ids).not.toContain(7);
			expect(ids).not.toContain(8);
		});

		it('narrows to one filing year', () => {
			expect(listReceipts(OWNER, { year: 2024 }).map((r) => r.id)).toEqual([1]);
			expect(listReceipts(OWNER, { year: 1999 })).toEqual([]);
		});

		it('carries the same reasons the vault rail shows', () => {
			const rows = listReceipts(OWNER);
			expect(rows.find((r) => r.id === 3)?.reasons).toEqual(['amount']);
			expect(rows.find((r) => r.id === 4)?.reasons).toEqual(['provider']);
			expect(rows.find((r) => r.id === 5)?.reasons).toEqual(['document']);
			expect(rows.find((r) => r.id === 1)?.reasons).toEqual([]);
		});

		it('never carries image bytes', () => {
			const row = listReceipts(OWNER).find((r) => r.id === 1)!;
			expect(row).not.toHaveProperty('thumb');
		});
	});

	describe('getFilingYears', () => {
		it('lists every year filed against, newest first', () => {
			expect(getFilingYears(OWNER)).toEqual([2026, 2024]);
		});

		it('is empty for someone with nothing filed', () => {
			expect(getFilingYears(999)).toEqual([]);
		});
	});

	describe('getUnreimbursedTotalCents', () => {
		it('matches the vault total, so the capture flow can show it move', () => {
			expect(getUnreimbursedTotalCents(OWNER)).toBe(getVaultStats(OWNER, NOW).totalCents);
		});
	});

	describe('auditReceipt', () => {
		it('passes a complete receipt', () => {
			expect(auditReceipt(OWNER, 1)).toEqual({
				hasImage: true,
				fieldsComplete: true,
				notReimbursed: true,
				notDuplicate: true
			});
		});

		it('reports an unreadable amount as an incomplete field', () => {
			expect(auditReceipt(OWNER, 3)?.fieldsComplete).toBe(false);
		});

		it('reports a missing image', () => {
			expect(auditReceipt(OWNER, 5)?.hasImage).toBe(false);
		});

		it('does not find a deleted or foreign receipt', () => {
			expect(auditReceipt(OWNER, 7)).toBeNull();
			expect(auditReceipt(OWNER, 8)).toBeNull();
		});
	});

	describe('findDuplicateExpenseIds', () => {
		it('finds none among distinct images', () => {
			expect([...findDuplicateExpenseIds(OWNER)]).toEqual([]);
		});

		/** Two receipts, 10 and 11, filed against byte-identical images. */
		function seedDuplicatePair() {
			db.insert(expenses)
				.values([
					{
						id: 10,
						userId: OWNER,
						serviceDate: '2026-08-01',
						amountCents: 4200,
						provider: 'Dupe A'
					},
					{
						id: 11,
						userId: OWNER,
						serviceDate: '2026-08-02',
						amountCents: 4200,
						provider: 'Dupe B'
					}
				])
				.run();
			db.insert(documents)
				.values(
					[10, 11].map((expenseId) => ({
						userId: OWNER,
						expenseId,
						storageKey: `${expenseId}.jpg`,
						mimeType: 'image/jpeg',
						byteSize: 10,
						sha256: 'identical-bytes',
						isPrimary: 1
					}))
				)
				.run();
		}

		it('flags both sides of a pair sharing one image', () => {
			seedDuplicatePair();
			expect([...findDuplicateExpenseIds(OWNER)].sort((a, b) => a - b)).toEqual([10, 11]);
			expect(auditReceipt(OWNER, 10)?.notDuplicate).toBe(false);
		});

		it('stops flagging the survivor once its twin is deleted', () => {
			seedDuplicatePair();
			db.update(expenses).set({ deletedAt: new Date() }).where(eq(expenses.id, 11)).run();
			expect([...findDuplicateExpenseIds(OWNER)]).toEqual([]);
			expect(auditReceipt(OWNER, 10)?.notDuplicate).toBe(true);
		});
	});
});
