// M0 spike: MicroPython WebAssembly in a worker inside an Electron window (throw-away, T10).
// Run: npm run spike:electron   → prints one JSON line of measurements, then quits.
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, protocol } from 'electron';

const here = dirname(fileURLToPath(import.meta.url));
const mpDir = dirname(createRequire(import.meta.url).resolve('@micropython/micropython-webassembly-pyscript'));
const types = { '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript', '.wasm': 'application/wasm' };
app.setPath('userData', join(app.getPath('temp'), 'microlab-spike'));

protocol.registerSchemesAsPrivileged([{ scheme: 'spike', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);

app.whenReady().then(() => {
  protocol.handle('spike', async (req) => {
    const path = new URL(req.url).pathname;
    const file = path.startsWith('/mp/') ? join(mpDir, path.slice(4)) : join(here, path);
    const body = await readFile(file);
    return new Response(body, {
      headers: {
        'Content-Type': types[extname(file)] ?? 'application/octet-stream',
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'require-corp',
      },
    });
  });
  const win = new BrowserWindow({ show: false, webPreferences: { backgroundThrottling: false, sandbox: true, contextIsolation: true } });
  win.webContents.on('did-fail-load', (_e, code, desc, url) => console.log('[fail]', code, desc, url));
  win.webContents.on('did-finish-load', () => console.log('[loaded]', win.webContents.getURL()));
  win.webContents.on('console-message', (e, _level, legacyMessage) => {
    const msg = e.message ?? legacyMessage ?? '';
    if (msg.startsWith('RESULT ')) {
      console.log(msg.slice(7));
      app.quit();
    } else console.log('[page]', msg);
  });
  setTimeout(() => { console.log('{"timeout":true}'); app.quit(); }, 60000);
  void win.loadURL('spike://x/index.html');
});
