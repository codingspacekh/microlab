import { PART_ART } from './library';

/**
 * The parts in the parts panel (M4.3; the inputs pack M6.1; the rest in M6, M7): their names, their legs as offsets
 * from the first leg (in drawing units, so a footprint lands on holes), the id prefix and first props. Resistors,
 * LEDs, RGB LEDs, light sensors and battery packs have no fixed picture — they are drawn from their holes — so their
 * footprints are set here; the push button's, the potentiometer's and the slide switch's come from their art.json.
 */
export type PartType = 'resistor' | 'led' | 'rgb-led' | 'button' | 'slide-switch' | 'potentiometer' | 'ldr' | 'buzzer' | 'battery'
  | 'hc-sr04' | 'dht' | 'mpu6050' | 'pir' | 'line-sensor' | 'soil-moisture' | 'temp-sensor'
  | 'button-module' | 'touch' | 'vibration' | 'ir-obstacle' | 'hall' | 'flame' | 'raindrop' | 'water-level' | 'mq2'
  | 'ldr-module' | 'pot-module' | 'joystick' | 'rotary-encoder' | 'speed-sensor'
  | 'pcf8591' | 'bmp280' | 'ds18b20' | 'ds1302' | 'vl53l0x' | 'max30102';

export interface PartKind {
  type: PartType;
  /** Its group in the parts panel (screen 02, design/build.py PARTS). */
  group: 'Basics' | 'Sensors' | 'Modules' | 'Chips';
  name: string;
  detail: string;
  prefix: string;
  /** Leg name → offset from the first leg. */
  legs: Record<string, [number, number]>;
  props: Record<string, number | string | boolean>;
  /** Rows the first leg tries, in order, when the part is put in a free spot. */
  rows: readonly string[];
}

function fromArt(type: keyof typeof PART_ART): Record<string, [number, number]> {
  const legs = Object.entries(PART_ART[type].legs);
  const [, [x0, y0]] = legs[0]!;
  return Object.fromEntries(legs.map(([k, [x, y]]) => [k, [x - x0, y - y0]]));
}

const ROWS = [...'abcdefghij'];
const MODULE_ROWS = [...'fghijabcde'];

