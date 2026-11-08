import { CONTACT_OHMS, LED, LED_COLORS, WIPER_OHMS, ldrOhms, type Device, type Netlist, type SimState } from './devices';

export interface Solution {
  /** Each net's voltage to ground. */
  volts: Record<string, number>;
  /**
   * Each device's current, A: resistor a → b, LED anode → cathode, supply and pin out into the circuit.
   * A pin that drives nothing (input, no pull) has no entry.
   */
  amps: Record<string, number>;
  converged: boolean;
  iterations: number;
}

const GMIN = 1e-12;        // from every node to ground, so a floating node still has a voltage (0 V)
const MAX_ITER = 200;
const MAX_STEP = 0.5;      // V per Newton step at most (damping)
const PHASE1_TOL = 1e-4;

/** A Thevenin source with a smooth current limit: i = L·tanh((V − u) / (R·L)), u = v(plus) − v(minus). */
function sourceCurrent(volts: number, ohms: number, limitA: number, u: number) {
  const x = (volts - u) / (ohms * limitA);
  const t = Math.tanh(x);
  return { i: limitA * t, g: (1 - t * t) / ohms };   // g = −di/du ≥ 0
}

/** LED junction (decision 1): i = refA·(e^((v − vf)/nvt) − e^(−vf/nvt)), exact vf at refA. */
function ledCurrent(vf: number, v: number) {
  const e = Math.exp((v - vf) / LED.nvt);
  return { i: LED.refA * (e - Math.exp(-vf / LED.nvt)), g: (LED.refA * e) / LED.nvt };
}

/** SPICE's junction step limit: big forward steps grow logarithmically, so exp() never runs away. */
function limitJunction(vNew: number, vOld: number, vcrit: number): number {
  if (vNew > vcrit && Math.abs(vNew - vOld) > 2 * LED.nvt) {
    if (vOld > 0) {
      const arg = 1 + (vNew - vOld) / LED.nvt;
      return arg > 0 ? vOld + LED.nvt * Math.log(arg) : vcrit;
    }
    return vcrit;
  }
  return vNew;
}

type Source = { id: string; p: number; m: number; volts: number; ohms: number; limitA: number };
type Led = { id: string; a: number; j: number; k: number; vf: number; vcrit: number };

type Logic = Extract<Device, { kind: 'logic' }>;
/** A driver solves again at most this many times for its switches to agree with the voltages (inputs that don't
 *  depend on its outputs agree on the second pass; a relay at the edge of pulling in may not, and stays as last). */
const LOGIC_PASSES = 6;

/** Which of a driver's switches its inputs close, from the voltages: '1' closed, '0' open, one a switch. */
export function logicPattern(l: Logic, volts: Record<string, number>): string {
  const v = (net: string) => (volts[net] ?? 0) - (volts[l.gnd] ?? 0);
  const rest = l.rest ?? '0'.repeat(l.switches.length);
  if (l.power.length && !l.power.some((p) => v(p.net) >= p.minVolts)) return rest;
  return l.table[l.inputs.map((i) => (v(i) >= l.threshold ? '1' : '0')).join('')] ?? rest;
}

/** Nodal analysis with Newton iterations (architecture §2.5, Q14). Plain data in, plain data out. Drivers' logic
 *  (M7): solved with its switches as the last answer had them, then again while its inputs say otherwise. */
export function solve(netlist: Netlist, state: SimState = {}, previous?: Solution): Solution {
  const logic = netlist.devices.filter((d): d is Logic => d.kind === 'logic');
  if (!logic.length) return solveDevices(netlist, netlist.devices, state, previous);
  const others = netlist.devices.filter((d) => d.kind !== 'logic');
  const closedBy = (patterns: string[]): Device[] => logic.flatMap((l, i) => l.switches
    .filter((_, k) => patterns[i]![k] === '1')
    .map((sw): Device => ({ kind: 'resistor', id: `${l.id}:${sw.id}`, a: sw.a, b: sw.b, ohms: sw.ohms })));
  let patterns = logic.map((l) => logicPattern(l, previous?.volts ?? {}));
  let s = solveDevices(netlist, [...others, ...closedBy(patterns)], state, previous);
  for (let pass = 1; pass < LOGIC_PASSES; pass++) {
    const next = logic.map((l) => logicPattern(l, s.volts));
    if (next.every((p, i) => p === patterns[i])) break;
    patterns = next;
    s = solveDevices(netlist, [...others, ...closedBy(patterns)], state, s);
  }
  return s;
}

