import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';
import { verifyAccessJwt } from '$lib/server/access';
import { initDb } from '$lib/server/db';
import { upsertUser } from '$lib/server/db/users';
import type { Handle } from '@sveltejs/kit';

// Opened and migrated once, at server start rather than at request time, so a
// failed migration stops the server instead of failing the first request.
initDb();

export const handle: Handle = async ({ event, resolve }) => {
	const forceAccess = env.FORCE_ACCESS === '1';
	if (dev && !forceAccess) {
		event.locals.email = env.DEV_EMAIL ?? 'dev@localhost';
	} else {
		const token = event.request.headers.get('cf-access-jwt-assertion');
		if (!token) return new Response('Unauthorized', { status: 401 });
		try {
			event.locals.email = await verifyAccessJwt(token);
		} catch {
			return new Response('Forbidden', { status: 403 });
		}
	}
	event.locals.userId = upsertUser(event.locals.email);

	return resolve(event);
};
