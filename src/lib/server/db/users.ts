import { eq } from 'drizzle-orm';
import { db } from './index';
import { users } from './schema';

export function upsertUser(email: string): number { 
    db.insert(users).values({email}).onConflictDoNothing().run();
    const row = db.select({id: users.id}).from(users)
        .where(eq(users.email, email)).get();
    return row!.id;
}