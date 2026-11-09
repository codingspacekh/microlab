import type { Device, SimState } from './devices';
import { connect } from './connectivity';
import { toNetlist } from './netlist';
import { solve } from './solve';
import type { CircuitSpec, PointRef } from './spec';

/**
 * The multimeter (M9 slice 4, F-38, screen 29), as a real one measures: V from the black probe (COM) to the red; A
 * through a wire or a leg, the meter put in its place in series (a 1 mΩ shunt); Ω with the power off — supplies,
 * pins, drivers and sensor outputs gone — from a small test voltage (an LED doesn't conduct at it).
 */
export type MeterMode = 'V' | 'A' | 'Ω';
/** What A measures: a wire (by id), or a part's leg ('led1.k'). */
export type Through = { wire: string } | { leg: string };
export interface MeterSetting { mode: MeterMode; red?: PointRef; black?: PointRef; through?: Through }

const SHUNT_OHMS = 1e-3;
/** A meter's Ω test voltage: below any LED's forward voltage. */
const TEST_VOLTS = 0.5;
/** Above this the Ω range is over: OL. */
const OL_OHMS = 40e6;
const OL_VOLTS = 600;
const OL_AMPS = 10;

/** The voltage of `red` from `black`, or null while a probe isn't on a point. */
export function measureVolts(spec: CircuitSpec, state: SimState, red?: PointRef, black?: PointRef): number | null {
  if (!red || !black) return null;
  const { netlist, connectivity } = toNetlist(spec);
  const r = connectivity.netOf(red);
  const b = connectivity.netOf(black);
  if (r === undefined || b === undefined) return null;
  const s = solve(netlist, state);
  return (s.volts[r] ?? 0) - (s.volts[b] ?? 0);
}

/** The current through a wire or a leg (A, its size), as if the meter were put in its place; null when there is none. */
export function measureAmps(spec: CircuitSpec, state: SimState, through?: Through): number | null {
  if (!through) return null;
  let cut: CircuitSpec;
  let ends: [PointRef, PointRef];
  if ('wire' in through) {
    const w = spec.wires.find((x) => x.id === through.wire);
    if (!w) return null;
    cut = { ...spec, wires: spec.wires.filter((x) => x !== w) };
    ends = [w.a, w.b];
  } else {
    const dot = through.leg.indexOf('.');
    const [id, leg] = [through.leg.slice(0, dot), through.leg.slice(dot + 1)];
    const part = spec.parts.find((p) => p.id === id);
    const at = part?.legs[leg];
    if (!part || !at) return null;
    const legs = { ...part.legs };
    delete legs[leg];
    cut = { ...spec, parts: spec.parts.map((p) => (p === part ? { ...p, legs } : p)) };
    ends = [through.leg, at];
  }
  const { netlist, connectivity } = toNetlist(cut);
  const a = connectivity.netOf(ends[0]);
  const b = connectivity.netOf(ends[1]);
  if (a === undefined || b === undefined) return null;
  const meter: Device = { kind: 'resistor', id: 'meter', a, b, ohms: SHUNT_OHMS };
  const s = solve({ ...netlist, devices: [...netlist.devices, meter] }, state);
  return Math.abs(s.amps.meter ?? 0);
}

/** The resistance between the probes with the power off (Ω; Infinity when nothing joins them), or null. `state`: the
 *  parts as they are set (a button held, a knob's position). */
export function measureOhms(spec: CircuitSpec, red?: PointRef, black?: PointRef, state: SimState = {}): number | null {
  if (!red || !black) return null;
  const { netlist, connectivity } = toNetlist(spec);
  const r = connectivity.netOf(red);
  const b = connectivity.netOf(black);
  if (r === undefined || b === undefined) return null;
  if (r === b) return 0;
  const passive = netlist.devices.filter((d) => d.kind !== 'source' && d.kind !== 'pin' && d.kind !== 'drive' && d.kind !== 'logic');
  const meter: Device = { kind: 'source', id: 'ohmmeter', plus: r, minus: b, volts: TEST_VOLTS, ohms: 1e-6, limitA: 1e3 };
  // COM is the meter's own reference: the power off, the circuit may float from the board's GND
  const s = solve({ ...netlist, ground: b, devices: [...passive, meter] }, { parts: state.parts });
  const i = s.amps.ohmmeter ?? 0;
  if (i <= TEST_VOLTS / OL_OHMS) return Infinity;
  return Math.max(0, TEST_VOLTS / i - 1e-6);
}

