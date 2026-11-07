import type { BoardData } from '../boards';
import { COLUMNS, railHole } from '../circuit';
import type { Project } from '../project';
import { boardData } from './library';

/**
 * What the pointer is on (screen 02): a board pin's name and what it can do (F-15) — "GP15 · pin 20", a chip for
 * each function by its kind, its logic and current; a hole's strip and what is already in it (F-12).
 */
export type ChipKind = 'gpio' | 'pwm' | 'adc' | 'i2c' | 'spi' | 'uart' | 'touch' | 'power' | 'gnd';
export interface PinCard { title: string; detail: string; chips: { text: string; kind: ChipKind }[]; lines: string[] }
export interface HoleCard { title: string; lines: string[] }

const KINDS: [RegExp, ChipKind][] = [
  [/^PWM/, 'pwm'], [/^(ADC|DAC)/, 'adc'], [/^I2C/, 'i2c'], [/^SPI/, 'spi'], [/^UART/, 'uart'], [/^TOUCH/, 'touch'],
];
const kindOf = (fn: string): ChipKind => KINDS.find(([re]) => re.test(fn))?.[1] ?? 'gpio';
const volts = (v: number) => `${Number(v.toFixed(2))} V`;
const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function pinCard(board: BoardData, id: string): PinCard {
  const pin = board.pins.find((p) => p.id === id);
  if (!pin) return { title: id, detail: '', chips: [], lines: [] };
  const card: PinCard = { title: pin.label, detail: `pin ${pin.number}`, chips: [], lines: [] };
  if (pin.role === 'ground') {
    card.chips.push({ text: 'Ground', kind: 'gnd' });
    card.lines.push('0 V · every GND pin is joined');
  } else if (pin.role === 'power') {
    card.chips.push({ text: 'Power', kind: 'power' });
    const s = board.supplies.find((x) => x.pin === pin.id);
    if (s) {
      card.lines.push(`${volts(s.volts)} out · up to ${s.maxMa} mA`);
      if (s.usbOnly) card.lines.push('Only while the USB cable is in');
    }
  } else if (pin.role === 'gpio') {
    card.chips.push({ text: pin.inputOnly ? 'Input only' : 'Digital in/out', kind: 'gpio' });
    for (const fn of pin.functions) card.chips.push({ text: fn, kind: kindOf(fn) });
    card.lines.push(`${volts(board.logicVolts)} logic · ${pin.inputOnly ? 'input only' : `up to ${board.gpio.safeMa} mA`}`);
    if (pin.noPulls) card.lines.push('No built-in pull-up or pull-down');
  } else {
    card.chips.push({ text: 'Control', kind: 'gpio' });
  }
  if (pin.note) card.lines.push(sentence(pin.note));
  return card;
}

const RAILS: Record<string, [string, string]> = {
  'T-': ['Top − rail', 'GND'], 'T+': ['Top + rail', '3.3 V or 5 V'], 'B+': ['Bottom + rail', '3.3 V or 5 V'], 'B-': ['Bottom − rail', 'GND'],
};

export function holeCard(project: Project, ref: string): HoleCard {
  const dot = ref.indexOf('.');
  const bbId = ref.slice(0, dot);
  const bb = project.breadboards.find((b) => b.id === bbId);
  const m = /^(T-|T\+|B\+|B-|[a-j])(\d+)$/.exec(ref.slice(dot + 1));
  if (!bb || !m) return { title: ref, lines: [] };
  const [, row, colText] = m as unknown as [string, string, string];
  const col = Number(colText);
  let title: string;
  let lines: string[];
  let inStrip: (hole: string) => boolean;
  if (row.length === 2) {
    const [name, usual] = RAILS[row]!;
    let n = 0;
    for (let c = 1; c <= COLUMNS[bb.size]; c++) if (railHole(c)) n++;
    title = name;
    lines = [`All ${n} holes along this line are joined — usually ${usual}.`];
    inStrip = (h) => h.startsWith(`${bbId}.${row}`) && /\d+$/.test(h.slice(bbId.length + 1 + row.length));
  } else {
    const half = 'abcde'.includes(row) ? 'abcde' : 'fghij';
    title = `Column ${col}, rows ${half[0]}–${half[4]}`;
    lines = ['These 5 holes are joined inside the breadboard.'];
    inStrip = (h) => {
      const hm = /^(?:([^.]+)\.)([a-j])(\d+)$/.exec(h);
      return !!hm && hm[1] === bbId && half.includes(hm[2]!) && Number(hm[3]) === col;
    };
  }
  const where = (h: string) => (row.length === 2 ? `hole ${h.slice(dot + 1 + row.length)}` : `row ${h.slice(dot + 1, dot + 2)}`);
  for (const p of project.parts) {
    const legs = Object.values(p.legs).filter(inStrip);
    if (legs.length) lines.push(`${p.id.toUpperCase()} is already in ${legs.map(where).join(' and ')}.`);
  }
  const label = (end: string) => {
    if (!end.startsWith('board.')) return end.slice(end.indexOf('.') + 1);
    return boardData(project.board as never).pins.find((p) => `board.${p.id}` === end)?.label ?? end.slice(6);
  };
  for (const w of project.wires) {
    if (inStrip(w.a)) lines.push(`A wire joins it to ${label(w.b)}.`);
    else if (inStrip(w.b)) lines.push(`A wire joins it to ${label(w.a)}.`);
  }
  return { title, lines };
}
