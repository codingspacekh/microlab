import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'electron-vite';

/** Cross-origin isolation, so the simulation worker can share memory with the window (architecture §2.2). */
const isolation = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

export default defineConfig({
  main: {
    resolve: { alias: { '@lib': resolve('src/lib') } },
  },
  preload: {
    // A sandboxed preload must be CommonJS.
    build: { rollupOptions: { output: { format: 'cjs', entryFileNames: '[name].cjs' } } },
  },
  renderer: {
    resolve: { alias: { '@lib': resolve('src/lib') } },
    plugins: [react()],
    server: { headers: isolation },
    preview: { headers: isolation },
    worker: { format: 'es' },
  },
});
