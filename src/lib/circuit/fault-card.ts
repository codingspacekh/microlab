import type { BoardData } from '@lib/boards';
import type { Fault } from './faults';

/**
 * M9's fault table (F-37, §1.3 Teaching faults; screens 04, 25c, 26c, 27c, 28d): a fault the engine found, said for
 * a student — what happened, why, its numbers, the fix — with what to show on the workspace and what is drawn hurt.
 * The engine's one-line describeFault() stays the console's and the tests' text.
 */
export interface FaultCard {
  /** kind:on, as the run keeps each fault once. */
  key: string;
  severity: Fault['severity'];
  /** The card's heading: "LED1 burnt out", "GP15 was damaged", "SERVO1 gets 3.3 V". */
  title: string;
  /** Problems' heading — the card's, with the LED's colour: "LED1 (green) burnt out". */
  heading: string;
  /** Why, in a sentence or two. */
  why: string;
  /** The numbers that tell it: the one that is too much is `bad`. */
  numbers: { label: string; value: string; bad?: boolean }[];
  /** What to do about it ("Fix: …"). */
  fix: string;
  /** Problems' line under the heading, with the numbers; a damage says when the run stopped. */
  line: string;
  /** What Show selects: a part (its id) or a board pin (its label). */
  show: { part?: string; pin?: string };
  /** What is drawn hurt: a burnt LED (its id, or a die's 'rgb1:r'), a damaged pin (its label). */
  hurt?: { led?: string; pin?: string };
  /** The pin straight on it (screen 04: GP13 on the LED): its own warning needs no second note on the canvas. */
  via?: string;
}

export interface FaultContext {
  board?: BoardData;
  /** The project's parts: an LED's colour, a part's type. */
  parts?: { id: string; type: string; props?: Record<string, unknown> }[];
}

const DIES: Record<string, string> = { r: 'red', y: 'yellow', g: 'green', b: 'blue' };
const SHORT_NAMES: Record<string, string> = { 'pico-w': 'Pico W', 'microbit-v2': 'micro:bit', 'esp32-devkit-v1': 'ESP32' };

/** A part's id as the workspace labels it: LED1, MOTOR1. */
export const partName = (id: string) => id.toUpperCase();

/** ≈ 48 mA, 1.46 A. */
export function amps(a = 0): string {
  const x = Math.abs(a);
  return x >= 1 ? `${x.toFixed(2)} A` : `${Math.round(x * 1000)} mA`;
}
const volts = (v = 0) => `${Math.abs(v).toFixed(1)} V`;
/** 00:01.4 — minutes, seconds and tenths since the run started. */
export function runTime(ms = 0): string {
  const t = Math.max(0, Math.floor(ms / 100));
  return `${String(Math.floor(t / 600)).padStart(2, '0')}:${String(Math.floor(t / 10) % 60).padStart(2, '0')}.${t % 10}`;
}

