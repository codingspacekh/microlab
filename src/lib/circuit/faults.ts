import type { Connectivity } from './connectivity';
import { LED, type Device, type Netlist, type SimState } from './devices';
import { toNetlist } from './netlist';
import { isSensor, minVolts } from './sensors';
import { solve, type Solution } from './solve';
import type { CircuitSpec } from './spec';
import { UnionFind } from './union-find';

/**
 * Faults are checks on the solved values (architecture §2.5, §1.3), so the same rules give the live warnings (M9)
 * and the wiring check (F-18). Each carries its numbers; the wording and the fix are M9's fault table.
 */
export type FaultKind =
  | 'short' | 'led-burnt' | 'led-over-current' | 'pin-over-current' | 'board-over-current'
  | 'supply-over-current' | 'over-voltage' | 'floating' | 'servo-underpowered' | 'sensor-underpowered' | 'motor-on-pin';

export interface Fault {
  kind: FaultKind;
  /** damage: the part or pin is hurt and the run stops (screen 04); warning: it works, but shouldn't be built so. */
  severity: 'damage' | 'warning';
  /** A part id, a pin label (GP13), a supply's pin (3V3), or "board". */
  on: string;
  amps?: number;
  limitA?: number;
  ratedA?: number;
  volts?: number;
  limitV?: number;
  /** The part that did it (M7: the motor on a pin). */
  part?: string;
}

/** At its limit with its voltage collapsed: a source is short-circuited. */
const SHORT_LIMIT = 0.9;
/** A servo needs 4.8–6 V (screen 09); between these it is powered, but too low. */
const SERVO_LOW = { from: 0.5, to: 4.5 };
/** An LED carrying less than this is dark: it holds nothing (floating check). */
const LED_ON_A = 1e-6;

export interface Analysis {
  connectivity: Connectivity;
  netlist: Netlist;
  solution: Solution;
  faults: Fault[];
}

/** The whole engine in one call: nets, solve, faults. `previous` speeds up the next step of a run. */
export function analyse(spec: CircuitSpec, state: SimState, previous?: Solution): Analysis {
  const { netlist, connectivity } = toNetlist(spec);
  const solution = solve(netlist, state, previous);
  return { connectivity, netlist, solution, faults: findFaults(spec, netlist, solution, state) };
}

