import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyToDrive, drivePath, listVolumesWindows } from '../../../src/main/drives';

/** M10.7 F-52: where a board's drive is, and the firmware copied onto it with its progress. */
let dir = '';
afterEach(() => { if (dir) rmSync(dir, { recursive: true, force: true }); });

describe('M10.7 a board\'s drive', () => {
  it('on a Mac under /Volumes, when it is there; on Windows by its letter', async () => {
    expect(await drivePath('NO-SUCH-DRIVE-XYZ', 'darwin', 'u')).toBeUndefined();
    expect(await drivePath('RPI-RP2', 'win32', 'u', async () => [{ name: 'RPI-RP2', path: 'E:\\' }])).toBe('E:\\');
    expect(await drivePath('MICROBIT', 'win32', 'u', async () => [])).toBeUndefined();
  });

  it('on Linux under /media/<user> or /run/media/<user>; on a Mac /Volumes', async () => {
    expect(await drivePath('RPI-RP2', 'linux', 'ana', undefined, async (p) => p === '/run/media/ana/RPI-RP2')).toBe('/run/media/ana/RPI-RP2');
    expect(await drivePath('RPI-RP2', 'darwin', 'ana', undefined, async () => true)).toBe('/Volumes/RPI-RP2');
  });

  it('Windows\' drive list through PowerShell; none when it can\'t be read', async () => {
    const run = vi.fn(async () => '{"DriveLetter":"E","FileSystemLabel":"RPI-RP2"}');
    expect(await listVolumesWindows(run)).toEqual([{ name: 'RPI-RP2', path: 'E:\\' }]);
    expect(run).toHaveBeenCalledWith('powershell.exe', expect.arrayContaining([expect.stringContaining('Get-Volume')]));
    expect(await listVolumesWindows(async () => { throw new Error('no'); })).toEqual([]);
  });

  it('the firmware copied whole, its progress told as it goes', async () => {
    dir = mkdtempSync(join(tmpdir(), 'microlab-drive-'));
    const src = join(dir, 'fw.uf2');
    const data = Buffer.alloc(200 * 1024, 7);
    writeFileSync(src, data);
    mkdirSync(join(dir, 'RPI-RP2'));
    const seen: number[] = [];
    await copyToDrive(src, join(dir, 'RPI-RP2', 'fw.uf2'), (n) => seen.push(n));
    expect(readFileSync(join(dir, 'RPI-RP2', 'fw.uf2'))).toEqual(data);
    expect(seen).toEqual([65536, 131072, 196608, 204800]);
  });

  it('a drive that refuses the write: the error comes back (macOS without permission: EPERM)', async () => {
    dir = mkdtempSync(join(tmpdir(), 'microlab-drive-'));
    writeFileSync(join(dir, 'fw.uf2'), 'x');
    await expect(copyToDrive(join(dir, 'fw.uf2'), join(dir, 'no-such-dir', 'fw.uf2'), () => {})).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
