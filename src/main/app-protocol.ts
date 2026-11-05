import { extname, join, normalize, sep } from 'node:path';

/** The window's files are served from app://microlab/ (architecture §2.2). */
export const APP_SCHEME = 'app';
export const APP_HOST = 'microlab';
export const APP_URL = `${APP_SCHEME}://${APP_HOST}/`;

/** Cross-origin isolation, so the simulation worker can share memory with the window. */
export const isolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
} as const;

const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "worker-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
].join('; ');

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.wasm': 'application/wasm',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.py': 'text/plain; charset=utf-8',
};

export function contentType(file: string): string {
  return TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream';
}

/** The file on disk for an app:// URL, or null if it is not one of the app's own files. */
export function resolveAppPath(rootDir: string, url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== `${APP_SCHEME}:` || parsed.host !== APP_HOST) return null;
  let path: string;
  try {
    path = decodeURIComponent(parsed.pathname);
  } catch {
    return null;
  }
  if (path === '' || path === '/') path = '/index.html';
  const root = normalize(rootDir);
  const full = normalize(join(root, path));
  if (!full.startsWith(root + sep)) return null;
  return full;
}

export function responseHeaders(file: string): Record<string, string> {
  const headers: Record<string, string> = { ...isolationHeaders, 'Content-Type': contentType(file) };
  if (extname(file).toLowerCase() === '.html') headers['Content-Security-Policy'] = CSP;
  return headers;
}
