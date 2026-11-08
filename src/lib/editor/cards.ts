import type { BoardData } from '../boards';
import { COLUMNS, connect, railHole } from '../circuit';
import { toCircuit, type Project } from '../project';
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

/** What each terminal is (M7), as printed by it, and what it is for. */
const TERMINALS: Record<string, { names: Record<string, string>; line: string }> = {
  motor: { names: { '+': '+ tab', '-': '− tab' }, line: 'The motor turns forward with + above −, backward the other way round.' },
  pump: { names: { '+': '+ lead (red)', '-': '− lead (black)' }, line: 'It pumps with 2.5 V or more across its leads.' },
  l9110s: { names: { a1: 'MOTOR A, screw 1', a2: 'MOTOR A, screw 2', b1: 'MOTOR B, screw 1', b2: 'MOTOR B, screw 2' }, line: "A motor's two leads go in a pair of screws; A-IA / A-IB (B-IA / B-IB) say which way it turns." },
  relay: { names: { no: 'NO (normally open)', com: 'COM (common)', nc: 'NC (normally closed)' }, line: 'COM is joined to NC — and to NO while the relay is on. What it switches is apart from the board.' },
  l298n: {
    names: { out1: 'OUT1 (motor A)', out2: 'OUT2 (motor A)', out3: 'OUT3 (motor B)', out4: 'OUT4 (motor B)', '12v': '12V (the motors\' supply, 5–12 V)', gnd: 'GND', '5v': '5V (logic)', ena: 'ENA', in1: 'IN1', in2: 'IN2', in3: 'IN3', in4: 'IN4', enb: 'ENB' },
    line: 'IN1 / IN2 turn motor A, IN3 / IN4 motor B; ENA and ENB have their jumpers on (full speed) — take one off in the inspector to wire a PWM pin there.',
  },
  uln2003: { names: { a: 'socket, OUT1', b: 'socket, OUT2', c: 'socket, OUT3', d: 'socket, OUT4', m: 'socket, +' }, line: 'The 28BYJ-48\'s cable plugs in here.' },
  stepper: { names: { blue: 'blue (coil A)', pink: 'pink (coil B)', yellow: 'yellow (coil C)', orange: 'orange (coil D)', red: 'red (+)' }, line: 'Its cable goes into a ULN2003\'s socket.' },
  // M7 slice 2: the displays' headers out of their sides
  lcd1602: { names: { gnd: 'GND', vcc: 'VCC (5 V)', sda: 'SDA (I²C data)', scl: 'SCL (I²C clock)' }, line: 'Its I²C backpack: SDA and SCL to the board\'s I²C pins, VCC to 5 V — on 3.3 V its letters are too faint to read.' },
  tm1637: { names: { clk: 'CLK', dio: 'DIO', vcc: 'VCC', gnd: 'GND' }, line: 'CLK and DIO go to any two pins (the tm1637 library); VCC 3.3–5 V.' },
  max7219: {
    names: { vcc: 'VCC (5 V)', gnd: 'GND', din: 'DIN (SPI MOSI)', cs: 'CS (LOAD)', clk: 'CLK (SPI SCK)', vcc2: 'VCC out', gnd2: 'GND out', dout: 'DOUT (to the next one\'s DIN)', cs2: 'CS out', clk2: 'CLK out' },
    line: 'DIN to SPI\'s MOSI, CLK to its SCK, CS to any pin; VCC 5 V. The right-hand header chains another matrix.',
  },
  // M7 slice 3: a NeoPixel's pads
  neopixel: {
    names: { din: 'DIN (data in)', vcc: '5V', gnd: 'GND', dout: 'DOUT (to the next one\'s DIN)', vcc2: '5V out', gnd2: 'GND out' },
    line: 'DIN to any pin (neopixel); 5V to VBUS, VIN or 5V. Its data goes in at DIN only — DOUT goes on to the next stick or ring.',
  },
};

/** A part's terminal (M7): what it is, and what it is wired to. */
function terminalCard(project: Project, part: Project['parts'][number], leg: string): HoleCard {
  const t = TERMINALS[part.type];
  const lines = t ? [t.line] : [];
  const ref = `${part.id}.${leg}`;
  for (const w of project.wires) {
    const other = w.a === ref ? w.b : w.b === ref ? w.a : undefined;
    if (other) lines.push(`A wire joins it to ${endName(project, other)}.`);
  }
  return { title: `${part.id.toUpperCase()} · ${t?.names[leg] ?? leg}`, lines };
}

/** A wire's end in words: a board pin's label, a part's terminal, a hole. */
function endName(project: Project, end: string): string {
  if (end.startsWith('board.')) return boardData(project.board as never).pins.find((p) => `board.${p.id}` === end)?.label ?? end.slice(6);
  const owner = end.slice(0, end.indexOf('.'));
  const part = project.parts.find((p) => p.id === owner);
  const leg = end.slice(end.indexOf('.') + 1);
  return part ? `${owner.toUpperCase()} ${TERMINALS[part.type]?.names[leg] ?? leg}` : leg;
}

export function holeCard(project: Project, ref: string): HoleCard {
  const dot = ref.indexOf('.');
  const bbId = ref.slice(0, dot);
  const bb = project.breadboards.find((b) => b.id === bbId);
  const part = !bb ? project.parts.find((p) => p.id === bbId) : undefined;
  if (part) return terminalCard(project, part, ref.slice(dot + 1));
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
  for (const w of project.wires) {
    if (inStrip(w.a)) lines.push(`A wire joins it to ${endName(project, w.b)}.`);
    else if (inStrip(w.b)) lines.push(`A wire joins it to ${endName(project, w.a)}.`);
  }
  return { title, lines };
}

/** What a part's legs are joined to (F-14, screen 02b: "GP15 ↔ LED3"), one name per side — legs joined inside the
 *  part (a push button's) count as one side. Board pins by their label first, then other parts; "nothing". */
export function joinsOf(project: Project, id: string): string[] {
  const part = project.parts.find((p) => p.id === id);
  if (!part) return [];
  const net = connect(toCircuit(project, boardData(project.board as never)));
  // every ground pin (the Pico's AGND too) is joined to the others inside the board: they are all "GND"
  const labels = new Map(boardData(project.board as never).pins.map((p) => [`board.${p.id}`, p.role === 'ground' ? 'GND' : p.label]));
  const sides: { net: string | undefined; names: string[] }[] = [];
  // its legs, and its terminals (M7: a motor's tabs, a driver's screws)
  for (const leg of new Set([...Object.keys(part.legs), ...Object.keys(TERMINALS[part.type]?.names ?? {})])) {
    const n = net.netOf(`${id}.${leg}`);
    if (sides.some((x) => x.net === n)) continue;
    const pins: string[] = [];
    const parts: string[] = [];
    for (const point of net.pointsInNet(`${id}.${leg}`)) {
      const label = labels.get(point);
      if (label) { if (!pins.includes(label)) pins.push(label); continue; }
      const owner = point.slice(0, point.indexOf('.'));
      if (owner !== id && project.parts.some((p) => p.id === owner) && !parts.includes(owner.toUpperCase())) parts.push(owner.toUpperCase());
    }
    sides.push({ net: n, names: [...pins, ...parts] });
  }
  return sides.map((x) => (x.names.length ? x.names.join(', ') : 'nothing'));
}
