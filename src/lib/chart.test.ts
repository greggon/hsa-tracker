import { describe, expect, it } from 'vitest';
import {
	buildChartGeometry,
	buildDailySeries,
	buildSeries,
	niceCeil,
	projectToViewBox,
	readChartAt
} from './chart';

/** The artboard's projection: y = H - 4 - (v / max) * (H - top - 8), H=200, top=12. */
const artboardY = (v: number, max: number) => 200 - 4 - (v / max) * (200 - 12 - 8);

describe('niceCeil', () => {
	it('lands on the constant the artboard had hard-coded', () => {
		expect(niceCeil(18420)).toBe(20000);
		// Same ratio in cents, so the curve sits at the same height.
		expect(niceCeil(1842000)).toBe(2000000);
	});

	it('rounds up to a readable step', () => {
		expect(niceCeil(9999)).toBe(10000);
		expect(niceCeil(10001)).toBe(12500);
	});

	it('never returns zero, so nothing divides by it', () => {
		expect(niceCeil(0)).toBe(1);
		expect(niceCeil(-5)).toBe(1);
		expect(niceCeil(NaN)).toBe(1);
	});
});

describe('buildDailySeries', () => {
	it('collapses rows onto the days they were filed against', () => {
		const days = buildDailySeries([
			{ serviceDate: '2024-03-02', amountCents: 500 },
			{ serviceDate: '2024-01-01', amountCents: 1000 },
			{ serviceDate: '2024-03-02', amountCents: 250 }
		]);

		expect(days.map((d) => d.date)).toEqual(['2024-01-01', '2024-03-02']);
		expect(days.map((d) => d.dayCents)).toEqual([1000, 750]);
		expect(days.map((d) => d.cumulativeCents)).toEqual([1000, 1750]);
	});

	it('ignores unreadable amounts and malformed dates', () => {
		expect(
			buildDailySeries([
				{ serviceDate: '2024-01-01', amountCents: null },
				{ serviceDate: 'not-a-date', amountCents: 500 }
			])
		).toEqual([]);
	});

	it('handles an empty ledger', () => {
		expect(buildDailySeries([])).toEqual([]);
	});
});

describe('buildChartGeometry', () => {
	const spread = buildChartGeometry(
		[
			{ date: '2020-01-01', dayCents: 100, cumulativeCents: 100 },
			{ date: '2021-01-01', dayCents: 100, cumulativeCents: 200 },
			{ date: '2024-01-01', dayCents: 100, cumulativeCents: 300 }
		],
		[],
		'2024-01-01'
	);

	it('keeps the artboard projection', () => {
		const single = buildChartGeometry(
			[{ date: '2024-01-01', dayCents: 1842000, cumulativeCents: 1842000 }],
			[],
			'2024-01-01'
		);
		expect(single.cumulativeMaxCents).toBe(2000000);
		expect(single.linePath.split(' ').slice(0, 2).join(' ')).toBe(
			`M0 ${artboardY(1842000, 2000000).toFixed(1)}`
		);
	});

	it('positions x by elapsed time, not by index', () => {
		// 2020 is a leap year: 366 of the span's 1461 days, so 25.1% across —
		// not the 50% an index-based axis would have produced.
		expect(spread.linePath).toContain('H250.5');
		expect(spread.linePath).not.toContain('H500.0');
	});

	it('steps rather than ramps, because a running total does not accrue daily', () => {
		expect(spread.linePath).toMatch(/^M0 [\d.]+ H[\d.]+ V[\d.]+/);
	});

	it('holds the total flat out to today', () => {
		expect(spread.linePath.endsWith('H1000')).toBe(true);

		const stale = buildChartGeometry(
			[{ date: '2020-01-01', dayCents: 100, cumulativeCents: 100 }],
			[],
			'2026-01-01'
		);
		expect(stale.linePath).toBe(`M0 ${artboardY(100, 100).toFixed(1)} H1000`);
		expect(stale.endDate).toBe('2026-01-01');
	});

	it('closes the area along the baseline', () => {
		expect(spread.areaPath.endsWith('L1000 200 L0 200 Z')).toBe(true);
	});

	it('survives a record with no span', () => {
		const oneDay = buildChartGeometry(
			[{ date: '2026-01-01', dayCents: 50, cumulativeCents: 50 }],
			[],
			'2026-01-01'
		);
		expect(oneDay.linePath).not.toMatch(/NaN|Infinity/);
	});

	it('returns nothing to draw for an empty ledger', () => {
		const none = buildChartGeometry([], [], '2026-01-01');
		expect(none).toMatchObject({ linePath: '', areaPath: '', ticks: [], startDate: '' });
	});

	it('exposes the domain so a pointer position maps back to a date', () => {
		expect(spread.startDate).toBe('2020-01-01');
		expect(spread.endDate).toBe('2024-01-01');
	});

	describe('axis ticks', () => {
		it('labels each year at its true position, starting at the left edge', () => {
			expect(spread.ticks.map((t) => t.label)).toEqual(['2020', '2021', '2022', '2023', '2024']);
			expect(spread.ticks[0].xPercent).toBe(0);
			expect(spread.ticks[1].xPercent).toBeCloseTo(25.05, 1);
		});

		it('drops a label that would collide with the one before it', () => {
			// The record opens four days before New Year, so a 2020 label would sit
			// on top of the 2019 one pinned to the edge.
			const crowded = buildChartGeometry(
				[
					{ date: '2019-12-28', dayCents: 100, cumulativeCents: 100 },
					{ date: '2024-01-01', dayCents: 100, cumulativeCents: 200 }
				],
				[],
				'2024-01-01'
			);
			expect(crowded.ticks.map((t) => t.label)).toEqual(['2019', '2021', '2022', '2023', '2024']);
		});
	});

	describe('per-year bars', () => {
		const withYears = buildChartGeometry(
			[{ date: '2025-06-01', dayCents: 100, cumulativeCents: 100 }],
			[
				{ year: 2025, yearCents: 100, cumulativeCents: 100 },
				{ year: 2026, yearCents: 100, cumulativeCents: 200 }
			],
			'2026-01-01'
		);

		it('scales to the per-year maximum, not the cumulative one', () => {
			expect(withYears.barsPath).toContain('16.0');
			expect(withYears.years).toEqual([2025, 2026]);
		});

		it('draws nothing when there are no years', () => {
			expect(spread.barsPath).toBe('');
		});
	});
});

