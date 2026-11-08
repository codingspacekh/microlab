import {
  BATTERIES, BUZZER, BUZZER_MODULE, CONTACT_OHMS, KIT_LED_OHMS, L298N, L9110S, MOTOR, POWER_SUPPLY, PUMP, RELAY, RGB_DIES, SERVO_IDLE_OHMS, STEPPER, ULN2003,
  type Device,
} from './devices';
import { DISPLAYS } from './displays';
import { MPU6050 } from './i2c';
import { NEOPIXEL, neopixelCount } from './neopixel';
import { RC522 } from './rfid';
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
  /** Legs that are points on the part itself (M7): a screw terminal, a motor's tab, a socket. They are wired to, or
   *  take another part's plug (a stepper's cable in its driver's socket); they are never put in a hole, so a part
   *  of terminals only (a motor, an L298N) lies anywhere on the canvas. */
  terminals?: readonly string[];
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
  /** SG90 by its plug, brown −, red +, orange S: a load between + and − (more while it turns, M7); S is an input, its
   *  pulses the sim's. */
  servo: {
    legs: ['gnd', 'vcc', 'signal'],
    devices: ({ id, leg }) => [{ kind: 'load', id, a: leg('vcc'), b: leg('gnd'), ohms: SERVO_IDLE_OHMS, part: id }],
  },
  // ---- M7 slice 1 (screens 25, 25b): actuators, their drivers, the kit's output modules
  /** A TT gear motor: its two tabs (+, −); it turns forward with + above −. */
  motor: { legs: ['+', '-'], terminals: ['+', '-'], devices: ({ id, leg }) => [{ kind: 'resistor', id, a: leg('+'), b: leg('-'), ohms: MOTOR.ohms }] },
  /** A small water pump: its two leads' tabs (+, −). */
  pump: { legs: ['+', '-'], terminals: ['+', '-'], devices: ({ id, leg }) => [{ kind: 'resistor', id, a: leg('+'), b: leg('-'), ohms: PUMP.ohms }] },
  /** L9110S (HG7881) module: its header B-IA B-IB GND VCC A-IA A-IB in the breadboard, MOTOR A (a1, a2) and MOTOR B
   *  (b1, b2) screws. IA high, IB low: the first screw to VCC, the second to GND; the other way round, reversed; both
   *  the same: both to GND. */
  l9110s: {
    legs: ['b-ia', 'b-ib', 'gnd', 'vcc', 'a-ia', 'a-ib', 'b1', 'b2', 'a1', 'a2'],
    terminals: ['b1', 'b2', 'a1', 'a2'],
    devices: ({ id, leg }) => (['a', 'b'] as const).flatMap((m): Device[] => [
      { kind: 'resistor', id: `${id}:${m}-ia`, a: leg(`${m}-ia`), b: leg('gnd'), ohms: L9110S.inputOhms },
      { kind: 'resistor', id: `${id}:${m}-ib`, a: leg(`${m}-ib`), b: leg('gnd'), ohms: L9110S.inputOhms },
      bridge(`${id}:${m}`, leg('gnd'), [{ net: leg('vcc'), minVolts: L9110S.minVolts }], L9110S.threshold, [leg(`${m}-ia`), leg(`${m}-ib`)],
        leg(`${m}1`), leg(`${m}2`), leg('vcc'), L9110S.ohms, { 10: '1001', '01': '0110', '00': '0101', 11: '0101' }),
    ]),
  },
  /** L298N module, beside the breadboard (all its points are terminals): OUT1 OUT2 (motor A), OUT3 OUT4 (motor B), the
   *  12V GND 5V screws, ENA IN1 IN2 IN3 IN4 ENB. Its ENA / ENB jumpers on (`ena`, `enb`; the default): that motor is
   *  enabled; off, its EN pin enables it (a PWM there sets the speed). EN high: IN1 high, IN2 low → OUT1 to 12V, OUT2
   *  to GND; the other way, reversed; both the same: both to that side (a brake). `regulator` (its 5V-EN jumper, on by
   *  default): its logic is powered from the 12V screw, not only from 5V. */
  l298n: {
    legs: ['out1', 'out2', 'out3', 'out4', '12v', 'gnd', '5v', 'ena', 'in1', 'in2', 'in3', 'in4', 'enb'],
    terminals: ['out1', 'out2', 'out3', 'out4', '12v', 'gnd', '5v', 'ena', 'in1', 'in2', 'in3', 'in4', 'enb'],
    devices: ({ id, leg, props }) => {
      const power = [{ net: leg('5v'), minVolts: L298N.minVolts }, ...(props.regulator === false ? [] : [{ net: leg('12v'), minVolts: L298N.minVolts }])];
      const forward = { 10: '1001', '01': '0110', '00': '0101', 11: '1010' };
      return ([['a', 'ena', 'in1', 'in2', 'out1', 'out2'], ['b', 'enb', 'in3', 'in4', 'out3', 'out4']] as const).map(([m, en, i1, i2, o1, o2]) => {
        const jumper = props[en] !== false;
        const table = jumper ? forward : Object.fromEntries(Object.entries(forward).map(([k, v]) => [`1${k}`, v]));
        const inputs = jumper ? [leg(i1), leg(i2)] : [leg(en), leg(i1), leg(i2)];
        return bridge(`${id}:${m}`, leg('gnd'), power, L298N.threshold, inputs, leg(o1), leg(o2), leg('12v'), L298N.ohms, table);
      });
    },
  },
  /** Relay module (SRD-05VDC): its header S + − in the breadboard, its NO COM NC screws. S high (`trigger` 'low': low)
   *  with ≥ 3.75 V on +: the coil pulls in, COM to NO; otherwise COM to NC. */
  relay: {
    legs: ['s', 'vcc', 'gnd', 'no', 'com', 'nc'],
    terminals: ['no', 'com', 'nc'],
    devices: ({ id, leg, props }) => [
      { kind: 'resistor', id: `${id}:s`, a: leg('s'), b: leg('gnd'), ohms: RELAY.inputOhms },
      {
        kind: 'logic', id, gnd: leg('gnd'), power: [{ net: leg('vcc'), minVolts: RELAY.pullInVolts }], threshold: RELAY.threshold, inputs: [leg('s')],
        switches: [
          { id: 'coil', a: leg('vcc'), b: leg('gnd'), ohms: RELAY.coilOhms },
          { id: 'no', a: leg('com'), b: leg('no'), ohms: CONTACT_OHMS },
          { id: 'nc', a: leg('com'), b: leg('nc'), ohms: CONTACT_OHMS },
        ],
        table: props.trigger === 'low' ? { 0: '110', 1: '001' } : { 1: '110', 0: '001' }, rest: '001',
      },
    ],
  },
  /** ULN2003 stepper driver board: IN1–IN4, − and + in the breadboard; its socket's a b c d (OUT1–OUT4) and m (its +)
   *  take a 28BYJ-48's cable. Each IN high sinks its OUT to −; an LED (A–D) on each OUT lights with it. */
  uln2003: {
    legs: ['in1', 'in2', 'in3', 'in4', '-', '+', 'a', 'b', 'c', 'd', 'm'],
    terminals: ['a', 'b', 'c', 'd', 'm'],
    internal: [['+', 'm']],
    devices: ({ id, leg }) => (['a', 'b', 'c', 'd'] as const).flatMap((o, i): Device[] => [
      { kind: 'resistor', id: `${id}:in${i + 1}`, a: leg(`in${i + 1}`), b: leg('-'), ohms: ULN2003.inputOhms },
      {
        kind: 'logic', id: `${id}:${o}`, gnd: leg('-'), power: [], threshold: ULN2003.threshold, inputs: [leg(`in${i + 1}`)],
        switches: [{ id: 'sink', a: leg(o), b: leg('-'), ohms: ULN2003.ohms }], table: { 1: '1' },
      },
      { kind: 'resistor', id: `${id}:${o.toUpperCase()}-r`, a: leg('+'), b: `${id}#${o}`, ohms: ULN2003.ledOhms },
      { kind: 'led', id: `${id}:${o.toUpperCase()}`, a: `${id}#${o}`, k: leg(o), color: 'red' },
    ]),
  },
  /** 28BYJ-48 by its cable (blue pink yellow orange red, all terminals: plugged into a ULN2003's a b c d m): coils A–D
   *  from the red common. */
  stepper: {
    legs: ['blue', 'pink', 'yellow', 'orange', 'red'],
    terminals: ['blue', 'pink', 'yellow', 'orange', 'red'],
    devices: ({ id, leg }) => (['blue', 'pink', 'yellow', 'orange'] as const).map((l, i): Device => (
      { kind: 'resistor', id: `${id}:${'ABCD'[i]}`, a: leg('red'), b: leg(l), ohms: STEPPER.coilOhms })),
  },
  /** The kit's traffic light module: R Y G GND, each LED with its resistor on the board. */
  'traffic-module': {
    legs: ['r', 'y', 'g', 'gnd'],
    devices: ({ id, leg }) => ([['r', 'red'], ['y', 'yellow'], ['g', 'green']] as const).flatMap(([l, color]): Device[] => [
      { kind: 'resistor', id: `${id}:${l}-r`, a: leg(l), b: `${id}#${l}`, ohms: KIT_LED_OHMS.traffic },
      { kind: 'led', id: `${id}:${l}`, a: `${id}#${l}`, k: leg('gnd'), color },
    ]),
  },
  /** The kit's RGB LED module: R G B − (common cathode), each die with its resistor on the board. */
  'rgb-module': {
    legs: ['r', 'g', 'b', 'gnd'],
    devices: ({ id, leg }) => RGB_DIES.flatMap(([l, color, vf]): Device[] => [
      { kind: 'resistor', id: `${id}:${l}-r`, a: leg(l), b: `${id}#${l}`, ohms: KIT_LED_OHMS.rgb },
      { kind: 'led', id: `${id}:${l}`, a: `${id}#${l}`, k: leg('gnd'), color, vf },
    ]),
  },
  /** The kit's passive buzzer module: I/O VCC GND; a transistor from I/O switches its buzzer across VCC, so it plays
   *  the note of the PWM on I/O. */
  'buzzer-module': {
    legs: ['io', 'vcc', 'gnd'],
    devices: ({ id, leg }) => [
      { kind: 'resistor', id: `${id}:io`, a: leg('io'), b: leg('gnd'), ohms: BUZZER_MODULE.inputOhms },
      { kind: 'resistor', id, a: leg('vcc'), b: `${id}#c`, ohms: BUZZER_MODULE.ohms },
      {
        kind: 'logic', id: `${id}:q`, gnd: leg('gnd'), power: [], threshold: BUZZER_MODULE.threshold, inputs: [leg('io')],
        switches: [{ id: 'ce', a: `${id}#c`, b: leg('gnd'), ohms: 1 }], table: { 1: '1' },
      },
    ],
  },
  /** The RC522 RFID reader module (M7, the teacher's request): SDA (its SPI chip select) SCK MOSI MISO IRQ GND RST
   *  3.3V in a row; it answers on SPI (rfid.ts). */
  rc522: {
    legs: ['sda', 'sck', 'mosi', 'miso', 'irq', 'gnd', 'rst', 'vcc'],
    devices: ({ id, leg }) => [{ kind: 'resistor', id: `${id}:supply`, a: leg('vcc'), b: leg('gnd'), ohms: RC522.loadOhms }],
  },
  /** SSD1306 OLED module (M7 slice 2): GND VCC SCL SDA in a row; it answers on I²C (displays.ts). */
  ssd1306: {
    legs: ['gnd', 'vcc', 'scl', 'sda'],
    devices: ({ id, leg }) => [{ kind: 'resistor', id: `${id}:supply`, a: leg('vcc'), b: leg('gnd'), ohms: DISPLAYS.ssd1306.loadOhms }],
  },
  /** A 16×2 LCD with its I²C backpack: the backpack's header out of its end — GND VCC SDA SCL, points to wire. */
  lcd1602: {
    legs: ['gnd', 'vcc', 'sda', 'scl'],
    terminals: ['gnd', 'vcc', 'sda', 'scl'],
    devices: ({ id, leg }) => [{ kind: 'resistor', id: `${id}:supply`, a: leg('vcc'), b: leg('gnd'), ohms: DISPLAYS.lcd1602.loadOhms }],
  },
  /** A 7-segment digit (0.56", 5161AS): pins 1–5 e d COM c dp, 6–10 b a COM f g, its two COMs joined inside; eight
   *  LEDs (`<id>:a` … `:g`, `:dp`), their cathodes on COM ('cathode', the default) or their anodes ('anode'). */
  'seven-segment': {
    legs: ['e', 'd', 'com2', 'c', 'dp', 'b', 'a', 'com1', 'f', 'g'],
    internal: [['com1', 'com2']],
    devices: ({ id, leg, props }) => ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'dp'].map((s): Device => (props.common === 'anode'
      ? { kind: 'led', id: `${id}:${s}`, a: leg('com1'), k: leg(s), color: String(props.color ?? 'red') }
      : { kind: 'led', id: `${id}:${s}`, a: leg(s), k: leg('com1'), color: String(props.color ?? 'red') })),
  },
  /** The TM1637 4-digit module: its header out of its side — CLK DIO VCC GND, points to wire; read pin by pin.
   *  CLK and DIO have 10 kΩ pull-ups to VCC on the module. */
  tm1637: {
    legs: ['clk', 'dio', 'vcc', 'gnd'],
    terminals: ['clk', 'dio', 'vcc', 'gnd'],
    devices: ({ id, leg }) => [
      { kind: 'resistor', id: `${id}:supply`, a: leg('vcc'), b: leg('gnd'), ohms: DISPLAYS.tm1637.loadOhms },
      { kind: 'resistor', id: `${id}:pull-clk`, a: leg('vcc'), b: leg('clk'), ohms: DISPLAYS.tm1637.pullOhms },
      { kind: 'resistor', id: `${id}:pull-dio`, a: leg('vcc'), b: leg('dio'), ohms: DISPLAYS.tm1637.pullOhms },
    ],
  },
  /** The MAX7219 8×8 module: VCC GND DIN CS CLK in, VCC GND DOUT CS CLK out (to chain another; VCC, GND, CS and
   *  CLK go straight through), all points to wire. It draws what its lit dots take (the sim sets it). */
  max7219: {
    legs: ['vcc', 'gnd', 'din', 'cs', 'clk', 'vcc2', 'gnd2', 'dout', 'cs2', 'clk2'],
    terminals: ['vcc', 'gnd', 'din', 'cs', 'clk', 'vcc2', 'gnd2', 'dout', 'cs2', 'clk2'],
    internal: [['vcc', 'vcc2'], ['gnd', 'gnd2'], ['cs', 'cs2'], ['clk', 'clk2']],
    devices: ({ id, leg }) => [{ kind: 'load', id, a: leg('vcc'), b: leg('gnd'), part: id, ohms: Math.round(5 / DISPLAYS.max7219.shutdownA) }],
  },
  /** A NeoPixel stick or ring (M7 slice 3; props shape 'stick' | 'ring', leds): DIN 5V GND in, DOUT out (a stick has its
   *  5V and GND again at its out end, to chain the next one), all points to wire. It draws what its LEDs take (the
   *  sim sets it from their colours); dark, ≈ 0.6 mA an LED. */
  neopixel: {
    legs: ['din', 'vcc', 'gnd', 'dout', 'vcc2', 'gnd2'],
    terminals: ['din', 'vcc', 'gnd', 'dout', 'vcc2', 'gnd2'],
    internal: [['vcc', 'vcc2'], ['gnd', 'gnd2']],
    devices: ({ id, leg, props }) => [{ kind: 'load', id, a: leg('vcc'), b: leg('gnd'), part: id, ohms: Math.round(5 / (neopixelCount(props) * NEOPIXEL.idleA)) }],
  },
  /** A USB-serial adapter (CP2102; M7 slice 5): RXD TXD GND 3V3 5V, points to wire. It is powered from the laptop's
   *  USB: its 5V and 3V3 pins give power (500 mA, 100 mA from its regulator). What its TXD and RXD carry is the sim's. */
  'usb-serial': {
    legs: ['rxd', 'txd', 'gnd', '3v3', '5v'],
    terminals: ['rxd', 'txd', 'gnd', '3v3', '5v'],
    devices: ({ id, leg }) => [
      { kind: 'source', id: `${id}:5v`, plus: leg('5v'), minus: leg('gnd'), volts: 5, ohms: 0.1, limitA: 0.5 },
      { kind: 'source', id: `${id}:3v3`, plus: leg('3v3'), minus: leg('gnd'), volts: 3.3, ohms: 0.5, limitA: 0.1 },
    ],
  },
  /** An HC-05 / JDY-31 Bluetooth module: EN VCC GND TXD RXD STATE, points to wire; ≈ 40 mA from VCC; STATE high while a
   *  phone is connected (the sim drives it). */
  hc05: {
    legs: ['en', 'vcc', 'gnd', 'txd', 'rxd', 'state'],
    terminals: ['en', 'vcc', 'gnd', 'txd', 'rxd', 'state'],
    devices: ({ id, leg }) => [
      { kind: 'resistor', id: `${id}:supply`, a: leg('vcc'), b: leg('gnd'), ohms: 120 },
      { kind: 'drive', id: `${id}:state`, out: leg('state'), gnd: leg('gnd'), part: id, key: 'state' },
    ],
  },
  /** A GPS module (GY-NEO6MV2): GND TX RX VCC, points to wire; ≈ 45 mA from VCC (3.3–5 V). */
  gps: {
    legs: ['gnd', 'tx', 'rx', 'vcc'],
    terminals: ['gnd', 'tx', 'rx', 'vcc'],
    devices: ({ id, leg }) => [{ kind: 'resistor', id: `${id}:supply`, a: leg('vcc'), b: leg('gnd'), ohms: 110 }],
  },
  /** Breadboard power supply (MB102) on a breadboard's end: two pins in each rail (t- t+ top, b+ b- bottom); `top`
   *  and `bottom` its jumpers, 5 or 3.3 V; `on` its switch (on by default). Its own jack or USB is its power. */
  'power-supply': {
    legs: ['t-1', 't-2', 't+1', 't+2', 'b+1', 'b+2', 'b-1', 'b-2'],
    internal: [['t-1', 't-2'], ['t+1', 't+2'], ['b+1', 'b+2'], ['b-1', 'b-2'], ['t-1', 'b-1']],
    devices: ({ id, leg, props }) => {
      if (props.on === false) return [];
      const volts = (v: unknown, d: number) => (POWER_SUPPLY.choices as readonly number[]).includes(Number(v)) ? Number(v) : d;
      return [
        { kind: 'source', id: `${id}:top`, plus: leg('t+1'), minus: leg('t-1'), volts: volts(props.top, 5), ohms: POWER_SUPPLY.ohms, limitA: POWER_SUPPLY.limitA },
        { kind: 'source', id: `${id}:bottom`, plus: leg('b+1'), minus: leg('b-1'), volts: volts(props.bottom, 3.3), ohms: POWER_SUPPLY.ohms, limitA: POWER_SUPPLY.limitA },
      ];
    },
  },
};

/** An H-bridge's two outputs (M7): `table` closes, in this order, o1 to `high`, o1 to gnd, o2 to `high`, o2 to gnd. */
function bridge(id: string, gnd: string, power: { net: string; minVolts: number }[], threshold: number, inputs: string[],
  o1: string, o2: string, high: string, ohms: number, table: Record<string, string>): Device {
  return {
    kind: 'logic', id, gnd, power, threshold, inputs, table,
    switches: [{ id: '1h', a: o1, b: high, ohms }, { id: '1l', a: o1, b: gnd, ohms }, { id: '2h', a: o2, b: high, ohms }, { id: '2l', a: o2, b: gnd, ohms }],
  };
}

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
