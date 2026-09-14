import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from './schema';

/**
 * A throwaway database for tests, held entirely in memory.
 *
 * In-memory on purpose: a test must not be able to reach a file on disk at all.
 * An earlier version pointed DATABASE_PATH at a temp file, but `.env` is loaded
 * by Vite and its value won over the one the setup file assigned, so the suite
 * silently ran against the real database and its fixtures wiped it.
 *
 * The schema is built by applying the project's real migrations, so tests still
 * exercise the DDL that ships.
 */
export function makeTestDb() {
	const sqlite = new Database(':memory:');
	sqlite.pragma('foreign_keys = OFF');
	const db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: './drizzle' });
	sqlite.pragma('foreign_keys = ON');
	return { db, sqlite };
}
