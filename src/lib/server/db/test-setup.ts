import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Point the database module at a throwaway file before anything imports it.
 *
 * `db/index.ts` opens `DATABASE_PATH` and runs the real migrations at import
 * time, so each test run gets a fresh database built by the same DDL that ships
 * — including the foreign-key handling around the table rebuild.
 */
process.env.DATABASE_PATH = join(mkdtempSync(join(tmpdir(), 'hsa-test-')), 'test.db');
