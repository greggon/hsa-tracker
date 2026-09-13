import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import { env } from '$env/dynamic/private';

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
  if (!payload.email) throw new Error('no email claim');
  return payload.email as string;
}


//old 
/*
const teamDomain = env.CF_ACCESS_TEAM_DOMAIN; // https://yourteam.cloudflareaccess.com
const aud = env.CF_ACCESS_AUD;

const JWKS = createRemoteJWKSet(new URL(`${teamDomain}/cdn-cgi/access/certs`));

export async function verifyAccessJwt(token: string): Promise<string> {
  const { payload } = await jwtVerify(token, JWKS, {
    issuer: teamDomain,
    audience: aud
  });
  if (!payload.email) throw new Error('no email claim');
  return payload.email as string;
}
  */