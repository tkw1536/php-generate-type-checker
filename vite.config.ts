import { defineConfig } from 'vite';

const fromCi = process.env.GITHUB_SHA;
const appGitSha =
  fromCi !== undefined && fromCi !== '' ? fromCi.slice(0, 7) : '';
const appBuildTime = new Date().toISOString();

export default defineConfig({
  define: {
    'import.meta.env.APP_GIT_SHA': JSON.stringify(appGitSha),
    'import.meta.env.APP_BUILD_TIME': JSON.stringify(appBuildTime),
  },
  test: {
    globals: false,
    include: ['src/**/*.test.ts'],
    fsModuleCache: true,

    // not sure if we have side effects between files - so let's keep this off
    isolate: false,
  },
});
