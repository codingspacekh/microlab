import type { BoardData } from '@lib/boards';
import { connect, MODELS } from '@lib/circuit';
import { toCircuit, type Project } from './project';

/**
 * The check before running (M9 slice 3, F-18, screen 29b): what is easy to miss in the circuit and the code — a part's
 * leg alone in its column, a wire that ends where nothing is, a pin the code uses with nothing wired to it. Each says
 * what to do; Show rings it on the canvas, or goes to the line. Nothing found: Run just runs.
 */
export interface CheckItem {
  key: string;
  /** In bold: "LED2's short leg is alone in column 19." */
  title: string;
  /** After it: "Nothing joins it to GND, so it can't light. Wire column 19 to the − rail." */
  text: string;
  /** What Show rings: a part and the hole its leg is in, a wire's end, a board pin; the line of the code. */
  show: { part?: string; pin?: string; point?: string; line?: { file: string; line: number } };
}

/** The legs a part in use can't do without; the others (an RGB LED's unused colour, a button's second leg of a pair)
 *  may be left alone. Every VCC and GND too. */
const NEEDED: Record<string, string[]> = {
  led: ['a', 'k'], resistor: ['a', 'b'], ldr: ['a', 'b'], buzzer: ['+', '-'], motor: ['+', '-'], pump: ['+', '-'],
  'rgb-led': ['common'], 'seven-segment': ['com1'],
};
const HOLE = /^([^.]+)\.(?:([a-j])|([TB])([+-]))(\d+)$/;

const partName = (id: string) => id.toUpperCase();

/** "column 19", "the bottom − rail". */
function placeOf(point: string): string | undefined {
  const m = HOLE.exec(point);
  if (!m) return undefined;
  if (m[2]) return `column ${m[5]}`;
  return `the ${m[3] === 'T' ? 'top' : 'bottom'} ${m[4] === '-' ? '−' : '+'} rail`;
}

function legName(type: string, leg: string): string {
  if (type === 'led') return leg === 'a' ? 'long leg' : 'short leg';
  if (type === 'rgb-led') return 'long leg (common)';
  if (type === 'seven-segment') return 'COM';
  if (type === 'resistor' || type === 'ldr') return 'leg';
  if (type === 'motor' || type === 'pump') return `${leg === '-' ? '−' : '+'} tab`;
  if (type === 'buzzer') return `${leg === '-' ? '−' : '+'} leg`;
  return leg.toUpperCase();
}

function legAdvice(type: string, leg: string, id: string, where: string | undefined, props?: Record<string, unknown>): string {
  const wire = (to: string, fallback: string) => (where ? `Wire ${where} to ${to}.` : fallback);
  if (type === 'led' && leg === 'k') return `Nothing joins it to GND, so it can't light. ${wire(where?.endsWith('rail') ? 'GND' : 'the − rail', 'Wire it to GND.')}`;
  if (type === 'led') return `Nothing joins it to a pin or 3V3, so it can't light. ${wire('a pin through a resistor', 'Wire it to a pin through a resistor.')}`;
  if (type === 'rgb-led') return props?.common === 'anode' ? 'Nothing joins it to 3V3, so no colour can light.' : 'Nothing joins it to GND, so no colour can light.';
  if (type === 'seven-segment') return 'Nothing joins it to GND, so no segment can light.';
  if (type === 'resistor' || type === 'ldr') return `Nothing joins that end to anything, so no current flows through ${partName(id)}.`;
  if (type === 'motor' || type === 'pump') return `Nothing comes back from it, so the ${type} can't ${type === 'motor' ? 'turn' : 'run'}.`;
  if (type === 'buzzer') return "Nothing joins it, so it can't sound.";
  if (leg === 'vcc') return 'It has no power: wire it to 3V3, or 5 V if it needs it.';
  return 'Wire it to GND.';
}

