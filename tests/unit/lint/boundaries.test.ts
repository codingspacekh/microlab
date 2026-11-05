import { ESLint } from 'eslint';
import { beforeAll, describe, expect, it } from 'vitest';

let eslint: ESLint;
beforeAll(() => {
  eslint = new ESLint({ cwd: process.cwd() });
});

async function errors(code: string, filePath: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? []).map((m) => m.ruleId ?? m.message);
}

describe('boundary: src/lib is pure (architecture §2.2)', () => {
  it.each([
    ["import { app } from 'electron';"],
    ["import { readFileSync } from 'node:fs';"],
    ["import path from 'path';"],
    ["import React from 'react';"],
    ['export const w = window.innerWidth;'],
  ])('refuses %s in src/lib', async (code) => {
    const found = await errors(code, 'src/lib/circuit/x.ts');
    expect(found.some((r) => r === 'no-restricted-imports' || r === 'no-restricted-globals')).toBe(true);
  });

  it('allows the same Electron import in src/main', async () => {
    expect(await errors("import { app } from 'electron';\nexport { app };\n", 'src/main/x.ts')).toEqual([]);
  });

  it('allows plain TypeScript in src/lib', async () => {
    expect(await errors('export const ohms = (v: number, i: number): number => v / i;\n', 'src/lib/circuit/x.ts')).toEqual([]);
  });
});

describe('N-14 controls: only our own controls reach the screen', () => {
  it.each([
    ['<select><option>Red</option></select>'],
    ['<input type="color" />'],
    ['<input type="time" />'],
    ['<input type="range" />'],
    ['<input type="number" />'],
  ])('refuses %s in a screen', async (jsx) => {
    const found = await errors(`export const X = () => ${jsx};\n`, 'src/renderer/src/screen.tsx');
    expect(found).toContain('no-restricted-syntax');
  });

  it('allows them inside src/renderer/ui, where the kit is built', async () => {
    expect(await errors('export const X = () => <select><option>Red</option></select>;\n', 'src/renderer/ui/select.tsx')).toEqual([]);
  });

  it('allows a plain text input in a screen', async () => {
    expect(await errors('export const X = () => <input type="text" />;\n', 'src/renderer/src/screen.tsx')).toEqual([]);
  });
});
