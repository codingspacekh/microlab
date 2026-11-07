/**
 * Sensor modules that drive their own output (M6.3), from their datasheets. Each has VCC, OUT and GND legs; it draws
 * a small current (`loadOhms` across its supply) and drives OUT through `ohms` — what its output stage is. Below
 * `minVolts` (VCC above GND) it gives nothing (OUT weakly to GND) and a warning says so (faults: sensor-underpowered).
 * The sim works out each one's input (motion, the surface under it, moisture, temperature) and supply, and hands the
 * solver the result as a `drive` (devices.ts).
 */
export interface Drive { volts: number; ohms: number }

/** What a sensor sees now: motion (a PIR, its hold time included), position 0–1 (the line sensor: 0 white, 1 the
 *  black line; the soil sensor: 0 dry, 1 in water), °C. */
export interface SensorInput { motion?: boolean; position?: number; celsius?: number; echo?: boolean }

export const SENSORS = {
  /** HC-SR501: 4.5–20 V, ≈ 50 µA idle; OUT 3.3 V (its own regulator) while it sees motion and for `holdS` after. */
  pir: { minVolts: 4.5, loadOhms: 100_000, high: 3.3, holdS: 3 },
  /** TCRT5000 module (LM393 comparator, open collector, 10 kΩ pull-up to VCC): 3.3–5 V; its IR LED draws ≈ 15 mA. */
  'line-sensor': { minVolts: 3.0, loadOhms: 220, pullOhms: 10_000 },
  /** Capacitive soil moisture sensor v1.2 (TLC555, 3.3 V regulator): ≈ 2.4 V in dry soil, ≈ 0.9 V in water, ≈ 5 mA. */
  'soil-moisture': { minVolts: 3.0, loadOhms: 680, dry: 2.4, wet: 0.9 },
  /** DHT11 / DHT22 module (M6.4): 3.3–5.5 V, ≈ 1.5 mA reading; its DATA pulled up to VCC by 10 kΩ on the board, the
   *  rest is its protocol (the sim's dht_readinto). DHT11: 0–50 °C, 20–90 %, whole numbers; DHT22: −40…80 °C, 0–100 %. */
  dht: { minVolts: 3.0, loadOhms: 3300, pullOhms: 10_000, DHT11: { min: 0, max: 50, hMin: 20, hMax: 90 }, DHT22: { min: -40, max: 80, hMin: 0, hMax: 100 } },
  /** HC-SR04 (M6.4): 5 V (4.5 V at least), ≈ 15 mA; a ≥ 10 µs pulse on Trig, then Echo high at VCC for the sound's way
   *  there and back, 58 µs per cm (343 m/s), 2–400 cm; nothing there: a 38 ms echo. */
  'hc-sr04': { minVolts: 4.5, loadOhms: 333, usPerCm: 58, delayUs: 460, minCm: 2, maxCm: 400, noneUs: 38_000, minTrigUs: 8 },
  /** TMP36: 2.7–5.5 V, 0.5 V + 10 mV/°C (−40…125 °C). LM35: 4–30 V, 10 mV/°C (0…150 °C as wired simply). ≈ 50 µA. */
  'temp-sensor': { TMP36: { minVolts: 2.7, offset: 0.5, min: -40, max: 125 }, LM35: { minVolts: 4.0, offset: 0, min: 0, max: 150 }, loadOhms: 100_000 },
} as const;

export type SensorType = keyof typeof SENSORS;

export const isSensor = (type: string): type is SensorType => type in SENSORS;

/** Room temperature, when nothing has set it; a soil sensor in damp soil; half-humid air; something 1 m away. */
export const SENSOR_START = { celsius: 22, moisture: 0.5, humidity: 50, cm: 100 } as const;

const OFF: Drive = { volts: 0, ohms: 1e6 };

/** The lowest supply a sensor works from. */
export function minVolts(type: SensorType, props: Record<string, unknown> = {}): number {
  if (type === 'temp-sensor') return SENSORS['temp-sensor'][props.kind === 'LM35' ? 'LM35' : 'TMP36'].minVolts;
  return SENSORS[type].minVolts;
}

/** What drives a sensor's OUT, from what it sees and its supply (VCC above GND). */
export function sensorDrive(type: SensorType, props: Record<string, unknown>, input: SensorInput, supply: number): Drive {
  if (supply < minVolts(type, props)) return OFF;
  switch (type) {
    case 'pir':
      return input.motion ? { volts: SENSORS.pir.high, ohms: 100 } : { volts: 0, ohms: 100 };
    case 'line-sensor':
      // over white the comparator pulls OUT low; over the black line the pull-up takes it to VCC
      return (input.position ?? 0) >= 0.5 ? { volts: supply, ohms: SENSORS['line-sensor'].pullOhms } : { volts: 0, ohms: 100 };
    case 'soil-moisture': {
      const s = SENSORS['soil-moisture'];
      const m = Math.min(1, Math.max(0, input.position ?? SENSOR_START.moisture));
      return { volts: s.dry - (s.dry - s.wet) * m, ohms: 1000 };
    }
    case 'dht':
      return OFF;   // its DATA is its pull-up and its protocol, no driven level
    case 'hc-sr04':
      return input.echo ? { volts: supply, ohms: 100 } : { volts: 0, ohms: 100 };
    case 'temp-sensor': {
      const t = SENSORS['temp-sensor'][props.kind === 'LM35' ? 'LM35' : 'TMP36'];
      const c = Math.min(t.max, Math.max(t.min, input.celsius ?? SENSOR_START.celsius));
      return { volts: Math.min(supply, t.offset + 0.01 * c), ohms: 100 };
    }
  }
}

/** The 5 bytes a DHT sends (its datasheet): DHT11 humidity %, 0, °C, 0; DHT22 humidity × 10 and °C × 10 (the top bit the
 *  sign), 16 bits each; then the checksum, the low byte of their sum. */
export function dhtBytes(kind: string, celsius: number, humidity: number): number[] {
  const k = SENSORS.dht[kind === 'DHT11' ? 'DHT11' : 'DHT22'];
  const c = Math.min(k.max, Math.max(k.min, celsius));
  const h = Math.min(k.hMax, Math.max(k.hMin, humidity));
  let b: number[];
  if (kind === 'DHT11') b = [Math.round(h), 0, Math.round(c), 0];
  else {
    const hh = Math.round(h * 10);
    const tt = Math.round(Math.abs(c) * 10);
    b = [hh >> 8, hh & 0xff, ((tt >> 8) & 0x7f) | (c < 0 ? 0x80 : 0), tt & 0xff];
  }
  return [...b, (b[0]! + b[1]! + b[2]! + b[3]!) & 0xff];
}

/** How long an HC-SR04's echo lasts for something `cm` away, µs. */
export function echoUs(cm: number): number {
  const s = SENSORS['hc-sr04'];
  return cm > s.maxCm ? s.noneUs : Math.round(Math.max(s.minCm, cm) * s.usPerCm);
}