export function faultCard(f: Fault, ctx: FaultContext = {}): FaultCard {
  const b = ctx.board;
  const board = b ? SHORT_NAMES[b.id] ?? b.name : 'board';
  const pinGives = b ? b.gpio.safeMa / 1000 : f.limitA;
  // the 5 V a part should have: the board's supply of 4.5 V or more (VBUS, VIN, 5V)
  const five = b?.supplies.find((s) => s.volts >= 4.5)?.pin;
  const giveFive = (leg: string) => five ? `Give its ${leg} ${five}${five === '5V' ? '' : ' (5 V)'}.` : `Give its ${leg} 5 V — a battery pack or a breadboard power supply, its GND joined to the board's.`;
  const stopped = f.severity === 'damage' ? ` The simulation stopped at ${runTime(f.atMs)}.` : '';
  const key = `${f.kind}:${f.on}`;
  const die = /^(.+):([A-Za-z]+)$/.exec(f.on);
  const partId = die ? die[1]! : f.on;
  const part = ctx.parts?.find((p) => p.id === partId);
  const type = f.partType ?? part?.type;
  const N = partName(partId);
  // an LED as a student names it: LED1, RGB1 (red), DIGIT1's segment a
  const colour = die ? DIES[die[2]!.toLowerCase()] : String(part?.props?.color ?? '');
  const led = !die ? N : type === 'seven-segment' ? `${N}'s segment ${die[2]}` : colour ? `${N} (${colour})` : `${N} ${die[2]}`;
  const ledHeading = !die && colour ? `${N} (${colour})` : led;
  const theLed = colour && type !== 'seven-segment' ? `the ${colour} LED` : type === 'seven-segment' ? `segment ${die?.[2]}` : 'the LED';
  const card = (c: Omit<FaultCard, 'key' | 'severity' | 'heading'> & { heading?: string }): FaultCard =>
    ({ key, severity: f.severity, heading: c.heading ?? c.title, ...(f.via ? { via: f.via } : {}), ...c });

  switch (f.kind) {
    case 'led-burnt': {
      const digit = type === 'seven-segment';
      return card({
        title: `${led} burnt out`, heading: `${ledHeading} burnt out`,
        why: f.via
          ? `${f.via} goes straight to ${theLed} with no resistor, so far too much current flowed. A real LED would now be dead.`
          : `Nothing held back the current through ${theLed}: far too much flowed. A real LED would now be dead.`,
        numbers: [
          { label: 'Current', value: `≈ ${amps(f.amps)}`, bad: true },
          { label: 'LED can take', value: amps(f.ratedA) },
          ...(f.via && pinGives ? [{ label: 'Pin can give', value: amps(pinGives) }] : []),
        ],
        fix: digit ? 'a 220 Ω from COM to GND, or one on each segment.'
          : type === 'rgb-led' ? 'a 220 Ω on each of its colour legs.'
          : f.via ? `put a 220 Ω resistor between ${f.via} and the LED.` : 'put a 220 Ω resistor in line with the LED, or a bigger one than it has.',
        line: `About ${amps(f.amps)}${f.via ? ` from ${f.via} — no resistor` : ''}.${stopped}`,
        show: { part: partId }, hurt: { led: f.on },
      });
    }
    case 'led-over-current': return card({
      title: `${led} gets too much current`, heading: `${ledHeading} gets too much current`,
      why: `${amps(f.amps)} flows through ${theLed}; an LED is made for ${amps(f.ratedA)}. It glows too bright, and won't last.`,
      numbers: [{ label: 'Current', value: `≈ ${amps(f.amps)}`, bad: true }, { label: 'LED is made for', value: amps(f.ratedA) }],
      fix: f.via ? `put a 220 Ω resistor between ${f.via} and the LED.` : 'a bigger resistor: 220 Ω or more.',
      line: `${amps(f.amps)} through it; an LED is made for ${amps(f.ratedA)}. Use a bigger resistor.`,
      show: { part: partId },
    });
    case 'led-backwards': return card({
      title: `${N} is the wrong way round`,
      why: `Its long leg (+, the anode) is on the low side. An LED lets current through one way only, so it stays dark.`,
      numbers: [{ label: 'Across it, backwards', value: volts(f.volts), bad: true }],
      fix: 'turn it round: the long leg towards the pin, the short leg (the flat side) towards GND.',
      line: `${volts(f.volts)} across it the wrong way: it stays dark. Turn it round — the long leg towards the pin.`,
      show: { part: partId },
    });
    case 'pin-over-current': return card({
      title: `${f.on} gave more than it should`,
      why: `${amps(f.amps)} flows through ${f.on}; a ${board} pin should give at most ${amps(f.limitA)}. A real pin would get hot and could fail.`,
      numbers: [{ label: 'Pin gives', value: `≈ ${amps(f.amps)}`, bad: true }, { label: 'Pin can give', value: amps(f.limitA) }],
      fix: 'a bigger resistor, or drive the load through a transistor or a driver.',
      line: `${amps(f.amps)} from one pin; a ${board} pin should give at most ${amps(f.limitA)}.`,
      show: { pin: f.on },
    });
    case 'board-over-current': return card({
      title: 'The pins give too much together',
      why: `All the pins together give ${amps(f.amps)}; a ${board} gives at most ${amps(f.limitA)} from its pins at once.`,
      numbers: [{ label: 'Pins give', value: `≈ ${amps(f.amps)}`, bad: true }, { label: 'Board can give', value: amps(f.limitA) }],
      fix: 'bigger resistors, fewer things on at once, or drive the loads through a driver.',
      line: `${amps(f.amps)} from all the pins together; a ${board} gives at most ${amps(f.limitA)}.`,
      show: {},
    });
    case 'supply-over-current': return card({
      title: `${f.on} gives more than it can`,
      why: `The parts on ${f.on} draw ${amps(f.amps)}; it gives at most ${amps(f.limitA)}. A real board would reset, or its supply get hot.`,
      numbers: [{ label: 'Parts draw', value: `≈ ${amps(f.amps)}`, bad: true }, { label: `${f.on} gives`, value: amps(f.limitA) }],
      fix: 'give the big loads (motors, many LEDs) their own supply, its GND joined to the board\'s.',
      line: `${amps(f.amps)} drawn from ${f.on}; it gives at most ${amps(f.limitA)}.`,
      show: { pin: f.on },
    });
    case 'short': {
      const pin = !!b?.pins.some((p) => p.label === f.on && p.role === 'gpio');
      const battery = !b?.supplies.some((s) => s.pin === f.on) && !pin;
      const what = battery ? partName(f.on) : f.on;
      const to = f.to ?? (battery ? 'its −' : 'GND');
      return card({
        title: `A short circuit on ${what}`,
        why: pin
          ? `${f.on} is ${to === 'GND' ? 'HIGH' : 'LOW'} and wired straight to ${to}, with nothing between: as much current flows as it can give. A real pin would now be dead.`
          : battery ? `${what}'s + is wired straight to its −: as much current flows as it can give. A real battery gets hot.`
          : `${f.on} is wired straight to ${to}, with nothing between: as much current flows as the board can give. A real board would reset, or be damaged.`,
        numbers: [{ label: 'Current', value: `≈ ${amps(f.amps)}`, bad: true }, ...(pin && pinGives ? [{ label: 'Pin can give', value: amps(pinGives) }] : [])],
        fix: `take away the wire between ${what === f.on ? f.on : `${what}'s + and −`}${what === f.on ? ` and ${to}` : ''}, or put a part between them (a resistor, an LED with its resistor).`,
        line: `${what} straight to ${to}: about ${amps(f.amps)}.${stopped}`,
        show: battery ? { part: f.on } : { pin: f.on }, ...(pin ? { hurt: { pin: f.on } } : {}),
      });
    }
    case 'over-voltage': {
      const takes = b?.logicVolts ?? 3.3;
      return card({
        title: `${f.on} was damaged`,
        why: `${f.on} has ${volts(f.volts)} on it; a ${board} pin takes at most ${volts(takes)}. A real pin would now be dead.`,
        numbers: [{ label: 'On the pin', value: volts(f.volts), bad: true }, { label: 'Pin takes', value: volts(takes) }],
        fix: `never wire 5 V to a pin. Bring a 5 V signal down with a divider (1 kΩ and 2 kΩ) first.`,
        line: `${volts(f.volts)} on a pin that takes at most ${volts(takes)}.${stopped}`,
        show: { pin: f.on }, hurt: { pin: f.on },
      });
    }
    case 'floating': {
      const noPulls = !!b?.pins.find((p) => p.label === f.on)?.noPulls;
      return card({
        title: `${f.on} reads chance`,
        why: `${f.on} is an input with nothing holding it: it reads 0 or 1 by chance, and changes when nothing happens.`,
        numbers: [],
        fix: noPulls
          ? `${f.on} has no pull-up of its own: wire a 10 kΩ from it to 3V3 (the button to GND), or to GND (the button to 3V3).`
          : `Pin.PULL_UP in the code (the button to GND), or Pin.PULL_DOWN (the button to 3V3).`,
        line: `An input with nothing holding it reads 0 or 1 by chance. Use Pin.PULL_UP or Pin.PULL_DOWN${noPulls ? ' — or, on this pin, a 10 kΩ resistor' : ''}.`,
        show: { pin: f.on },
      });
    }
    case 'servo-underpowered': return card({
      title: `${N} gets ${volts(f.volts)}`,
      why: `An SG90 needs 4.8–6 V: on ${volts(f.volts)} it twitches and can't hold its angle.`,
      numbers: [{ label: 'It gets', value: volts(f.volts), bad: true }, { label: 'It needs', value: '4.8–6 V' }],
      fix: giveFive('+'),
      line: `An SG90 needs 4.8–6 V: on ${volts(f.volts)} it twitches and can't hold its angle. ${giveFive('+')}`,
      show: { part: partId },
    });
    case 'sensor-underpowered': return card({
      title: `${N} gets ${volts(f.volts)}`,
      why: `It needs ${volts(f.limitV)} at least: what it reads is wrong, or nothing.`,
      numbers: [{ label: 'It gets', value: volts(f.volts), bad: true }, { label: 'It needs', value: `${volts(f.limitV)}+` }],
      fix: giveFive('VCC'),
      line: `It needs ${volts(f.limitV)} at least: on ${volts(f.volts)} what it reads is wrong. ${giveFive('VCC')}`,
      show: { part: partId },
    });
    case 'display-underpowered': {
      const lcd = type === 'lcd1602';
      const what = lcd ? 'its letters are too faint to read' : type === 'max7219' ? 'its dots may stay dark' : 'it may stay dark';
      const needs = lcd ? 'A 16×2 LCD needs 5 V' : `It needs ${volts(f.limitV)} at least`;
      return card({
        title: `${N} gets ${volts(f.volts)}`,
        why: `${needs}: on ${volts(f.volts)} ${what}.`,
        numbers: [{ label: 'It gets', value: volts(f.volts), bad: true }, { label: 'It needs', value: lcd ? '5 V' : `${volts(f.limitV)}+` }],
        fix: giveFive('VCC'),
        line: `${needs}: on ${volts(f.volts)} ${what}. ${giveFive('VCC')}`,
        show: { part: partId },
      });
    }
    case 'motor-on-pin': {
      const M = f.part ? partName(f.part) : 'The motor';
      return card({
        title: `${f.on} was damaged`,
        why: `${M} is wired straight to ${f.on}. A motor needs far more current than a pin can give — a real pin would now be dead, and the motor wouldn't turn.`,
        numbers: [{ label: 'Motor draws', value: `≈ ${amps(f.amps)}`, bad: true }, { label: 'Pin can give', value: amps(f.limitA) }],
        fix: `drive it through an L9110S or L298N (Actuators): the pin to the driver's input, the motor to its screws, the driver on ${five ?? '5 V'}.`,
        line: `${M} straight on the pin drew about ${amps(f.amps)}; a ${board} pin should give at most ${amps(f.limitA)}.${stopped}`,
        show: { pin: f.on }, hurt: { pin: f.on },
      });
    }
    case 'neopixel-backwards': return card({
      title: `${N}'s data goes in at DOUT`,
      why: `${f.part}'s wire is on ${N}'s DOUT. A NeoPixel takes data only at DIN, so none of its LEDs light.`,
      numbers: [],
      fix: `move ${f.part}'s wire to DIN, at the end the arrows point away from.`,
      line: `${f.part}'s wire is on ${N}'s DOUT. A NeoPixel takes data only at DIN, so none of its LEDs light. Move the wire to DIN, at the end the arrows point away from.`,
      show: { part: partId },
    });
    case 'neopixel-over-current': {
      const usb = !f.part || ['VBUS', 'VIN', '5V'].includes(f.part);
      const from = usb ? 'USB' : f.part!;
      return card({
        title: `${N} asks ${amps(f.amps)} of ${from}`,
        why: `Its LEDs together ask ${amps(f.amps)}; ${from} gives ${amps(f.limitA)}. A real ${board} would reset${usb ? ', or the computer turn its port off' : ''}.`,
        numbers: [{ label: 'It asks', value: `≈ ${amps(f.amps)}`, bad: true }, { label: `${from} gives`, value: amps(f.limitA) }],
        fix: 'make it dimmer — (40, 40, 40) for white, not (255, 255, 255) — light fewer, or give it its own 5 V supply (its GND joined to the board\'s).',
        line: `Its LEDs ask about ${amps(f.amps)}; ${from} gives ${amps(f.limitA)}. Make it dimmer, light fewer, or give it its own 5 V supply.`,
        show: { part: partId },
      });
    }
    case 'uart-tx-to-tx': return card({
      title: `${f.on} (TX) is wired to ${f.part}`,
      why: 'Two outputs on one wire: neither hears the other, and they fight when one sends a 0.',
      numbers: [],
      fix: `a TX goes to the other side's RX — swap ${f.on}'s and its RX's wires.`,
      line: `Two outputs on one wire: neither hears the other, and they fight when one sends a 0. A TX goes to the other side's RX — swap the wires.`,
      show: { pin: f.on },
    });
  }
}

