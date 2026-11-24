import { defineConfig } from '@playwright/test';

/**
 * End-to-end: a real server + Vite, a TV in desktop Chromium, phones emulated as
 * iPhone (WebKit/Safari engine) and Android (Chromium). Browsers are launched inside the spec.
 */
/** Not 8790: keeps e2e clear of a running dev server on the usual port. */
const E2E_SERVER_PORT = 8797;

export default defineConfig({
  testDir: 'e2e',
  timeout: 240_000,
  expect: { timeout: 15_000 },
  workers: 1,
  reporter: [['list']],
  outputDir: 'test-results',
  webServer: [
    {
      command: 'npx tsx apps/server/src/index.ts',
      port: E2E_SERVER_PORT,
      reuseExistingServer: false,
      env: {
        PORT: String(E2E_SERVER_PORT),
        MAX_PLAYERS: '2',
        // Every game playable in the flows; the free tier and its limits are switched on per test.
        OPEN_ALL: '1',
        SNAPSHOT_FILE: 'test-results/rooms.json',
        DB_FILE: ':memory:',
        ADMIN_USERNAME: 'admin',
        ADMIN_PASSWORD: 'e2e-admin-pass',
        LOG_LEVEL: 'warn',
        ROOMS_PER_IP_PER_MINUTE: '200',
      },
    },
    {
      command: 'npm run dev -w @hoorah/web',
      url: 'http://localhost:5173/',
      reuseExistingServer: false,
      env: { HOORAH_SERVER_PORT: String(E2E_SERVER_PORT) },
      timeout: 60_000,
    },
  ],
});
