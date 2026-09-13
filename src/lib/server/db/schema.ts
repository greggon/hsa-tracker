import { sql } from 'drizzle-orm';
import { blob, index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

const now = sql`(unixepoch())`;

export const users = sqliteTable('users', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	email: text('email').notNull().unique(),
	/** YYYY-MM-DD. Backs the receipt checklist's "Dated after your HSA was opened". */
	hsaOpenedOn: text('hsa_opened_on'),
	createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(now)
});

export const expenses = sqliteTable(
	'expenses',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		userId: integer('user_id')
			.notNull()
			.references(() => users.id),
		serviceDate: text('service_date').notNull(), //YYYY-MM-DD
		/**
		 * Nullable: a receipt whose amount could not be read still has to be
		 * filed, so it can surface in the "Needs a field" list. A null amount is
		 * excluded from the running total until it is filled in.
		 */
		amountCents: integer('amount_cents'),
		provider: text('provider'),
		reimbursedAt: integer('reimbursed_at', { mode: 'timestamp' }),
		reimbursedAmountCents: integer('reimbursed_amount_cents').notNull().default(0),
		createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(now),
		updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(now),
		deletedAt: integer('deleted_at', { mode: 'timestamp' })
	},
	(t) => [index('idx_expenses_outstanding').on(t.userId, t.reimbursedAt, t.deletedAt)]
);

export const documents = sqliteTable(
	'documents',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		userId: integer('user_id')
			.notNull()
			.references(() => users.id),
		expenseId: integer('expense_id').references(() => expenses.id, { onDelete: 'cascade' }),
		storageKey: text('storage_key').notNull(),
		webKey: text('web_key'),
		originalFilename: text('original_filename'),
		mimeType: text('mime_type').notNull(),
		byteSize: integer('byte_size').notNull(),
		sha256: text('sha256').notNull(),
		thumb: blob('thumb', { mode: 'buffer' }),
		isPrimary: integer('is_primary').notNull().default(0),
		createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(now)
	},
	(t) => [index('idx_documents_expense').on(t.expenseId)]
);