/** The run's faults as cards, and after them each LED still burnt from an earlier run (dead until replaced): it
 *  stays a damaged part, with its Replace, in Problems and the status bar (M9 slice 2). */
export function faultCards(faults: Fault[], burnt: string[] = [], ctx: FaultContext = {}): FaultCard[] {
  const cards = faults.map((f) => faultCard(f, ctx));
  for (const id of burnt) {
    if (cards.some((c) => c.hurt?.led === id)) continue;
    const c = faultCard({ kind: 'led-burnt', severity: 'damage', on: id }, ctx);
    cards.push({
      ...c, key: `dead:${id}`, title: `${c.title.replace(/ burnt out$/, '')} is still burnt out`, heading: `${c.heading.replace(/ burnt out$/, '')} is still burnt out`,
      why: 'It burnt out in an earlier run: a real LED stays dead, so it stays dark until it is replaced.',
      numbers: [], fix: 'replace it — and put a resistor in line with it first.',
      line: 'It burnt out in an earlier run and stays dark until it is replaced.',
    });
  }
  return cards;
}

/** The status bar's count (screens 04, 25c, 27c): "1 part damaged · 1 warning", "1 pin damaged", "2 warnings". */
export function faultSummary(cards: FaultCard[]): string {
  const n = (k: number, one: string) => `${k} ${one}${k === 1 ? '' : 's'}`;
  const damage = cards.filter((c) => c.severity === 'damage');
  const parts = damage.filter((c) => c.hurt?.led || (!c.hurt?.pin && c.show.part)).length;
  const pins = damage.filter((c) => c.hurt?.pin).length;
  const other = damage.length - parts - pins;
  const warnings = cards.length - damage.length;
  return [
    parts && `${n(parts, 'part')} damaged`, pins && `${n(pins, 'pin')} damaged`, other && n(other, 'short circuit'),
    warnings && n(warnings, 'warning'),
  ].filter(Boolean).join(' · ');
}

/** The status bar's left side after a damage stopped the run: "Stopped: a part was damaged". */
export function stoppedBy(card: FaultCard): string {
  return card.hurt?.led ? 'Stopped: a part was damaged' : card.hurt?.pin ? 'Stopped: a pin was damaged' : 'Stopped: a short circuit';
}
