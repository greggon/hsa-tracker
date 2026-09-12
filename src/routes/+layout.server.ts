import { env } from '$env/dynamic/private';

export const load = () => ({
  build: {
    sha: (env.GIT_SHA ?? 'dev').slice(0, 7),
    time: env.BUILD_TIME ?? 'local'
  }
});