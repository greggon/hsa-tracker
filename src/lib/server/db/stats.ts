import { and, eq, isNull, ne } from 'drizzle-orm';
import { db } from './index';
import { documents, expenses, users } from './schema';

/**
 * The numbers behind the vault screen.
 *
 * The artboard's chart geometry came from a `DCLogic` block with hard-coded
 * arrays and a fixed `max = 20000`. The projection is reproduced faithfully
 * here; the data and the scale are not — both are derived from real rows.
 */

/** Chart viewport, from the artboard's `viewBox="0 0 1000 200"`. */
export const CHART_W = 1000;
export const CHART_H = 200;
const CHART_TOP = 12;
const CHART_BOTTOM_PAD = 4;

export type YearPoint = {
	year: number;
	/** Unreimbursed, amount-known spend filed against this year. */
	yearCents: number;
	/** Running total through the end of this year. */
	cumulativeCents: number;
};

export type ChartGeometry = {
	/** Cumulative line, as an SVG path `d`. Empty string when there is no data. */
	linePath: string;
	/** The same line closed along the baseline, for the gradient fill. */
	areaPath: string;
	/** Per-year bars as a single path. Scaled to its own maximum, not the cumulative one. */
	barsPath: string;
	years: number[];
	/** Ceiling the cumulative line is scaled against. */
	cumulativeMaxCents: number;
	/** Ceiling the bars are scaled against. */
	yearMaxCents: number;
};

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
	series: YearPoint[];
	chart: ChartGeometry;
};

/**
 * Round up to a readable axis ceiling (1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 7.5, 10
 * times a power of ten). The artboard's cumulative peak of 18,420 lands on
 * 20,000 — the constant it had hard-coded.
 */
export function niceCeil(value: number): number {
	if (!Number.isFinite(value) || value <= 0) return 1;
	const base = 10 ** Math.floor(Math.log10(value));
	for (const m of [1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 7.5, 10]) {
		if (value <= m * base) return m * base;
	}
	return 10 * base;
}

/**
 * Project a year series into the artboard's SVG paths.
 *
 * Pure, so it can be exercised without a database.
 */
export function buildChartGeometry(series: YearPoint[]): ChartGeometry {
	const years = series.map((p) => p.year);
	const empty: ChartGeometry = {
		linePath: '',
		areaPath: '',
		barsPath: '',
		years,
		cumulativeMaxCents: 0,
		yearMaxCents: 0
	};
	if (series.length === 0) return empty;

	const cumulativeMax = niceCeil(Math.max(...series.map((p) => p.cumulativeCents)));
	const yearMax = niceCeil(Math.max(...series.map((p) => p.yearCents)));

	// The artboard's projection, with `max` now a parameter.
	const project = (value: number, max: number) =>
		CHART_H - CHART_BOTTOM_PAD - (value / max) * (CHART_H - CHART_TOP - 8);

	// A single year has no run to draw across, so the line is held flat at its
	// value rather than collapsing to one invisible point.
	const xs =
		series.length === 1 ? [0, CHART_W] : series.map((_, i) => (i * CHART_W) / (series.length - 1));
	const ys =
		series.length === 1
			? [
					project(series[0].cumulativeCents, cumulativeMax),
					project(series[0].cumulativeCents, cumulativeMax)
				]
			: series.map((p) => project(p.cumulativeCents, cumulativeMax));

	const linePath = xs
		.map((x, i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${ys[i].toFixed(1)}`)
		.join(' ');
	const areaPath = `${linePath} L${CHART_W} ${CHART_H} L0 ${CHART_H} Z`;

	// Bars keep the artboard's 42%-of-slot width, but are scaled to the
	// per-year maximum instead of the artboard's `v * 2.1` fudge, which only
	// existed to make mock per-year values fill a cumulative-scaled box.
	const slot = CHART_W / series.length;
	const barWidth = slot * 0.42;
	const barsPath = series
		.map((p, i) => {
			const x = i * slot + (slot - barWidth) / 2;
			const y = project(p.yearCents, yearMax);
			return (
				`M${x.toFixed(1)} ${CHART_H} L${x.toFixed(1)} ${y.toFixed(1)} ` +
				`L${(x + barWidth).toFixed(1)} ${y.toFixed(1)} L${(x + barWidth).toFixed(1)} ${CHART_H} Z`
			);
		})
		.join(' ');

	return {
		linePath,
		areaPath,
		barsPath,
		years,
		cumulativeMaxCents: cumulativeMax,
		yearMaxCents: yearMax
	};
}

/**
 * Build the year series from unreimbursed rows, filling gap years with zero so
 * the axis runs continuously the way the artboard's 2019-2026 axis does.
 */
export function buildSeries(
	rows: { serviceDate: string; amountCents: number | null }[],
	throughYear: number
): YearPoint[] {
	const byYear = new Map<number, number>();
	for (const r of rows) {
		if (r.amountCents == null) continue;
		const year = Number(r.serviceDate.slice(0, 4));
		if (!Number.isFinite(year)) continue;
		byYear.set(year, (byYear.get(year) ?? 0) + r.amountCents);
	}
	if (byYear.size === 0) return [];

	const first = Math.min(...byYear.keys());
	// Run to the current year even if nothing was filed recently, so the line
	// reaches "today" rather than stopping at the last receipt.
	const last = Math.max(throughYear, ...byYear.keys());

	const series: YearPoint[] = [];
	let running = 0;
	for (let year = first; year <= last; year++) {
		const yearCents = byYear.get(year) ?? 0;
		running += yearCents;
		series.push({ year, yearCents, cumulativeCents: running });
	}
	return series;
}

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

	const series = buildSeries(unreimbursed, now.getFullYear());

	return {
		totalCents,
		documentedCents,
		undocumentedCents: totalCents - documentedCents,
		receiptCount: unreimbursed.length,
		oldestServiceDate,
		currentYearCents,
		incomplete,
		series,
		chart: buildChartGeometry(series)
	};
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
 * Each is something the database can actually answer. `afterHsaOpened` is
 * `null` rather than false when the account has no recorded open date — an
 * unanswerable question is not a failed one.
 */
export type ReceiptAudit = {
	hasImage: boolean;
	fieldsComplete: boolean;
	/** null when the HSA open date has never been recorded. */
	afterHsaOpened: boolean | null;
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

	const openedOn =
		db.select({ hsaOpenedOn: users.hsaOpenedOn }).from(users).where(eq(users.id, userId)).get()
			?.hsaOpenedOn ?? null;

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
		afterHsaOpened: openedOn == null ? null : row.serviceDate >= openedOn,
		notReimbursed: row.reimbursedAt == null,
		notDuplicate
	};
}
