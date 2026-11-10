// A Vite plugin that writes which npm packages a build put into the app, for THIRD_PARTY_LICENSES
// (scripts/licences.ts): build-info/packages-<name>.json. (As OneEditor's.)
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Plugin } from 'vite';
import { bundledPackages } from './licences.ts';

export function recordPackages(name: string): Plugin {
  return {
    name: 'microlab-record-packages',
    apply: 'build',
    generateBundle() {
      const packages = bundledPackages([...this.getModuleIds()]);
      mkdirSync('build-info', { recursive: true });
      writeFileSync(join('build-info', `packages-${name}.json`), `${JSON.stringify(packages, null, 2)}\n`);
    },
  };
}
