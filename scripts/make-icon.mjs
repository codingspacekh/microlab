#!/usr/bin/env node
/**
 * MicroLab's app icon (M11, F-107, screen 32): the top bar's logo in the macOS icon layout, drawn by the design's own
 * code (design/iconfigs.py, `logo`) and rendered at 1024 × 1024 with a clear background into build/icon.png (and the
 * SVG beside it). electron-builder makes the .icns (macOS) and .ico (Windows) from it.
 *
 *   npm run icon
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'build');
const svg = execFileSync('python3', ['-I', '-c', "import sys; sys.path.insert(0, sys.argv[1]); import iconfigs; print(iconfigs.icon('logo', '1024', 'icon'))", join(ROOT, 'design')], { encoding: 'utf8' }).trim();
mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, 'icon.svg'), `${svg.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ')}\n`);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1024, height: 1024 }, deviceScaleFactor: 1 });
await page.setContent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`);
await page.locator('svg').screenshot({ path: join(OUT, 'icon.png'), omitBackground: true });
await browser.close();
console.log('build/icon.png and build/icon.svg (1024 × 1024)');
