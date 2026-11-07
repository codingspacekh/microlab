import { BATTERIES, BUZZER, RGB_DIES, SERVO_IDLE_OHMS, type Device } from './devices';
import { MPU6050 } from './i2c';
import { MODULES, SENSORS } from './sensors';

/** What a part's devices are built from: its id, the net each leg is in, its properties. */
export interface PartContext {
  id: string;
  leg: (name: string) => string;
  props: Record<string, number | string | boolean>;
}

/**
 * The electrical side of each part type (architecture §2.5): its legs, which legs are joined inside the part,
 * and the devices it becomes in the solver. Behaviours (brightness, angle …) are in src/lib/parts, later.
 */
export interface PartModel {
  legs: readonly string[];
  /** Legs joined inside the part, always (a push button's legs on one side). */
  internal?: readonly (readonly [string, string])[];
  devices: (p: PartContext) => Device[];
}

export const MODELS: Record<string, PartModel> = {
  resistor: {
    legs: ['a', 'b'],
    devices: ({ id, leg, props }) => [{ kind: 'resistor', id, a: leg('a'), b: leg('b'), ohms: Number(props.ohms ?? 220) }],
  },
  /** a: anode (long leg), k: cathode. */
  led: {
    legs: ['a', 'k'],
    devices: ({ id, leg, props }) => [{ kind: 'led', id, a: leg('a'), k: leg('k'), color: String(props.color ?? 'red') }],
  },
  /** RGB LED: legs red, the common (the longest), green, blue — three LEDs (`<id>:r`, `:g`, `:b`) sharing the common
   *  leg, their cathodes (common: 'cathode', the default) or their anodes ('anode'). */
  'rgb-led': {
    legs: ['r', 'common', 'g', 'b'],
    devices: ({ id, leg, props }) => RGB_DIES.map(([l, color, vf]): Device => (props.common === 'anode'
      ? { kind: 'led', id: `${id}:${l}`, a: leg('common'), k: leg(l), color, vf }
      : { kind: 'led', id: `${id}:${l}`, a: leg(l), k: leg('common'), color, vf })),
  },
  /** A piezo buzzer, + and − (M6.2): `kind` 'active' (its own pitch on a steady voltage) or 'passive' (the pitch of
   *  the square wave across it). Electrically a load between its legs; what it sounds like is worked out by the sim. */
  buzzer: {
    legs: ['+', '-'],
    devices: ({ id, leg, props }) => [{ kind: 'resistor', id, a: leg('+'), b: leg('-'), ohms: BUZZER[props.kind === 'passive' ? 'passive' : 'active'].ohms }],
  },
  /** Sensor modules (M6.3, sensors.ts): VCC, OUT, GND — a small load across the supply, OUT driven by the sim. */
  pir: sensorModel(SENSORS.pir.loadOhms),
  'line-sensor': sensorModel(SENSORS['line-sensor'].loadOhms),
  'soil-moisture': sensorModel(SENSORS['soil-moisture'].loadOhms),
  /** DHT11 / DHT22 module (`kind`, M6.4): VCC, DATA (leg `out`), GND; its 10 kΩ pull-up on the board. */
  dht: {
    legs: ['vcc', 'out', 'gnd'],
    devices: ({ id, leg }) => [
      { kind: 'resistor', id: `${id}:supply`, a: leg('vcc'), b: leg('gnd'), ohms: SENSORS.dht.loadOhms },
      { kind: 'resistor', id: `${id}:pull`, a: leg('vcc'), b: leg('out'), ohms: SENSORS.dht.pullOhms },
    ],
  },
  /** HC-SR04 (M6.4): VCC, Trig, Echo, GND — Echo driven by the sim after a trigger pulse. */
  'hc-sr04': {
    legs: ['vcc', 'trig', 'echo', 'gnd'],
    devices: ({ id, leg }) => [
      { kind: 'resistor', id: `${id}:supply`, a: leg('vcc'), b: leg('gnd'), ohms: SENSORS['hc-sr04'].loadOhms },
      { kind: 'drive', id: `${id}:out`, out: leg('echo'), gnd: leg('gnd'), part: id },
    ],
  },
  /** MPU6050 on a GY-521 (M6.4b), its 8 pins as printed: VCC GND SCL SDA XDA XCL AD0 INT; AD0 pulled down on the board
   *  (address 0x68; high: 0x69). Its I²C pull-ups go to its own 3.3 V regulator, so they are left out here. */
  mpu6050: {
    legs: ['vcc', 'gnd', 'scl', 'sda', 'xda', 'xcl', 'ad0', 'int'],
    devices: ({ id, leg }) => [
      { kind: 'resistor', id: `${id}:supply`, a: leg('vcc'), b: leg('gnd'), ohms: SENSORS.mpu6050.loadOhms },
      { kind: 'resistor', id: `${id}:ad0`, a: leg('ad0'), b: leg('gnd'), ohms: MPU6050.ad0PullOhms },
    ],
  },
  /** PCF8591 module (M6.5b): AOUT AIN3 AIN2 AIN1 AIN0 SCL SDA GND VCC — its inputs read the circuit, AOUT driven by its
   *  DAC (the sim). */
  pcf8591: {
    legs: ['aout', 'ain3', 'ain2', 'ain1', 'ain0', 'scl', 'sda', 'gnd', 'vcc'],
    devices: ({ id, leg }) => [
      { kind: 'resistor', id: `${id}:supply`, a: leg('vcc'), b: leg('gnd'), ohms: SENSORS.pcf8591.loadOhms },
      { kind: 'drive', id: `${id}:aout`, out: leg('aout'), gnd: leg('gnd'), part: id, key: 'aout' },
    ],
  },
  /** VL53L0X module (M6.5b): VIN GND SCL SDA GPIO1 XSHUT; XSHUT pulled up on the board (low: shut down). */
  vl53l0x: {
    legs: ['vcc', 'gnd', 'scl', 'sda', 'gpio1', 'xshut'],
    devices: ({ id, leg }) => [
      { kind: 'resistor', id: `${id}:supply`, a: leg('vcc'), b: leg('gnd'), ohms: SENSORS.vl53l0x.loadOhms },
      { kind: 'resistor', id: `${id}:xshut`, a: leg('vcc'), b: leg('xshut'), ohms: 10_000 },
    ],
  },
  /** MAX30102 module (M6.5b): VIN SCL SDA INT GND. */
  max30102: {
    legs: ['vcc', 'scl', 'sda', 'int', 'gnd'],
    devices: ({ id, leg }) => [{ kind: 'resistor', id: `${id}:supply`, a: leg('vcc'), b: leg('gnd'), ohms: SENSORS.max30102.loadOhms }],
  },
  /** DS1302 RTC module (M6.5b): VCC GND CLK DAT RST; DAT driven by the chip while it sends (the sim). */
  ds1302: {
    legs: ['vcc', 'gnd', 'clk', 'dat', 'rst'],
    devices: ({ id, leg }) => [
      { kind: 'resistor', id: `${id}:supply`, a: leg('vcc'), b: leg('gnd'), ohms: SENSORS.ds1302.loadOhms },
      { kind: 'drive', id: `${id}:dat`, out: leg('dat'), gnd: leg('gnd'), part: id, key: 'dat' },
    ],
  },
  /** DS18B20 module (M6.5b): S VCC GND, its 4.7 kΩ pull-up from S to VCC on the board. */
  ds18b20: {
    legs: ['out', 'vcc', 'gnd'],
    devices: ({ id, leg }) => [
      { kind: 'resistor', id: `${id}:supply`, a: leg('vcc'), b: leg('gnd'), ohms: SENSORS.ds18b20.loadOhms },
      { kind: 'resistor', id: `${id}:pull`, a: leg('vcc'), b: leg('out'), ohms: 4700 },
    ],
  },
  /** GY-BMP280 (M6.5b): VCC GND SCL SDA CSB SDO; SDO pulled down on the board (0x76), CSB up (I²C). */
  bmp280: {
    legs: ['vcc', 'gnd', 'scl', 'sda', 'csb', 'sdo'],
    devices: ({ id, leg }) => [
      { kind: 'resistor', id: `${id}:supply`, a: leg('vcc'), b: leg('gnd'), ohms: SENSORS.bmp280.loadOhms },
      { kind: 'resistor', id: `${id}:sdo`, a: leg('sdo'), b: leg('gnd'), ohms: 10_000 },
      { kind: 'resistor', id: `${id}:csb`, a: leg('vcc'), b: leg('csb'), ohms: 10_000 },
    ],
  },
  /** TMP36 or LM35 (`kind`), flat face towards you: +Vs, Vout, GND. */
  'temp-sensor': sensorModel(SENSORS['temp-sensor'].loadOhms),
  // ---- the SunFounder kit's modules (M6.5a, requirements Rev 8), on common modules: pins as commonly printed
  /** Button module: S VCC GND; a 10 kΩ pull-up on the board, the button to GND (pressed: S low). */
  'button-module': {
    legs: ['out', 'vcc', 'gnd'],
    devices: ({ id, leg }) => [
      { kind: 'resistor', id: `${id}:pull`, a: leg('vcc'), b: leg('out'), ohms: 10_000 },
      { kind: 'switch', id, a: leg('out'), b: leg('gnd'), part: id, closedWhen: 'pressed' },
    ],
  },
  /** Photoresistor module: S VCC GND; the LDR from VCC to S, 10 kΩ from S to GND (more light, more volts). */
  'ldr-module': {
    legs: ['out', 'vcc', 'gnd'],
    devices: ({ id, leg }) => [
      { kind: 'ldr', id, a: leg('vcc'), b: leg('out'), part: id },
      { kind: 'resistor', id: `${id}:r`, a: leg('out'), b: leg('gnd'), ohms: 10_000 },
    ],
  },
  /** Potentiometer module: S (the wiper) VCC GND, 10 kΩ. */
  'pot-module': {
    legs: ['out', 'vcc', 'gnd'],
    devices: ({ id, leg }) => [{ kind: 'pot', id, e1: leg('gnd'), w: leg('out'), e2: leg('vcc'), ohms: 10_000, part: id }],
  },
  /** Joystick: GND VCC VRx VRy SW — two 10 kΩ pots, the button to GND (no pull-up on the board). */
  joystick: {
    legs: ['gnd', 'vcc', 'vrx', 'vry', 'sw'],
    devices: ({ id, leg }) => [
      { kind: 'pot', id: `${id}:x`, e1: leg('gnd'), w: leg('vrx'), e2: leg('vcc'), ohms: 10_000, part: id, axis: 'x' },
      { kind: 'pot', id: `${id}:y`, e1: leg('gnd'), w: leg('vry'), e2: leg('vcc'), ohms: 10_000, part: id, axis: 'y' },
      { kind: 'switch', id, a: leg('sw'), b: leg('gnd'), part: id, closedWhen: 'pressed' },
    ],
  },
  touch: moduleModel('touch', ['out', 'vcc', 'gnd']),
  vibration: moduleModel('vibration', ['vcc', 'gnd', 'out']),
  'ir-obstacle': moduleModel('ir-obstacle', ['out', 'gnd', 'vcc']),
  hall: moduleModel('hall', ['out', 'vcc', 'gnd']),
  flame: moduleModel('flame', ['ao', 'gnd', 'vcc', 'out']),
  raindrop: moduleModel('raindrop', ['ao', 'out', 'gnd', 'vcc']),
  'water-level': moduleModel('water-level', ['out', 'vcc', 'gnd']),
  mq2: moduleModel('mq2', ['ao', 'out', 'gnd', 'vcc']),
  /** KY-040: CLK DT SW VCC GND; its button to GND has no pull-up on the board. */
  'rotary-encoder': moduleModel('rotary-encoder', ['clk', 'dt', 'sw', 'vcc', 'gnd'], (id, leg) => [{ kind: 'switch', id, a: leg('sw'), b: leg('gnd'), part: id, closedWhen: 'pressed' }]),
  'speed-sensor': moduleModel('speed-sensor', ['vcc', 'gnd', 'out']),
  /** Across the channel: 1a–1b and 2a–2b are joined inside; pressing joins 1 and 2. */
  button: {
    legs: ['1a', '1b', '2a', '2b'],
    internal: [['1a', '1b'], ['2a', '2b']],
    devices: ({ id, leg }) => [{ kind: 'switch', id, a: leg('1a'), b: leg('2a'), part: id, closedWhen: 'pressed' }],
  },
  /** Slide switch: the common leg 2 goes to 1 (position 0) or to 3 (position 1). */
  'slide-switch': {
    legs: ['1', '2', '3'],
    devices: ({ id, leg }) => [
      { kind: 'switch', id: `${id}:1`, a: leg('2'), b: leg('1'), part: id, closedWhen: 0 },
      { kind: 'switch', id: `${id}:3`, a: leg('2'), b: leg('3'), part: id, closedWhen: 1 },
    ],
  },
  /** Ends 1 and 3, wiper 2. */
  potentiometer: {
    legs: ['1', '2', '3'],
    devices: ({ id, leg, props }) => [{ kind: 'pot', id, e1: leg('1'), w: leg('2'), e2: leg('3'), ohms: Number(props.ohms ?? 10_000), part: id }],
  },
  ldr: {
    legs: ['a', 'b'],
    devices: ({ id, leg }) => [{ kind: 'ldr', id, a: leg('a'), b: leg('b'), part: id }],
  },
  battery: {
    legs: ['+', '-'],
    devices: ({ id, leg, props }) => {
      const b = BATTERIES[String(props.kind)] ?? BATTERIES['9V']!;
      return [{ kind: 'source', id, plus: leg('+'), minus: leg('-'), ...b }];
    },
  },
  /** Power between vcc and gnd; the signal leg is an input (its pulses are the behaviour's, M7). */
  servo: {
    legs: ['gnd', 'vcc', 'signal'],
    devices: ({ id, leg }) => [{ kind: 'resistor', id, a: leg('vcc'), b: leg('gnd'), ohms: SERVO_IDLE_OHMS }],
  },
};

