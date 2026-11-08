import { neopixelShape } from '../circuit/neopixel';
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
  | 'pcf8591' | 'bmp280' | 'ds18b20' | 'ds1302' | 'vl53l0x' | 'max30102'
  | 'servo' | 'motor' | 'l9110s' | 'l298n' | 'relay' | 'pump' | 'uln2003' | 'stepper'
  | 'traffic-module' | 'rgb-module' | 'buzzer-module' | 'power-supply'
  | 'ssd1306' | 'lcd1602' | 'seven-segment' | 'tm1637' | 'max7219' | 'rc522' | 'neopixel';

export interface PartKind {
  type: PartType;
  /** Its group in the parts panel (screen 02, design/build.py PARTS). */
  group: 'Basics' | 'Sensors' | 'Modules' | 'Chips' | 'Actuators' | 'Output modules' | 'Displays';
  name: string;
  detail: string;
  prefix: string;
  /** Leg name → offset from the first leg. */
  legs: Record<string, [number, number]>;
  props: Record<string, number | string | boolean>;
  /** Rows the first leg tries, in order, when the part is put in a free spot. */
  rows: readonly string[];
  /** Points on the part that wires go to (M7, screens 25, 25b): screws, a motor's tabs, a socket — offsets from its
   *  first leg (turned with it), or, for a part that lies beside the breadboard, from where it lies. */
  terminals?: Record<string, [number, number]>;
  /** It lies beside the breadboard, on no hole (M7: a motor, a pump, an L298N, a stepper): its place is
   *  view.parts[id]; `box` is its body [x0, y0, x1, y1] from there. Its `legs` are none. */
  free?: { box: [number, number, number, number] };
  /** Its terminals and body follow its props (M7 slice 3: a NeoPixel's shape and LED count); `terminals` and
   *  `free.box` are then its first props'. */
  sized?: (props: Record<string, unknown>) => { terminals: Record<string, [number, number]>; box: [number, number, number, number] };
  /** Not in the parts panel: it comes with another part (a stepper with its ULN2003). */
  hidden?: boolean;
  /** Added with this part, its legs in this part's terminals (the ULN2003's stepper, by its cable in the socket); it
   *  lies right of the board and breadboards, as any part beside them with no place yet. */
  brings?: { type: PartType; legs: Record<string, string> };
}

function fromArt(type: keyof typeof PART_ART): Record<string, [number, number]> {
  const legs = Object.entries(PART_ART[type].legs);
  const [, [x0, y0]] = legs[0]!;
  return Object.fromEntries(legs.map(([k, [x, y]]) => [k, [x - x0, y - y0]]));
}

const ROWS = [...'abcdefghij'];
const MODULE_ROWS = [...'fghijabcde'];

/** A NeoPixel's pads and body (screen 27): a stick lies from its body's top-left — DIN 5V GND out of its left end,
 *  DOUT 5V GND out of its right, an LED every 22; a ring from its middle, LED 0 at the top — DIN GND 5V DOUT on a
 *  header below it. */
