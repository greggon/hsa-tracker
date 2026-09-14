import { and, desc, eq, isNull, like, ne, sql } from 'drizzle-orm';
import { buildChartGeometry, buildDailySeries, buildSeries } from '$lib/chart';
import { rankProviders } from '$lib/providers';
import type { ChartGeometry, DayPoint, YearPoint } from '$lib/chart';
import { db } from './index';
import { documents, expenses } from './schema';

export type { ChartGeometry, ChartReading, DayPoint, Tick, YearPoint } from '$lib/chart';

/**
 * The numbers behind the vault screen.
 *
 * The artboard's chart geometry came from a `DCLogic` block with hard-coded
 * arrays and a fixed `max = 20000`. The projection is reproduced faithfully
 * here; the data and the scale are not — both are derived from real rows.
 */

export type IncompleteReason = 'amount' | 'provider' | 'document';

export type IncompleteReceipt = {
	id: number;
	serviceDate: string;
	provider: string | null;
	amountCents: number | null;
	/** Every missing piece, so the rail can name the first one. */
	reasons: IncompleteReason[];
};

export type VaultStats = {
	/** Hero figure: unreimbursed spend whose amount is known. */
	totalCents: number;
	/** The part of `totalCents` on receipts that are complete — what you could actually prove. */
	documentedCents: number;
	/** `totalCents - documentedCents`: counted, but not yet defensible. */
	undocumentedCents: number;
	/** Unreimbursed receipts backing the total. */
	receiptCount: number;
	/** Earliest service date among them, `YYYY-MM-DD`, or null when there are none. */
	oldestServiceDate: string | null;
	/** This calendar year's contribution — the artboard's "+$1,918 this year". */
	currentYearCents: number;
	incomplete: IncompleteReceipt[];
	/** Every day with a filing, for the cumulative line. */
	days: DayPoint[];
	/** Annual totals, for the per-year bars. */
	series: YearPoint[];
	chart: ChartGeometry;
};

/** Everything missing from a receipt, in the order the rail should mention it. */
function missingFrom(row: {
	amountCents: number | null;
	provider: string | null;
	docId: number | null;
}): IncompleteReason[] {
	const reasons: IncompleteReason[] = [];
	if (row.amountCents == null) reasons.push('amount');
	if (!row.provider?.trim()) reasons.push('provider');
	if (row.docId == null) reasons.push('document');
	return reasons;
}

/**
 * One pass over a user's live expenses produces every figure on the vault.
 *
 * Deliberately a single query aggregated in JS rather than several aggregate
 * queries: the figures are interdependent (the documented split, the series and
 * the incomplete list all partition the same rows), and one readable pass over a
 * personal ledger's worth of receipts costs nothing.
 */
export function getVaultStats(userId: number, now = new Date()): VaultStats {
	const rows = db
		.select({
			id: expenses.id,
			serviceDate: expenses.serviceDate,
			provider: expenses.provider,
			amountCents: expenses.amountCents,
			reimbursedAt: expenses.reimbursedAt,
			docId: documents.id
		})
		.from(expenses)
		.leftJoin(documents, and(eq(documents.expenseId, expenses.id), eq(documents.isPrimary, 1)))
		.where(and(eq(expenses.userId, userId), isNull(expenses.deletedAt)))
		.all();

	const unreimbursed = rows.filter((r) => r.reimbursedAt == null);

	let totalCents = 0;
	let documentedCents = 0;
	let currentYearCents = 0;
	let oldestServiceDate: string | null = null;
	const incomplete: IncompleteReceipt[] = [];
	const currentYear = String(now.getFullYear());

	for (const row of unreimbursed) {
		const reasons = missingFrom(row);

		if (row.amountCents != null) {
			totalCents += row.amountCents;
			if (reasons.length === 0) documentedCents += row.amountCents;
			if (row.serviceDate.startsWith(currentYear)) currentYearCents += row.amountCents;
		}

		if (reasons.length > 0) {
			incomplete.push({
				id: row.id,
				serviceDate: row.serviceDate,
				provider: row.provider,
				amountCents: row.amountCents,
				reasons
			});
		}

		if (oldestServiceDate == null || row.serviceDate < oldestServiceDate) {
			oldestServiceDate = row.serviceDate;
		}
	}

	// Most recently dated first — the rail shows the freshest problems.
	incomplete.sort((a, b) =>
		a.serviceDate < b.serviceDate ? 1 : a.serviceDate > b.serviceDate ? -1 : 0
	);

	const days = buildDailySeries(unreimbursed);
	const series = buildSeries(unreimbursed, now.getFullYear());
	// Local date, so "today" matches the date a receipt filed right now would get.
	const throughDate = now.toLocaleDateString('en-CA');

	return {
		totalCents,
		documentedCents,
		undocumentedCents: totalCents - documentedCents,
		receiptCount: unreimbursed.length,
		oldestServiceDate,
		currentYearCents,
		incomplete,
		days,
		series,
		chart: buildChartGeometry(days, series, throughDate)
	};
}

/** A receipt as both the vault and the receipts list render it. */
export type ReceiptRow = {
	id: number;
	serviceDate: string;
	provider: string | null;
	amountCents: number | null;
	reimbursedAt: Date | null;
	docId: number | null;
	hasThumb: boolean;
	/** Empty when nothing is missing. */
	reasons: IncompleteReason[];
};

/**
 * Live receipts, newest first, optionally narrowed to one filing year.
 *
 * Shared so a row's status tag means the same thing wherever it is drawn. The
 * thumbnail is reported as a flag, not bytes: they are fetched per row from
 * /documents/[id]?thumb rather than inlined into the page.
 */
