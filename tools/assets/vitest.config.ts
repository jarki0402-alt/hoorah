import { defineConfig } from 'vitest/config';

/** The asset workshop's tests on their own (the root config runs them too). */
export default defineConfig({
  test: {
    include: ['tools/assets/test/**/*.test.ts'],
    environment: 'node',
  },
});