export const NEOPIXEL_DRAWN = { pitch: 22, margin: 20, height: 44, pads: [10, 22, 34], ringRadius: { 8: 30, 12: 42, 16: 54, 24: 78 } as Record<number, number>, band: 12 } as const;
function neopixelGeometry(props: Record<string, unknown>): { terminals: Record<string, [number, number]>; box: [number, number, number, number] } {
  const { shape, leds } = neopixelShape(props);
  const d = NEOPIXEL_DRAWN;
  if (shape === 'ring') {
    const ro = (d.ringRadius[leds] ?? leds * 3.3) + d.band;
    const terminals = Object.fromEntries(['din', 'gnd', 'vcc', 'dout'].map((t, i) => [t, [-18 + 12 * i, ro + 22]])) as Record<string, [number, number]>;
    return { terminals, box: [-ro, -ro, ro, ro + 26] };
  }
  const w = leds * d.pitch + 2 * d.margin;
  const terminals = Object.fromEntries([
    ...['din', 'vcc', 'gnd'].map((t, i) => [t, [-8, d.pads[i]!]]), ...['dout', 'vcc2', 'gnd2'].map((t, i) => [t, [w + 8, d.pads[i]!]]),
  ]) as Record<string, [number, number]>;
  return { terminals, box: [-12, 0, w + 12, d.height] };
}

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
  // M7 slice 1 (screens 25, 25b): actuators — the servo by its plug (S + −), its body above; the drivers stand in
  // the breadboard, their screws on the far edge; a motor, a pump, an L298N lie beside it
  { type: 'servo', group: 'Actuators', name: 'Servo SG90', detail: '0–180°', prefix: 'servo', legs: { signal: [0, 0], vcc: [16, 0], gnd: [32, 0] }, props: {}, rows: ROWS },
  { type: 'motor', group: 'Actuators', name: 'TT motor', detail: '3–6 V gear motor', prefix: 'motor', legs: {}, props: {}, rows: [],
    terminals: { '+': [78, -8], '-': [78, 8] }, free: { box: [-36, -30, 82, 38] } },
  { type: 'l9110s', group: 'Actuators', name: 'L9110S driver', detail: 'two motors', prefix: 'drv', props: {}, rows: MODULE_ROWS,
    legs: header(['b-ia', 'b-ib', 'gnd', 'vcc', 'a-ia', 'a-ib']), terminals: { b1: [14, -78], b2: [25, -78], a1: [55, -78], a2: [66, -78] } },
  { type: 'l298n', group: 'Actuators', name: 'L298N driver', detail: 'two motors · 5–12 V', prefix: 'l298n', legs: {}, props: {}, rows: [],
    terminals: Object.fromEntries([
      ...(['out1', 'out2'] as const).map((t, i) => [t, [12 + 15 * i, 20]]), ...(['out3', 'out4'] as const).map((t, i) => [t, [123 + 15 * i, 20]]),
      ...(['12v', 'gnd', '5v'] as const).map((t, i) => [t, [16 + 13 * i, 124]]),
      ...(['ena', 'in1', 'in2', 'in3', 'in4', 'enb'] as const).map((t, i) => [t, [74 + 11 * i, 124]]),
    ]) as Record<string, [number, number]>, free: { box: [0, 0, 150, 140] } },
  { type: 'relay', group: 'Actuators', name: 'Relay module', detail: '5 V · NO / NC', prefix: 'relay', props: {}, rows: MODULE_ROWS,
    legs: header(['s', 'vcc', 'gnd']), terminals: { no: [3, -97], com: [16, -97], nc: [29, -97] } },
  { type: 'pump', group: 'Actuators', name: 'Water pump', detail: '3–6 V', prefix: 'pump', legs: {}, props: {}, rows: [],
    terminals: { '+': [-8, -46], '-': [8, -46] }, free: { box: [-40, -52, 64, 68] } },
  { type: 'uln2003', group: 'Actuators', name: 'Stepper 28BYJ-48', detail: 'with ULN2003', prefix: 'uln', props: {}, rows: MODULE_ROWS,
    legs: header(['in1', 'in2', 'in3', 'in4', '-', '+']), terminals: Object.fromEntries(['a', 'b', 'c', 'd', 'm'].map((t, i) => [t, [28 + 7 * i, -100]])),
    brings: { type: 'stepper', legs: { blue: 'a', pink: 'b', yellow: 'c', orange: 'd', red: 'm' } } },
  { type: 'stepper', group: 'Actuators', name: '28BYJ-48 stepper', detail: '5 V', prefix: 'step', legs: {}, props: {}, rows: [], hidden: true,
    terminals: Object.fromEntries(['blue', 'pink', 'yellow', 'orange', 'red'].map((t, i) => [t, [-14 + 7 * i, 96]])), free: { box: [-64, -46, 64, 48] } },
  // the kit's output modules (screens 25, 25b), standing in row f; the power supply on a breadboard's rails, its
  // two pins in each (both pairs)
  { type: 'traffic-module', group: 'Output modules', name: 'Traffic light module', detail: 'R Y G', prefix: 'tl', props: {}, rows: MODULE_ROWS, legs: header(['r', 'y', 'g', 'gnd']) },
  { type: 'rgb-module', group: 'Output modules', name: 'RGB LED module', detail: 'R G B', prefix: 'rgbm', props: {}, rows: MODULE_ROWS, legs: header(['r', 'g', 'b', 'gnd']) },
  { type: 'buzzer-module', group: 'Output modules', name: 'Passive buzzer module', detail: 'plays notes', prefix: 'bzm', props: {}, rows: MODULE_ROWS, legs: header(['io', 'vcc', 'gnd']) },
  { type: 'power-supply', group: 'Output modules', name: 'Breadboard power supply', detail: '5 V · 3.3 V', prefix: 'psu', props: { top: 5, bottom: 3.3 }, rows: ['T-'],
    legs: { 't-1': [0, 0], 't-2': [16, 0], 't+1': [0, 16], 't+2': [16, 16], 'b+1': [0, 246], 'b+2': [16, 246], 'b-1': [0, 262], 'b-2': [16, 262] } },
  // M7 (the teacher's request): the RC522 RFID reader stands in row f by its eight pins, its board and antenna above
  { type: 'rc522', group: 'Modules', name: 'RFID reader RC522', detail: 'SPI · a card and a key fob', prefix: 'rfid', props: {}, rows: MODULE_ROWS,
    legs: header(['sda', 'sck', 'mosi', 'miso', 'irq', 'gnd', 'rst', 'vcc']) },
  // M7 slice 2 (screens 26, 26b): the OLED stands in row f by its four pins; a 7-segment digit straddles the gap, its
  // pins in rows h and d; the LCD's backpack, the TM1637's and the matrix's headers stick out of their sides, so
  // they lie beside the breadboard, their pins points to wire
  { type: 'ssd1306', group: 'Displays', name: 'OLED SSD1306', detail: '128×64 · I²C', prefix: 'oled', props: { address: 0x3c }, rows: MODULE_ROWS, legs: header(['gnd', 'vcc', 'scl', 'sda']) },
  { type: 'lcd1602', group: 'Displays', name: 'LCD 16×2', detail: 'I²C backpack', prefix: 'lcd', legs: {}, props: { address: 0x27 }, rows: [],
    terminals: Object.fromEntries(['gnd', 'vcc', 'sda', 'scl'].map((t, i) => [t, [-30, 34 + 14 * i]])), free: { box: [-38, 0, 300, 108] } },
  { type: 'seven-segment', group: 'Displays', name: '7-segment digit', detail: 'common cathode', prefix: 'digit', props: { common: 'cathode' }, rows: ['h', 'i'],
    legs: { e: [0, 0], d: [16, 0], com2: [32, 0], c: [48, 0], dp: [64, 0], b: [64, -96], a: [48, -96], com1: [32, -96], f: [16, -96], g: [0, -96] } },
  { type: 'tm1637', group: 'Displays', name: '4-digit display', detail: 'TM1637 · with colon', prefix: 'tm', legs: {}, props: {}, rows: [],
    terminals: Object.fromEntries(['clk', 'dio', 'vcc', 'gnd'].map((t, i) => [t, [148, 12 + 12 * i]])), free: { box: [0, 0, 152, 60] } },
  { type: 'max7219', group: 'Displays', name: '8×8 dot matrix', detail: 'MAX7219', prefix: 'matrix', legs: {}, props: {}, rows: [],
    terminals: Object.fromEntries([
      ...['vcc', 'gnd', 'din', 'cs', 'clk'].map((t, i) => [t, [-8, 40 + 12 * i]]), ...['vcc2', 'gnd2', 'dout', 'cs2', 'clk2'].map((t, i) => [t, [132, 40 + 12 * i]]),
    ]) as Record<string, [number, number]>, free: { box: [-12, 0, 136, 128] } },
  // M7 slice 3 (screens 27, 27b): a NeoPixel stick or ring lies beside the breadboard, its pads points to wire
  { type: 'neopixel', group: 'Displays', name: 'NeoPixel strip / ring', detail: 'WS2812B', prefix: 'neo', legs: {}, props: { shape: 'stick', leds: 8 }, rows: [],
    terminals: neopixelGeometry({}).terminals, free: { box: neopixelGeometry({}).box }, sized: neopixelGeometry },
];

