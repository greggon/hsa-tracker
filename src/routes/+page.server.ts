import { getVaultStats, listReceipts } from '$lib/server/db/stats';
import { createReceipt } from '$lib/server/receipts';

export const load = ({ locals }) => ({
	expenses: listReceipts(locals.userId),
	// A second pass over the same table. Kept separate because the figures and
	// the list have genuinely different shapes, and at a personal ledger's scale
	// the extra scan is not worth entangling them for.
	stats: getVaultStats(locals.userId)
});

export const actions = {
	create: async ({ request, locals }) => createReceipt(locals.userId, await request.formData())
};
