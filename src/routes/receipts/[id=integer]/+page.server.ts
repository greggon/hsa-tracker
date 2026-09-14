import { and, eq } from 'drizzle-orm';
import { error, fail, redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { liveExpenses } from '$lib/server/db/filters';
import { documents, expenses } from '$lib/server/db/schema';
import { auditReceipt } from '$lib/server/db/stats';
import { parseReceiptForm } from '$lib/server/receipt-form';

/** Loads the receipt for display, scoped to the signed-in user. */
function findReceipt(userId: number, id: number) {
	return db
		.select({
			id: expenses.id,
			serviceDate: expenses.serviceDate,
			provider: expenses.provider,
			amountCents: expenses.amountCents,
			reimbursedAt: expenses.reimbursedAt,
			docId: documents.id,
			originalFilename: documents.originalFilename,
			byteSize: documents.byteSize,
			mimeType: documents.mimeType,
			webKey: documents.webKey,
			addedAt: documents.createdAt
		})
		.from(expenses)
		.leftJoin(documents, and(eq(documents.expenseId, expenses.id), eq(documents.isPrimary, 1)))
		.where(liveExpenses(userId, id))
		.get();
}

/**
 * The authorization every action shares: the row must exist, belong to this
 * user, and not be deleted. Returning the row rather than a boolean means an
 * action cannot accidentally proceed without having looked.
 */
function requireOwned(userId: number, rawId: string) {
	return (
		db
			.select()
			.from(expenses)
			.where(liveExpenses(userId, Number(rawId)))
			.get() ?? null
	);
}

export const load = ({ params, locals }) => {
	// The [id=integer] matcher has already rejected anything that is not a
	// positive integer, so this cannot be NaN.
	const id = Number(params.id);

	const receipt = findReceipt(locals.userId, id);
	if (!receipt) error(404, 'Not found');

	return { receipt, audit: auditReceipt(locals.userId, id)! };
};

export const actions = {
	save: async ({ params, request, locals }) => {
		const existing = requireOwned(locals.userId, params.id);
		if (!existing) return fail(404, { error: 'Not found.' });

		const parsed = parseReceiptForm(await request.formData());
		if (!parsed.ok) return fail(400, { error: parsed.error });

		db.update(expenses)
			.set({ ...parsed.fields, updatedAt: new Date() })
			.where(eq(expenses.id, existing.id))
			.run();

		return { saved: true };
	},

	/** Toggles, so the same button can undo a reimbursement recorded by mistake. */
	reimburse: async ({ params, locals }) => {
		const existing = requireOwned(locals.userId, params.id);
		if (!existing) return fail(404, { error: 'Not found.' });

		const nowReimbursed = existing.reimbursedAt == null;
		db.update(expenses)
			.set({
				reimbursedAt: nowReimbursed ? new Date() : null,
				reimbursedAmountCents: nowReimbursed ? (existing.amountCents ?? 0) : 0,
				updatedAt: new Date()
			})
			.where(eq(expenses.id, existing.id))
			.run();

		return { saved: true };
	},

	/**
	 * Soft delete only. The image stays on disk and the row stays in the table —
	 * this is a vault whose whole point is that nothing becomes unprovable years
	 * later, so "Delete" removes a receipt from view, not from the record.
	 */
	remove: async ({ params, locals }) => {
		const existing = requireOwned(locals.userId, params.id);
		if (!existing) return fail(404, { error: 'Not found.' });

		db.update(expenses)
			.set({ deletedAt: new Date(), updatedAt: new Date() })
			.where(eq(expenses.id, existing.id))
			.run();

		redirect(303, '/');
	}
};
