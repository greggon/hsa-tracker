import { and, eq, isNull } from 'drizzle-orm';
import { expenses } from './schema';

/**
 * Deleting a receipt is a soft delete, so *every* read has to exclude
 * `deleted_at` rows. Spelled out at each call site that rule was repeated a
 * dozen times, and omitting it once does not raise an error — it quietly
 * resurrects a deleted receipt into a total. Composing these instead means the
 * rule exists once.
 */

/** The bare predicate, for joins that scope ownership some other way. */
export const notDeleted = isNull(expenses.deletedAt);

/** A user's live expenses, optionally narrowed to one of them. */
export function liveExpenses(userId: number, id?: number) {
	const parts = [eq(expenses.userId, userId), notDeleted];
	if (id != null) parts.push(eq(expenses.id, id));
	return and(...parts);
}
