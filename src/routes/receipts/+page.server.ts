import { getFilingYears, listReceipts } from '$lib/server/db/stats';

export const load = ({ locals, url }) => {
	const requested = Number(url.searchParams.get('year'));
	const years = getFilingYears(locals.userId);
	// An unknown or absent year means "all", rather than an empty page.
	const year = years.includes(requested) ? requested : null;

	return {
		year,
		years,
		receipts: listReceipts(locals.userId, year ? { year } : {})
	};
};
