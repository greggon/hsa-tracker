import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { documents, expenses } from '$lib/server/db/schema';
import { fail } from '@sveltejs/kit';
import { makeDerivatives } from '$lib/server/images';
import { makeKey, sha256, writeAtomic } from '$lib/server/storage';

/**
 * A blank amount is deliberate, not a mistake: a receipt whose total could not
 * be read still needs filing so it can surface in the "Needs a field" list, and
 * it stays out of the running total until someone fills it in. A non-blank
 * value that will not parse is still an error — that is a typo, not an
 * unreadable receipt.
 */
function toCents(raw: string): number | null {
	const trimmed = raw.trim();
	if (trimmed === '') return null;
	const n = Math.round(parseFloat(trimmed.replace(/[$,\s]/g, '')) * 100);
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
			docId: documents.id,
			// Only whether a thumbnail exists — the bytes are fetched per row from
			// /documents/[id]?thumb. Inlining them as base64 data URLs put roughly
			// 7.6 KB of markup on the page per receipt.
			hasThumb: sql<number>`(${documents.thumb} is not null)`
		})
		.from(expenses)
		.leftJoin(documents, and(eq(documents.expenseId, expenses.id), eq(documents.isPrimary, 1)))
		.where(and(eq(expenses.userId, locals.userId), isNull(expenses.deletedAt)))
		.orderBy(desc(expenses.serviceDate), desc(expenses.id))
		.all();

	return { expenses: rows };
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

		let amountCents: number | null;
		try {
			amountCents = toCents(String(form.get('amount') ?? ''));
		} catch {
			return fail(400, { error: 'Enter a valid amount, or leave it blank if it is not readable.' });
		}

		const wantsReimbursed = form.get('reimbursed') === 'on';
		const reimbursedAt = wantsReimbursed ? (existing.reimbursedAt ?? new Date()) : null;

		db.update(expenses)
			.set({
				serviceDate,
				amountCents,
				provider: String(form.get('provider') ?? '') || null,
				reimbursedAt,
				reimbursedAmountCents: wantsReimbursed ? (amountCents ?? 0) : 0,
				updatedAt: new Date()
			})
			.where(and(eq(expenses.id, id), eq(expenses.userId, locals.userId)))
			.run();

		return { success: true };
	},
	create: async ({ request, locals }) => {
		const form = await request.formData();
		const candidates = [form.get('fileCamera'), form.get('filePick')];
		const file = candidates.find((f): f is File => f instanceof File && f.size > 0) ?? null;
		const serviceDate = String(form.get('serviceDate') ?? '');
		const provider = String(form.get('provider') ?? '') || null;

		if (!/^\d{4}-\d{2}-\d{2}$/.test(serviceDate)) {
			return fail(400, { error: 'Service date is required.' });
		}

		let amountCents: number | null;
		try {
			amountCents = toCents(String(form.get('amount') ?? ''));
		} catch {
			return fail(400, { error: 'Enter a valid amount, or leave it blank if it is not readable.' });
		}

		let doc: typeof documents.$inferInsert | null = null;

		if (file instanceof File && file.size > 0) {
			const buf = Buffer.from(await file.arrayBuffer());
			const isPdf = buf.subarray(0, 4).toString() === '%PDF';

			if (isPdf) {
				const key = makeKey('pdf');
				await writeAtomic(key, buf);
				doc = {
					userId: locals.userId,
					storageKey: key,
					mimeType: 'application/pdf',
					originalFilename: file.name,
					byteSize: buf.length,
					sha256: sha256(buf),
					isPrimary: 1
				};
			} else {
				let d;

				const cx = Number(form.get('cropX'));
				const cy = Number(form.get('cropY'));
				const cw = Number(form.get('cropW'));
				const ch = Number(form.get('cropH'));
				const rect =
					Number.isFinite(cw) && cw > 0 ? { left: cx, top: cy, width: cw, height: ch } : undefined;
				try {
					d = await makeDerivatives(buf, rect);
				} catch {
					return fail(400, { error: 'That file is not a supported image or PDF.' });
				}

				const key = makeKey('jpg');
				const webKey = key.replace(/\.jpg$/, '.web.jpg');
				await writeAtomic(key, d.original);
				await writeAtomic(webKey, d.web);
				doc = {
					userId: locals.userId,
					storageKey: key,
					webKey,
					mimeType: 'image/jpeg',
					originalFilename: file.name,
					byteSize: d.original.length,
					sha256: sha256(d.original),
					thumb: d.thumb,
					isPrimary: 1
				};
			}
		}

		const expenseId = db.transaction((tx) => {
			const row = tx
				.insert(expenses)
				.values({
					userId: locals.userId,
					serviceDate,
					amountCents,
					provider
				})
				.returning({ id: expenses.id })
				.get();

			if (doc)
				tx.insert(documents)
					.values({ ...doc, expenseId: row.id })
					.run();
			return row.id;
		});

		return { success: true, created: expenseId };
	}
};
