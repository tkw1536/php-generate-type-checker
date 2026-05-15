import { defineConfig } from 'vite';

export default defineConfig({
  test: {
    globals: false,
    include: ['src/**/*.test.ts'],
  },
});
