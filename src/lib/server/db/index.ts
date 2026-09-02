import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { env } from '$env/dynamic/private';
import * as schema from './schema';

import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const dbPath = env.DATABASE_PATH ?? 'data/hsa.db';
mkdirSync(dirname(dbPath), { recursive: true });

const sqlite = new Database(env.DATABASE_PATH ?? 'data/hsa.db');
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('busy_timeout = 5000');
sqlite.pragma('foreign_keys = ON');

export const db = drizzle(sqlite, { schema });

migrate(db, { migrationsFolder: './drizzle'});