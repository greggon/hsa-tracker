/**
 * How money and dates are rendered, in one place.
 *
 * These were previously redefined in five components, and had already drifted:
 * one copy took `number` where the others took `number | null`, so the same
 * receipt formatted differently depending on which screen you were looking at.
 */

/** An em dash stands in for an amount that could not be read off the receipt. */
export function money(cents: number | null): string {
	return cents == null
		? '—'
		: (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

/**
 * The hero figure sets its cents smaller than its dollars, so the two parts are
 * returned separately rather than the caller hunting for the decimal point.
 */
export function splitMoney(cents: number): { whole: string; frac: string } {
	const full = money(cents);
	const dot = full.lastIndexOf('.');
	return dot === -1
		? { whole: full, frac: '' }
		: { whole: full.slice(0, dot), frac: full.slice(dot) };
}

/**
 * Service dates are stored as bare `YYYY-MM-DD`. Parsing one with `new Date()`
 * alone would read it as UTC midnight and render the day before in any western
 * timezone, so the time is pinned to local midnight first.
 */
function localDate(iso: string): Date {
	return new Date(iso + 'T00:00:00');
}

export function pretty(iso: string): string {
	return localDate(iso).toLocaleDateString('en-US', {
		month: 'short',
		day: 'numeric',
		year: 'numeric'
	});
}

/** Day and month only — for places where the year is noise. */
export function prettyShort(iso: string): string {
	return localDate(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
