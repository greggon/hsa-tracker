import { env } from '$env/dynamic/private';

export const load = () => ({
  build: {
    sha: (env.PUBLIC_GIT_SHA ?? 'dev').slice(0, 7),
    time: env.PUBLIC_BUILD_TIME ?? 'local'
  }
});