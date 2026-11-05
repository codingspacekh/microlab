import { defineConfig } from '@playwright/test';

/** E2E against the built Electron app (`npm run e2e` builds first). */
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  workers: 1,
  reporter: 'list',
});
