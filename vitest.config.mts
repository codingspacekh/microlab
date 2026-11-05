import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const alias = { '@lib': fileURLToPath(new URL('./src/lib', import.meta.url)) };

/**
 * One Vitest project per test layer (docs/MILESTONES.md §3):
 *   npm test                     → every layer
 *   npx vitest --project python  → one layer
 * Playwright tests live in tests/e2e and run with `npm run e2e`.
 */
export default defineConfig({
  resolve: { alias },
  test: {
    passWithNoTests: true,
    projects: [
      { extends: true, test: { name: 'unit', include: ['tests/unit/**/*.test.ts'], environment: 'node' } },
      { extends: true, test: { name: 'python', include: ['tests/python/**/*.test.ts'], environment: 'node' } },
      { extends: true, test: { name: 'integration', include: ['tests/integration/**/*.test.ts'], environment: 'node' } },
      { extends: true, test: { name: 'acceptance', include: ['tests/acceptance/**/*.test.ts'], environment: 'node' } },
      // Speed budgets (Q14). Not run with coverage: `npm run perf`.
      { extends: true, test: { name: 'perf', include: ['tests/perf/**/*.test.ts'], environment: 'node' } },
      {
        extends: true,
        plugins: [react()],
        test: {
          name: 'component',
          include: ['tests/component/**/*.test.tsx'],
          environment: 'jsdom',
          setupFiles: ['tests/setup/component.ts'],
        },
      },
    ],
    coverage: {
      provider: 'v8',
      include: ['src/lib/**', 'src/sim/**', 'src/main/**'],
      // index.ts is Electron glue (windows, menus), proven by the e2e tests; sim/worker.ts only wires the Web Worker
      // to handleStart (worker-core.ts, tested), and the .d.ts has no code.
      exclude: ['src/main/index.ts', 'src/sim/worker.ts', 'src/sim/vendor.d.ts'],
      thresholds: {
        'src/lib/circuit/**': { lines: 95, branches: 95, functions: 95, statements: 95 },
        'src/lib/**': { lines: 90, branches: 90, functions: 90, statements: 90 },
        'src/sim/**': { lines: 85, branches: 85, functions: 85, statements: 85 },
        'src/main/**': { lines: 85, branches: 85, functions: 85, statements: 85 },
      },
    },
  },
});
