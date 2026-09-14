import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { env } from '$env/dynamic/private';
import * as schema from './schema';

/*
 * Tests must never reach a real database. They mock this module out entirely
 * (see testdb.ts); if one ever imports it for real, fail loudly here rather
 * than let a fixture's `delete` run against whatever DATABASE_PATH resolves to.
 * That is not hypothetical — it destroyed the development database once.
 */
if (process.env.VITEST) {
	throw new Error(
		'src/lib/server/db/index.ts was imported inside a test. ' +
			"Mock it with vi.mock('./index', …) and makeTestDb() instead."
	);
}

type Db = BetterSQLite3Database<typeof schema>;

let instance: Db | undefined;

/**
 * Opens the database and brings its schema up to date. Idempotent.
 *
 * Called explicitly from `hooks.server.ts` at server start, and lazily by the
 * first query otherwise. Deliberately *not* run as a side effect of importing
 * this module: `vite build` imports server modules while bundling, so migration
 * on import meant every production build silently migrated whatever database
 * DATABASE_PATH happened to point at on the machine doing the building.
 */
export function initDb(): Db {
	if (instance) return instance;

	const dbPath = env.DATABASE_PATH ?? 'data/hsa.db';
	mkdirSync(dirname(dbPath), { recursive: true });

	const sqlite = new Database(dbPath);
	sqlite.pragma('journal_mode = WAL');
	sqlite.pragma('busy_timeout = 5000');

	const db = drizzle(sqlite, { schema });

	/*
	 * Foreign keys stay OFF for the duration of the migration, then go back ON.
	 *
	 * SQLite cannot ALTER a column, so drizzle implements a nullability or
	 * drop-column change as a table rebuild: CREATE `__new_expenses`, copy the
	 * rows, DROP TABLE `expenses`, rename. With enforcement ON, that DROP performs
	 * an implicit DELETE of every row, which cascades through
	 * documents.expense_id (ON DELETE cascade) and destroys every receipt record —
	 * silently, with foreign_key_check still reporting zero violations afterwards.
	 *
	 * The `PRAGMA foreign_keys=OFF` drizzle writes at the top of such a migration
	 * cannot prevent this: that pragma is a no-op inside a transaction, and the
	 * migrator runs each migration in one. Disabling it out here, around the whole
	 * migrate() call, is SQLite's own documented procedure for this class of
	 * schema change.
	 */
	sqlite.pragma('foreign_keys = OFF');
	try {
		migrate(db, { migrationsFolder: './drizzle' });

		const violations = sqlite.pragma('foreign_key_check') as unknown[];
		if (violations.length > 0) {
			throw new Error(
				`Migration left ${violations.length} foreign key violation(s); refusing to start. ` +
					`Restore the database from backup before retrying.`
			);
		}
	} finally {
		sqlite.pragma('foreign_keys = ON');
	}

	instance = db;
	return instance;
}

/**
 * The database, opened on first use.
 *
 * A proxy so that every call site can keep reading `db.select(...)` while the
 * connection itself stays lazy. Methods are bound to the real instance, so
 * `db.transaction(...)` behaves exactly as if it had been called on it.
 */
export const db: Db = new Proxy({} as Db, {
	get(_target, prop) {
		const real = initDb() as unknown as Record<string | symbol, unknown>;
		const value = real[prop];
		return typeof value === 'function' ? value.bind(real) : value;
	}
});
