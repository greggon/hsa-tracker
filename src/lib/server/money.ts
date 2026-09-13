/**
 * A blank amount is deliberate, not a mistake: a receipt whose total could not
 * be read still needs filing so it can surface in the "Needs a field" list, and
 * it stays out of the running total until someone fills it in. A non-blank
 * value that will not parse is still an error — that is a typo, not an
 * unreadable receipt.
 *
 * Shared by the vault's quick edit and the receipt detail screen so the two
 * cannot drift apart.
 */
export function toCents(raw: string): number | null {
	const trimmed = raw.trim();
	if (trimmed === '') return null;
	const n = Math.round(parseFloat(trimmed.replace(/[$,\s]/g, '')) * 100);
	if (!Number.isFinite(n) || n <= 0) throw new Error('invalid');
	return n;
}

export const AMOUNT_ERROR = 'Enter a valid amount, or leave it blank if it is not readable.';
