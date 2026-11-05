import { z } from 'zod';

/**
 * A board's data file, `library/boards/<id>/board.json` (architecture §2.4): every pin with its functions and
 * limits, the supplies it gives, and the parts built onto it. Checked against the official pinouts in
 * tests/unit/boards/pinouts.test.ts; the electrical numbers feed the solver and the fault rules (docs/acceptance/M1.md).
 */

/** Function names as printed on the official pinouts: ADC0, ADC1_CH6, PWM7B, PWM, I2C1 SCL, SPI SCK, UART0 TX, TOUCH9, DAC1. */
export const FUNCTION = /^(ADC\d?|ADC[12]_CH\d|PWM(\d[AB])?|DAC\d|TOUCH\d?|I2C\d? (SDA|SCL)|SPI\d? (SCK|MOSI|MISO|TX|RX|CS)|UART\d (TX|RX))$/;

const pin = z.object({
  /** Unique on the board: the label, or label@number when the label repeats (GND@38). */
  id: z.string().min(1),
  /** As printed on the board. */
  label: z.string().min(1),
  /** Physical pin number (Pico), or the place on the header (ESP32, micro:bit breakout). */
  number: z.int().positive(),
  role: z.enum(['gpio', 'power', 'ground', 'control']),
  gpio: z.int().nonnegative().optional(),
  functions: z.array(z.string().regex(FUNCTION, 'unknown function')),
  inputOnly: z.boolean().optional(),
  /** No internal pull-up / pull-down (ESP32 GPIO 34–39). */
  noPulls: z.boolean().optional(),
  /** Affects how the board starts (ESP32 2, 5, 12, 15). */
  strapping: z.boolean().optional(),
  /** Also used on the board itself, e.g. "display COL3", "button A". */
  shared: z.string().optional(),
  note: z.string().optional(),
  /** The same connection as another pin, by a track on the board (the GPIO board's second 3.3V; its I²C
   *  header's SDA is P20). Same role and GPIO number as that pin; the circuit joins them. */
  same: z.string().optional(),
  /** A right-angle pin: it takes a jumper wire but doesn't go into the breadboard (the GPIO board's I²C header). */
  wireOnly: z.boolean().optional(),
});

const supply = z.object({
  /** The pin the supply comes out of; its return is the board's ground. */
  pin: z.string(),
  volts: z.number().positive(),
  /** What it may give to the circuit (the warning). */
  maxMa: z.number().positive(),
  /** Source resistance and the current it saturates at (the solver's model, docs/acceptance/M1.md decision 3). */
  ohms: z.number().positive(),
  limitMa: z.number().positive(),
  /** Only when the board is powered from USB (VBUS, VIN). */
  usbOnly: z.boolean().optional(),
  /** The volts a jumper on the board can pick (the ESP32 extension board's V rail: 3.3 or 5); `volts` is where
   *  the jumper starts. The circuit's board.jumpers picks another one. */
  choices: z.array(z.number().positive()).min(2).optional(),
});

const builtIn = z.discriminatedUnion('kind', [
  /** A resistor on the board between two of its pins (micro:bit pull-ups on the buttons and I²C). */
  z.object({ kind: z.literal('resistor'), id: z.string(), a: z.string(), b: z.string(), ohms: z.number().positive() }),
  /** A push button on the board between a pin and another (usually GND). */
  z.object({ kind: z.literal('button'), id: z.string(), a: z.string(), b: z.string() }),
  /** An LED with its series resistor, from a pin to GND (ESP32's blue LED on GPIO 2). */
  z.object({ kind: z.literal('led'), id: z.string(), pin: z.string(), color: z.string(), ohms: z.number().positive() }),
]);

