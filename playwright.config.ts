import { defineConfig } from '@playwright/test';

/** E2E against the built Electron app (`npm run e2e` builds first). The app runs hidden, in the background, and never
 *  takes focus (src/main/index.ts, MICROLAB_HIDDEN); every spec passes process.env on to electron.launch. Set
 *  MICROLAB_HIDDEN=0 to watch a run. */
process.env.MICROLAB_HIDDEN ??= '1';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  workers: 1,
  // On GitHub a broken run stops after 5 failures — each waits out its 30 s, and Windows once had 22 (11 minutes)
  maxFailures: process.env.CI ? 5 : 0,
  reporter: 'list',
});
