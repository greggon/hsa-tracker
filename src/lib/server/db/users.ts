import { eq } from 'drizzle-orm';
import { db } from './index';
import { users } from './schema';

/**
 * Email addresses are matched case-insensitively.
 *
 * SQLite compares TEXT case-sensitively and the column carries no COLLATE
 * NOCASE, so without this an identity provider returning a differently-cased
 * address — the same person, re-enrolled — would miss the existing row, insert
 * a second user, and silently present an empty vault. The ledger would look
 * lost behind a login that still worked.
 */
export function normaliseEmail(email: string): string {
	return email.trim().toLowerCase();
}

export function upsertUser(email: string): number {
	const normalised = normaliseEmail(email);

	db.insert(users).values({ email: normalised }).onConflictDoNothing().run();
	const row = db.select({ id: users.id }).from(users).where(eq(users.email, normalised)).get();

	return row!.id;
}
