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

const BUILD_MONTHS = [
	'Jan',
	'Feb',
	'Mar',
	'Apr',
	'May',
	'Jun',
	'Jul',
	'Aug',
	'Sep',
	'Oct',
	'Nov',
	'Dec'
];

const pad2 = (n: number) => String(n).padStart(2, '0');

/**
 * The CI build timestamp in the footer.
 *
 * Unlike the service dates above, this one is pinned to UTC rather than the
 * viewer's locale: the footer renders during SSR and again on hydration, and a
 * timezone-dependent string differs between the two. CI stamps are UTC anyway.
 *
 * Hand-formatted rather than run through `toLocaleDateString` because ICU is
 * not stable across Node builds — `en-GB` abbreviates September to "Sept" while
 * every other month gets three letters, so the footer width would change with
 * the month.
 *
 * Values that are not dates pass through unchanged: the Dockerfile defaults
 * BUILD_TIME to "unknown" and local dev has no value, and both read better than
 * "Invalid Date".
 */
export function buildTime(value: string): string {
	const d = new Date(value);
	if (Number.isNaN(d.getTime())) return value;

	return (
		`${pad2(d.getUTCDate())} ${BUILD_MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}, ` +
		`${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())} UTC`
	);
}
