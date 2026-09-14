import { env } from '$env/dynamic/private';
import { getProviderSuggestions } from '$lib/server/db/stats';

export const load = ({ locals }) => ({
	build: {
		sha: (env.GIT_SHA ?? 'dev').slice(0, 7),
		time: env.BUILD_TIME ?? 'local'
	},
	// Loaded once for the whole app: the capture sheet and the receipt detail
	// screen both offer the same history, on whichever route they are opened.
	providers: getProviderSuggestions(locals.userId)
});
