/**
 * The header search, applied to a list of receipts.
 *
 * Shared by the vault and the receipts list, which each filtered their own rows
 * with a copy of this and could otherwise drift on what "matches" means.
 */

type Searchable = { provider: string | null; amountCents: number | null };

/** Receipts whose provider or amount contains the query. Blank matches all. */
export function searchReceipts<T extends Searchable>(rows: T[], query: string): T[] {
	const q = query.trim().toLowerCase();
	if (q === '') return rows;

	// "$1,234" and "1234" should find the same receipt.
	const digits = q.replace(/[$,]/g, '');
	return rows.filter((e) => {
		const amount = e.amountCents == null ? '' : (e.amountCents / 100).toFixed(2);
		return (e.provider ?? '').toLowerCase().includes(q) || amount.includes(digits);
	});
}
