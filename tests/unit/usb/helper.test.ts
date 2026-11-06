import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseUname } from '@lib/repl';
import { detect, helperReport, helperView, parsePnp, type Detection, type PortInfo } from '@lib/usb';

/**
 * M10.6 F-56 (§1.13, screen 14): the connection helper — five steps, each decided from what the app sees and what
 * the student answers; the step that fails says what to do. Pure: recorded port lists in, the steps out.
 */
const fixture = (name: string): Detection => {
  const f = JSON.parse(readFileSync(`tests/fixtures/usb/${name}.json`, 'utf8')) as { platform: string; volumes: string[]; ports: PortInfo[]; pnp?: string };
  return detect(f.ports, f.volumes, f.platform, f.pnp ? parsePnp(f.pnp) : undefined);
};
const states = (v: ReturnType<typeof helperView>) => v.steps.map((s) => `${s.id}:${s.state}`).join(' ');
const W = parseUname("(sysname='rp2', nodename='rp2', release='1.29.0', version='v1.29.0 on 2026-08-24', machine='Raspberry Pi Pico W with RP2040')")!;

describe('M10.6 F-56 nothing on USB', () => {
  const none = fixture('mac-no-board');

  it('first: is it plugged in at both ends?', () => {
    const v = helperView('pico', none, {});
    expect(v.ask).toEqual({ kind: 'plugged' });
    expect(states(v)).toBe('plugged:now seen:later driver:later free:later micropython:later');
  });

  it('a Pico (no power light): the BOOTSEL test — no drive means a cable that only charges', () => {
    expect(helperView('pico', none, { plugged: true }).ask).toEqual({ kind: 'bootsel-test' });
    const v = helperView('pico', none, { plugged: true, bootsel: false });
    expect(v.ask).toEqual({ kind: 'charge-only' });
    expect(states(v)).toBe('plugged:ok seen:bad driver:later free:later micropython:later');
    expect(v.steps[0]!.note).toBe('you said so');
  });

  it('a micro:bit or an ESP32: is its power light on? Off: no power; on: a cable that only charges', () => {
    expect(helperView('microbit', none, { plugged: true }).ask).toEqual({ kind: 'light' });
    expect(helperView('esp32', none, { plugged: true, light: false }).ask).toEqual({ kind: 'no-power' });
    expect(helperView('esp32', none, { plugged: true, light: true }).ask).toEqual({ kind: 'charge-only' });
  });
});

describe('M10.6 F-56 something on USB', () => {
  it('the Pico in BOOTSEL: the cable is fine; it runs no program until it starts normally (or gets MicroPython)', () => {
    const v = helperView('pico', fixture('mac-pico-bootsel'), {});
    expect(v.ask).toEqual({ kind: 'bootsel-mode' });
    expect(states(v)).toBe('plugged:ok seen:ok driver:skip free:skip micropython:bad');
    expect(v.steps[1]!.note).toBe('its RPI-RP2 drive');
  });

  it('an ESP32 whose USB chip has no driver (Windows): install it', () => {
    const v = helperView('esp32', fixture('win-esp32-no-driver-constructed'), {});
    expect(v.ask).toEqual({ kind: 'driver', chip: 'CP210x', usb: '10c4:ea60' });
    expect(states(v)).toBe('plugged:ok seen:ok driver:bad free:later micropython:later');
  });

  it('another board than the one helped with: says which', () => {
    const v = helperView('pico', fixture('mac-microbit'), {});
    expect(v.ask).toEqual({ kind: 'wrong-board', found: 'microbit' });
  });

  it('the board, not asked yet: ask it; being asked; used by Thonny; no MicroPython; all fine', () => {
    const d = fixture('mac-pico-w');
    const id = d.boards[0]!.id;
    const at = (check: NonNullable<Detection['checks']>[string]) => helperView('pico', { ...d, checks: { [id]: check } }, {});
    expect(helperView('pico', d, {}).ask).toEqual({ kind: 'not-asked', id });
    expect(states(helperView('pico', d, {}))).toBe('plugged:ok seen:ok driver:skip free:now micropython:later');
    expect(at({ state: 'checking' }).ask).toEqual({ kind: 'checking' });
    expect(at({ state: 'busy', by: 'Thonny' }).ask).toEqual({ kind: 'busy', by: 'Thonny', id });
    expect(states(at({ state: 'busy', by: 'Thonny' }))).toBe('plugged:ok seen:ok driver:skip free:bad micropython:later');
    expect(at({ state: 'no-micropython', seen: '' }).ask).toEqual({ kind: 'no-micropython', id });
    expect(at({ state: 'cant-open', message: 'gone' }).ask).toEqual({ kind: 'cant-open', message: 'gone', id });
    const fine = at({ state: 'micropython', uname: W });
    expect(fine.ask).toEqual({ kind: 'ok', version: 'MicroPython 1.29' });
    expect(states(fine)).toBe('plugged:ok seen:ok driver:skip free:ok micropython:ok');
    expect(fine.steps[2]!.note).toBe('not needed for a Pico W');
    expect(fine.steps[1]!.note).toBe('on /dev/cu.usbmodem14201');
  });
});

describe('M10.6 F-56 a report for the teacher', () => {
  it('when, which app and system, the boards on USB with their state, the drives, the student\'s answers, the steps', () => {
    const d = fixture('mac-pico-w');
    const id = d.boards[0]!.id;
    const r = helperReport({
      at: new Date(2026, 10, 6, 15, 40), app: '0.4.0', system: 'Macintosh; Intel Mac OS X 10_15_7', project: 'Raspberry Pi Pico W',
      kind: 'pico', detection: { ...d, checks: { [id]: { state: 'busy', by: 'Thonny' } } }, answers: { plugged: true },
    });
    expect(r).toBe([
      'MicroLab connection report — 2026-11-06 15:40',
      'MicroLab 0.4.0 · Macintosh; Intel Mac OS X 10_15_7',
      'Project board: Raspberry Pi Pico W · helping with: Pico W',
      'Boards on USB: Pico 2e8a:0005 on /dev/cu.usbmodem14201 (serial e6614103e7519826) — used by Thonny',
      'Drives: none',
      'Answers: plugged in: yes',
      'Steps: ✓ Plugged in at both ends (it is on USB) · ✓ The laptop sees the board (on /dev/cu.usbmodem14201) · – A driver, if it needs one (not needed for a Pico W) · ✗ No other program has it (used by Thonny) · … It runs MicroPython (it answers with its version)',
    ].join('\n'));
  });
});