describe('buildSeries', () => {
	const gapped = buildSeries(
		[
			{ serviceDate: '2019-03-14', amountCents: 1000 },
			{ serviceDate: '2022-01-02', amountCents: 500 }
		],
		2024
	);

	it('fills gap years so the axis runs continuously', () => {
		expect(gapped.map((p) => p.year)).toEqual([2019, 2020, 2021, 2022, 2023, 2024]);
		expect(gapped.map((p) => p.yearCents)).toEqual([1000, 0, 0, 500, 0, 0]);
		expect(gapped.map((p) => p.cumulativeCents)).toEqual([1000, 1000, 1000, 1500, 1500, 1500]);
	});
});

describe('readChartAt', () => {
	const days = [
		{ date: '2020-01-01', dayCents: 100, cumulativeCents: 100 },
		{ date: '2021-01-01', dayCents: 400, cumulativeCents: 500 },
		{ date: '2024-01-01', dayCents: 250, cumulativeCents: 750 }
	];

	it('reads the day under the pointer', () => {
		expect(readChartAt(days, '2020-01-01', '2024-01-01', 0)?.date).toBe('2020-01-01');
		expect(readChartAt(days, '2020-01-01', '2024-01-01', 1)?.date).toBe('2024-01-01');
	});

	it('holds the total flat between filings rather than interpolating', () => {
		// Halfway is mid-2022: nothing was filed, so the total is still what the
		// 2021 receipt left it at — not a value part-way to the 2024 one.
		const mid = readChartAt(days, '2020-01-01', '2024-01-01', 0.5);
		expect(mid?.cumulativeCents).toBe(500);
		expect(mid?.dayCents).toBeNull();
	});

	it('reports what was filed when the pointer lands on a filing day', () => {
		const onFiling = readChartAt(days, '2020-01-01', '2024-01-01', 1);
		expect(onFiling).toMatchObject({ dayCents: 250, cumulativeCents: 750 });
	});

	it('clamps a pointer dragged outside the chart', () => {
		expect(readChartAt(days, '2020-01-01', '2024-01-01', -3)?.date).toBe('2020-01-01');
		expect(readChartAt(days, '2020-01-01', '2024-01-01', 9)?.date).toBe('2024-01-01');
	});

	it('handles a record spanning a single day', () => {
		const one = [{ date: '2026-01-01', dayCents: 50, cumulativeCents: 50 }];
		expect(readChartAt(one, '2026-01-01', '2026-01-01', 0.7)).toEqual({
			date: '2026-01-01',
			cumulativeCents: 50,
			dayCents: 50
		});
	});

	it('has nothing to read on an empty ledger', () => {
		expect(readChartAt([], '', '', 0.5)).toBeNull();
	});
});

describe('projectToViewBox', () => {
	it('puts zero on the baseline and the ceiling at the top', () => {
		expect(projectToViewBox(0, 1000)).toBe(196);
		expect(projectToViewBox(1000, 1000)).toBe(16);
	});

	it('never divides by a zero ceiling', () => {
		expect(Number.isFinite(projectToViewBox(0, 0))).toBe(true);
	});
});