export function listReceipts(userId: number, options: { year?: number } = {}): ReceiptRow[] {
	const filters = [eq(expenses.userId, userId), isNull(expenses.deletedAt)];
	if (options.year) filters.push(like(expenses.serviceDate, `${options.year}-%`));

	return db
		.select({
			id: expenses.id,
			serviceDate: expenses.serviceDate,
			provider: expenses.provider,
			amountCents: expenses.amountCents,
			reimbursedAt: expenses.reimbursedAt,
			docId: documents.id,
			hasThumb: sql<number>`(${documents.thumb} is not null)`
		})
		.from(expenses)
		.leftJoin(documents, and(eq(documents.expenseId, expenses.id), eq(documents.isPrimary, 1)))
		.where(and(...filters))
		.orderBy(desc(expenses.serviceDate), desc(expenses.id))
		.all()
		.map((r) => ({ ...r, hasThumb: r.hasThumb === 1, reasons: missingFrom(r) }));
}

/**
 * The user's providers, most-used first, for the autocomplete on the provider
 * field. Reimbursed receipts count — a clinic you have been paid back for is
 * still one you go to — but deleted ones do not.
 */
export function getProviderSuggestions(userId: number): string[] {
	const rows = db
		.select({ provider: expenses.provider, serviceDate: expenses.serviceDate })
		.from(expenses)
		.where(and(eq(expenses.userId, userId), isNull(expenses.deletedAt)))
		.all();

	return rankProviders(rows);
}

/** Every year the user has filed something against, newest first. */
export function getFilingYears(userId: number): number[] {
	return db
		.selectDistinct({ year: sql<string>`substr(${expenses.serviceDate}, 1, 4)` })
		.from(expenses)
		.where(and(eq(expenses.userId, userId), isNull(expenses.deletedAt)))
		.all()
		.map((r) => Number(r.year))
		.filter((y) => Number.isFinite(y))
		.sort((a, b) => b - a);
}

/**
 * Just the hero figure, for callers that need it without the rest of the vault.
 *
 * Used either side of filing a receipt so the capture flow can show the total
 * moving — the artboard's "was $18,336.46".
 */
export function getUnreimbursedTotalCents(userId: number): number {
	const rows = db
		.select({ amountCents: expenses.amountCents })
		.from(expenses)
		.where(
			and(eq(expenses.userId, userId), isNull(expenses.deletedAt), isNull(expenses.reimbursedAt))
		)
		.all();

	return rows.reduce((sum, r) => sum + (r.amountCents ?? 0), 0);
}

/**
 * Expenses whose primary image is byte-identical to another expense's.
 *
 * Backs the receipt checklist's "not a duplicate" line. `documents.sha256` is
 * already written on every upload, so this costs one grouped scan.
 */
export function findDuplicateExpenseIds(userId: number): Set<number> {
	// Joined to live expenses only, so a deleted receipt cannot keep its twin
	// flagged as a duplicate.
	const docs = db
		.select({ expenseId: documents.expenseId, sha256: documents.sha256 })
		.from(documents)
		.innerJoin(expenses, eq(expenses.id, documents.expenseId))
		.where(
			and(eq(documents.userId, userId), eq(documents.isPrimary, 1), isNull(expenses.deletedAt))
		)
		.all();

	const byHash = new Map<string, number[]>();
	for (const d of docs) {
		if (d.expenseId == null) continue;
		const seen = byHash.get(d.sha256);
		if (seen) seen.push(d.expenseId);
		else byHash.set(d.sha256, [d.expenseId]);
	}

	const duplicates = new Set<number>();
	for (const ids of byHash.values()) {
		// Several documents on one expense are pages of one receipt, not copies.
		const distinct = new Set(ids);
		if (distinct.size > 1) for (const id of distinct) duplicates.add(id);
	}
	return duplicates;
}

/**
 * The receipt detail screen's "Will this hold up?" checks.
 *
 * Each is something the database can actually answer.
 */
export type ReceiptAudit = {
	hasImage: boolean;
	fieldsComplete: boolean;
	notReimbursed: boolean;
	notDuplicate: boolean;
};

export function auditReceipt(userId: number, expenseId: number): ReceiptAudit | null {
	const row = db
		.select({
			serviceDate: expenses.serviceDate,
			amountCents: expenses.amountCents,
			provider: expenses.provider,
			reimbursedAt: expenses.reimbursedAt,
			docId: documents.id,
			sha256: documents.sha256
		})
		.from(expenses)
		.leftJoin(documents, and(eq(documents.expenseId, expenses.id), eq(documents.isPrimary, 1)))
		.where(and(eq(expenses.id, expenseId), eq(expenses.userId, userId), isNull(expenses.deletedAt)))
		.get();

	if (!row) return null;

	// A twin is the same bytes filed against a different *live* expense. The join
	// matters: without it a receipt stays flagged as a duplicate of one that was
	// deleted. Documents with no expense drop out for free, since `expense_id !=
	// n` is NULL for them.
	let notDuplicate = true;
	if (row.sha256) {
		const twin = db
			.select({ id: documents.id })
			.from(documents)
			.innerJoin(expenses, eq(expenses.id, documents.expenseId))
			.where(
				and(
					eq(documents.userId, userId),
					eq(documents.sha256, row.sha256),
					eq(documents.isPrimary, 1),
					ne(documents.expenseId, expenseId),
					isNull(expenses.deletedAt)
				)
			)
			.get();
		notDuplicate = !twin;
	}

	return {
		hasImage: row.docId != null,
		fieldsComplete: row.amountCents != null && !!row.provider?.trim() && !!row.serviceDate?.trim(),
		notReimbursed: row.reimbursedAt == null,
		notDuplicate
	};
}
