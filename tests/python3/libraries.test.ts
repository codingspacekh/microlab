import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { installLibrary, listLibraries, lookUp, removeLibrary, validName } from '../../src/main/python3/libraries';
import { findPython, startPython } from '../../src/main/python3/session';

/**
 * M12 slice 4 (F-95, screen 31d): libraries in MicroLab's own folder — listed from what pip wrote, looked up by name
 * on PyPI (its JSON page; PyPI has no search for programs), installed with pip (here from a .whl file, offline: the
 * tests have no internet), used by a program, removed.
 */
const python = findPython();
const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });
const dir = (p = 'ml-libs-') => { const d = mkdtempSync(join(tmpdir(), p)); dirs.push(d); return d; };

/** A pure-Python wheel, as a teacher might hand out: greet 1.0, with its package `greet`. */
async function wheel(folder: string, version = '1.0') {
  const info = `greet-${version}.dist-info`;
  const zip = zipSync({
    'greet/__init__.py': strToU8(`def hello(name):\n    return f"Hello {name} from greet ${version}"\n`),
    [`${info}/METADATA`]: strToU8(`Metadata-Version: 2.1\nName: greet\nVersion: ${version}\nSummary: Says hello, for MicroLab's tests\n`),
    [`${info}/WHEEL`]: strToU8('Wheel-Version: 1.0\nGenerator: microlab-test\nRoot-Is-Purelib: true\nTag: py3-none-any\n'),
    [`${info}/RECORD`]: strToU8(`greet/__init__.py,,\n${info}/METADATA,,\n${info}/WHEEL,,\n${info}/RECORD,,\n`),
  });
  const path = join(folder, `greet-${version}-py3-none-any.whl`);
  writeFileSync(path, zip);
  return path;
}

describe('listing what is installed', () => {
  it('each library\'s name, version and summary, from what pip wrote; none yet: empty', () => {
    const libs = dir();
    expect(listLibraries(libs)).toEqual([]);
    mkdirSync(join(libs, 'art-6.5.dist-info'));
    writeFileSync(join(libs, 'art-6.5.dist-info', 'METADATA'), 'Metadata-Version: 2.1\nName: art\nVersion: 6.5\nSummary: ASCII Art Library For Python\n\nLong description\n');
    mkdirSync(join(libs, 'numpy-2.3.4.dist-info'));
    writeFileSync(join(libs, 'numpy-2.3.4.dist-info', 'METADATA'), 'Name: numpy\nVersion: 2.3.4\nSummary: Fundamental package for array computing in Python\n');
    expect(listLibraries(libs)).toEqual([
      { name: 'art', version: '6.5', summary: 'ASCII Art Library For Python' },
      { name: 'numpy', version: '2.3.4', summary: 'Fundamental package for array computing in Python' },
    ]);
    expect(listLibraries(join(libs, 'no-such-folder'))).toEqual([]);
  });
});

describe('looking a library up on PyPI by its name', () => {
  const answer = (status: number, body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status }));

  it('found: its name as PyPI writes it, the latest version, its summary', async () => {
    const fetch = answer(200, { info: { name: 'requests', version: '2.32.5', summary: 'Python HTTP for Humans.' } });
    expect(await lookUp('Requests', fetch)).toEqual({ ok: true, name: 'requests', version: '2.32.5', summary: 'Python HTTP for Humans.' });
    expect(fetch).toHaveBeenCalledWith('https://pypi.org/pypi/Requests/json', expect.anything());
  });
  it('not on PyPI; no internet; a name that can\'t be a library\'s', async () => {
    expect(await lookUp('no-such-lib-xyz', answer(404, {}))).toEqual({ ok: false, message: 'There is no library called “no-such-lib-xyz” on PyPI. Check its spelling.' });
    expect(await lookUp('numpy', vi.fn(async () => { throw new TypeError('fetch failed'); }))).toEqual({ ok: false, offline: true, message: "PyPI can't be reached: this computer seems to have no internet. A .whl file from your teacher installs without it." });
    expect(await lookUp('a b; rm', answer(200, {}))).toEqual({ ok: false, message: '“a b; rm” isn\'t a library\'s name: names have letters, digits, - _ and . only.' });
  });
  it('names: letters, digits, - _ . ; not starting with - (it would be an option to pip)', () => {
    expect(['numpy', 'Pillow', 'python-dateutil', 'zope.interface', 'a_b'].every(validName)).toBe(true);
    expect(['', '-r', '--target', 'a b', 'x;y', '../up'].some(validName)).toBe(false);
  });
});

describe('installing and removing', () => {
  it('a .whl file installs offline into MicroLab\'s folder (pip says what it does); a program uses it; Remove takes it away', async () => {
    const libs = dir();
    const whl = await wheel(dir('ml-whl-'));
    const said: string[] = [];
    const r = await installLibrary({ python, libs, what: whl, offline: true, onOutput: (t) => said.push(t) });
    expect(r).toEqual({ ok: true });
    expect(said.join('')).toMatch(/Successfully installed greet-1\.0/);
    expect(listLibraries(libs)).toEqual([{ name: 'greet', version: '1.0', summary: "Says hello, for MicroLab's tests" }]);

    const s = startPython({ python, libs });
    let out = '';
    s.on((e) => { if ('out' in e) out += e.out; });
    s.run({ code: 'import greet\nprint(greet.hello("Sok"))\n', file: 'use.py', cwd: tmpdir() });
    await s.ended();
    s.kill();
    expect(out).toBe('Hello Sok from greet 1.0\n');

    expect(removeLibrary(libs, 'greet')).toEqual({ ok: true });
    expect(listLibraries(libs)).toEqual([]);
    expect(existsSync(join(libs, 'greet'))).toBe(false);
    expect(readdirSync(libs)).toEqual([]);
  });

  it('a newer version replaces the one installed', async () => {
    const libs = dir();
    const folder = dir('ml-whl-');
    await installLibrary({ python, libs, what: await wheel(folder, '1.0'), offline: true });
    await installLibrary({ python, libs, what: await wheel(folder, '2.0'), offline: true });
    expect(listLibraries(libs).map((l) => l.version)).toEqual(['2.0']);
  });

  it('what can\'t be installed says why, in pip\'s words; a bad name never reaches pip', async () => {
    const libs = dir();
    const said: string[] = [];
    const r = await installLibrary({ python, libs, what: 'no-such-lib-xyz', offline: true, onOutput: (t) => said.push(t) });
    expect(r.ok).toBe(false);
    expect(said.join('')).toMatch(/No matching distribution found for no-such-lib-xyz|Could not find a version/);
    expect(await installLibrary({ python, libs, what: '--target=/etc', offline: true })).toEqual({ ok: false, message: '“--target=/etc” isn\'t a library\'s name or a .whl file.' });
  });

  it('removing one that isn\'t there says so', () => {
    expect(removeLibrary(dir(), 'numpy')).toEqual({ ok: false, message: 'numpy isn\'t installed in MicroLab.' });
  });
});
