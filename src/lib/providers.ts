/**
 * Provider history, for the autocomplete on the provider field.
 *
 * Pure and outside `$lib/server`: the ranking runs on the server against the
 * ledger, the filtering runs in the browser as you type, and both want testing
 * without a database.
 */

/** How many suggestions to offer at once. */
export const SUGGESTION_LIMIT = 6;

type ProviderRow = { provider: string | null; serviceDate: string };

/**
 * Order a user's providers by how often they have been used, then by how
 * recently — so the ones you actually visit surface first.
 *
 * Names are matched case-insensitively but shown in the spelling you use most,
 * so "walgreens" typed once does not displace "Walgreens" typed ten times.
 */
export function rankProviders(rows: ProviderRow[]): string[] {
	type Entry = { uses: number; last: string; spellings: Map<string, number> };
	const byName = new Map<string, Entry>();

	for (const row of rows) {
		const name = row.provider?.trim();
		if (!name) continue;

		const key = name.toLowerCase();
		const entry = byName.get(key) ?? { uses: 0, last: '', spellings: new Map() };
		entry.uses += 1;
		if (row.serviceDate > entry.last) entry.last = row.serviceDate;
		entry.spellings.set(name, (entry.spellings.get(name) ?? 0) + 1);
		byName.set(key, entry);
	}

	return [...byName.values()]
		.sort((a, b) => b.uses - a.uses || (a.last < b.last ? 1 : a.last > b.last ? -1 : 0))
		.map((entry) => {
			let best = '';
			let seen = -1;
			for (const [spelling, count] of entry.spellings) {
				if (count > seen) {
					best = spelling;
					seen = count;
				}
			}
			return best;
		});
}

/**
 * Narrow the ranked list to what someone is typing.
 *
 * Names that *start* with the query come first — typing "w" should reach
 * Walgreens before Quest — and names merely containing it follow, so "dental"
 * still finds "Nguyen Family Dental". An exact match is dropped: there is
 * nothing to complete once the name is fully typed.
 */
export function filterProviders(
	providers: string[],
	query: string,
	limit = SUGGESTION_LIMIT
): string[] {
	const q = query.trim().toLowerCase();
	if (q === '') return providers.slice(0, limit);

	const starts: string[] = [];
	const contains: string[] = [];

	for (const provider of providers) {
		const lower = provider.toLowerCase();
		if (lower === q) continue;
		if (lower.startsWith(q)) starts.push(provider);
		else if (lower.includes(q)) contains.push(provider);
	}

	return [...starts, ...contains].slice(0, limit);
}

/** Split a label around the typed text, so the match can be emphasised. */
export function highlight(label: string, query: string): [string, string, string] {
	const q = query.trim();
	if (!q) return [label, '', ''];
	const at = label.toLowerCase().indexOf(q.toLowerCase());
	if (at < 0) return [label, '', ''];
	return [label.slice(0, at), label.slice(at, at + q.length), label.slice(at + q.length)];
}