export const boardSchema = z.object({
  format: z.literal(1),
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string(),
  chip: z.string(),
  logicVolts: z.number().positive(),
  gpio: z.object({
    /** What one pin should give at most (the warning, screen 04). */
    safeMa: z.number().positive(),
    /** Where a pin's current saturates (no resistor, screen 04). */
    shortCircuitMa: z.number().positive(),
    /** Output resistance below the limit. */
    outputOhms: z.number().positive(),
    pullOhms: z.number().positive(),
    /** All GPIO pins together. */
    totalMa: z.number().positive().optional(),
    /** Above logicVolts + this, a pin is damaged (5 V on a 3.3 V pin). */
    overVolts: z.number().positive(),
  }),
  /** Any output pin can be used for these buses (ESP32 GPIO matrix); the listed bus pins are the defaults. */
  anyPinBuses: z.array(z.enum(['I2C', 'SPI', 'UART'])).optional(),
  supplies: z.array(supply),
  builtIn: z.array(builtIn),
  /** Values the makers don't publish, to be confirmed (docs/acceptance/M1.md). Dotted paths. */
  estimates: z.array(z.string()),
  sources: z.array(z.string()).min(1),
  pins: z.array(pin).min(1),
}).superRefine((b, ctx) => {
  const ids = new Set<string>();
  b.pins.forEach((p, i) => {
    if (ids.has(p.id)) ctx.addIssue({ code: 'custom', path: ['pins', i, 'id'], message: `duplicate pin id "${p.id}"` });
    ids.add(p.id);
    if (p.role === 'gpio' && p.gpio === undefined) {
      ctx.addIssue({ code: 'custom', path: ['pins', i, 'gpio'], message: `${p.id} is a GPIO pin with no gpio number` });
    }
  });
  const byRef = (ref: string) => b.pins.find((p) => p.id === ref) ?? b.pins.find((p) => p.label === ref);
  b.pins.forEach((p, i) => {
    if (p.same === undefined) return;
    const to = byRef(p.same);
    const at = ['pins', i, 'same'];
    if (!to || to === p) ctx.addIssue({ code: 'custom', path: at, message: `${p.id} is the same as unknown pin "${p.same}"` });
    else if (to.same !== undefined) {
      ctx.addIssue({ code: 'custom', path: at, message: `${p.id} is the same as ${to.id}, which is itself the same as another pin` });
    } else if (to.role !== p.role || to.gpio !== p.gpio) {
      ctx.addIssue({ code: 'custom', path: at, message: `${p.id} is the same as ${to.id} but not the same kind of pin` });
    }
  });
  if (!b.pins.some((p) => p.role === 'ground')) ctx.addIssue({ code: 'custom', path: ['pins'], message: 'the board has no ground pin' });
  const known = (ref: string) => b.pins.some((p) => p.id === ref || p.label === ref);
  b.supplies.forEach((s, i) => {
    if (!known(s.pin)) ctx.addIssue({ code: 'custom', path: ['supplies', i, 'pin'], message: `supply on unknown pin "${s.pin}"` });
    if (s.choices && !s.choices.includes(s.volts)) {
      ctx.addIssue({ code: 'custom', path: ['supplies', i, 'volts'], message: `supply ${s.pin} is ${s.volts} V, not one of its choices ${s.choices.join(', ')}` });
    }
  });
  b.builtIn.forEach((part, i) => {
    const refs = part.kind === 'led' ? [part.pin] : [part.a, part.b];
    for (const r of refs) {
      if (!known(r)) ctx.addIssue({ code: 'custom', path: ['builtIn', i], message: `built-in ${part.id} on unknown pin "${r}"` });
    }
  });
});

export type BoardData = z.infer<typeof boardSchema>;
export type BoardPin = BoardData['pins'][number];
export type BoardSupply = BoardData['supplies'][number];
export type BuiltInPart = BoardData['builtIn'][number];

/** Checks a board.json; throws with every problem and where it is (pins.3.functions.1: unknown function). */
export function parseBoard(json: unknown): BoardData {
  const r = boardSchema.safeParse(json);
  if (!r.success) {
    const problems = r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`board.json is not valid — ${problems}`);
  }
  return r.data;
}
