/**
 * Chart geometry and readings.
 *
 * Pure: no database, no environment. It lives outside `$lib/server` because the
 * hover marker runs in the browser and must read the same projection the path
 * was drawn with, rather than a copy of it that can drift.
 *
 * The artboard's chart came from a `DCLogic` block with hard-coded arrays and a
 * fixed `max = 20000`. The projection is reproduced faithfully here; the data
 * and the scale are not — both are derived from real rows.
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

/** One day on which something was filed. */
export type DayPoint = {
	/** YYYY-MM-DD. */
	date: string;
	/** Unreimbursed, amount-known spend filed against this day. */
	dayCents: number;
	/** Running total through the end of this day. */
	cumulativeCents: number;
};

/** An axis label and where along the width it belongs, as a percentage. */
export type Tick = { label: string; xPercent: number };

export type ChartGeometry = {
	/**
	 * Cumulative total as an SVG path `d`, stepped: flat between filings and
	 * vertical on the day of one. Empty string when there is no data.
	 */
	linePath: string;
	/** The same line closed along the baseline, for the gradient fill. */
	areaPath: string;
	/** Per-year bars as a single path. Scaled to its own maximum, not the cumulative one. */
	barsPath: string;
	/** Year labels placed at their true position along the time axis. */
	ticks: Tick[];
	/** Time domain the x axis spans, so a pointer position maps back to a date. */
	startDate: string;
	endDate: string;
	years: number[];
	/** Ceiling the cumulative line is scaled against. */
	cumulativeMaxCents: number;
	/** Ceiling the bars are scaled against. */
	yearMaxCents: number;
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

/** Midnight UTC for a YYYY-MM-DD string; UTC throughout so DST cannot shift a day. */
function dayMs(date: string): number {
	return Date.parse(`${date}T00:00:00Z`);
}

/**
 * The artboard's projection, with `max` a parameter rather than a constant.
 *
 * Exported so the hover marker sits on the line by construction: it reads the
 * same function the path was drawn with.
 */
export function projectToViewBox(cents: number, maxCents: number): number {
	const max = maxCents || 1;
	return CHART_H - CHART_BOTTOM_PAD - (cents / max) * (CHART_H - CHART_TOP - 8);
}

/**
 * Year labels at their true position along the time axis.
 *
 * With days rather than evenly-spaced years, a quiet stretch now occupies the
 * width it actually took, so the labels have to be placed by date rather than
 * by index. The first label sits at the left edge and carries the year the
 * record opens in, which is rarely January.
 */
function buildTicks(startMs: number, endMs: number): Tick[] {
	const span = endMs - startMs;
	const first = new Date(startMs).getUTCFullYear();
	const ticks: Tick[] = [{ label: String(first), xPercent: 0 }];
	if (span <= 0) return ticks;

	for (let year = first + 1; year <= new Date(endMs).getUTCFullYear(); year++) {
		const ms = Date.UTC(year, 0, 1);
		if (ms <= startMs || ms > endMs) continue;
		// Two decimals is finer than a pixel at any realistic width, and keeps
		// full float noise out of the markup.
		const xPercent = Number((((ms - startMs) / span) * 100).toFixed(2));
		// Drop a label that would collide with the one before it.
		if (xPercent - ticks[ticks.length - 1].xPercent < 7) continue;
		ticks.push({ label: String(year), xPercent });
	}
	return ticks;
}

/**
 * Project the series into the artboard's SVG paths.
 *
 * The cumulative line is daily and stepped: a running total is flat until
 * something is filed and then jumps, so drawing it as a diagonal ramp would
 * imply money accruing on days nothing happened. Only days that change the
 * total need a vertex — the days between are the flat runs — so the path stays
 * small without losing a day of resolution.
 *
 * The x axis is time, not position: `throughDate` extends the line to today, so
 * a year of filing nothing reads as a long flat stretch rather than one tick.
 *
 * Pure, so it can be exercised without a database.
 */
export function buildChartGeometry(
	days: DayPoint[],
	years: YearPoint[],
	throughDate: string
): ChartGeometry {
	const empty: ChartGeometry = {
		linePath: '',
		areaPath: '',
		barsPath: '',
		ticks: [],
		startDate: '',
		endDate: '',
		years: years.map((p) => p.year),
		cumulativeMaxCents: 0,
		yearMaxCents: 0
	};
	if (days.length === 0) return empty;

	const cumulativeMax = niceCeil(Math.max(...days.map((p) => p.cumulativeCents)));
	const yearMax = niceCeil(Math.max(0, ...years.map((p) => p.yearCents)));

	const project = projectToViewBox;

	const startMs = dayMs(days[0].date);
	// Run to today, or past it if something is dated in the future.
	const endMs = Math.max(dayMs(days[days.length - 1].date), dayMs(throughDate));
	const span = endMs - startMs;

	// A single day — or everything filed on one day — has no run to draw across,
	// so the line is held flat at its value rather than collapsing to a point.
	const x = (date: string) => (span <= 0 ? 0 : ((dayMs(date) - startMs) / span) * CHART_W);

	const segments = [`M0 ${project(days[0].cumulativeCents, cumulativeMax).toFixed(1)}`];
	for (let i = 1; i < days.length; i++) {
		segments.push(
			`H${x(days[i].date).toFixed(1)} V${project(days[i].cumulativeCents, cumulativeMax).toFixed(1)}`
		);
	}
	// Hold the total flat from the last filing to the right-hand edge.
	segments.push(`H${CHART_W}`);

	const linePath = segments.join(' ');
	const areaPath = `${linePath} L${CHART_W} ${CHART_H} L0 ${CHART_H} Z`;

	// Bars keep the artboard's 42%-of-slot width, but are scaled to the
	// per-year maximum instead of the artboard's `v * 2.1` fudge, which only
	// existed to make mock per-year values fill a cumulative-scaled box.
	const slot = years.length > 0 ? CHART_W / years.length : CHART_W;
	const barWidth = slot * 0.42;
	const barsPath = years
		.map((p, i) => {
			const bx = i * slot + (slot - barWidth) / 2;
			const by = project(p.yearCents, yearMax);
			return (
				`M${bx.toFixed(1)} ${CHART_H} L${bx.toFixed(1)} ${by.toFixed(1)} ` +
				`L${(bx + barWidth).toFixed(1)} ${by.toFixed(1)} L${(bx + barWidth).toFixed(1)} ${CHART_H} Z`
			);
		})
		.join(' ');

	return {
		linePath,
		areaPath,
		barsPath,
		ticks: buildTicks(startMs, endMs),
		startDate: days[0].date,
		endDate: new Date(endMs).toISOString().slice(0, 10),
		years: years.map((p) => p.year),
		cumulativeMaxCents: cumulativeMax,
		yearMaxCents: yearMax
	};
}

/** What the chart reads at one position along its width. */
export type ChartReading = {
	/** The calendar day under that position. */
	date: string;
	/** The running total as it stood at the end of that day. */
	cumulativeCents: number;
	/** What was filed on that exact day, or null if nothing was. */
	dayCents: number | null;
};

/**
 * Read the chart at `fraction` (0 at the left edge, 1 at the right).
 *
 * The total is a step function, so the value at any position is whatever the
 * most recent filing on or before that day left it at — not an interpolation
 * between neighbouring points.
 */
export function readChartAt(
	days: DayPoint[],
	startDate: string,
	endDate: string,
	fraction: number
): ChartReading | null {
	if (days.length === 0 || !startDate) return null;

	const clamped = Math.min(1, Math.max(0, fraction));
	const startMs = dayMs(startDate);
	const endMs = dayMs(endDate);
	// A record spanning a single day has no width to interpolate across.
	const atMs = endMs > startMs ? startMs + clamped * (endMs - startMs) : startMs;
	const date = new Date(Math.floor(atMs / 86_400_000) * 86_400_000).toISOString().slice(0, 10);

	let cumulativeCents = 0;
	let dayCents: number | null = null;
	for (const day of days) {
		if (day.date > date) break;
		cumulativeCents = day.cumulativeCents;
		dayCents = day.date === date ? day.dayCents : null;
	}

	return { date, cumulativeCents, dayCents };
}

/**
 * Collapse rows onto the days they were filed against, with a running total.
 *
 * Only days that carry a filing appear: the flat runs between them are implied,
 * and reconstructing every calendar day in between would add thousands of
 * identical points without adding any information.
 */
export function buildDailySeries(
	rows: { serviceDate: string; amountCents: number | null }[]
): DayPoint[] {
	const byDate = new Map<string, number>();
	for (const r of rows) {
		if (r.amountCents == null) continue;
		if (!/^\d{4}-\d{2}-\d{2}$/.test(r.serviceDate)) continue;
		byDate.set(r.serviceDate, (byDate.get(r.serviceDate) ?? 0) + r.amountCents);
	}

	// ISO dates sort lexicographically in chronological order.
	const dates = [...byDate.keys()].sort();
	let running = 0;
	return dates.map((date) => {
		const dayCents = byDate.get(date)!;
		running += dayCents;
		return { date, dayCents, cumulativeCents: running };
	});
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
