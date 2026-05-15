import { defineConfig } from 'vite';

/** GitHub project Pages URL is /<repo>/; CI sets GITHUB_REPOSITORY=owner/repo. */
function baseForGithubPages(): string {
  const full = process.env.GITHUB_REPOSITORY;
  if (!full?.includes('/')) {
    return '/php-generate-type-checker/';
  }
  const name = full.split('/', 2)[1];
  if (!name) {
    return '/php-generate-type-checker/';
  }
  return `/${name}/`;
}

export default defineConfig(({ mode }) => ({
  base: mode === 'pages' ? baseForGithubPages() : '/',
  test: {
    globals: false,
    include: ['src/**/*.test.ts'],
  },
}));