function solveDevices(netlist: Netlist, devices: Device[], state: SimState, previous?: Solution): Solution {
  const index = new Map<string, number>();     // ground is -1
  const names: string[] = [];
  const node = (name: string): number => {
    if (name === netlist.ground) return -1;
    let i = index.get(name);
    if (i === undefined) {
      i = names.length;
      index.set(name, i);
      names.push(name);
    }
    return i;
  };
  // Only nets a device touches are unknowns: an empty breadboard strip or unused pin is just 0 V.

  const resistors: { id: string; a: number; b: number; g: number }[] = [];
  const sources: Source[] = [];
  const leds: Led[] = [];
  for (const d of devices) addDevice(d, state, node, resistors, sources, leds);

  const n = names.length;
  const v = new Float64Array(n);
  if (previous) names.forEach((name, i) => { v[i] = previous.volts[name] ?? 0; });
  const at = (i: number) => (i < 0 ? 0 : v[i]!);
  const vj = leds.map((l) => at(l.j) - at(l.k));   // each LED's junction voltage, limited separately

  const G = new Float64Array(n * n);
  const I = new Float64Array(n);
  const stampG = (a: number, b: number, g: number) => {
    if (a >= 0) G[a * n + a] = G[a * n + a]! + g;
    if (b >= 0) G[b * n + b] = G[b * n + b]! + g;
    if (a >= 0 && b >= 0) {
      G[a * n + b] = G[a * n + b]! - g;
      G[b * n + a] = G[b * n + a]! - g;
    }
  };
  const stampI = (a: number, b: number, i: number) => {   // current i injected into a, taken from b
    if (a >= 0) I[a] = I[a]! + i;
    if (b >= 0) I[b] = I[b]! - i;
  };

  // Two phases (homotopy): first the supplies and pins as plain sources (V and R), then with their current
  // limits on, starting from that answer. Started anywhere else — from 0 V, or from the last answer after a pin
  // changed — a limited source can look like a constant current, and Newton bounces between its two limits.
  // From the last answer, phase 1 takes only a few steps.
  let saturate = false;
  let converged = false;
  let iterations = 0;
  while (iterations < MAX_ITER) {
    iterations++;
    G.fill(0);
    I.fill(0);
    for (let i = 0; i < n; i++) G[i * n + i] = GMIN;
    for (const r of resistors) stampG(r.a, r.b, r.g);
    for (const s of sources) {
      const u = at(s.p) - at(s.m);
      const { i, g } = saturate ? sourceCurrent(s.volts, s.ohms, s.limitA, u) : { i: (s.volts - u) / s.ohms, g: 1 / s.ohms };
      stampG(s.p, s.m, g);
      stampI(s.p, s.m, i + g * u);
    }
    leds.forEach((l, li) => {
      stampG(l.a, l.j, 1 / LED.ohms);
      const u = vj[li]!;
      const { i, g } = ledCurrent(l.vf, u);
      stampG(l.j, l.k, g + GMIN);
      stampI(l.k, l.j, i - g * u);   // linearised junction i(u) ≈ i0 + g(u − u0), from j to k
    });

    const x = solveLinear(G, I, n);
    let maxStep = 0;
    for (let i = 0; i < n; i++) maxStep = Math.max(maxStep, Math.abs(x[i]! - v[i]!));
    const scale = saturate && maxStep > MAX_STEP ? MAX_STEP / maxStep : 1;
    let delta = 0;
    for (let i = 0; i < n; i++) {
      const next = v[i]! + scale * (x[i]! - v[i]!);
      delta = Math.max(delta, Math.abs(next - v[i]!) / (1 + Math.abs(next)));
      v[i] = next;
    }
    let limited = false;
    leds.forEach((l, li) => {
      const want = at(l.j) - at(l.k);
      const got = limitJunction(want, vj[li]!, l.vcrit);
      if (got !== want) limited = true;
      vj[li] = got;
    });
    // Phase 1 only has to get close; phase 2 settles to 1e-10.
    if (scale === 1 && !limited && delta < (saturate ? 1e-10 : PHASE1_TOL)) {
      if (saturate) {
        converged = true;
        break;
      }
      saturate = true;
    }
  }

  const volts: Record<string, number> = {};
  for (const name of netlist.nets) volts[name] = 0;
  names.forEach((name, i) => { volts[name] = v[i]!; });
  const amps: Record<string, number> = {};
  for (const r of resistors) amps[r.id] = (at(r.a) - at(r.b)) * r.g;
  for (const s of sources) amps[s.id] = sourceCurrent(s.volts, s.ohms, s.limitA, at(s.p) - at(s.m)).i;
  for (const l of leds) amps[l.id] = (at(l.a) - at(l.j)) / LED.ohms;
  return { volts, amps, converged, iterations };
}