function sensorModel(loadOhms: number): PartModel {
  return {
    legs: ['vcc', 'out', 'gnd'],
    devices: ({ id, leg }) => [
      { kind: 'resistor', id: `${id}:supply`, a: leg('vcc'), b: leg('gnd'), ohms: loadOhms },
      { kind: 'drive', id: `${id}:out`, out: leg('out'), gnd: leg('gnd'), part: id },
    ],
  };
}

/** A module from sensors.ts MODULES: its supply's load, its pull-ups, an output stage (a `drive`) for each output. */
function moduleModel(type: string, legs: string[], extra?: (id: string, leg: (name: string) => string) => Device[]): PartModel {
  const m = MODULES[type]!;
  return {
    legs,
    devices: ({ id, leg }) => [
      { kind: 'resistor', id: `${id}:supply`, a: leg('vcc'), b: leg('gnd'), ohms: m.loadOhms },
      ...m.pullUps.map((l): Device => ({ kind: 'resistor', id: `${id}:pull-${l}`, a: leg('vcc'), b: leg(l), ohms: 10_000 })),
      ...Object.keys(m.outputs).map((l): Device => ({ kind: 'drive', id: `${id}:${l}`, out: leg(l), gnd: leg('gnd'), part: id, key: l })),
      ...(extra?.(id, leg) ?? []),
    ],
  };
}
