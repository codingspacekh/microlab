import { join, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { contentType, resolveAppPath, responseHeaders } from '../../../src/main/app-protocol';

const root = join('/opt', 'MicroLab', 'renderer');

describe('app:// protocol — files of the window (architecture §2.2)', () => {
  it('serves index.html for the root', () => {
    expect(resolveAppPath(root, 'app://microlab/')).toBe(join(root, 'index.html'));
  });

  it('serves a nested file', () => {
    expect(resolveAppPath(root, 'app://microlab/assets/sim-worker-abc.js')).toBe(join(root, 'assets', 'sim-worker-abc.js'));
  });

  it('decodes spaces in names', () => {
    expect(resolveAppPath(root, 'app://microlab/assets/my%20file.wasm')).toBe(join(root, 'assets', 'my file.wasm'));
  });

  it('ignores the query and the hash', () => {
    expect(resolveAppPath(root, 'app://microlab/index.html?x=1#top')).toBe(join(root, 'index.html'));
  });

  it.each([
    ['app://microlab/../../etc/passwd'],
    ['app://microlab/%2e%2e/%2e%2e/etc/passwd'],
    ['app://microlab/assets/..%2F..%2F..%2Fsecret'],
  ])('never resolves outside the app folder: %s', (url) => {
    const file = resolveAppPath(root, url);
    expect(file === null || file.startsWith(root + sep)).toBe(true);
  });

  it('refuses an encoded ../ that would climb out', () => {
    expect(resolveAppPath(root, 'app://microlab/assets/..%2F..%2F..%2Fsecret')).toBeNull();
  });

  it('refuses something that is not a URL', () => {
    expect(resolveAppPath(root, 'not a url')).toBeNull();
  });

  it('refuses broken % encoding', () => {
    expect(resolveAppPath(root, 'app://microlab/%E0%A4%A')).toBeNull();
  });

  it('refuses another host', () => {
    expect(resolveAppPath(root, 'app://elsewhere/index.html')).toBeNull();
  });
});

describe('app:// protocol — headers', () => {
  it.each([
    ['index.html', 'text/html; charset=utf-8'],
    ['a.js', 'text/javascript'],
    ['a.mjs', 'text/javascript'],
    ['a.css', 'text/css'],
    ['micropython.wasm', 'application/wasm'],
    ['a.json', 'application/json'],
    ['a.svg', 'image/svg+xml'],
    ['a.woff2', 'font/woff2'],
    ['a.bin', 'application/octet-stream'],
  ])('%s is served as %s', (file, type) => {
    expect(contentType(file)).toBe(type);
  });

  it('every response is cross-origin isolated, so the worker can share memory', () => {
    const h = responseHeaders('a.js');
    expect(h['Cross-Origin-Opener-Policy']).toBe('same-origin');
    expect(h['Cross-Origin-Embedder-Policy']).toBe('require-corp');
  });

  it('the page gets a Content-Security-Policy that allows WebAssembly but no other origins', () => {
    const csp = responseHeaders('index.html')['Content-Security-Policy'] ?? '';
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("'wasm-unsafe-eval'");
    expect(csp).not.toContain('http');
  });
});
