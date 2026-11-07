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
export interface SensorInput { motion?: boolean; position?: number; celsius?: number }

export const SENSORS = {
  /** HC-SR501: 4.5–20 V, ≈ 50 µA idle; OUT 3.3 V (its own regulator) while it sees motion and for `holdS` after. */
  pir: { minVolts: 4.5, loadOhms: 100_000, high: 3.3, holdS: 3 },
  /** TCRT5000 module (LM393 comparator, open collector, 10 kΩ pull-up to VCC): 3.3–5 V; its IR LED draws ≈ 15 mA. */
  'line-sensor': { minVolts: 3.0, loadOhms: 220, pullOhms: 10_000 },
  /** Capacitive soil moisture sensor v1.2 (TLC555, 3.3 V regulator): ≈ 2.4 V in dry soil, ≈ 0.9 V in water, ≈ 5 mA. */
  'soil-moisture': { minVolts: 3.0, loadOhms: 680, dry: 2.4, wet: 0.9 },
  /** TMP36: 2.7–5.5 V, 0.5 V + 10 mV/°C (−40…125 °C). LM35: 4–30 V, 10 mV/°C (0…150 °C as wired simply). ≈ 50 µA. */
  'temp-sensor': { TMP36: { minVolts: 2.7, offset: 0.5, min: -40, max: 125 }, LM35: { minVolts: 4.0, offset: 0, min: 0, max: 150 }, loadOhms: 100_000 },
} as const;

export type SensorType = keyof typeof SENSORS;

export const isSensor = (type: string): type is SensorType => type in SENSORS;

/** Room temperature, when nothing has set it; a soil sensor in damp soil. */
export const SENSOR_START = { celsius: 22, moisture: 0.5 } as const;

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
    case 'temp-sensor': {
      const t = SENSORS['temp-sensor'][props.kind === 'LM35' ? 'LM35' : 'TMP36'];
      const c = Math.min(t.max, Math.max(t.min, input.celsius ?? SENSOR_START.celsius));
      return { volts: Math.min(supply, t.offset + 0.01 * c), ohms: 100 };
    }
  }
}
