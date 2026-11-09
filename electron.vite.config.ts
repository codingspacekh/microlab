import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'electron-vite';
import { recordPackages } from './scripts/lib/record-packages.ts';

/** Cross-origin isolation, so the simulation worker can share memory with the window (architecture §2.2). */
const isolation = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

export default defineConfig({
  // each build writes the npm packages it put into the app (THIRD_PARTY_LICENSES, N-11)
  main: {
    resolve: { alias: { '@lib': resolve('src/lib') } },
    plugins: [recordPackages('main')],
  },
  preload: {
    plugins: [recordPackages('preload')],
    // A sandboxed preload must be CommonJS.
    build: { rollupOptions: { output: { format: 'cjs', entryFileNames: '[name].cjs' } } },
  },
  renderer: {
    resolve: { alias: { '@lib': resolve('src/lib') } },
    plugins: [react(), recordPackages('pages')],
    // A fixed port of its own (the other edutools apps use 3000–3239); strictPort: if it's busy, `npm run dev`
    // stops with an error instead of moving to a port another app may use. Electron gets the URL from electron-vite.
    server: { port: 5391, strictPort: true, headers: isolation },
    preview: { headers: isolation },
    worker: { format: 'es', plugins: () => [recordPackages('worker')] },
    // fonts are files, never inlined as data: URLs — the window's policy allows fonts from the app only (font-src 'self');
    // small pieces of the code fonts (M12 Rev 12) would otherwise be inlined and refused
    build: { assetsInlineLimit: (file: string) => (/\.(woff2?|ttf|otf)$/.test(file) ? false : undefined) },
  },
});
