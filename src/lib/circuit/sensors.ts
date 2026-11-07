/**
 * Sensor modules that drive their own output (M6.3), from their datasheets. Each has VCC, OUT and GND legs; it draws
 * a small current (`loadOhms` across its supply) and drives OUT through `ohms` — what its output stage is. Below
 * `minVolts` (VCC above GND) it gives nothing (OUT weakly to GND) and a warning says so (faults: sensor-underpowered).
 * The sim works out each one's input (motion, the surface under it, moisture, temperature) and supply, and hands the
 * solver the result as a `drive` (devices.ts). A DHT and an MPU6050 answer a protocol instead (M6.4).
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
  /** MPU6050 on a GY-521 (M6.4b): 3–5 V, ≈ 4 mA; it answers on I²C (i2c.ts). */
  mpu6050: { minVolts: 3.0, loadOhms: 1000 },
  /** PCF8591 ADC / DAC and BMP280 (M6.5b): they answer on I²C (i2c.ts). */
  pcf8591: { minVolts: 2.5, loadOhms: 3300 },
  /** DS18B20 on a module (M6.5b): 3–5.5 V, S VCC GND, its 4.7 kΩ pull-up on the board; it answers on 1-Wire. */
  ds18b20: { minVolts: 3.0, loadOhms: 3300 },
  /** DS1302 RTC module (M6.5b): 2–5.5 V; it answers pin by pin (ds1302.ts). */
  ds1302: { minVolts: 2.0, loadOhms: 10_000 },
  bmp280: { minVolts: 1.8, loadOhms: 10_000 },
  /** VL53L0X and MAX30102 on their modules (M6.5b): they answer on I²C (i2c.ts). */
  vl53l0x: { minVolts: 2.6, loadOhms: 330 },
  max30102: { minVolts: 3.0, loadOhms: 600 },
  /** TMP36: 2.7–5.5 V, 0.5 V + 10 mV/°C (−40…125 °C). LM35: 4–30 V, 10 mV/°C (0…150 °C as wired simply). ≈ 50 µA. */
  'temp-sensor': { TMP36: { minVolts: 2.7, offset: 0.5, min: -40, max: 125 }, LM35: { minVolts: 4.0, offset: 0, min: 0, max: 150 }, loadOhms: 100_000 },
} as const;

export type SensorType = keyof typeof SENSORS;

export const isSensor = (type: string): type is SensorType => type in SENSORS || type in MODULES;

/** Room temperature, when nothing has set it; a soil sensor in damp soil; half-humid air; something 1 m away. */
export const SENSOR_START = { celsius: 22, moisture: 0.5, humidity: 50, cm: 100 } as const;

const OFF: Drive = { volts: 0, ohms: 1e6 };

