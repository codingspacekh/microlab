import { describe, expect, it, vi } from 'vitest';
import { parseUname } from '@lib/repl';
import type { BoardCheck, Detection, FoundBoard } from '@lib/usb';
import { installMicroPython, installRoute, type InstallDeps, type InstallStep } from '../../../src/main/firmware';

/**
 * M10.7 F-52, Q18 (screen 14b): installing MicroPython from the app, offline — the .uf2 copied to a Pico's RPI-RP2
 * drive, the .hex to a micro:bit's MICROBIT drive (its files copied off first and put back after); then the board
 * restarts and answers with its version. The flow follows what is on USB, replayed here as a timeline.
 */
const PICO: FoundBoard = { id: 'e661', kind: 'pico', port: '/dev/cu.usbmodem14201', usb: '2e8a:0005' };
const MB: FoundBoard = { id: '9906', kind: 'microbit', port: '/dev/cu.usbmodem14202', usb: '0d28:0204' };
const W = parseUname("(sysname='rp2', nodename='rp2', release='1.29.0', version='v1.29.0 on 2026-08-24', machine='Raspberry Pi Pico W with RP2040')")!;
const M = parseUname("(sysname='microbit', nodename='microbit', release='2.1.2', version='micro:bit v2.1.2+0697c6d on 2023-10-30; MicroPython v1.18 on 2023-10-30', machine='micro:bit with nRF52833')")!;
const PICO_FW = { file: '/app/library/firmware/RPI_PICO_W-20260824-v1.29.0.uf2', name: 'RPI_PICO_W-20260824-v1.29.0.uf2', size: 1811456, drive: 'RPI-RP2', version: 'v1.29.0' };
const MB_FW = { file: '/app/library/firmware/micropython-microbit-v2.1.2.hex', name: 'micropython-microbit-v2.1.2.hex', size: 1239726, drive: 'MICROBIT', version: 'v2.1.2' };
const at = (boards: FoundBoard[], drives: string[] = [], checks: Record<string, BoardCheck> = {}): Detection =>
  ({ boards, drives: drives.map((v) => ({ kind: v === 'RPI-RP2' ? 'pico-bootsel' as const : 'microbit' as const, volume: v })), checks });

/** Deps whose USB moves along a timeline: each wait sees the next state once the one before has been seen. */
function rig(timeline: Detection[], over: Partial<InstallDeps> = {}) {
  let now = 0;
  const steps: string[] = [];
  const deps: InstallDeps = {
    now: () => timeline[now]!,
    waitFor: async (pick) => {
      for (;;) {
        const got = pick(timeline[now]!);
        if (got !== undefined) return got;
        if (now === timeline.length - 1) throw new Error('timed out');
        now++;
      }
    },
    drivePath: async (name) => `/Volumes/${name}`,
    copy: vi.fn(async (_src: string, _dest: string, progress: (done: number) => void) => { progress(1000); progress(PICO_FW.size); now = Math.min(now + 1, timeline.length - 1); }),
    bootloader: vi.fn(async () => { now = Math.min(now + 1, timeline.length - 1); }),
    check: vi.fn(async () => {}),
    readAll: vi.fn(async () => ({ 'main.py': new TextEncoder().encode('# mine'), 'lib.py': new TextEncoder().encode('x') })),
    keep: vi.fn(async () => '/Users/t/Documents/MicroLab/Board backups/micro-bit 2026-11-06 16-00-00'),
    restore: vi.fn(async (_b: FoundBoard, files: Record<string, Uint8Array>) => Object.keys(files).length),
    ...over,
  };
  const onStep = (s: InstallStep) => steps.push(`${s.step}:${s.state}`);
  return { deps, steps, onStep };
}