/** The pins the code names, each with its first line: Pin(12), Pin("GP12"), ADC(1) on the Pico; pin1 on the micro:bit. */
function pinsInCode(code: string, board: BoardData): { gpio: number; line: number }[] {
  const out = new Map<number, number>();
  code.split('\n').forEach((raw, i) => {
    const line = raw.replace(/#.*$/, '');
    const found: number[] = [];
    if (board.id === 'microbit-v2') {
      for (const m of line.matchAll(/\bpin(\d+)\b/g)) found.push(Number(m[1]));
    } else {
      for (const m of line.matchAll(/\bPin\(\s*(?:(\d+)|["']GP(\d+)["'])/g)) found.push(Number(m[1] ?? m[2]));
      if (board.id === 'pico-w') {
        for (const m of line.matchAll(/\bADC\(\s*(\d+)\s*\)/g)) {
          const n = Number(m[1]);
          if (n <= 3) found.push(26 + n);   // ADC(0)–ADC(3): GP26–GP29; ADC(4) is the chip's temperature
          else if (n >= 26 && n <= 29) found.push(n);
        }
      }
    }
    for (const n of found) if (!out.has(n)) out.set(n, i + 1);
  });
  return [...out].map(([gpio, line]) => ({ gpio, line }));
}

export function checkBeforeRun(project: Project, board: BoardData, files: Record<string, unknown>, entry = 'main.py'): CheckItem[] {
  const spec = toCircuit(project, board);
  const c = connect(spec);
  // what is in a column (or on a terminal) itself: the nets with no wires, a wire's end counted as one thing there
  const bare = connect({ ...spec, wires: [] });
  const parts = new Set(project.parts.map((p) => p.id));
  const owner = (point: string) => point.slice(0, point.indexOf('.'));
  const wireEnds = new Map<string, string[]>();   // a point → the wires that end there
  // a board pin by its id, as the nets name it (a wire may name it by its label)
  const canon = (end: string) => {
    if (!end.startsWith('board.')) return end;
    const pin = board.pins.find((p) => p.id === end.slice(6)) ?? board.pins.find((p) => p.label === end.slice(6));
    return pin ? `board.${pin.id}` : end;
  };
  for (const w of project.wires) for (const end of [canon(w.a), canon(w.b)]) wireEnds.set(end, [...(wireEnds.get(end) ?? []), w.id]);
  // something in the net besides `self` (a part, or a wire): another part's point, a board pin, a wire's end
  const joined = (point: string, self: { part?: string; wire?: string }) => bare.pointsInNet(point).some((p) =>
    p.startsWith('board.')
    || (parts.has(owner(p)) && owner(p) !== self.part)
    || (wireEnds.get(p) ?? []).some((id) => id !== self.wire));
  const items: CheckItem[] = [];

  // a leg alone: in a part that is in use (something is joined to one of its points)
  for (const part of project.parts) {
    const model = MODELS[part.type];
    if (!model) continue;
    const points = model.legs.map((leg) => ({ leg, point: part.legs[leg] ?? `${part.id}.${leg}` }));
    if (!points.some((p) => joined(p.point, { part: part.id }))) continue;
    for (const { leg, point } of points) {
      const needed = NEEDED[part.type]?.includes(leg) || leg === 'vcc' || leg === 'gnd';
      if (!needed || joined(point, { part: part.id })) continue;
      const where = placeOf(point);
      const N = partName(part.id);
      items.push({
        key: `leg:${part.id}.${leg}`,
        title: where ? `${N}'s ${legName(part.type, leg)} is alone ${where.startsWith('the') ? 'on' : 'in'} ${where}.` : `${N}'s ${legName(part.type, leg)} has nothing wired to it.`,
        text: legAdvice(part.type, leg, part.id, where, part.props),
        show: { part: part.id, ...(where ? { point } : {}) },
      });
    }
  }

  // a wire's end in a hole where nothing else is
  const nameOfEnd = (end: string): string => {
    if (end.startsWith('board.')) {
      const id = end.slice(6);
      return `${board.pins.find((p) => p.id === id || p.label === id)?.label ?? id}'s wire`;
    }
    if (parts.has(owner(end))) return `${partName(owner(end))}'s wire`;
    return `The wire from ${placeOf(end) ?? end}`;
  };
  for (const w of project.wires) {
    const alone = (['a', 'b'] as const).filter((e) => HOLE.test(w[e]) && !joined(w[e], { wire: w.id }));
    if (alone.length === 2) {
      items.push({ key: `wire:${w.id}`, title: `The wire from ${placeOf(w.a)} to ${placeOf(w.b)}`, text: ' joins nothing.', show: { point: w.a } });
    } else if (alone.length === 1) {
      const e = alone[0]!;
      items.push({ key: `wire:${w.id}.${e}`, title: `${nameOfEnd(e === 'a' ? w.b : w.a)} ends in ${placeOf(w[e])}`, text: ', where nothing else is.', show: { point: w[e] } });
    }
  }

  // a pin the code uses, with nothing wired to it (the board's own buttons and LED don't count: they are wired)
  const code = files[entry];
  if (typeof code === 'string') {
    const own = new Set(board.builtIn.flatMap((b) => (b.kind === 'led' ? [b.pin] : [b.a, b.b])));
    for (const { gpio, line } of pinsInCode(code, board)) {
      const pin = board.pins.find((p) => p.role === 'gpio' && !p.same && p.gpio === gpio);
      if (!pin || own.has(pin.label) || own.has(pin.id)) continue;
      const self = new Set(board.pins.filter((p) => p.gpio === gpio && p.role === 'gpio').map((p) => `board.${p.id}`));
      const wired = c.pointsInNet(`board.${pin.id}`).some((p) => (p.startsWith('board.') && !self.has(p)) || parts.has(owner(p)) || wireEnds.has(p));
      if (wired) continue;
      items.push({
        key: `pin:${pin.label}`, title: `${entry} uses ${pin.label}`, text: ` (line ${line}), but nothing is wired to it.`,
        show: { pin: pin.label, line: { file: entry, line } },
      });
    }
  }
  return items;
}
