/**
 * A blank amount is deliberate, not a mistake: a receipt whose total could not
 * be read still needs filing so it can surface in the "Needs a field" list, and
 * it stays out of the running total until someone fills it in. A non-blank
 * value that will not parse is still an error — that is a typo, not an
 * unreadable receipt.
 *
 * Shared by every caller that parses an amount — the capture sheet, the receipt
 * detail screen, and the submit button's own preview of what it is about to
 * add. Deliberately outside `$lib/server`: it is pure, and the browser needs to
 * agree with the server about what counts as a valid amount.
 */
export function toCents(raw: string): number | null {
	const trimmed = raw.trim();
	if (trimmed === '') return null;
	const n = Math.round(parseFloat(trimmed.replace(/[$,\s]/g, '')) * 100);
	if (!Number.isFinite(n) || n <= 0) throw new Error('invalid');
	return n;
}

export const AMOUNT_ERROR = 'Enter a valid amount, or leave it blank if it is not readable.';