/** The lowest supply a sensor works from. */
export function minVolts(type: SensorType, props: Record<string, unknown> = {}): number {
  if (type in MODULES) return MODULES[type]!.minVolts;
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
    case 'mpu6050':
    case 'pcf8591':
    case 'bmp280':
    case 'ds18b20':
    case 'ds1302':
    case 'vl53l0x':
    case 'max30102':
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

// ------------------------------------------------------------------ the SunFounder kit's modules (M6.5a, Rev 8)

/** What a module sees now: held (a touch, a shake), a position 0–1 (something in front, a magnet near, a flame,
 *  rain, water, gas), an encoder's two contacts closed (`a` CLK, `b` DT), a speed sensor's slot blocked. */
export interface ModuleInput { pressed?: boolean; position?: number; a?: boolean; b?: boolean; pulse?: boolean }

/** A comparator's open collector pulling low (LM393 modules); OFF is let go — the module's 10 kΩ pull-up takes it high. */
const LOW: Drive = { volts: 0, ohms: 50 };
const level = (i: ModuleInput) => Math.min(1, Math.max(0, i.position ?? 0));

/**
 * Common modules with an output stage (requirements Rev 8; not SunFounder's boards exactly): their supply, the
 * current they draw (`loadOhms` across it), the outputs with a 10 kΩ pull-up to VCC on the board, and what drives each
 * output from what they see. Below `minVolts` every output lets go.
 */
export const MODULES: Record<string, { minVolts: number; loadOhms: number; pullUps: string[]; outputs: Record<string, (i: ModuleInput, vcc: number) => Drive> }> = {
  /** TTP223 touch pad: 2–5.5 V, a push-pull output high while touched. */
  touch: { minVolts: 2.0, loadOhms: 2000, pullUps: [], outputs: { out: (i, v) => ({ volts: i.pressed ? v : 0, ohms: 100 }) } },
  /** SW-420 vibration switch + LM393: still, DO low; shaken, high. */
  vibration: { minVolts: 3.0, loadOhms: 1000, pullUps: ['out'], outputs: { out: (i) => (i.pressed ? OFF : LOW) } },
  /** IR obstacle avoidance (an IR LED, a receiver, LM393): something in front, OUT low. The IR LED draws ≈ 15 mA. */
  'ir-obstacle': { minVolts: 3.0, loadOhms: 220, pullUps: ['out'], outputs: { out: (i) => (level(i) >= 0.5 ? LOW : OFF) } },
  /** Hall switch module: a magnet near, S low. */
  hall: { minVolts: 3.0, loadOhms: 1000, pullUps: ['out'], outputs: { out: (i) => (level(i) >= 0.5 ? LOW : OFF) } },
  /** Flame (an IR photodiode, LM393): AO falls as the flame grows (to 15 % of VCC); DO low from half way. */
  flame: { minVolts: 3.0, loadOhms: 1000, pullUps: ['out'], outputs: { ao: (i, v) => ({ volts: v * (1 - 0.85 * level(i)), ohms: 10_000 }), out: (i) => (level(i) >= 0.5 ? LOW : OFF) } },
  /** Raindrop plate + LM393: AO falls as it gets wet (to 20 % of VCC); DO low from 40 %. */
  raindrop: { minVolts: 3.0, loadOhms: 1000, pullUps: ['out'], outputs: { ao: (i, v) => ({ volts: v * (1 - 0.8 * level(i)), ohms: 10_000 }), out: (i) => (level(i) >= 0.4 ? LOW : OFF) } },
  /** Water level (its traces as a resistor to a transistor): 0 V dry, up to 70 % of VCC under water. */
  'water-level': { minVolts: 3.0, loadOhms: 10_000, pullUps: [], outputs: { out: (i, v) => ({ volts: v * 0.7 * level(i), ohms: 1000 }) } },
  /** MQ-2 gas / smoke: a 5 V heater (≈ 150 mA, 33 Ω); AO from 8 % of VCC in clean air to 70 % in gas; DO low from 40 %. */
  mq2: { minVolts: 4.5, loadOhms: 33, pullUps: ['out'], outputs: { ao: (i, v) => ({ volts: v * (0.08 + 0.62 * level(i)), ohms: 1000 }), out: (i) => (level(i) >= 0.4 ? LOW : OFF) } },
  /** KY-040 rotary encoder: two contacts to GND (CLK, DT) with 10 kΩ pull-ups, closed in turn as it is turned. */
  'rotary-encoder': { minVolts: 0, loadOhms: 1e6, pullUps: ['clk', 'dt'], outputs: { clk: (i) => (i.a ? LOW : OFF), dt: (i) => (i.b ? LOW : OFF) } },
  /** IR speed sensor (a slotted optocoupler, LM393): the slot blocked, DO high; a wheel of 20 slots turning, pulses. */
  'speed-sensor': { minVolts: 3.0, loadOhms: 1000, pullUps: ['out'], outputs: { out: (i) => (i.pulse ? OFF : LOW) } },
};

/** An encoder's detent: CLK and DT close and open a quarter apart (CW: CLK first), 2 ms each; a speed sensor's wheel. */
export const ENCODER = { phaseUs: 2000 } as const;
export const SPEED = { slots: 20 } as const;

/** What drives each of a module's outputs, from what it sees and its supply. */
export function moduleDrives(type: string, input: ModuleInput, supply: number): Record<string, Drive> {
  const m = MODULES[type]!;
  return Object.fromEntries(Object.entries(m.outputs).map(([leg, f]) => [leg, supply < m.minVolts ? OFF : f(input, supply)]));
}
