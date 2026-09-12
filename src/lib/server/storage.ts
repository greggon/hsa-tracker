import { createHash, randomUUID } from 'node:crypto';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { env } from '$env/dynamic/private';
import { mkdirSync } from 'node:fs'

export const UPLOAD_ROOT = env.UPLOAD_ROOT ?? 'data/uploads';

mkdirSync(UPLOAD_ROOT, { recursive: true })

export const sha256 = (buf: Buffer) => 
    createHash('sha256').update(buf).digest('hex');

export function makeKey(ext: string): string {
    const d = new Date();
    const mm = String(d.getMonth() +1).padStart(2, '0');
    return `${d.getFullYear()}/${mm}/${randomUUID()}.${ext}`;
}

export async function writeAtomic(key: string, buf: Buffer): Promise<void> {
    const full = join(UPLOAD_ROOT, key);
    await mkdir(dirname(full), { recursive: true });
    const tmp = `${full}.tmp`;
    await writeFile(tmp, buf);
    await rename(tmp, full);
}