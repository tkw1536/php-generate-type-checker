import { defineConfig } from 'vite';

export default defineConfig({
  test: {
    globals: false,
    include: ['src/**/*.test.ts'],
    fsModuleCache: true,

    // not sure if we have side effects between files - so let's keep this off
    isolate: false,
  },
});
