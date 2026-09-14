import { createReadStream, existsSync } from 'node:fs';
import { Readable } from 'node:stream';
import { join } from 'node:path';
import { and, eq } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { documents } from '$lib/server/db/schema';
import { dispositionFilename } from '$lib/server/http';
import { uploadRoot } from '$lib/server/storage';

/**
 * Serves one document in one of three variants:
 *
 *   ?thumb      the 240px JPEG held as a blob on the row — list thumbnails
 *   ?web        the 1600px JPEG derivative on disk — the detail screen
 *   (neither)   the stored original; add ?download for an attachment
 *
 * Stored bytes never change once written, so each variant is immutable for a
 * year and carries an ETag derived from the original's content hash, which
 * keeps a hard reload from re-sending every thumbnail in a long list.
 */
export async function GET({ params, locals, url, request }) {
	// Guaranteed a positive integer by the [id=integer] route matcher.
	const id = Number(params.id);

	const doc = db
		.select()
		.from(documents)
		.where(and(eq(documents.id, id), eq(documents.userId, locals.userId)))
		.get();

	if (!doc) error(404);

	const variant = url.searchParams.has('thumb')
		? 'thumb'
		: url.searchParams.has('web') && doc.webKey
			? 'web'
			: 'original';

	const etag = `"${doc.sha256}-${variant}"`;
	if (request.headers.get('if-none-match') === etag) {
		return new Response(null, { status: 304, headers: { etag } });
	}

	const headers = new Headers({
		etag,
		'cache-control': 'private, max-age=31536000, immutable'
	});

	if (variant === 'thumb') {
		const thumb = doc.thumb as Buffer | null;
		// PDFs are stored without a thumbnail; the list renders a placeholder
		// instead of requesting one.
		if (!thumb) error(404);
		headers.set('content-type', 'image/jpeg'); // derivatives are always JPEG
		headers.set('content-length', String(thumb.byteLength));
		headers.set('content-disposition', 'inline');
		// A zero-copy view: better-sqlite3 may hand back a Buffer pointing into a
		// larger pool, and Buffer itself is not assignable to BodyInit.
		// The cast pins the generic to ArrayBuffer; the DOM's BodyInit does not
		// accept the ArrayBufferLike that Buffer carries.
		const body = new Uint8Array(thumb.buffer as ArrayBuffer, thumb.byteOffset, thumb.byteLength);
		return new Response(body, { headers });
	}

	const key = variant === 'web' ? doc.webKey! : doc.storageKey;
	const full = join(uploadRoot(), key);

	// Without this the read stream fails after the response has already begun,
	// which reaches the browser as a truncated image rather than a 404.
	if (!existsSync(full)) error(404);

	const download = url.searchParams.has('download');
	headers.set('content-type', variant === 'web' ? 'image/jpeg' : doc.mimeType);
	headers.set(
		'content-disposition',
		`${download ? 'attachment' : 'inline'}; ${dispositionFilename(doc.originalFilename)}`
	);

	return new Response(Readable.toWeb(createReadStream(full)) as ReadableStream, { headers });
}
