import { fail } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { documents, expenses } from '$lib/server/db/schema';
import { getUnreimbursedTotalCents } from '$lib/server/db/stats';
import { makeDerivatives } from '$lib/server/images';
import { makeKey, sha256, writeAtomic } from '$lib/server/storage';
import { AMOUNT_ERROR, toCents } from '$lib/server/money';

/**
 * Files a receipt.
 *
 * Shared by every route that offers the capture sheet, so filing from the vault
 * and filing from the receipts list cannot drift apart. Returns the action
 * result directly — either a `fail` or the payload the success screen needs to
 * show the total moving.
 */
export async function createReceipt(userId: number, form: FormData) {
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
		return fail(400, { error: AMOUNT_ERROR });
	}

	const totalBeforeCents = getUnreimbursedTotalCents(userId);

	let doc: typeof documents.$inferInsert | null = null;

	if (file instanceof File && file.size > 0) {
		const buf = Buffer.from(await file.arrayBuffer());
		const isPdf = buf.subarray(0, 4).toString() === '%PDF';

		if (isPdf) {
			const key = makeKey('pdf');
			await writeAtomic(key, buf);
			doc = {
				userId,
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
				userId,
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
			.values({ userId, serviceDate, amountCents, provider })
			.returning({ id: expenses.id })
			.get();

		if (doc)
			tx.insert(documents)
				.values({ ...doc, expenseId: row.id })
				.run();
		return row.id;
	});

	return {
		success: true,
		created: expenseId,
		filed: {
			amountCents,
			provider,
			serviceDate,
			totalBeforeCents,
			totalAfterCents: totalBeforeCents + (amountCents ?? 0)
		}
	};
}