export function findFaults(spec: CircuitSpec, netlist: Netlist, s: Solution, state: SimState): Fault[] {
  const board = spec.board?.data;
  const v = (net: string) => s.volts[net] ?? 0;
  const amps = (id: string) => s.amps[id];
  const out: Fault[] = [];
  const shorted = new Set<string>();

  // Sources: supplies, batteries and driven pins (they have a current only while driving).
  type Src = { id: string; on: string; i: number; u: number; full: number; target: number; limitA: number };
  const sources: Src[] = [];
  for (const d of netlist.devices) {
    if (d.kind === 'source') {
      const on = d.id.startsWith('supply:') ? d.id.slice(7) : d.id;
      sources.push({ id: d.id, on, i: amps(d.id)!, u: v(d.plus) - v(d.minus), full: d.volts, target: d.volts, limitA: d.limitA });
    } else if (d.kind === 'pin' && isDriven(d, state)) {
      const p = state.pins![d.label]!;
      const target = p.mode === 'out' ? p.value * d.volts : Math.min(1, Math.max(0, (p as { duty: number }).duty)) * d.volts;
      sources.push({ id: d.id, on: d.label, i: amps(d.id)!, u: v(d.net) - v(d.gnd), full: d.volts, target, limitA: d.limitA });
    }
  }
  for (const src of sources) {
    if (Math.abs(src.i) >= SHORT_LIMIT * src.limitA && Math.abs(src.u - src.target) > SHORT_LIMIT * src.full) {
      shorted.add(src.id);
      out.push({ kind: 'short', severity: 'damage', on: src.on, amps: Math.abs(src.i), limitA: src.limitA });
    }
  }

  for (const d of netlist.devices) {
    if (d.kind !== 'led') continue;
    const i = amps(d.id)!;
    if (i > LED.maxA) out.push({ kind: 'led-burnt', severity: 'damage', on: d.id, amps: i, limitA: LED.maxA, ratedA: LED.ratedA });
    else if (i > LED.ratedA) out.push({ kind: 'led-over-current', severity: 'warning', on: d.id, amps: i, limitA: LED.maxA, ratedA: LED.ratedA });
  }

  if (board) {
    const safeA = board.gpio.safeMa / 1000;
    // a motor or a pump straight on a pin (M7, screen 25c): it takes all a pin can give, and more than it should — the
    // pin is damaged (a real one would be, by the current and the motor's kick when it stops)
    const motorOn = new Map<string, string>();   // a pin's net → the motor on it
    for (const part of spec.parts) {
      if (part.type !== 'motor' && part.type !== 'pump') continue;
      const d = netlist.devices.find((x) => x.id === part.id) as Extract<Device, { kind: 'resistor' }> | undefined;
      if (d) for (const net of [d.a, d.b]) if (!motorOn.has(net)) motorOn.set(net, part.id);
    }
    for (const d of netlist.devices) {
      if (d.kind !== 'pin' || !isDriven(d, state)) continue;
      const motor = motorOn.get(d.net);
      const i = Math.abs(amps(d.id) ?? 0);
      if (motor && i > safeA) {
        shorted.add(d.id);
        out.push({ kind: 'motor-on-pin', severity: 'damage', on: d.label, part: motor, amps: i, limitA: safeA });
      }
    }
    let total = 0;
    for (const src of sources) {
      if (!src.id.startsWith('pin:')) continue;
      total += Math.abs(src.i);
      if (!shorted.has(src.id) && Math.abs(src.i) > safeA) {
        out.push({ kind: 'pin-over-current', severity: 'warning', on: src.on, amps: Math.abs(src.i), limitA: safeA });
      }
    }
    if (board.gpio.totalMa !== undefined && total > board.gpio.totalMa / 1000) {
      out.push({ kind: 'board-over-current', severity: 'warning', on: 'board', amps: total, limitA: board.gpio.totalMa / 1000 });
    }
    for (const supply of board.supplies) {
      const src = sources.find((x) => x.id === `supply:${supply.pin}`);
      if (src && !shorted.has(src.id) && src.i > supply.maxMa / 1000) {
        out.push({ kind: 'supply-over-current', severity: 'warning', on: supply.pin, amps: src.i, limitA: supply.maxMa / 1000 });
      }
    }
    const top = board.logicVolts + board.gpio.overVolts;
    for (const d of netlist.devices) {
      if (d.kind !== 'pin') continue;
      const u = v(d.net) - v(d.gnd);
      if (u > top || u < -board.gpio.overVolts) out.push({ kind: 'over-voltage', severity: 'damage', on: d.label, volts: u, limitV: top });
    }
  }

  out.push(...floating(netlist, s, state));

  for (const part of spec.parts) {
    if (part.type !== 'servo') continue;
    const d = netlist.devices.find((x) => x.id === part.id && x.kind === 'load') as Extract<Device, { kind: 'load' }>;
    const u = v(d.a) - v(d.b);
    if (u > SERVO_LOW.from && u < SERVO_LOW.to) out.push({ kind: 'servo-underpowered', severity: 'warning', on: part.id, volts: u });
  }
  // a sensor module given some supply, but less than it works from (M6.3)
  for (const part of spec.parts) {
    if (!isSensor(part.type)) continue;
    const d = netlist.devices.find((x) => x.id === `${part.id}:supply`) as Extract<Device, { kind: 'resistor' }> | undefined;
    if (!d) continue;
    const u = v(d.a) - v(d.b);
    const need = minVolts(part.type, part.props);
    if (u > SERVO_LOW.from && u < need) out.push({ kind: 'sensor-underpowered', severity: 'warning', on: part.id, volts: u, limitV: need });
  }
  return out;
}

function isDriven(d: Extract<Device, { kind: 'pin' }>, state: SimState): boolean {
  const mode = state.pins?.[d.label]?.mode;
  return mode === 'out' || mode === 'pwm';
}

/**
 * An input pin is floating when nothing joins its net to ground through something that conducts: resistors,
 * closed switches, sources, a sensor's output, driven or pulled pins, lit LEDs. The pin itself (high impedance) doesn't count.
 */
function floating(netlist: Netlist, s: Solution, state: SimState): Fault[] {
  const uf = new UnionFind();
  for (const n of netlist.nets) uf.add(n);
  for (const d of netlist.devices) {
    switch (d.kind) {
      case 'resistor':
      case 'ldr':
      case 'load':
        uf.union(d.a, d.b);
        break;
      case 'logic':   // a driver's closed switches
        for (const sw of d.switches) if (s.amps[`${d.id}:${sw.id}`] !== undefined) uf.union(sw.a, sw.b);
        break;
      case 'switch':
        if (s.amps[d.id] !== undefined) uf.union(d.a, d.b);
        break;
      case 'pot':
        uf.union(d.e1, d.w);
        uf.union(d.w, d.e2);
        break;
      case 'source':
        uf.union(d.plus, d.minus);
        break;
      case 'drive':   // a sensor's output stage drives its OUT (M6.3)
        uf.union(d.out, d.gnd);
        break;
      case 'pin':
        if (s.amps[d.id] !== undefined) uf.union(d.net, d.gnd);
        break;
      case 'led':
        if (Math.abs(s.amps[d.id]!) > LED_ON_A) uf.union(d.a, d.k);
    }
  }
  const out: Fault[] = [];
  for (const d of netlist.devices) {
    if (d.kind !== 'pin' || state.pins?.[d.label]?.mode !== 'in') continue;
    if (uf.find(d.net) !== uf.find(d.gnd)) out.push({ kind: 'floating', severity: 'warning', on: d.label });
  }
  return out;
}

