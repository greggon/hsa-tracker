import { describe, expect, it, vi } from 'vitest';

vi.mock('./index', async () => {
	const { makeTestDb } = await import('./testdb');
	return makeTestDb();
});

import { db } from './index';
import { users } from './schema';
import { normaliseEmail, upsertUser } from './users';

describe('normaliseEmail', () => {
	it('lowercases and trims', () => {
		expect(normaliseEmail('  Gregory.Goncharov@Gmail.COM ')).toBe('gregory.goncharov@gmail.com');
	});
});

describe('upsertUser', () => {
	it('creates a user the first time it sees an address', () => {
		const id = upsertUser('someone@example.test');
		expect(id).toBeGreaterThan(0);
		expect(upsertUser('someone@example.test')).toBe(id);
	});

	it('treats a differently-cased address as the same person', () => {
		// The failure this guards against: Cloudflare Access returning the
		// address in a different case would otherwise mint a second, empty user
		// and the ledger would appear to have vanished.
		const lower = upsertUser('gregory.goncharov@gmail.com');
		expect(upsertUser('Gregory.Goncharov@gmail.com')).toBe(lower);
		expect(upsertUser('GREGORY.GONCHAROV@GMAIL.COM')).toBe(lower);
	});

	it('ignores surrounding whitespace', () => {
		const id = upsertUser('spaced@example.test');
		expect(upsertUser('  spaced@example.test  ')).toBe(id);
	});

	it('stores the address in its normalised form', () => {
		upsertUser('MiXeD@Example.Test');
		const row = db.select({ email: users.email }).from(users).all();
		expect(row.map((r) => r.email)).toContain('mixed@example.test');
		expect(row.map((r) => r.email)).not.toContain('MiXeD@Example.Test');
	});

	it('still separates genuinely different people', () => {
		expect(upsertUser('a@example.test')).not.toBe(upsertUser('b@example.test'));
	});
});
