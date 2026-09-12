import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import { join } from 'node:path';
import { and, eq } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { documents } from '$lib/server/db/schema';
import { UPLOAD_ROOT } from '$lib/server/storage';

export async function GET({ params, locals, url }) {
    const doc = db.select().from(documents)
        .where(and(eq(documents.id, Number(params.id)),
    eq(documents.userId, locals.userId)))
    .get();

    if(!doc) error(404);

    const wantsWeb = url.searchParams.has('web') && doc?.webKey;
    const key = wantsWeb ? doc.webKey! : doc?.storageKey;
    const download = url.searchParams.has('download');

    const stream = createReadStream(join(UPLOAD_ROOT, key));
    return new Response(Readable.toWeb(stream) as ReadableStream, { 
        headers: {
            'content-type': doc.mimeType,
            'content-disposition': `${download ? 'attachment' : 'inline'}; filename="${(doc.originalFilename ?? 'receipt').replace(/"/g, '')}"`,
            'cache-control': 'private, max-age=31536000, immutable'
        }
    });
}