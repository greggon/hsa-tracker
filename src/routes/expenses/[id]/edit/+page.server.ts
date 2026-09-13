import { error } from '@sveltejs/kit'
import { and, eq, isNull } from 'drizzle-orm'
import { db } from '$lib/server/db';
import { expenses } from '$lib/server/db/schema';

export const load = ({ params, locals }) => {
    const expense = db
        .select()
        .from(expenses)
        .where(
            and(
                eq(expenses.id, Number(params.id)),
                eq(expenses.userId, locals.userId),
                isNull(expenses.deletedAt)
            )
        )
        .get();

    if (!expense) error(404, 'Expense not found');
    return { expense };
}