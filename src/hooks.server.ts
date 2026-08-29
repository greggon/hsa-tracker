import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';
import { verifyAccessJwt } from '$lib/server/access';
import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
  if (dev && !env.FORCE_ACCESS) {
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
  return resolve(event);
};