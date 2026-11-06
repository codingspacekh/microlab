import { defineConfig } from '@playwright/test';

/** E2E against the built Electron app (`npm run e2e` builds first). The app runs hidden, in the background, and never
 *  takes focus (src/main/index.ts, MICROLAB_HIDDEN); every spec passes process.env on to electron.launch. Set
 *  MICROLAB_HIDDEN=0 to watch a run. */
process.env.MICROLAB_HIDDEN ??= '1';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  workers: 1,
  reporter: 'list',
});
