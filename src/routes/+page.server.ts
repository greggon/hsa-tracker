import { and, desc, eq, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { documents, expenses } from '$lib/server/db/schema';

export const load = ({ locals }) => { 
    const rows = db.select({
        id: expenses.id,
        serviceDate: expenses.serviceDate,
        provider: expenses.provider,
        amountCents: expenses.amountCents,
        reimbursedAt: expenses.reimbursedAt,
        thumb: documents.thumb,
        docId: documents.id
    })
    .from(expenses)
    .leftJoin(
        documents,
        and(eq(documents.expenseId, expenses.id), eq(documents.isPrimary, 1)) 
    )
    .where(and(eq(expenses.userId, locals.userId), isNull(expenses.deletedAt)))
    .orderBy(desc(expenses.serviceDate), desc(expenses.id))
    .all();

    return {
        expenses: rows.map((r) => ({
            ...r,
            thumb: r.thumb ? `data:image/jpeg;base64,${(r.thumb as Buffer).toString('base64')}` : null
        }))
    };
};