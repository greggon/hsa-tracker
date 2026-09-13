import { and, desc, eq, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { documents, expenses } from '$lib/server/db/schema';
import { fail } from '@sveltejs/kit';

function toCents(raw: string): number {
	const n = Math.round(parseFloat(raw.replace(/[$,\s]/g, '')) * 100);
	if (!Number.isFinite(n) || n <= 0) throw new Error('invalid');
	return n;
}

export const load = ({ locals }) => {
	const rows = db
		.select({
			id: expenses.id,
			serviceDate: expenses.serviceDate,
			provider: expenses.provider,
			amountCents: expenses.amountCents,
			reimbursedAt: expenses.reimbursedAt,
			category: expenses.category,
			patient: expenses.patient,
			notes: expenses.notes,
			thumb: documents.thumb,
			docId: documents.id
		})
		.from(expenses)
		.leftJoin(documents, and(eq(documents.expenseId, expenses.id), eq(documents.isPrimary, 1)))
		.where(and(eq(expenses.userId, locals.userId), isNull(expenses.deletedAt)))
		.orderBy(desc(expenses.serviceDate), desc(expenses.id))
		.all();

	return {
		expenses: rows.map((r) => ({
			...r,
			thumb: r.thumb ? `data:image/jpeg;base64,${(r.thumb as Buffer).toString('base64')}` : null
		}))
	};
};

export const actions = {
	update: async ({ request, locals }) => {
		const form = await request.formData();
		const id = Number(form.get('id'));

		const existing = db
			.select()
			.from(expenses)
			.where(and(eq(expenses.id, id), eq(expenses.userId, locals.userId)))
			.get();
		if (!existing) return fail(404, { error: 'Not found.' });

		const serviceDate = String(form.get('serviceDate') ?? '');
		if (!/^\d{4}-\d{2}-\d{2}$/.test(serviceDate)) {
			return fail(400, { error: 'Enter a valid date.' });
		}

		let amountCents: number;
		try {
			amountCents = toCents(String(form.get('amount') ?? ''));
		} catch {
			return fail(400, { error: 'Enter a valid amount.' });
		}

		const wantsReimbursed = form.get('reimbursed') === 'on';
		const reimbursedAt = wantsReimbursed ? (existing.reimbursedAt ?? new Date()) : null;

		db.update(expenses)
			.set({
				serviceDate,
				amountCents,
				provider: String(form.get('provider') ?? '') || null,
				category: String(form.get('category') ?? '') || null,
				patient: String(form.get('patient') ?? '') || null,
				notes: String(form.get('notes') ?? '') || null,
				reimbursedAt,
				reimbursedAmountCents: wantsReimbursed ? amountCents : 0,
				updatedAt: new Date()
			})
			.where(and(eq(expenses.id, id), eq(expenses.userId, locals.userId)))
			.run();

		return { success: true };
	}
};