function addDevice(
  d: Device, state: SimState, node: (name: string) => number,
  resistors: { id: string; a: number; b: number; g: number }[], sources: Source[], leds: Led[],
): void {
  switch (d.kind) {
    case 'resistor':
      resistors.push({ id: d.id, a: node(d.a), b: node(d.b), g: 1 / d.ohms });
      return;
    case 'source':
      sources.push({ id: d.id, p: node(d.plus), m: node(d.minus), volts: d.volts, ohms: d.ohms, limitA: d.limitA });
      return;
    case 'pin': {
      const s = state.pins?.[d.label] ?? { mode: 'in' as const };
      const p = node(d.net);
      const m = node(d.gnd);
      if (s.mode === 'out' || s.mode === 'pwm') {
        const volts = s.mode === 'out' ? s.value * d.volts : Math.min(1, Math.max(0, s.duty)) * d.volts;
        sources.push({ id: d.id, p, m, volts, ohms: d.ohms, limitA: d.limitA });
      } else if (s.pull === 'up' && !d.noPulls) {
        sources.push({ id: d.id, p, m, volts: d.volts, ohms: d.pullOhms, limitA: 1 });
      } else if (s.pull === 'down' && !d.noPulls) {
        resistors.push({ id: d.id, a: p, b: m, g: 1 / d.pullOhms });
      }
      return;
    }
    case 'switch': {
      const s = state.parts?.[d.part];
      const closed = d.closedWhen === 'pressed' ? Boolean(s?.pressed) : (s?.position ?? 0) === d.closedWhen;
      if (closed) resistors.push({ id: d.id, a: node(d.a), b: node(d.b), g: 1 / CONTACT_OHMS });
      return;
    }
    case 'pot': {
      const st = state.parts?.[d.part];
      const p = Math.min(1, Math.max(0, (d.axis ? st?.[d.axis] : st?.position) ?? 0.5));
      resistors.push(
        { id: `${d.id}:1-2`, a: node(d.e1), b: node(d.w), g: 1 / (p * d.ohms + WIPER_OHMS) },
        { id: `${d.id}:2-3`, a: node(d.w), b: node(d.e2), g: 1 / ((1 - p) * d.ohms + WIPER_OHMS) },
      );
      return;
    }
    case 'load':
      resistors.push({ id: d.id, a: node(d.a), b: node(d.b), g: 1 / (state.parts?.[d.part]?.ohms ?? d.ohms) });
      return;
    case 'logic':   // its switches are resistors, added by solve()
      return;
    case 'ldr':
      resistors.push({ id: d.id, a: node(d.a), b: node(d.b), g: 1 / ldrOhms(state.parts?.[d.part]?.lux ?? 300) });
      return;
    case 'drive': {
      const st = state.parts?.[d.part];
      const dr = (d.key ? st?.drives?.[d.key] : st?.drive) ?? { volts: 0, ohms: 1e6 };
      sources.push({ id: d.id, p: node(d.out), m: node(d.gnd), volts: dr.volts, ohms: dr.ohms, limitA: 0.05 });
      return;
    }
    case 'led': {
      const vf = d.vf ?? (LED_COLORS[d.color] ?? LED_COLORS.red!).vf;
      const vcrit = vf + LED.nvt * Math.log(LED.nvt / (Math.SQRT2 * LED.refA));
      leds.push({ id: d.id, a: node(d.a), j: node(`${d.id}#j`), k: node(d.k), vf, vcrit });
    }
  }
}

/**
 * Gaussian elimination, G and I overwritten. No pivoting needed: a nodal matrix is diagonally dominant
 * (each node's conductances sum on its diagonal, plus GMIN), which keeps elimination stable.
 */
function solveLinear(G: Float64Array, I: Float64Array, n: number): Float64Array {
  for (let c = 0; c < n; c++) {
    const d = G[c * n + c]!;
    for (let r = c + 1; r < n; r++) {
      const f = G[r * n + c]! / d;
      if (f === 0) continue;   // most entries are 0: a node touches few others
      for (let k = c; k < n; k++) G[r * n + k] = G[r * n + k]! - f * G[c * n + k]!;
      I[r] = I[r]! - f * I[c]!;
    }
  }
  const x = new Float64Array(n);
  for (let r = n - 1; r >= 0; r--) {
    let s = I[r]!;
    for (let k = r + 1; k < n; k++) s -= G[r * n + k]! * x[k]!;
    x[r] = s / G[r * n + r]!;
  }
  return x;
}