describe('M10.7 F-52 which way', () => {
  it('a Pico in BOOTSEL: copy; one that answers MicroPython: MicroLab puts it in BOOTSEL; else the student does', () => {
    expect(installRoute('pico', at([], ['RPI-RP2']))).toBe('copy');
    expect(installRoute('pico', at([PICO], [], { e661: { state: 'micropython', uname: W } }))).toBe('bootloader');
    expect(installRoute('pico', at([PICO], [], { e661: { state: 'no-micropython', seen: '' } }))).toBe('press-bootsel');
    expect(installRoute('pico', at([]))).toBe('press-bootsel');
  });

  it('a micro:bit: its drive is always there (no drive: plug it in); an ESP32: a guide', () => {
    expect(installRoute('microbit', at([MB], ['MICROBIT']))).toBe('copy');
    expect(installRoute('microbit', at([]))).toBe('no-drive');
    expect(installRoute('esp32', at([]))).toBe('guide');
  });
});

describe('M10.7 F-52 on a Pico W', () => {
  it('in BOOTSEL: the .uf2 copied to RPI-RP2; the drive goes, the Pico W comes back and answers 1.29.0', async () => {
    const r = rig([at([], ['RPI-RP2']), at([], []), at([PICO]), at([PICO], [], { e661: { state: 'micropython', uname: W } })]);
    const res = await installMicroPython('pico', PICO_FW, r.deps, r.onStep);
    expect(res).toEqual({ ok: true, version: '1.29.0' });
    expect(r.deps.copy).toHaveBeenCalledWith(PICO_FW.file, '/Volumes/RPI-RP2/RPI_PICO_W-20260824-v1.29.0.uf2', expect.any(Function));
    expect(r.steps).toEqual(['copy:now', 'copy:progress', 'copy:progress', 'copy:done', 'restart:now', 'restart:done', 'answer:now', 'answer:done']);
  });

  it('running MicroPython: put in BOOTSEL by MicroLab (machine.bootloader()) — no button to hold', async () => {
    const r = rig([at([PICO], [], { e661: { state: 'micropython', uname: W } }), at([], ['RPI-RP2']), at([], []), at([PICO], [], { e661: { state: 'micropython', uname: W } })]);
    expect(await installMicroPython('pico', PICO_FW, r.deps, r.onStep)).toEqual({ ok: true, version: '1.29.0' });
    expect(r.deps.bootloader).toHaveBeenCalledWith(PICO);
    expect(r.steps.slice(0, 2)).toEqual(['bootsel:now', 'bootsel:done']);
  });

  it('no MicroPython and no BOOTSEL drive: waits for the student to plug it in with BOOTSEL held', async () => {
    const r = rig([at([]), at([]), at([], ['RPI-RP2']), at([], []), at([PICO], [], { e661: { state: 'micropython', uname: W } })]);
    expect(await installMicroPython('pico', PICO_FW, r.deps, r.onStep)).toEqual({ ok: true, version: '1.29.0' });
    expect(r.steps.slice(0, 2)).toEqual(['bootsel:wait', 'bootsel:done']);
  });

  it('macOS refuses the write (no permission for the removable drive): says so, and which file to drag by hand', async () => {
    const e = Object.assign(new Error("EPERM: operation not permitted, open '/Volumes/RPI-RP2/x.uf2'"), { code: 'EPERM' });
    const r = rig([at([], ['RPI-RP2'])], { copy: vi.fn(async () => { throw e; }) });
    expect(await installMicroPython('pico', PICO_FW, r.deps, r.onStep)).toEqual({
      ok: false, permission: true, file: PICO_FW.file,
      message: expect.stringMatching(/MicroLab may not write to the RPI-RP2 drive/),
    });
  });

  it('the board doesn\'t come back answering MicroPython: says what to do', async () => {
    const r = rig([at([], ['RPI-RP2']), at([], []), at([PICO], [], { e661: { state: 'no-micropython', seen: '' } })]);
    expect(await installMicroPython('pico', PICO_FW, r.deps, r.onStep)).toEqual({ ok: false, message: expect.stringMatching(/didn't answer as MicroPython/) });
  });

  it('cancelled while waiting for the button: stops, nothing written', async () => {
    const ac = new AbortController();
    const r = rig([at([])], { waitFor: async () => { ac.abort(); throw new Error('aborted'); } });
    expect(await installMicroPython('pico', PICO_FW, r.deps, r.onStep, ac.signal)).toEqual({ ok: false, cancelled: true, message: 'Cancelled — nothing was written to the board.' });
    expect(r.deps.copy).not.toHaveBeenCalled();
  });
});

describe('M10.7 F-52 on a micro:bit (installing wipes its files)', () => {
  it('its files copied to the laptop first, the .hex to MICROBIT, it restarts and answers, its files put back', async () => {
    const before = at([MB], ['MICROBIT'], { 9906: { state: 'micropython', uname: M } });
    const r = rig([before, at([MB], []), at([MB], ['MICROBIT']), at([MB], ['MICROBIT'], { 9906: { state: 'micropython', uname: M } })]);
    const res = await installMicroPython('microbit', MB_FW, r.deps, r.onStep);
    expect(res).toEqual({ ok: true, version: '2.1.2', restored: 2, keptIn: '/Users/t/Documents/MicroLab/Board backups/micro-bit 2026-11-06 16-00-00' });
    expect(r.deps.readAll).toHaveBeenCalledWith(MB);
    expect(r.deps.copy).toHaveBeenCalledWith(MB_FW.file, '/Volumes/MICROBIT/micropython-microbit-v2.1.2.hex', expect.any(Function));
    expect(r.deps.restore).toHaveBeenCalledWith(MB, expect.objectContaining({ 'main.py': expect.any(Uint8Array) }));
    expect(r.steps.filter((s) => !s.endsWith('progress'))).toEqual([
      'save:now', 'save:done', 'copy:now', 'copy:done', 'restart:now', 'restart:done', 'answer:now', 'answer:done', 'restore:now', 'restore:done',
    ]);
  });

  it('one never asked (plugged in before MicroLab started) is asked first — its files are not lost', async () => {
    const r = rig([
      at([MB], ['MICROBIT']), at([MB], ['MICROBIT'], { 9906: { state: 'micropython', uname: M } }),
      at([MB], []), at([MB], ['MICROBIT']), at([MB], ['MICROBIT'], { 9906: { state: 'micropython', uname: M } }),
    ]);
    const res = await installMicroPython('microbit', MB_FW, r.deps, r.onStep);
    expect(r.deps.check).toHaveBeenCalledWith(MB);
    expect(r.deps.readAll).toHaveBeenCalledWith(MB);
    expect(res).toMatchObject({ ok: true, restored: 2 });
  });

  it('one another program holds, or whose files can\'t be read: nothing installed — its files would be lost', async () => {
    const busy = rig([at([MB], ['MICROBIT'], { 9906: { state: 'busy', by: 'Thonny' } })]);
    expect(await installMicroPython('microbit', MB_FW, busy.deps, busy.onStep)).toEqual({ ok: false, message: expect.stringMatching(/used by Thonny.*Nothing was installed/) });
    const failing = rig([at([MB], ['MICROBIT'], { 9906: { state: 'micropython', uname: M } })], { readAll: vi.fn(async () => { throw new Error('The board stopped answering'); }) });
    expect(await installMicroPython('microbit', MB_FW, failing.deps, failing.onStep)).toEqual({ ok: false, message: expect.stringMatching(/couldn't be copied to this laptop.*Nothing was installed/) });
    expect(busy.deps.copy).not.toHaveBeenCalled();
    expect(failing.deps.copy).not.toHaveBeenCalled();
  });

  it('one with no MicroPython (a MakeCode program): no files to keep', async () => {
    const before = at([MB], ['MICROBIT'], { 9906: { state: 'no-micropython', seen: '' } });
    const r = rig([before, at([MB], []), at([MB], ['MICROBIT']), at([MB], ['MICROBIT'], { 9906: { state: 'micropython', uname: M } })]);
    expect(await installMicroPython('microbit', MB_FW, r.deps, r.onStep)).toEqual({ ok: true, version: '2.1.2' });
    expect(r.deps.readAll).not.toHaveBeenCalled();
    expect(r.steps.slice(0, 1)).toEqual(['save:skip']);
  });
});

describe('M10.7 F-52 when it goes wrong', () => {
  const ok = { e661: { state: 'micropython' as const, uname: W } };
  it.each([
    ['the RPI-RP2 drive never comes (the button not held)', [at([]), at([])], /RPI-RP2 drive didn't appear/],
    ['the Pico doesn\'t come back after the copy', [at([], ['RPI-RP2']), at([], ['RPI-RP2'])], /didn't come back after the copy/],
    ['it comes back but never answers', [at([], ['RPI-RP2']), at([], []), at([PICO])], /didn't answer as MicroPython/],
  ])('%s: says what to do', async (_what, timeline, message) => {
    const r = rig(timeline as Detection[], { copy: vi.fn(async () => {}) });
    expect(await installMicroPython('pico', PICO_FW, r.deps, r.onStep)).toEqual({ ok: false, message: expect.stringMatching(message) });
  });

  it('the drive gone before the copy; another error said as it is', async () => {
    const gone = rig([at([], ['RPI-RP2'])], { drivePath: async () => undefined });
    expect(await installMicroPython('pico', PICO_FW, gone.deps, gone.onStep)).toEqual({ ok: false, message: expect.stringMatching(/went away before MicroPython could be copied/) });
    const disk = rig([at([], ['RPI-RP2'])], { copy: vi.fn(async () => { throw Object.assign(new Error('ENOSPC: no space left on device'), { code: 'ENOSPC' }); }) });
    expect(await installMicroPython('pico', PICO_FW, disk.deps, disk.onStep)).toEqual({ ok: false, message: 'ENOSPC: no space left on device' });
  });

  it('a micro:bit with no MICROBIT drive; one that can\'t be opened; its files not put back', async () => {
    const none = rig([at([MB])]);
    expect(await installMicroPython('microbit', MB_FW, none.deps, none.onStep)).toEqual({ ok: false, message: expect.stringMatching(/MICROBIT drive isn't there/) });
    const shut = rig([at([MB], ['MICROBIT'], { 9906: { state: 'cant-open', message: 'x' } })]);
    expect(await installMicroPython('microbit', MB_FW, shut.deps, shut.onStep)).toEqual({ ok: false, message: expect.stringMatching(/can't talk to the micro:bit.*Nothing was installed/) });
    const before = at([MB], ['MICROBIT'], { 9906: { state: 'micropython', uname: M } });
    const back = rig([before, at([MB], []), at([MB], ['MICROBIT']), at([MB], ['MICROBIT'], { 9906: { state: 'micropython', uname: M } })], { restore: vi.fn(async () => { throw new Error('unplugged'); }) });
    expect(await installMicroPython('microbit', MB_FW, back.deps, back.onStep)).toEqual({ ok: false, message: expect.stringMatching(/installed, but the micro:bit's files couldn't be put back.*kept on this laptop/) });
  });

  it('a board that doesn\'t answer when asked first: nothing installed', async () => {
    const r = rig([at([MB], ['MICROBIT'])]);
    expect(await installMicroPython('microbit', MB_FW, r.deps, r.onStep)).toEqual({ ok: false, message: expect.stringMatching(/didn't answer when asked.*Nothing was installed/) });
    expect(r.deps.copy).not.toHaveBeenCalled();
  });

  it('cancelled after the copy: says the board finishes by itself', async () => {
    const ac = new AbortController();
    const r = rig([at([], ['RPI-RP2']), at([], ['RPI-RP2'])], {
      copy: vi.fn(async () => {}),
      waitFor: async () => { ac.abort(); throw new Error('aborted'); },
    });
    expect(await installMicroPython('pico', PICO_FW, r.deps, r.onStep, ac.signal)).toEqual({ ok: false, cancelled: true, message: expect.stringMatching(/already copied/) });
    expect(ok).toBeDefined();
  });
});
