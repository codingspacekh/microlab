// M11.4 (N-11): THIRD_PARTY_LICENSES lists everything MicroLab ships that CodingSpaceKH did not write, with its licence,
// and stops the release at anything without a licence text or under a copyleft one. (As OneEditor's.)
import { describe, expect, it } from 'vitest';
import {
  bundledPackages, copyleft, isLicenceFile, licenceTextOf, packageLists, pythonLicence, shippedPackages, thirdPartyLicences,
  type LicenceInputs,
} from '../../../scripts/lib/licences.ts';

const inputs = (): LicenceInputs => ({
  appVersion: '1.0.0',
  electron: { version: '45.2.3', licence: 'MIT License\nCopyright (c) Electron contributors' },
  python: { version: '3.13.18', texts: [{ name: 'LICENSE.cpython.txt', text: 'PSF LICENSE AGREEMENT FOR PYTHON' }, { name: 'LICENSE.tcl.txt', text: 'Tcl/Tk licence' }] },
  pythonPackages: [
    { name: 'pip', version: '26.2.2', licence: 'MIT', texts: [{ name: 'LICENSE.txt', text: 'Copyright (c) pip developers' }, { name: 'src/pip/_vendor/rich/LICENSE', text: 'Copyright (c) Will McGugan' }] },
    { name: 'jedi', version: '0.20.1', licence: 'MIT', texts: [{ name: 'LICENSE.txt', text: 'Copyright (c) David Halter' }] },
  ],
  micropython: { version: '1.29.0', licence: 'Copyright (c) 2013-2026 Damien P. George' },
  firmware: [
    { name: 'MicroPython for the Raspberry Pi Pico W', version: 'v1.29.0', source: 'https://micropython.org/x.uf2', texts: [{ name: 'pico-w-firmware/cyw43-driver-LICENSE.RP.txt', text: 'only with RP2040' }] },
  ],
  libraries: [{ id: 'hcsr04', licence: 'Apache-2.0', text: 'Apache License 2.0 (Roberto Sánchez)' }],
  packages: [
    { name: 'react', version: '19.2.0', licence: 'MIT', text: 'Copyright (c) Meta Platforms' },
    { name: '@fontsource-variable/inter', version: '5.2.8', licence: 'OFL-1.1', text: 'SIL OPEN FONT LICENSE Version 1.1 (Inter)' },
  ],
});