export const PART_KINDS: PartKind[] = [
  { type: 'resistor', name: 'Resistor', detail: '220 Ω', group: 'Basics', prefix: 'r', legs: { a: [0, 0], b: [48, 0] }, props: { ohms: 220 }, rows: ROWS },
  { type: 'led', name: 'LED', detail: 'red, 5 mm', group: 'Basics', prefix: 'led', legs: { a: [0, 0], k: [32, 0] }, props: { color: 'red' }, rows: ROWS },
  // red, the common (the longest leg), green, blue — side by side, as on a real 5 mm RGB LED
  { type: 'rgb-led', name: 'RGB LED', detail: 'common cathode', group: 'Basics', prefix: 'rgb', legs: { r: [0, 0], common: [16, 0], g: [32, 0], b: [48, 0] }, props: { common: 'cathode' }, rows: ROWS },
  // across the channel, so its two sides are not joined by the breadboard
  { type: 'button', name: 'Push button', detail: '12 mm', group: 'Basics', prefix: 'btn', legs: fromArt('button'), props: {}, rows: ['e'] },
  { type: 'slide-switch', name: 'Slide switch', detail: 'SS12D00', group: 'Basics', prefix: 'sw', legs: fromArt('slide-switch'), props: {}, rows: ROWS },
  { type: 'potentiometer', name: 'Potentiometer', detail: '10 kΩ knob', group: 'Basics', prefix: 'pot', legs: fromArt('potentiometer'), props: { ohms: 10_000 }, rows: ROWS },
  { type: 'ldr', name: 'Light sensor (LDR)', detail: 'GL5528', group: 'Basics', prefix: 'ldr', legs: { a: [0, 0], b: [32, 0] }, props: {}, rows: ROWS },
  // a 12 mm piezo buzzer: its legs 7.6 mm apart, three holes (M6.2)
  { type: 'buzzer', name: 'Buzzer', detail: 'active · passive', group: 'Basics', prefix: 'bz', legs: { '+': [0, 0], '-': [48, 0] }, props: { kind: 'active' }, rows: ROWS },
  // its red lead in a + rail, its black lead in the − rail below it (screen 17b): the pack hangs below the breadboard
  { type: 'battery', name: 'Battery pack', detail: '2×AA · 4×AA · 9 V', group: 'Basics', prefix: 'bat', legs: { '+': [0, 0], '-': [0, 16] }, props: { kind: '2xAA' }, rows: ['B+'] },
  // modules (M6.4, screen 19): the HC-SR04 drawn as screen 07, its board below its pins — clicked in, it hangs off
  // the breadboard's bottom edge (R turns it to face the other way); the DHT and the GY-521 stand in row f
  { type: 'hc-sr04', group: 'Sensors', name: 'Ultrasonic HC-SR04', detail: 'distance · 5 V', prefix: 'sonar', legs: { vcc: [0, 0], trig: [16, 0], echo: [32, 0], gnd: [48, 0] }, props: {}, rows: [...'jihgfedcba'] },
  { type: 'dht', group: 'Sensors', name: 'DHT11 / DHT22', detail: 'temperature, humidity', prefix: 'dht', legs: { vcc: [0, 0], out: [16, 0], gnd: [32, 0] }, props: { kind: 'DHT11' }, rows: MODULE_ROWS },
  { type: 'mpu6050', group: 'Sensors', name: 'MPU6050 motion', detail: 'accelerometer · I²C', prefix: 'mpu',
    legs: Object.fromEntries(['vcc', 'gnd', 'scl', 'sda', 'xda', 'xcl', 'ad0', 'int'].map((l, i) => [l, [16 * i, 0] as [number, number]])), props: {}, rows: MODULE_ROWS },
  // sensor modules (M6.3, screen 18): three pins in a row, as printed; in row f, their boards over the top half
  { type: 'pir', group: 'Sensors', name: 'PIR motion', detail: 'HC-SR501 · 5 V', prefix: 'pir', legs: { vcc: [0, 0], out: [16, 0], gnd: [32, 0] }, props: {}, rows: MODULE_ROWS },
  { type: 'line-sensor', group: 'Sensors', name: 'Line sensor (IR)', detail: 'TCRT5000', prefix: 'line', legs: { out: [0, 0], gnd: [16, 0], vcc: [32, 0] }, props: {}, rows: MODULE_ROWS },
  { type: 'soil-moisture', group: 'Sensors', name: 'Soil moisture', detail: 'capacitive', prefix: 'soil', legs: { out: [0, 0], vcc: [16, 0], gnd: [32, 0] }, props: {}, rows: MODULE_ROWS },
  { type: 'temp-sensor', group: 'Sensors', name: 'Temperature', detail: 'TMP36 · LM35', prefix: 'tmp', legs: { vcc: [0, 0], out: [16, 0], gnd: [32, 0] }, props: { kind: 'TMP36' }, rows: MODULE_ROWS },
  // the SunFounder kit's inputs on common modules (M6.5a, screens 20, 20b): pins as commonly printed, in row f
  ...([
    ['button-module', 'Button module', '', 'kbtn', ['out', 'vcc', 'gnd']],
    ['touch', 'Touch (TTP223)', '', 'touch', ['out', 'vcc', 'gnd']],
    ['vibration', 'Vibration (SW-420)', '', 'vib', ['vcc', 'gnd', 'out']],
    ['ir-obstacle', 'IR obstacle', '', 'ir', ['out', 'gnd', 'vcc']],
    ['hall', 'Hall', 'magnet', 'hall', ['out', 'vcc', 'gnd']],
    ['flame', 'Flame', 'AO · DO', 'flame', ['ao', 'gnd', 'vcc', 'out']],
    ['raindrop', 'Raindrop', 'AO · DO', 'rain', ['ao', 'out', 'gnd', 'vcc']],
    ['water-level', 'Water level', '', 'water', ['out', 'vcc', 'gnd']],
    ['mq2', 'Gas / smoke (MQ-2)', '5 V', 'gas', ['ao', 'out', 'gnd', 'vcc']],
    ['ldr-module', 'Photoresistor module', '', 'photo', ['out', 'vcc', 'gnd']],
    ['pot-module', 'Potentiometer module', '', 'knob', ['out', 'vcc', 'gnd']],
    ['joystick', 'Joystick', 'X · Y · button', 'joy', ['gnd', 'vcc', 'vrx', 'vry', 'sw']],
    ['rotary-encoder', 'Rotary encoder', 'KY-040', 'enc', ['clk', 'dt', 'sw', 'vcc', 'gnd']],
    ['speed-sensor', 'IR speed sensor', '20-slot wheel', 'speed', ['vcc', 'gnd', 'out']],
  ] as const).map(([type, name, detail, prefix, legs]): PartKind => ({
    type, group: 'Modules', name, detail, prefix, props: {}, rows: MODULE_ROWS,
    legs: Object.fromEntries(legs.map((l, i) => [l, [16 * i, 0] as [number, number]])),
  })),
  // the kit's chips on their modules (M6.5b, screen 21)
  ...([
    ['pcf8591', 'PCF8591', 'ADC · DAC · I²C', 'adc', ['aout', 'ain3', 'ain2', 'ain1', 'ain0', 'scl', 'sda', 'gnd', 'vcc']],
    ['bmp280', 'BMP280', 'pressure · I²C', 'baro', ['vcc', 'gnd', 'scl', 'sda', 'csb', 'sdo']],
    ['ds18b20', 'DS18B20', 'temperature · 1-Wire', 'temp', ['out', 'vcc', 'gnd']],
    ['ds1302', 'DS1302 clock', 'real-time clock', 'rtc', ['vcc', 'gnd', 'clk', 'dat', 'rst']],
    ['vl53l0x', 'VL53L0X', 'laser distance · I²C', 'tof', ['vcc', 'gnd', 'scl', 'sda', 'gpio1', 'xshut']],
    ['max30102', 'MAX30102', 'pulse · SpO2 · I²C', 'pulse', ['vcc', 'scl', 'sda', 'int', 'gnd']],
  ] as const).map(([type, name, detail, prefix, legs]): PartKind => ({
    type, group: 'Chips', name, detail, prefix, props: {}, rows: MODULE_ROWS,
    legs: Object.fromEntries(legs.map((l, i) => [l, [16 * i, 0] as [number, number]])),
  })),
];

