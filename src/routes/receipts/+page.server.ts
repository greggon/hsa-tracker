import { getFilingYears, listReceipts } from '$lib/server/db/stats';
import { createReceipt } from '$lib/server/receipts';

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

export const actions = {
	create: async ({ request, locals }) => createReceipt(locals.userId, await request.formData())
};
