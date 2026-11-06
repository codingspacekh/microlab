import type { BoardId } from '../boards';
import type { BoardKind } from '../usb';

/**
 * Which board answered, from its os.uname() (F-55): the USB IDs can't tell a Pico from a Pico W, nor a micro:bit V1
 * from a V2; the board's own MicroPython can. Pure.
 */
export interface Uname {
  sysname: string;
  nodename: string;
  release: string;
  version: string;
  machine: string;
}

const FIELDS = ['sysname', 'nodename', 'release', 'version', 'machine'] as const;

/** `(sysname='rp2', nodename='rp2', release='1.29.0', …)` as MicroPython prints it; null for anything else. */
export function parseUname(text: string): Uname | null {
  const u: Partial<Uname> = {};
  for (const f of FIELDS) {
    const m = new RegExp(`${f}='([^']*)'`).exec(text);
    if (!m) return null;
    u[f] = m[1]!;
  }
  return u as Uname;
}

export type Model = 'pico-w' | 'pico' | 'pico2-w' | 'pico2' | 'microbit-v2' | 'microbit-v1' | 'esp32' | 'esp32-other' | 'other';

export interface ModelInfo {
  model: Model;
  /** In the chip and in sentences: "Pico W". */
  short: string;
  /** In the board's card: "Raspberry Pi Pico W". */
  name: string;
  kind: BoardKind | undefined;
}

export function modelOf(u: Uname): ModelInfo {
  const m = u.machine;
  const pico = /^Raspberry Pi Pico( 2)?( W)? with/.exec(m);
  if (pico) {
    const short = `Pico${pico[1] ?? ''}${pico[2] ?? ''}`;
    const model = `pico${pico[1] ? '2' : ''}${pico[2] ? '-w' : ''}` as Model;
    return { model, short, name: `Raspberry Pi ${short}`, kind: 'pico' };
  }
  if (/^micro:bit with nRF52/.test(m)) return { model: 'microbit-v2', short: 'micro:bit', name: 'BBC micro:bit V2', kind: 'microbit' };
  if (/^micro:bit with nRF51/.test(m)) return { model: 'microbit-v1', short: 'micro:bit V1', name: 'BBC micro:bit V1', kind: 'microbit' };
  const esp = / with (ESP32\w*)$/.exec(m);
  if (esp) {
    const chip = esp[1]!;
    return chip === 'ESP32'
      ? { model: 'esp32', short: 'ESP32', name: 'ESP32 board', kind: 'esp32' }
      : { model: 'esp32-other', short: chip, name: `${chip} board`, kind: 'esp32' };
  }
  const name = m.replace(/ with .*$/, '') || u.sysname;
  return { model: 'other', short: name, name, kind: undefined };
}

/** "MicroPython 1.29" (a .0 dropped) — the chip's few words. */
export function shortVersion(u: Uname): string {
  return `MicroPython ${u.release.replace(/\.0$/, '')}`;
}

/** "MicroPython v1.29.0 (2026-08-24)"; the micro:bit's own release and the MicroPython it is built on. */
export function versionText(u: Uname): string {
  const mb = /^micro:bit (v[\d.]+)\S* on (\S+); MicroPython (v[\d.]+)/.exec(u.version);
  if (mb) return `micro:bit MicroPython ${mb[1]} (MicroPython ${mb[3]}, ${mb[2]})`;
  const mp = /^(v[\d.]+\S*) on (\d{4}-\d\d-\d\d)/.exec(u.version);
  return mp ? `MicroPython ${mp[1]} (${mp[2]})` : `MicroPython ${u.release}`;
}

/** Whether a board that answered is the one the project was built for (its pins and modules). */
export function boardFits(model: Model, project: BoardId): boolean {
  if (project === 'pico-w') return model === 'pico-w';
  if (project === 'microbit-v2') return model === 'microbit-v2';
  return model === 'esp32';
}
