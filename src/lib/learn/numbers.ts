import { BATTERIES, LED, LED_COLORS, MODELS, POWER_SUPPLY } from '../circuit';
import { stepE12 } from '../units';

/**
 * The numbers a Learn page shows (M8, F-40): each is read from the simulator's own model of the part, never typed
 * in the page, so a page and a run always agree. A page writes `{led.max} mA`; `{led.resistor:9}` has an argument.
 */

/** 0.02 A → 20; 2.0 → "2"; 3.3 → "3.3". */
const plain = (value: number) => String(Number(value.toPrecision(4)));
const mA = (amps: number) => plain(amps * 1000);

/** Below half its rated current an LED is dim; the best current is the middle of what is left (the picture's too). */
const ledDimA = LED.ratedA / 2;
const ledBestA = (ledDimA + LED.ratedA) / 2;

/** An LED's forward voltage as a page says it — "about 2 V": to the nearest volt. */
function ledVolts(colour: string): string | undefined {
  const led = LED_COLORS[colour];
  return led ? plain(Math.round(led.vf)) : undefined;
}

/** The resistor for a red LED at its best current on `volts`: what is left of the volts over that current, then the
 *  next common value above (a bigger resistor is safe). */
function ledResistor(volts: number): string | undefined {
  const left = volts - LED_COLORS.red!.vf;
  return left > 0 ? plain(stepE12(left / ledBestA, 1)) : undefined;
}

/** The potentiometer's whole track, as its model builds it. */
function potTrack(): number {
  return MODELS.potentiometer!.devices({ id: 'pot', leg: (name) => name, props: {} })
    .reduce((ohms, d) => (d.kind === 'pot' ? d.ohms : ohms), 0);
}

const NUMBERS: Record<string, (arg: string) => string | undefined> = {
  'led.vf': (colour) => ledVolts(colour || 'red'),
  'led.dim': () => mA(ledDimA),
  'led.best': () => mA(ledBestA),
  'led.best.A': () => plain(ledBestA),
  'led.rated': () => mA(LED.ratedA),
  'led.max': () => mA(LED.maxA),
  'led.resistor': (volts) => (volts && Number.isFinite(Number(volts)) ? ledResistor(Number(volts)) : undefined),
  'pot.track.k': () => plain(potTrack() / 1000),
  'supply.low': () => plain(Math.min(...POWER_SUPPLY.choices)),
  'supply.high': () => plain(Math.max(...POWER_SUPPLY.choices)),
  'battery.volts': (kind) => (BATTERIES[kind] ? plain(BATTERIES[kind].volts) : undefined),
};

/** A token's number as text — `led.max` → "30", `led.resistor:9` → "470" — or undefined if there is no such number. */
export function learnNumber(token: string): string | undefined {
  const at = token.indexOf(':');
  const name = at < 0 ? token : token.slice(0, at);
  return NUMBERS[name]?.(at < 0 ? '' : token.slice(at + 1));
}

/** Every token's name, for the checker's messages. */
export const LEARN_NUMBERS = Object.keys(NUMBERS);