describe('THIRD_PARTY_LICENSES', () => {
  it('says whose MicroLab is, then each part with its version and licence text', () => {
    const text = thirdPartyLicences(inputs());
    expect(text.startsWith('MicroLab 1.0.0 — third-party components\n\nMicroLab is © 2026 CodingSpaceKH. All rights reserved.')).toBe(true);
    for (const part of [
      'Electron 45.2.3 — MIT License', 'Copyright (c) Electron contributors', 'LICENSES.chromium.html',
      'Python 3.13.18 — Python Software Foundation License', 'python-build-standalone', '--- LICENSE.tcl.txt ---', 'Tcl/Tk licence',
      '--- pip 26.2.2 (MIT) ---', 'Copyright (c) Will McGugan', '--- jedi 0.20.1 (MIT) ---',
      'MicroPython 1.29.0 — MIT License', 'Damien P. George',
      '--- MicroPython for the Raspberry Pi Pico W v1.29.0 ---', 'from https://micropython.org/x.uf2', 'only with RP2040',
      '--- hcsr04 (Apache-2.0) ---', 'Roberto Sánchez',
      '--- react 19.2.0 (MIT) ---', '--- @fontsource-variable/inter 5.2.8 (OFL-1.1) ---', 'SIL OPEN FONT LICENSE Version 1.1 (Inter)',
      'Trademarks', '"Python" and the Python logo are trademarks', 'Micro:bit Educational Foundation', 'Raspberry Pi Ltd',
    ]) expect(text).toContain(part);
  });

  it('stops at anything without a licence text: a package, a Python package, a library, the firmware, Python itself', () => {
    const i = inputs();
    expect(() => thirdPartyLicences({ ...i, packages: [{ name: 'left-pad', version: '1.0.0', licence: 'MIT', text: ' ' }] })).toThrow(/left-pad 1\.0\.0 has no licence text/);
    expect(() => thirdPartyLicences({ ...i, pythonPackages: [{ name: 'mystery', version: '1', licence: 'MIT', texts: [] }] })).toThrow(/mystery 1 has no licence text/);
    expect(() => thirdPartyLicences({ ...i, libraries: [{ id: 'gps', licence: 'MIT', text: '' }] })).toThrow(/The library gps has no licence text/);
    expect(() => thirdPartyLicences({ ...i, firmware: [{ ...i.firmware[0]!, texts: [] }] })).toThrow(/firmware .* has no licence texts/);
    expect(() => thirdPartyLicences({ ...i, python: { version: '3.13.18', texts: [] } })).toThrow(/bundled Python has no licence texts/);
  });

  it('stops at a copyleft licence (GPL, LGPL, AGPL), unless another licence can be chosen', () => {
    const i = inputs();
    expect(() => thirdPartyLicences({ ...i, packages: [{ name: 'gpl-thing', version: '2.0.0', licence: 'GPL-3.0-only', text: 'GNU GPL' }] })).toThrow(/gpl-thing 2\.0\.0 is under GPL-3\.0-only: a copyleft licence/);
    expect(() => thirdPartyLicences({ ...i, pythonPackages: [{ name: 'lgpl-py', version: '1', licence: 'GNU Lesser General Public License v3 (LGPLv3)', texts: [{ name: 'COPYING', text: 'x' }] }] })).toThrow(/lgpl-py 1 is under/);
    expect(copyleft('AGPL-3.0')).toBe(true);
    expect(copyleft('LGPL-2.1-or-later')).toBe(true);
    expect(copyleft('(MIT OR GPL-3.0-or-later)')).toBe(false);
    expect(copyleft('MIT')).toBe(false);
    expect(copyleft('Python-2.0')).toBe(false);   // CPython's text calls itself GPL-compatible: the name is what counts
    expect(copyleft('MPL-2.0')).toBe(false);
  });

  it('the packages in the app are read from the build (module ids under node_modules)', () => {
    expect(bundledPackages([
      '/p/node_modules/react/index.js', '/p/node_modules/react/cjs/react.js', 'C:\\p\\node_modules\\fflate\\esm\\browser.js',
      '/p/node_modules/@codemirror/view/dist/index.js', '/p/src/renderer/app/App.tsx', '\0vite/preload-helper',
    ])).toEqual(['@codemirror/view', 'fflate', 'react']);
  });

  it('reads only the package lists from build-info, not the other files kept there (updates.json)', () => {
    expect(packageLists([[], ['zod', 'react'], { url: null, macSigned: false }, ['react']])).toEqual(['react', 'zod']);
  });

  it('the packages the installers carry in node_modules: the dependencies and theirs, nested copies too', () => {
    const disk: Record<string, { version: string; dependencies?: Record<string, string> }> = {
      'node_modules/electron-updater': { version: '6.8.11', dependencies: { 'js-yaml': '^4', semver: '^7' } },
      'node_modules/js-yaml': { version: '4.3.2', dependencies: { argparse: '^2' } },
      'node_modules/argparse': { version: '2.0.1' },
      'node_modules/electron-updater/node_modules/semver': { version: '7.7.4' },
      'node_modules/semver': { version: '6.3.1' },
      'node_modules/zod': { version: '4.1.0' },
    };
    expect(shippedPackages({ 'electron-updater': '^6', zod: '^4' }, (dir) => disk[dir] ?? null)).toEqual([
      { name: 'argparse', version: '2.0.1', dir: 'node_modules/argparse' },
      { name: 'electron-updater', version: '6.8.11', dir: 'node_modules/electron-updater' },
      { name: 'js-yaml', version: '4.3.2', dir: 'node_modules/js-yaml' },
      { name: 'semver', version: '7.7.4', dir: 'node_modules/electron-updater/node_modules/semver' },
      { name: 'zod', version: '4.1.0', dir: 'node_modules/zod' },
    ]);
  });

  it('an npm package with no licence file: the standard MIT text with its author when it says MIT; else none', () => {
    expect(licenceTextOf({ license: 'ISC' }, 'ISC License\n\nCopyright (c) Isaac')).toBe('ISC License\n\nCopyright (c) Isaac');
    const mit = licenceTextOf({ license: 'MIT', author: 'Vladimir Krivosheev' }, '');
    expect(mit).toContain('Copyright (c) Vladimir Krivosheev');
    expect(mit).toContain('Permission is hereby granted, free of charge');
    expect(licenceTextOf({ license: 'MIT', author: { name: 'Ann' } }, '')).toContain('Copyright (c) Ann');
    expect(licenceTextOf({ license: 'Apache-2.0' }, '')).toBe('');
  });

  it('a Python package\'s licence from its METADATA: License-Expression, else License, else its classifiers', () => {
    expect(pythonLicence('Name: pip\nVersion: 26.2.2\nLicense-Expression: MIT\nLicense-File: LICENSE.txt\n')).toBe('MIT');
    expect(pythonLicence('Name: jedi\nLicense: MIT\nClassifier: License :: OSI Approved :: MIT License\n')).toBe('MIT');
    expect(pythonLicence('Name: x\nClassifier: License :: OSI Approved :: BSD License\nClassifier: License :: OSI Approved :: Apache Software License\n')).toBe('BSD License OR Apache Software License');
    expect(pythonLicence(`Name: y\nLicense: ${'Copyright (c) someone who pasted the whole licence here. '.repeat(3)}\n`)).toBe('see text');
  });

  it('licence files by their names: LICENSE, LICENCE, COPYING, NOTICE, with any extension', () => {
    for (const name of ['LICENSE', 'LICENSE.txt', 'license.md', 'LICENCE', 'LICENSE.APACHE', 'COPYING', 'NOTICE', 'LICENSE-MIT']) expect(isLicenceFile(name)).toBe(true);
    for (const name of ['licenses.py', 'README.md', 'AUTHORS.txt', 'licensing.py']) expect(isLicenceFile(name)).toBe(false);
  });
});
