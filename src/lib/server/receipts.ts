import { fail } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { documents, expenses } from '$lib/server/db/schema';
import { getUnreimbursedTotalCents } from '$lib/server/db/stats';
import { makeDerivatives } from '$lib/server/images';
import { parseReceiptForm } from '$lib/server/receipt-form';
import { makeKey, sha256, writeAtomic } from '$lib/server/storage';

/** Raised when the bytes are neither a PDF nor something sharp can decode. */
class UnsupportedUpload extends Error {}

/** The crop the browser chose, in natural image pixels. Absent when uncropped. */
function cropFrom(form: FormData) {
	const num = (name: string) => Number(form.get(name));
	const width = num('cropW');
	if (!Number.isFinite(width) || width <= 0) return undefined;
	return { left: num('cropX'), top: num('cropY'), width, height: num('cropH') };
}

/**
 * Stores the uploaded file and returns the document row to insert with it.
 *
 * PDFs are kept byte-for-byte: they are already the document, and re-encoding
 * one would destroy the thing being preserved. Images are normalised into
 * three JPEG derivatives instead.
 */
async function storeUpload(userId: number, file: File, form: FormData) {
	const buf = Buffer.from(await file.arrayBuffer());

	if (buf.subarray(0, 4).toString() === '%PDF') {
		const key = makeKey('pdf');
		await writeAtomic(key, buf);
		return {
			userId,
			storageKey: key,
			mimeType: 'application/pdf',
			originalFilename: file.name,
			byteSize: buf.length,
			sha256: sha256(buf),
			isPrimary: 1
		} satisfies typeof documents.$inferInsert;
	}

	let d;
	try {
		d = await makeDerivatives(buf, cropFrom(form));
	} catch {
		throw new UnsupportedUpload();
	}

	const key = makeKey('jpg');
	const webKey = key.replace(/\.jpg$/, '.web.jpg');
	await writeAtomic(key, d.original);
	await writeAtomic(webKey, d.web);

	return {
		userId,
		storageKey: key,
		webKey,
		mimeType: 'image/jpeg',
		originalFilename: file.name,
		byteSize: d.original.length,
		sha256: sha256(d.original),
		thumb: d.thumb,
		isPrimary: 1
	} satisfies typeof documents.$inferInsert;
}

/**
 * Files a receipt.
 *
 * Shared by every route that offers the capture sheet, so filing from the vault
 * and filing from the receipts list cannot drift apart. Returns the action
 * result directly — either a `fail` or the payload the success screen needs to
 * show the total moving.
 */
export async function createReceipt(userId: number, form: FormData) {
	const parsed = parseReceiptForm(form);
	if (!parsed.ok) return fail(400, { error: parsed.error });
	const { serviceDate, amountCents, provider } = parsed.fields;

	// Two inputs, one upload: the camera and the file picker are separate
	// controls so a phone can go straight to the native camera.
	const file = [form.get('fileCamera'), form.get('filePick')].find(
		(f): f is File => f instanceof File && f.size > 0
	);

	let doc: typeof documents.$inferInsert | undefined;
	if (file) {
		try {
			doc = await storeUpload(userId, file, form);
		} catch (e) {
			// Only an undecodable upload is the user's problem. A failed write is
			// ours, and must surface as a 500 rather than blame their file.
			if (!(e instanceof UnsupportedUpload)) throw e;
			return fail(400, { error: 'That file is not a supported image or PDF.' });
		}
	}

	const totalBeforeCents = getUnreimbursedTotalCents(userId);

	const created = db.transaction((tx) => {
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
		created,
		filed: {
			amountCents,
			provider,
			serviceDate,
			totalBeforeCents,
			totalAfterCents: totalBeforeCents + (amountCents ?? 0)
		}
	};
}
