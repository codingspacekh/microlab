import { BATTERIES, BUZZER, echoUs, LED, LED_COLORS, ldrOhms, MODELS, POWER_SUPPLY, RGB_DIES, sensorDrive, SENSORS, strips } from '../circuit';
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

/** What the simulator has no number for, kept here so a page and its picture say the same (M8.2). An AA cell holds
 *  about 2000 mAh and a 9 V battery about 500 mAh; cells in a row add their volts, not how long they last. The
 *  resistor an LDR is read with: 10 kΩ suits room light. */
export const BATTERY_MAH: Record<string, number> = { '2xAA': 2000, '4xAA': 2000, '9V': 500 };
export const LDR_PARTNER_OHMS = 10_000;
/** The battery the LDR's page reads it on. */
const LDR_VOLTS = BATTERIES['2xAA']!.volts;

/** Two figures that matter: 2992.9 → "3", 133.3 → "130", 0.352 → "0.35". */
const about = (value: number) => String(Number(value.toPrecision(2)));

/** One of the RGB LED's three chips, by its leg. */
const die = (leg: string) => RGB_DIES.find((d) => d[0] === leg);

/** "5,g" → the resistor for the RGB LED's green chip on 5 V, at the best current. */
function rgbResistor(arg: string): string | undefined {
  const [volts, leg] = arg.split(',');
  const chip = die(leg ?? '');
  const left = Number(volts) - (chip?.[2] ?? NaN);
  return left > 0 ? plain(stepE12(left / ledBestA, 1)) : undefined;
}

/** The volts between an LDR and its partner resistor, on the page's battery, at `lux`. */
const ldrVolts = (lux: number) => (LDR_VOLTS * LDR_PARTNER_OHMS) / (ldrOhms(lux) + LDR_PARTNER_OHMS);
const lux = (arg: string) => (arg !== '' && Number(arg) >= 0 ? Number(arg) : undefined);

/** "2xAA,15" → how many hours a pack of AA cells feeds 15 mA. */
function batteryHours(arg: string): string | undefined {
  const [kind, ma] = arg.split(',');
  const mah = BATTERY_MAH[kind ?? ''];
  return mah && Number(ma) > 0 ? about(mah / Number(ma)) : undefined;
}

// ------------------------------------------------------------------ the sensors (M8.4)
const SONAR = SENSORS['hc-sr04'];
const DHT_KINDS = { DHT11: SENSORS.dht.DHT11, DHT22: SENSORS.dht.DHT22 } as const;
const TEMP_KINDS = { TMP36: SENSORS['temp-sensor'].TMP36, LM35: SENSORS['temp-sensor'].LM35 } as const;
const dht = (kind: string) => DHT_KINDS[kind as keyof typeof DHT_KINDS] as (typeof DHT_KINDS)[keyof typeof DHT_KINDS] | undefined;
const temp = (kind: string) => TEMP_KINDS[kind as keyof typeof TEMP_KINDS] as (typeof TEMP_KINDS)[keyof typeof TEMP_KINDS] | undefined;
/** A sensor's OUT, in volts, on a supply high enough for any of them. */
const HIGH_SUPPLY = Math.max(...POWER_SUPPLY.choices);
const tempVolts = (kind: string, celsius: number) => sensorDrive('temp-sensor', { kind }, { celsius }, HIGH_SUPPLY).volts;
/** "TMP36,22" → what a TMP36 gives at 22 °C, to a hundredth of a volt. */
function tempOut(arg: string): string | undefined {
  const [kind, celsius] = arg.split(',');
  return temp(kind ?? '') && celsius !== undefined && Number.isFinite(Number(celsius)) ? String(Number(tempVolts(kind!, Number(celsius)).toFixed(2))) : undefined;
}
const cm = (arg: string) => (arg !== '' && Number(arg) > 0 ? Number(arg) : undefined);

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
  'battery.cell.volts': () => plain(BATTERIES['2xAA']!.volts / 2),
  'battery.mah': (kind) => (BATTERY_MAH[kind] ? plain(BATTERY_MAH[kind]) : undefined),
  'battery.hours': batteryHours,
  'rgb.vf': (leg) => (die(leg) ? plain(Math.round(die(leg)![2])) : undefined),
  'rgb.resistor': rgbResistor,
  'ldr.dark.M': () => plain(ldrOhms(0) / 1e6),
  'ldr.k': (arg) => (lux(arg) === undefined ? undefined : about(ldrOhms(lux(arg)!) / 1000)),
  'ldr.partner.k': () => plain(LDR_PARTNER_OHMS / 1000),
  'ldr.battery': () => plain(LDR_VOLTS),
  'ldr.volts': (arg) => (lux(arg) === undefined ? undefined : String(Number(ldrVolts(lux(arg)!).toFixed(1)))),
  'buzzer.hz': () => plain(BUZZER.active.hz),
  'buzzer.volts': () => plain(BUZZER.active.minVolts),
  'buzzer.swing': () => plain(BUZZER.passive.minSwing),
  'sonar.us': () => plain(SONAR.usPerCm),
  'sonar.min': () => plain(SONAR.minCm),
  'sonar.max': () => plain(SONAR.maxCm),
  'sonar.volts': () => plain(SONAR.minVolts),
  'sonar.ms': (arg) => (cm(arg) === undefined ? undefined : plain(echoUs(cm(arg)!) / 1000)),
  'dht.volts': () => plain(SENSORS.dht.minVolts),
  'dht.tmin': (kind) => (dht(kind) ? plain(dht(kind)!.min) : undefined),
  'dht.tmax': (kind) => (dht(kind) ? plain(dht(kind)!.max) : undefined),
  'dht.hmin': (kind) => (dht(kind) ? plain(dht(kind)!.hMin) : undefined),
  'dht.hmax': (kind) => (dht(kind) ? plain(dht(kind)!.hMax) : undefined),
  'pir.hold': () => plain(SENSORS.pir.holdS),
  'pir.volts': () => plain(SENSORS.pir.minVolts),
  'pir.high': () => plain(sensorDrive('pir', {}, { motion: true }, HIGH_SUPPLY).volts),
  'line.volts': () => plain(SENSORS['line-sensor'].minVolts),
  'soil.dry': () => plain(sensorDrive('soil-moisture', {}, { position: 0 }, HIGH_SUPPLY).volts),
  'soil.wet': () => plain(sensorDrive('soil-moisture', {}, { position: 1 }, HIGH_SUPPLY).volts),
  'soil.volts': () => plain(SENSORS['soil-moisture'].minVolts),
  'temp.mv': () => plain((tempVolts('TMP36', 1) - tempVolts('TMP36', 0)) * 1000),
  'temp.offset': (kind) => (temp(kind) ? plain(temp(kind)!.offset) : undefined),
  'temp.min': (kind) => (temp(kind) ? plain(temp(kind)!.min) : undefined),
  'temp.max': (kind) => (temp(kind) ? plain(temp(kind)!.max) : undefined),
  'temp.supply': (kind) => (temp(kind) ? plain(temp(kind)!.minVolts) : undefined),
  'temp.out': tempOut,
  'breadboard.strip': () => plain(strips('half').find((strip) => strip.includes('a1'))!.length),
};

/** A token's number as text — `led.max` → "30", `led.resistor:9` → "470" — or undefined if there is no such number. */
export function learnNumber(token: string): string | undefined {
  const at = token.indexOf(':');
  const name = at < 0 ? token : token.slice(0, at);
  return NUMBERS[name]?.(at < 0 ? '' : token.slice(at + 1));
}

/** Every token's name, for the checker's messages. */
export const LEARN_NUMBERS = Object.keys(NUMBERS);