/** What the meter's display shows: the number in its range and the unit; OL off the end; dashes with nothing to read. */
export function showReading(mode: MeterMode, value: number | null): { text: string; unit: string } {
  const base = mode === 'Ω' ? 'Ω' : mode;
  if (value === null || Number.isNaN(value)) return { text: '- - - -', unit: base };
  const a = Math.abs(value);
  if (mode === 'V') {
    if (a >= OL_VOLTS) return { text: 'OL', unit: 'V' };
    if (a < 1) return { text: (value * 1000).toFixed(1), unit: 'mV' };
    return { text: value.toFixed(a < 10 ? 2 : 1), unit: 'V' };
  }
  if (mode === 'A') {
    if (a >= OL_AMPS) return { text: 'OL', unit: 'A' };
    if (a >= 1) return { text: a.toFixed(2), unit: 'A' };
    if (a >= 1e-3) return { text: (a * 1000).toFixed(1), unit: 'mA' };
    return { text: (a * 1e6).toFixed(0), unit: 'µA' };
  }
  if (a >= OL_OHMS) return { text: 'OL', unit: 'MΩ' };
  if (a >= 1e6) return { text: (a / 1e6).toFixed(2), unit: 'MΩ' };
  if (a >= 1e3) return { text: (a / 1e3).toFixed(1), unit: 'kΩ' };
  return { text: a.toFixed(1), unit: 'Ω' };
}

/** The mode's measurement, shown. */
export function meterReading(spec: CircuitSpec, state: SimState, m: MeterSetting): { text: string; unit: string } {
  const value = m.mode === 'V' ? measureVolts(spec, state, m.red, m.black)
    : m.mode === 'A' ? measureAmps(spec, state, m.through)
    : measureOhms(spec, m.red, m.black, state);
  return showReading(m.mode, value);
}

/** Where a probe is, for the meter's card: "column 9 — R1 and R2", "column 13 — GND", "GP15 — R1", "the top + rail". */
export function probePlace(spec: CircuitSpec, point?: PointRef): string {
  if (!point) return 'not on anything yet';
  const c = connect(spec);
  const board = spec.board?.data;
  const owner = (p: string) => p.slice(0, p.indexOf('.'));
  const hole = /^[^.]+\.(?:([a-j])|([TB])([+-]))(\d+)$/.exec(point);
  const pinLabel = (p: string) => board?.pins.find((x) => `board.${x.id}` === p || `board.${x.label}` === p)?.label;
  const where = hole ? (hole[1] ? `column ${hole[4]}` : `the ${hole[2] === 'T' ? 'top' : 'bottom'} ${hole[3] === '-' ? '−' : '+'} rail`)
    : point.startsWith('board.') ? pinLabel(point) ?? point.slice(6)
    : `${owner(point).toUpperCase()}'s ${point.slice(point.indexOf('.') + 1)}`;
  const net = c.pointsInNet(point);
  const pin = net.map((p) => (p.startsWith('board.') ? pinLabel(p) : undefined)).find((l) => l !== undefined);
  if (pin && !point.startsWith('board.')) return `${where} — ${pin}`;
  const ids = new Set(spec.parts.map((p) => p.id));
  const self = point.startsWith('board.') ? undefined : owner(point);
  const parts = [...new Set(net.map(owner).filter((o) => ids.has(o) && o !== self))].map((o) => o.toUpperCase());
  if (!parts.length) return where;
  const list = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`;
  return `${where} — ${list}`;
}