/** A part's terminals (M7), for its props (a NeoPixel's follow its shape and LED count). */
export function kindTerminals(type: string, props?: Record<string, unknown>): Record<string, [number, number]> {
  const k = partKind(type);
  return k.sized ? k.sized({ ...k.props, ...props }).terminals : k.terminals ?? {};
}

/** A free part's body [x0, y0, x1, y1] from where it lies, not turned, for its props. */
export function kindBox(type: string, props?: Record<string, unknown>): [number, number, number, number] {
  const k = partKind(type);
  return k.sized ? k.sized({ ...k.props, ...props }).box : k.free!.box;
}

/** A module's header: its pins in a row, one hole apart. */
function header(legs: string[]): Record<string, [number, number]> {
  return Object.fromEntries(legs.map((l, i) => [l, [16 * i, 0] as [number, number]]));
}

/** A free part (M7) lies beside the breadboard; the rest stand in its holes. */
export const isFree = (type: string): boolean => PART_KINDS.some((k) => k.type === type && k.free);

/** The middle of a free part's body, from where it lies: it turns about it (M7 slice 2: the teacher's request). */
function freeMiddle(type: string, props?: Record<string, unknown>): [number, number] {
  const b = kindBox(type, props);
  return [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
}

/** A free part's body [x0, y0, x1, y1] from where it lies, after `turns` quarter turns clockwise about its middle. */
export function freeBox(type: string, turns = 0, props?: Record<string, unknown>): [number, number, number, number] {
  const b = kindBox(type, props);
  if (turns % 2 === 0) return b;
  const [cx, cy] = freeMiddle(type, props);
  const [hw, hh] = [(b[2] - b[0]) / 2, (b[3] - b[1]) / 2];
  return [cx - hh, cy - hw, cx + hh, cy + hw];
}

/** A point of a free part (an offset from where it lies: a terminal) after `turns` quarter turns clockwise about its
 *  body's middle (screen y is down: (x, y) → (−y, x)); `back` turns it the other way. */
export function freeTurn(type: string, [x, y]: [number, number], turns = 0, back = false, props?: Record<string, unknown>): [number, number] {
  const [cx, cy] = freeMiddle(type, props);
  let [dx, dy] = [x - cx, y - cy];
  for (let i = 0; i < ((turns % 4) + 4) % 4; i++) [dx, dy] = back ? [dy, -dx || 0] : [-dy || 0, dx];
  return [cx + dx, cy + dy];
}

export function partKind(type: string): PartKind {
  const k = PART_KINDS.find((p) => p.type === type);
  if (!k) throw new Error(`there is no part "${type}"`);
  return k;
}

/** Where the legs' middle is from the first leg: the point a part is held by while it is dragged. */
export function legsCentre(type: string, turns = 0, props?: Record<string, unknown>): [number, number] {
  if (partKind(type).free) return freeMiddle(type, props);   // a free part: its body's middle
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
  if (keys.length < 2) return 0;   // a free part (M7) is not turned
  const base = partKind(type).legs[keys[1]!]!;
  const a = legs[keys[0]!];
  const b = legs[keys[1]!];
  if (!a || !b) return 0;
  const deg = (Math.atan2(b.y - a.y, b.x - a.x) - Math.atan2(base[1], base[0])) * 180 / Math.PI;
  return ((Math.round(deg / 90) % 4) + 4) % 4;
}
