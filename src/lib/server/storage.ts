import { createHash, randomUUID } from 'node:crypto';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { env } from '$env/dynamic/private';

/**
 * Where original uploads and their derivatives live.
 *
 * Read lazily rather than at module load: importing a module should not create
 * directories, and `vite build` imports this one while bundling.
 */
export function uploadRoot(): string {
	return env.UPLOAD_ROOT ?? 'data/uploads';
}

export const sha256 = (buf: Buffer) => createHash('sha256').update(buf).digest('hex');

/** Keys are date-partitioned so a directory listing stays browsable by hand. */
export function makeKey(ext: string): string {
	const d = new Date();
	const mm = String(d.getMonth() + 1).padStart(2, '0');
	return `${d.getFullYear()}/${mm}/${randomUUID()}.${ext}`;
}

/**
 * Writes via a temporary file and renames into place, so a crash mid-write
 * cannot leave a half-written receipt that the database believes is complete.
 */
export async function writeAtomic(key: string, buf: Buffer): Promise<void> {
	const full = join(uploadRoot(), key);
	await mkdir(dirname(full), { recursive: true });
	const tmp = `${full}.tmp`;
	await writeFile(tmp, buf);
	await rename(tmp, full);
}
