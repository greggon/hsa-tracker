import { and, eq, isNull } from 'drizzle-orm';
import { error, fail, redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { documents, expenses } from '$lib/server/db/schema';
import { auditReceipt } from '$lib/server/db/stats';
import { AMOUNT_ERROR, toCents } from '$lib/server/money';

/** Loads the receipt, scoped to the signed-in user and excluding soft-deleted rows. */
function findReceipt(userId: number, id: number) {
	return db
		.select({
			id: expenses.id,
			serviceDate: expenses.serviceDate,
			provider: expenses.provider,
			amountCents: expenses.amountCents,
			reimbursedAt: expenses.reimbursedAt,
			docId: documents.id,
			originalFilename: documents.originalFilename,
			byteSize: documents.byteSize,
			mimeType: documents.mimeType,
			webKey: documents.webKey,
			addedAt: documents.createdAt
		})
		.from(expenses)
		.leftJoin(documents, and(eq(documents.expenseId, expenses.id), eq(documents.isPrimary, 1)))
		.where(and(eq(expenses.id, id), eq(expenses.userId, userId), isNull(expenses.deletedAt)))
		.get();
}

export const load = ({ params, locals }) => {
	const id = Number(params.id);
	if (!Number.isInteger(id)) error(404, 'Not found');

	const receipt = findReceipt(locals.userId, id);
	if (!receipt) error(404, 'Not found');

	return { receipt, audit: auditReceipt(locals.userId, id)! };
};

export const actions = {
	save: async ({ params, request, locals }) => {
		const id = Number(params.id);
		const existing = db
			.select()
			.from(expenses)
			.where(
				and(eq(expenses.id, id), eq(expenses.userId, locals.userId), isNull(expenses.deletedAt))
			)
			.get();
		if (!existing) return fail(404, { error: 'Not found.' });

		const form = await request.formData();

		const serviceDate = String(form.get('serviceDate') ?? '');
		if (!/^\d{4}-\d{2}-\d{2}$/.test(serviceDate)) {
			return fail(400, { error: 'Enter a valid date.' });
		}

		let amountCents: number | null;
		try {
			amountCents = toCents(String(form.get('amount') ?? ''));
		} catch {
			return fail(400, { error: AMOUNT_ERROR });
		}

		db.update(expenses)
			.set({
				serviceDate,
				amountCents,
				provider: String(form.get('provider') ?? '') || null,
				updatedAt: new Date()
			})
			.where(and(eq(expenses.id, id), eq(expenses.userId, locals.userId)))
			.run();

		return { saved: true };
	},

	/** Toggles, so the same button can undo a reimbursement recorded by mistake. */
	reimburse: async ({ params, locals }) => {
		const id = Number(params.id);
		const existing = db
			.select()
			.from(expenses)
			.where(
				and(eq(expenses.id, id), eq(expenses.userId, locals.userId), isNull(expenses.deletedAt))
			)
			.get();
		if (!existing) return fail(404, { error: 'Not found.' });

		const nowReimbursed = existing.reimbursedAt == null;
		db.update(expenses)
			.set({
				reimbursedAt: nowReimbursed ? new Date() : null,
				reimbursedAmountCents: nowReimbursed ? (existing.amountCents ?? 0) : 0,
				updatedAt: new Date()
			})
			.where(and(eq(expenses.id, id), eq(expenses.userId, locals.userId)))
			.run();

		return { saved: true };
	},

	/**
	 * Soft delete only. The image stays on disk and the row stays in the table —
	 * this is a vault whose whole point is that nothing becomes unprovable years
	 * later, so "Delete" removes a receipt from view, not from the record.
	 */
	remove: async ({ params, locals }) => {
		const id = Number(params.id);
		const result = db
			.update(expenses)
			.set({ deletedAt: new Date(), updatedAt: new Date() })
			.where(
				and(eq(expenses.id, id), eq(expenses.userId, locals.userId), isNull(expenses.deletedAt))
			)
			.run();

		if (result.changes === 0) return fail(404, { error: 'Not found.' });
		redirect(303, '/');
	}
};
