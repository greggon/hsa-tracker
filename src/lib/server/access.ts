import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import { env } from '$env/dynamic/private';

/**
 * Cloudflare Access is the only way in: there is no login form and no session,
 * so this verification is the entire authentication boundary.
 */

// Cached across requests — createRemoteJWKSet keeps its own key cache, and
// rebuilding it every request would re-fetch Cloudflare's JWKS each time.
let jwks: JWTVerifyGetKey | undefined;

export async function verifyAccessJwt(token: string): Promise<string> {
	const teamDomain = env.CF_ACCESS_TEAM_DOMAIN;
	const aud = env.CF_ACCESS_AUD;
	if (!teamDomain || !aud) {
		throw new Error('CF_ACCESS_TEAM_DOMAIN and CF_ACCESS_AUD must be set');
	}

	jwks ??= createRemoteJWKSet(new URL(`${teamDomain}/cdn-cgi/access/certs`));

	const { payload } = await jwtVerify(token, jwks, {
		issuer: teamDomain,
		audience: aud
	});

	// Checked rather than asserted: this string becomes the user's identity, so a
	// malformed or absent claim must fail closed instead of being cast into one.
	const email = payload.email;
	if (typeof email !== 'string' || email.trim() === '') {
		throw new Error('token carries no usable email claim');
	}
	return email;
}
