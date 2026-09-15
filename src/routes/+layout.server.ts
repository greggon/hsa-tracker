import { env } from '$env/dynamic/private';
import { buildTime } from '$lib/format';
import { getProviderSuggestions } from '$lib/server/db/stats';

export const load = ({ locals }) => ({
	build: {
		sha: (env.GIT_SHA ?? 'dev').slice(0, 7),
		time: buildTime(env.BUILD_TIME ?? 'local'),
		/** Machine-readable original, for the <time> element. */
		timeISO: env.BUILD_TIME ?? ''
	},
	// Loaded once for the whole app: the capture sheet and the receipt detail
	// screen both offer the same history, on whichever route they are opened.
	providers: getProviderSuggestions(locals.userId)
});