export function partKind(type: string): PartKind {
  const k = PART_KINDS.find((p) => p.type === type);
  if (!k) throw new Error(`there is no part "${type}"`);
  return k;
}

/** Where the legs' middle is from the first leg: the point a part is held by while it is dragged. */
export function legsCentre(type: string, turns = 0): [number, number] {
  const offs = Object.values(footprint(type, turns));
  return [offs.reduce((s, [x]) => s + x, 0) / offs.length, offs.reduce((s, [, y]) => s + y, 0) / offs.length];
}

/** The legs' offsets from the first leg after `turns` quarter turns clockwise (screen y is down: (x, y) → (−y, x)),
 *  for a part turned while it is placed (M5.1). */
export function footprint(type: string, turns = 0): Record<string, [number, number]> {
  const t = ((turns % 4) + 4) % 4;
  const turn = ([x, y]: [number, number]): [number, number] => [-y || 0, x];
  return Object.fromEntries(Object.entries(partKind(type).legs).map(([k, o]) => {
    let p = o;
    for (let i = 0; i < t; i++) p = turn(p);
    return [k, p];
  }));
}

/** How many quarter turns clockwise a placed part is from its footprint, from its first two legs (0–3). */
export function turnsOf(type: string, legs: Record<string, { x: number; y: number }>): number {
  const keys = Object.keys(partKind(type).legs);
  const base = partKind(type).legs[keys[1]!]!;
  const a = legs[keys[0]!];
  const b = legs[keys[1]!];
  if (!a || !b) return 0;
  const deg = (Math.atan2(b.y - a.y, b.x - a.x) - Math.atan2(base[1], base[0])) * 180 / Math.PI;
  return ((Math.round(deg / 90) % 4) + 4) % 4;
}
