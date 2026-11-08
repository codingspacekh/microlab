import type { BoardData } from '@lib/boards';
import { NEOPIXEL, neopixelCount, NeoPixels, ws2812Bits, MifareTag, Mfrc522, RC522, RFID_TAGS, DISPLAYS, digitsText, isDisplay, Lcd1602, Max7219, Ssd1306, Tm1637, Bmp280, Max30102, Vl53l0x, BUZZER, BUZZER_MODULE, MOTOR, PUMP, SERVO, STEPPER, dhtBytes, Ds1302, Ds18b20, OneWireBus, type OneWireDevice, ENCODER, Pcf8591, moduleDrives, MODULES, SPEED, Mpu6050, MPU6050, type I2CDevice, echoUs, findFaults, isSensor, LED, minVolts, SENSORS, SENSOR_START, sensorDrive, solve, toNetlist, type CircuitSpec, type Connectivity, type Fault, type Netlist, type PartState, type PinState, type SimState, type Solution } from '@lib/circuit';
import type { Control } from './control';
import type { PinBank } from './pins';
import { isSerialPart, SERIAL_PARTS, SerialHub } from './serial';
import type { Framing } from './uart';

/**
 * The circuit engine inside the sim (M3, architecture §2.2): the board's pins and the parts' inputs make a
 * SimState; the circuit is solved when something needs its answer (a pin read, an ADC, a sleep, the VM hook) —
 * not on every write, so a tight `toggle()` loop stays fast — and the solved voltages are what the pins read.
 */

/** From `atUs` on, a part's input: a button pressed (a PIR seeing motion), a knob's position (0–1 from leg 1; the
 *  surface under a line sensor, a soil sensor's moisture), the light on an LDR, a temperature sensor's °C. */
export interface PartChange {
  atUs: number;
  /** A part id, or the board's own (board.A, board.B on the micro:bit). */
  part: string;
  pressed?: boolean;
  position?: number;
  lux?: number;
  celsius?: number;
  humidity?: number;
  cm?: number;
  tiltx?: number;
  tilty?: number;
  x?: number;
  y?: number;
  steps?: number;
  rpm?: number;
  hpa?: number;
  bpm?: number;
  spo2?: number;
  /** M7 slice 5: what a serial part sends (a terminal's line, a phone's message), a phone connected, a GPS's place. */
  text?: string;
  connected?: boolean;
  fix?: boolean;
  lat?: number;
  lon?: number;
  sats?: number;
  kmh?: number;
}

/** Up to this many PWM pins are averaged exactly (2^n solves: an RGB LED is 3); beyond, their DC average. */
const MAX_PWM_AVERAGED = 4;

/** What the window draws for a part (M3.4, §1.7 behaviours). */
export type PartView =
  /** brightness = current / the LED's 20 mA rating, 0–1 (the window decides how a glow looks). */
  | { kind: 'led'; amps: number; brightness: number }
  /** angle 0–180° from the pulse width (0.5 ms → 0°, 2.5 ms → 180°, SG90), turning there at its speed (M7); it moves
   *  only with ≥ 4.5 V across it. */
  | { kind: 'servo'; angle: number; powered: boolean; pulseUs?: number }
  /** A motor (M7): how fast it turns, which way (1: + above −), what it draws. */
  | { kind: 'motor'; rpm: number; direction: 1 | -1 | 0; amps: number }
  /** A pump: pumping or not, what it draws. */
  | { kind: 'pump'; running: boolean; amps: number }
  /** A motor driver (L9110S, L298N): which way each of its two outputs drives (1: its first screw above its second). */
  | { kind: 'driver'; a: -1 | 0 | 1; b: -1 | 0 | 1 }
  /** A relay module: its coil pulled in (COM to NO). */
  | { kind: 'relay'; on: boolean }
  /** A stepper: the half steps it has turned (4096 a turn; + clockwise), the coils on now ('BC'). */
  | { kind: 'stepper'; steps: number; coils: string }
  /** The breadboard power supply: on or not, what each rail pair gives (A). */
  | { kind: 'supply'; on: boolean; top: number; bottom: number }
  /** What a buzzer sounds like (M6.2): its pitch in Hz (0: silent) and its loudness 0–1. */
  | { kind: 'buzzer'; hz: number; volume: number }
  /** A sensor module's output (M6.3): its volts, and whether its supply is enough for it to work. */
  | { kind: 'sensor'; volts: number; powered: boolean }
  /** A real-time clock's time, 'HH:MM:SS' (M6.5b). */
  | { kind: 'clock'; time: string }
  /** An SSD1306 OLED (M7 slice 2): what it shows, 8 pages of 128 bytes as hex (bit 0 a page's top row; '' when
   *  nothing is lit), how many pixels are lit, its contrast (0–255). */
  | { kind: 'oled'; on: boolean; lit: number; contrast: number; frame: string }
  /** A 16×2 LCD: its two rows (character codes; 0–7 its own characters, in `cgram` as hex), its display and
   *  backlight on, `faint` when its supply is too low to read it. */
  | { kind: 'lcd'; on: boolean; backlight: boolean; faint: boolean; rows: [string, string]; cgram?: string }
  /** A TM1637 4-digit display: each digit's segments (bit 0 a … bit 6 g; bit 7 of the second its colon), as text,
   *  on, brightness 0–7. */
  | { kind: 'digits'; on: boolean; brightness: number; segments: number[]; text: string }
  /** A MAX7219 8×8 matrix: its rows top to bottom (bit 7 the left dot), on, intensity 0–15, the dots lit, what it draws. */
  | { kind: 'matrix'; on: boolean; intensity: number; rows: number[]; lit: number; amps: number }
  /** An RC522 RFID reader (M7): its antenna on, the tag held to it (0 none, 1 the card, 2 the key fob), its UID as hex,
   *  what the reader did last with it. */
  | { kind: 'rfid'; antenna: boolean; tag: number; uid: string; last: string }
  /** A NeoPixel stick or ring (M7 slice 3): powered, its LEDs' colours as hex ('rrggbb' an LED from LED 0; '' while
   *  all are dark), how many are lit, what it draws, and the board supply it is on with what that gives (A). */
  | { kind: 'pixels'; on: boolean; pixels: string; lit: number; amps: number; from?: string; limitA?: number }
  /** A USB-serial adapter (M7 slice 5): what its terminal shows (what reached its RXD, as text), the bytes it sent and
   *  got, its baud rate, and the rate of the board port that sent to it last (another: garbage). */
  | { kind: 'serial'; text: string; sent: number; received: number; baud: number; heardBaud?: number }
  /** A Bluetooth module: powered, a phone connected, the messages both ways (the phone's, the board's). */
  | { kind: 'bluetooth'; on: boolean; connected: boolean; messages: { from: 'phone' | 'board'; text: string }[]; sent: number; received: number }
  /** A GPS: powered, a fix, satellites, where it is, the bytes it has sent. */
  | { kind: 'gps'; on: boolean; fix: boolean; sats: number; lat: number; lon: number; kmh: number; sent: number };

/** [µs, part id, its new state] — one entry per change, as the window would be told. */
export type PartTraceEntry = [number, string, PartView];

/** The live input slots a part takes (sim-client's SLOT): 'pressed:btn1', 'celsius:dht1' … */
/** Parts that answer on I²C (M6.4b, M6.5b). */
const I2C_CHIPS = new Set(['mpu6050', 'pcf8591', 'bmp280', 'vl53l0x', 'max30102', 'ssd1306', 'lcd1602']);

const LIVE_KINDS = new Set(['pressed', 'position', 'lux', 'celsius', 'humidity', 'cm', 'tiltx', 'tilty', 'x', 'y', 'steps', 'rpm', 'hpa', 'bpm', 'spo2']);

/** A stepper's coils on, in half-step order (A, AB, B … DA): its rotor's eight places. */
const HALF_STEPS = ['A', 'AB', 'B', 'BC', 'C', 'CD', 'D', 'AD'];

export class CircuitHost {
  readonly netlist: Netlist;
  private readonly netOfPin = new Map<string, string>();   // pin key ('15') → its net
  private readonly labelOfPin = new Map<string, string>(); // pin key → its label ('GP15')
  private readonly parts: Record<string, PartState> = {};
  private readonly script: PartChange[];
  private next = 0;
  private solution: Solution | undefined;
  private dirty = true;
  faults: Fault[] = [];
  readonly partTrace: PartTraceEntry[] = [];
  /** Told of every change of a part's state (the worker batches them for the window). */
  onChange?: (entry: PartTraceEntry) => void;
  /** Every fault seen in the run, each once (its worst numbers). */
  readonly seen = new Map<string, Fault>();
  /** The first damage fault (a burnt LED, a short, over-voltage): the run stops (M3.5). */
  damage?: Fault;
  onDamage?: (fault: Fault) => void;
  private readonly connectivity: Connectivity;
  private readonly pinOfNet = new Map<string, string>();
  private readonly views = new Map<string, PartView>();
  /** Each servo's arm (M7): where it is, as of when. */
  private readonly servoArm = new Map<string, { angle: number; at: number }>();
  /** The servos turning now (they draw more, and their arm is drawn as it goes). */
  private readonly turning = new Set<string>();
  /** Each stepper's rotor: its place (0–7 of HALF_STEPS) and its steps. */
  private readonly rotors = new Map<string, { at?: number; steps: number }>();
  private readonly keyOfLabel = new Map<string, string>();   // 'GP15' → '15'
  /** The last solve, each on / off combination of the PWM pins (`pwm`, in mask order) with its weight: a buzzer
   *  hears the swing, not the average. One combination when no pin is on PWM. */
  private combos: { mask: number; weight: number; volts: Record<string, number> }[] = [];
  private pwmPins: string[] = [];

  constructor(
    private readonly spec: CircuitSpec,
    private readonly pins: PinBank,
    private readonly now: () => number,
    changes: PartChange[] = [],
    private readonly live?: Control,
  ) {
    const { netlist, connectivity } = toNetlist(spec);
    this.netlist = netlist;
    this.connectivity = connectivity;
    const board: BoardData | undefined = spec.board?.data;
    for (const p of board?.pins ?? []) {
      if (p.role !== 'gpio' || p.same || p.gpio === undefined) continue;
      const net = connectivity.netOf(`board.${p.id}`);
      if (net === undefined) continue;
      this.netOfPin.set(String(p.gpio), net);
      this.labelOfPin.set(String(p.gpio), p.label);
      this.keyOfLabel.set(p.label, String(p.gpio));
      this.pinOfNet.set(net, String(p.gpio));
    }
    this.script = [...changes].sort((a, b) => a.atUs - b.atUs);
    this.serial = new SerialHub({
      parts: spec.parts, netOf: (point) => this.connectivity.netOf(point), netOfPin: (key) => this.netOfPin.get(key),
      powered: (id) => this.powered.get(id) ?? false, wallStartMs: Date.now(),
    });
  }

  /** The run's UARTs (M7 slice 5): the board's ports and the serial parts. */
  readonly serial: SerialHub;

  /** A board UART opened on these pins: its handle. Its TX on a part's TX is a warning (screen 28d). */
  uartOpen(tx: string, rx: string, framing: Framing, rxbuf: number): number {
    this.update();
    const before = this.serial.txToTx.length;
    const h = this.serial.open(tx, rx, framing, rxbuf);
    for (const [pin, other] of this.serial.txToTx.slice(before)) {
      const on = this.labelOfPin.get(pin) ?? pin;
      const f: Fault = { kind: 'uart-tx-to-tx', severity: 'warning', on, part: other.toUpperCase().replace('.', "'s ") };
      if (!this.seen.has(`${f.kind}:${on}`)) this.seen.set(`${f.kind}:${on}`, f);
    }
    return h;
  }

  /** The window's live text and settings for the serial parts (M7 slice 5): 'txseq:usb1' counts what was sent,
   *  'txlen:usb1' and 'tx0:usb1' … its bytes; 'connected:bt1'; a GPS's 'fix', 'lat', 'lon', 'sats', 'kmh'. */
  private readonly serialSeq = new Map<string, number>();
  private readSerialLive(live: Control): void {
    const at = (name: string) => { const i = live.names.indexOf(name); return i < 0 ? NaN : live.input(i); };
    const t = this.now();
    for (const [id, line] of this.serial.lines) {
      const seq = at(`txseq:${id}`);
      if (!Number.isNaN(seq) && seq > (this.serialSeq.get(id) ?? 0)) {
        this.serialSeq.set(id, seq);
        const n = Math.max(0, Math.min(64, at(`txlen:${id}`) || 0));
        const bytes = Array.from({ length: n }, (_, i) => at(`tx${i}:${id}`) & 0xff);
        this.serial.partSends(id, new TextDecoder().decode(new Uint8Array(bytes)), t);
      }
      if (line.type === 'hc05') {
        const c = at(`connected:${id}`);
        if (!Number.isNaN(c)) this.serial.setConnected(id, c >= 0.5);
      }
      if (line.type === 'gps') {
        const g = { fix: at(`fix:${id}`), lat: at(`lat:${id}`), lon: at(`lon:${id}`), sats: at(`sats:${id}`), kmh: at(`kmh:${id}`) };
        this.serial.setGps(id, {
          ...(Number.isNaN(g.fix) ? {} : { fix: g.fix >= 0.5 }), ...(Number.isNaN(g.lat) ? {} : { lat: g.lat }), ...(Number.isNaN(g.lon) ? {} : { lon: g.lon }),
          ...(Number.isNaN(g.sats) ? {} : { sats: g.sats }), ...(Number.isNaN(g.kmh) ? {} : { kmh: g.kmh }),
        });
      }
    }
  }

  /** Is this pin key on the board's header (in the circuit)? */
  has(pin: string): boolean {
    return this.netOfPin.has(pin);
  }

  /** Something the pins drive changed: the next answer needs a new solve. */
  invalidate(): void {
    this.dirty = true;
  }

  /** Applies part inputs due by now; true if any changed. */
  private updateParts(): boolean {
    let changed = false;
    const t = this.now();
    while (this.next < this.script.length && this.script[this.next]!.atUs <= t) {
      const c = this.script[this.next++]!;
      const s = (this.parts[c.part] ??= {});
      if (c.pressed !== undefined) s.pressed = c.pressed;
      if (c.position !== undefined) s.position = c.position;
      if (c.lux !== undefined) s.lux = c.lux;
      if (c.celsius !== undefined) s.celsius = c.celsius;
      if (c.humidity !== undefined) s.humidity = c.humidity;
      if (c.cm !== undefined) s.cm = c.cm;
      if (c.tiltx !== undefined) s.tiltx = c.tiltx;
      for (const k of ['x', 'y', 'steps', 'rpm', 'hpa', 'bpm', 'spo2'] as const) if (c[k] !== undefined) s[k] = c[k];
      if (c.tilty !== undefined) s.tilty = c.tilty;
      // M7 slice 5: the serial parts'
      if (c.connected !== undefined) this.serial.setConnected(c.part, c.connected);
      if (c.fix !== undefined || c.lat !== undefined || c.lon !== undefined || c.sats !== undefined || c.kmh !== undefined) {
        this.serial.setGps(c.part, { fix: c.fix, lat: c.lat, lon: c.lon, sats: c.sats, kmh: c.kmh } as never);
      }
      if (c.text !== undefined) this.serial.partSends(c.part, c.text, c.atUs);
      changed = true;
    }
    if (this.live) { changed = this.readLive(this.live) || changed; this.readSerialLive(this.live); }
    return changed;
  }

  private readonly liveSeen: number[] = [];

  /** Live slots 'pressed:btn1' (0 / 1), 'position:pot1' (0–1), 'lux:ldr1', 'celsius:tmp1'. */
  private readLive(live: Control): boolean {
    let changed = false;
    live.names.forEach((name, i) => {
      const [kind, part] = name.split(':') as [string, string];
      if (!LIVE_KINDS.has(kind)) return;
      const v = live.input(i);
      if (this.liveSeen[i] === v || (Number.isNaN(v) && this.liveSeen[i] === undefined)) return;
      this.liveSeen[i] = v;
      const s = (this.parts[part] ??= {});
      if (kind === 'pressed') s.pressed = v > 0.5;
      else s[kind as 'position'] = v;
      changed = true;
    });
    return changed;
  }

  /** When the next scripted part input is due (µs), or Infinity: a sleep wakes for it. */
  nextChangeUs(): number {
    let next = this.script[this.next]?.atUs ?? Infinity;
    for (const until of this.pirHold.values()) if (until > this.now() && until < next) next = until;   // a PIR's hold ends
    for (const e of this.echoes.values()) for (const at of [e.from, e.to]) if (at > this.now() && at < next) next = at;   // an echo
    for (const e of this.encoders.values()) for (const [at] of e.phases) if (at > this.now() && at < next) { next = at; break; }   // a detent
    if (this.turning.size) next = Math.min(next, this.now() + SERVO.periodUs);   // a servo's arm goes on turning
    for (const part of this.spec.parts) {   // a wheel's next pulse
      const half = part.type === 'speed-sensor' ? this.pulseHalfUs(part.id) : Infinity;
      if (half < Infinity) next = Math.min(next, (Math.floor(this.now() / half) + 1) * half);
    }
    return next;
  }

  /** When each PIR's output falls: Infinity while it sees motion, then its hold time after the motion ends. */
  private readonly pirHold = new Map<string, number>();
  private readonly powered = new Map<string, boolean>();
  /** Each rotary encoder's steps taken so far, and its contacts' changes still to come: [µs, CLK closed, DT closed]. */
  private readonly encoders = new Map<string, { steps: number; phases: [number, boolean, boolean][]; a: boolean; b: boolean }>();

  /** Half a speed sensor's pulse (µs): a wheel of 20 slots at its rpm; Infinity when it stands still. */
  private pulseHalfUs(id: string): number {
    const rpm = this.parts[id]?.rpm ?? 0;
    return rpm > 0 ? 1e6 / ((rpm / 60) * SPEED.slots * 2) : Infinity;
  }

  /** An encoder's contacts now: new steps (+ one way, − the other) become four changes each, CW DT first. */
  private encoderAt(id: string, t: number): { a: boolean; b: boolean } {
    const e = this.encoders.get(id) ?? { steps: 0, phases: [], a: false, b: false };
    const want = Math.round(this.parts[id]?.steps ?? 0);
    let at = Math.max(t, e.phases.at(-1)?.[0] ?? t);
    for (; e.steps !== want; e.steps += Math.sign(want - e.steps)) {
      const cw = want > e.steps;
      for (const [a, b] of (cw ? [[false, true], [true, true], [true, false], [false, false]] : [[true, false], [true, true], [false, true], [false, false]]) as [boolean, boolean][]) {
        at += ENCODER.phaseUs;
        e.phases.push([at, a, b]);
      }
    }
    while (e.phases.length && e.phases[0]![0] <= t) [, e.a, e.b] = e.phases.shift()!;
    this.encoders.set(id, e);
    return { a: e.a, b: e.b };
  }
  /** Each HC-SR04's echo (µs from, to) after its trigger's last pulse, and when its trigger last went high. */
  private readonly echoes = new Map<string, { from: number; to: number; rise?: number }>();
  private traceSeen = 0;

  /** HC-SR04 triggers (M6.4): a pin's pulse of ≥ 8 µs on Trig, from the pins' trace (when it rose and fell, whenever
   *  the circuit is next looked at), starts an echo 460 µs after it falls, 58 µs per cm long. */
  private readonly clocks = new Map<string, Ds1302>();
  private readonly levels = new Map<string, number>();   // each output pin's last level, as the trace goes

  /** A DS1302 part's chip, made the first time: it starts at the laptop's local time (its coin cell kept it). */
  private ds1302(id: string): Ds1302 {
    let c = this.clocks.get(id);
    if (!c) {
      const d = new Date();
      c = new Ds1302(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds()), this.now());
      this.clocks.set(id, c);
    }
    return c;
  }

  private readonly tms = new Map<string, Tm1637>();
  private readonly mxs = new Map<string, Max7219>();
  private readonly readers = new Map<string, Mfrc522>();
  private readonly tags = new Map<string, MifareTag[]>();
  /** The tag held to a reader now (its Inputs card, a script's input `position`: 0 none, 1 the card, 2 the key fob),
   *  each the same tag through the run — what was written to it stays. */
  private tagAt(id: string): MifareTag | undefined {
    let t = this.tags.get(id);
    if (!t) this.tags.set(id, (t = RFID_TAGS.map((x) => new MifareTag(x.uid))));
    const n = Math.round(this.parts[id]?.position ?? 0);
    return n >= 1 && n <= t.length ? t[n - 1] : undefined;
  }
  private reader(id: string): Mfrc522 { let r = this.readers.get(id); if (!r) this.readers.set(id, (r = new Mfrc522(() => this.tagAt(id)))); return r; }
  private tm(id: string): Tm1637 { let t = this.tms.get(id); if (!t) this.tms.set(id, (t = new Tm1637())); return t; }
  /** Each NeoPixel's LEDs (M7 slice 3), from its first frame; dark again when it loses its power. */
  private readonly strips = new Map<string, NeoPixels>();
  private strip(id: string): NeoPixels {
    let s = this.strips.get(id);
    if (!s) this.strips.set(id, (s = new NeoPixels(neopixelCount(this.spec.parts.find((p) => p.id === id)?.props))));
    return s;
  }
  /** The board supply a NeoPixel's 5V is on, and its volts (its LEDs' current is the same from 3.5 to 5 V: it is set
   *  as a load at the supply's own volts, so a supply that saturates doesn't change what they ask). */
  private supplyOf(id: string): { pin: string; volts: number; limitA: number } | undefined {
    const net = this.connectivity.netOf(`${id}.vcc`);
    const src = this.netlist.devices.find((d) => d.kind === 'source' && d.id.startsWith('supply:') && d.plus === net) as { id: string; volts: number } | undefined;
    const pin = src?.id.slice(7);
    const s = this.spec.board?.data.supplies.find((x) => x.pin === pin);
    return src && s ? { pin: s.pin, volts: src.volts, limitA: s.maxMa / 1000 } : undefined;
  }

  /** A bitstream out of a pin (M7 slice 3: neopixel.py's write(), the micro:bit's ws2812_write): read by each powered
   *  NeoPixel whose DIN is on the pin's net — its LEDs take their bytes, the rest goes out of its DOUT to the next. */
  bitstream(pin: string, timing: number[], bytes: number[]): void {
    this.update();
    const into = (net: string | undefined, data: number[], depth: number) => {
      if (net === undefined || !data.length || depth > 32) return;
      for (const part of this.spec.parts) {
        if (part.type !== 'neopixel' || !this.powered.get(part.id) || this.connectivity.netOf(`${part.id}.din`) !== net) continue;
        into(this.connectivity.netOf(`${part.id}.dout`), this.strip(part.id).take(data), depth + 1);
      }
    };
    into(this.netOfPin.get(pin), ws2812Bits(timing, bytes), 0);
    this.update();
    this.traceDisplays();
  }

  private mx(id: string): Max7219 { let m = this.mxs.get(id); if (!m) this.mxs.set(id, (m = new Max7219())); return m; }

  /** A pin changed (M7 slice 2): a TM1637 on its net reads CLK and DIO as they are now (its pull-ups hold an
   *  undriven one high); a MAX7219 whose CS (LOAD) it is takes its 16 bits as it rises. */
  private displayEdges(pin: string, net: string | undefined, before: number | undefined, level: number): void {
    if (net === undefined) return;
    const pinOf = (id: string, leg: string) => this.pinOfNet.get(this.connectivity.netOf(`${id}.${leg}`) ?? '');
    for (const part of this.spec.parts) {
      if (!this.powered.get(part.id)) continue;
      const on = (leg: string) => this.connectivity.netOf(`${part.id}.${leg}`) === net;
      if (part.type === 'tm1637' && (on('clk') || on('dio'))) {
        const lv = (leg: string) => { const k = pinOf(part.id, leg); return k === undefined ? 1 : k === pin ? level : this.levels.get(k) ?? 1; };
        this.tm(part.id).lines(lv('clk'), lv('dio'));
      } else if (part.type === 'max7219' && on('cs') && before === 0 && level === 1) {
        this.mx(part.id).load();
      } else if (part.type === 'rc522') {   // its SDA is its SPI chip select (NSS); RST rising resets it
        if (on('sda') && before === 1 && level === 0) this.reader(part.id).select();
        if (on('rst') && before === 0 && level === 1) this.reader(part.id).hardReset();
      }
    }
  }

  /** Bytes clocked out on SPI (M7 slice 2): into each powered MAX7219 whose CLK and DIN are on SCK's and MOSI's nets,
   *  and on down a chain, from each one's DOUT into the next one's DIN. */
  spi(sck: string, mosi: string, miso: string, bytes: number[]): number[] | undefined {
    this.update();
    const sckNet = this.netOfPin.get(sck);
    const mosiNet = this.netOfPin.get(mosi);
    if (sckNet === undefined || mosiNet === undefined) return undefined;
    // an RC522 on these nets answers each byte on MISO (M7)
    let answer: number[] | undefined;
    for (const part of this.spec.parts) {
      if (part.type !== 'rc522' || !this.powered.get(part.id)) continue;
      if (this.connectivity.netOf(`${part.id}.sck`) !== sckNet || this.connectivity.netOf(`${part.id}.mosi`) !== mosiNet) continue;
      const r = this.reader(part.id);
      const out = bytes.map((b) => r.transfer(b));
      if (miso && this.connectivity.netOf(`${part.id}.miso`) === this.netOfPin.get(miso)) answer = out;
    }
    const into = (dinNet: string | undefined, data: number[], depth: number) => {
      if (dinNet === undefined || !data.length || depth > 16) return;
      for (const part of this.spec.parts) {
        if (part.type !== 'max7219' || !this.powered.get(part.id)) continue;
        if (this.connectivity.netOf(`${part.id}.din`) !== dinNet || this.connectivity.netOf(`${part.id}.clk`) !== sckNet) continue;
        const out: number[] = [];
        for (const b of data) { const o = this.mx(part.id).clockIn(b); if (o !== undefined) out.push(o); }
        into(this.connectivity.netOf(`${part.id}.dout`), out, depth + 1);
      }
    };
    into(mosiNet, bytes, 0);
    return answer;
  }

  /** The displays' pictures, made again only when what they show changed (an I²C write needs no solve). */
  private readonly shown = new Map<string, { key: string; view: PartView }>();

  traceDisplays(): void {
    const t = this.now();
    for (const part of this.spec.parts) {
      const id = part.id;
      if (part.type === 'neopixel') { this.tracePixels(t, id); continue; }
      if (!isDisplay(part.type)) continue;
      const powered = this.powered.get(id) ?? false;
      const supply = this.volts_(id, 'vcc') - this.volts_(id, 'gnd');
      const chip = part.type === 'tm1637' ? this.tms.get(id) : part.type === 'max7219' ? this.mxs.get(id) : this.chips.get(id) as Ssd1306 | Lcd1602 | undefined;
      const version = powered ? (chip?.version ?? 0) * 2 + 1 : 0;
      const key = `${version}:${part.type === 'lcd1602' ? supply < DISPLAYS.lcd1602.minVolts : ''}`;
      const was = this.shown.get(id);
      if (was?.key === key) { this.setView(t, id, was.view); continue; }
      const view = this.displayView(part.type, powered, supply, chip);
      this.shown.set(id, { key, view });
      this.setView(t, id, view);
    }
  }

  /** The serial parts' views (M7 slice 5), made again when anything on their lines changed. */
  private serialSeen = -1;
  private traceSerial(): void {
    const t = this.now();
    this.serial.tick(t);
    if (this.serial.version === this.serialSeen) return;
    this.serialSeen = this.serial.version;
    for (const [id, line] of this.serial.lines) {
      const on = this.powered.get(id) ?? false;
      if (line.type === 'usb-serial') {
        this.setView(t, id, { kind: 'serial', text: line.text, sent: line.sent, received: line.received, baud: this.serial.framingOf(id).baud, ...(line.heardBaud ? { heardBaud: line.heardBaud } : {}) });
      } else if (line.type === 'hc05') {
        this.setView(t, id, { kind: 'bluetooth', on, connected: on && line.connected, messages: line.messages.map((m) => ({ ...m })), sent: line.sent, received: line.received });
      } else {
        this.setView(t, id, { kind: 'gps', on, ...line.gps, sent: line.sent });
      }
    }
  }

  private tracePixels(t: number, id: string): void {
    const powered = this.powered.get(id) ?? false;
    const s = this.strips.get(id);
    const key = `${powered}:${s?.version ?? -1}`;
    const was = this.shown.get(id);
    if (was?.key === key) { this.setView(t, id, was.view); return; }
    const sup = this.supplyOf(id);
    const n = neopixelCount(this.spec.parts.find((p) => p.id === id)?.props);
    const lit = s?.lit() ?? 0;
    const amps = powered ? s?.amps() ?? n * NEOPIXEL.idleA : 0;
    const view: PartView = { kind: 'pixels', on: powered, pixels: lit ? s!.hex() : '', lit, amps: Math.round(amps * 1e4) / 1e4, ...(sup ? { from: sup.pin, limitA: sup.limitA } : {}) };
    this.shown.set(id, { key, view });
    this.setView(t, id, view);
  }

  private displayView(type: string, powered: boolean, supply: number, chip: Ssd1306 | Lcd1602 | Tm1637 | Max7219 | undefined): PartView {
    if (type === 'ssd1306') {
      const o = powered ? chip as Ssd1306 | undefined : undefined;
      const lit = o?.lit() ?? 0;
      return { kind: 'oled', on: o?.on ?? false, lit, contrast: o?.contrast ?? 0x7f, frame: lit ? Array.from(o!.frame(), (b) => b.toString(16).padStart(2, '0')).join('') : '' };
    }
    if (type === 'lcd1602') {
      const l = powered ? chip as Lcd1602 | undefined : undefined;
      const cg = l?.cgram.some((b) => b) ? Array.from(l.cgram, (b) => b.toString(16).padStart(2, '0')).join('') : undefined;
      return { kind: 'lcd', on: l?.on ?? false, backlight: l?.backlight ?? false, faint: supply < DISPLAYS.lcd1602.minVolts, rows: l?.rows() ?? [' '.repeat(16), ' '.repeat(16)], ...(cg ? { cgram: cg } : {}) };
    }
    if (type === 'tm1637') {
      const d = powered ? chip as Tm1637 | undefined : undefined;
      const segments = d ? d.grid.slice(0, 4) : [0, 0, 0, 0];
      return { kind: 'digits', on: d?.on ?? false, brightness: d?.brightness ?? 0, segments, text: digitsText(segments) };
    }
    const m = powered ? chip as Max7219 | undefined : undefined;
    return { kind: 'matrix', on: m?.on ?? false, intensity: m?.intensity ?? 0, rows: m ? [...m.rows] : [0, 0, 0, 0, 0, 0, 0, 0], lit: m?.lit() ?? 0, amps: Math.round((m?.amps() ?? 0) * 1e4) / 1e4 };
  }

  private updateEchoes(): void {
    const trace = this.pins.trace;
    for (; this.traceSeen < trace.length; this.traceSeen++) {
      const [t, pin, level] = trace[this.traceSeen]!;
      const before = this.levels.get(pin);
      this.levels.set(pin, level);
      const net = this.netOfPin.get(pin);
      if (before !== level) this.displayEdges(pin, net, before, level);
      // DS1302s (M6.5b): CE and SCLK edges, I/O as the program drives it then
      for (const part of this.spec.parts) {
        if (part.type !== 'ds1302' || !this.powered.get(part.id) || before === level) continue;
        const on = (leg: string) => this.connectivity.netOf(`${part.id}.${leg}`) === net;
        if (on('rst')) this.ds1302(part.id).chipEnable(level === 1);
        else if (on('clk')) {
          const dat = this.pinOfNet.get(this.connectivity.netOf(`${part.id}.dat`) ?? '');
          this.ds1302(part.id).clock(level === 1, dat === undefined ? 0 : this.levels.get(dat) ?? 0, t);
        }
      }
      for (const part of this.spec.parts) {
        if (part.type !== 'hc-sr04' || this.connectivity.netOf(`${part.id}.trig`) !== net) continue;
        const e = this.echoes.get(part.id) ?? { from: -1, to: -1 };
        if (level) e.rise = t;
        else if (e.rise !== undefined && t - e.rise >= SENSORS['hc-sr04'].minTrigUs && this.powered.get(part.id)) {
          e.from = t + SENSORS['hc-sr04'].delayUs;
          e.to = e.from + echoUs(this.parts[part.id]?.cm ?? SENSOR_START.cm);
          e.rise = undefined;
        }
        this.echoes.set(part.id, e);
      }
    }
  }

  private readonly chips = new Map<string, I2CDevice>();

  /** The parts that answer on the I²C bus of these pins (M6.4b), by address: wired to both, powered. */
  i2c(sda: string, scl: string): Map<number, I2CDevice> {
    this.update();
    const out = new Map<number, I2CDevice>();
    const sdaNet = this.netOfPin.get(sda);
    const sclNet = this.netOfPin.get(scl);
    if (sdaNet === undefined || sclNet === undefined) return out;
    for (const part of this.spec.parts) {
      if (!I2C_CHIPS.has(part.type) || !this.powered.get(part.id)) continue;
      if (this.connectivity.netOf(`${part.id}.sda`) !== sdaNet || this.connectivity.netOf(`${part.id}.scl`) !== sclNet) continue;
      const above = (leg: string) => this.volts_(part.id, leg) - this.volts_(part.id, 'gnd');
      const chip = this.chipOf(part.id, part.type);
      const address = part.type === 'mpu6050' ? (above('ad0') >= 1.5 ? MPU6050.address + 1 : MPU6050.address)
        : part.type === 'bmp280' ? (above('sdo') >= 1.5 ? 0x77 : 0x76)
        : part.type === 'vl53l0x' ? 0x29 : part.type === 'max30102' ? 0x57
        : part.type === 'ssd1306' ? Number(part.props?.address ?? DISPLAYS.ssd1306.addresses[0])
        : part.type === 'lcd1602' ? Number(part.props?.address ?? DISPLAYS.lcd1602.addresses[0]) : 0x48;
      if (part.type === 'vl53l0x' && above('xshut') < 1.5) continue;   // XSHUT low: shut down
      out.set(address, chip);
    }
    return out;
  }

  private volts_(id: string, leg: string): number {
    return this.solution?.volts[this.connectivity.netOf(`${id}.${leg}`) ?? ''] ?? 0;
  }

  /** A part's I²C chip, made the first time it is asked for; it keeps its registers through the run. */
  private chipOf(id: string, type: string): I2CDevice {
    let chip = this.chips.get(id);
    if (chip) return chip;
    const s = () => this.parts[id] ?? {};
    const above = (leg: string) => this.volts_(id, leg) - this.volts_(id, 'gnd');
    if (type === 'pcf8591') chip = new Pcf8591(() => ({ ain: [above('ain0'), above('ain1'), above('ain2'), above('ain3')], vref: above('vcc') }));
    else if (type === 'vl53l0x') chip = new Vl53l0x(() => this.now(), () => (s().cm ?? SENSOR_START.cm) * 10);
    else if (type === 'max30102') chip = new Max30102(() => this.now(), () => ({ finger: (s().position ?? 1) >= 0.5, bpm: s().bpm ?? 72, spo2: s().spo2 ?? 98 }));
    else if (type === 'ssd1306') chip = new Ssd1306();
    else if (type === 'lcd1602') chip = new Lcd1602();
    else if (type === 'bmp280') chip = new Bmp280(() => ({ celsius: s().celsius ?? SENSOR_START.celsius, hpa: s().hpa ?? 1013.25 }));
    else chip = new Mpu6050(() => ({ tiltx: s().tiltx ?? 0, tilty: s().tilty ?? 0, celsius: s().celsius ?? SENSOR_START.celsius }));
    this.chips.set(id, chip);
    return chip;
  }

  private readonly wires = new Map<string, OneWireBus>();
  private readonly oneWireDevices = new Map<string, OneWireDevice>();

  /** The 1-Wire bus on a pin's net (M6.5b): the DS18B20s on it that are powered. */
  oneWire(pin: string): OneWireBus {
    const net = this.netOfPin.get(pin) ?? `?${pin}`;
    let bus = this.wires.get(net);
    if (!bus) {
      bus = new OneWireBus(() => {
        this.update();
        return this.spec.parts.filter((p) => p.type === 'ds18b20' && this.powered.get(p.id) && this.connectivity.netOf(`${p.id}.out`) === net)
          .map((p) => {
            let d = this.oneWireDevices.get(p.id);
            if (!d) {
              const serial = [...p.id].reduce((h, ch) => (Math.imul(h, 31) + ch.charCodeAt(0)) >>> 0, 0x5eed);
              d = new Ds18b20([0, 8, 16, 24].map((s) => (serial >> s) & 0xff).concat([0x12, 0x00]), () => this.parts[p.id]?.celsius ?? SENSOR_START.celsius);
              this.oneWireDevices.set(p.id, d);
            }
            return d;
          });
      }, () => this.now());
      this.wires.set(net, bus);
    }
    return bus;
  }

  /** What the DHT on a pin sends (M6.4): its 5 bytes as hex, or undefined when none answers (not there, not powered). */
  dhtRead(pin: string): string | undefined {
    this.update();
    const net = this.netOfPin.get(pin);
    const part = this.spec.parts.find((p) => p.type === 'dht' && net !== undefined && this.connectivity.netOf(`${p.id}.out`) === net);
    if (!part || !this.powered.get(part.id)) return undefined;
    const s = this.parts[part.id] ?? {};
    return dhtBytes(String(part.props?.kind ?? 'DHT22'), s.celsius ?? SENSOR_START.celsius, s.humidity ?? SENSOR_START.humidity)
      .map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  /** Works out what drives each sensor module's OUT (M6.3) from its input and its supply in the last solve; true if
   *  any changed (the circuit must be solved again). */
  private updateDrives(): boolean {
    let changed = false;
    const t = this.now();
    for (const part of this.spec.parts) {   // a display works from its chip's lowest supply (M7 slice 2); the RFID reader too
      const need = isDisplay(part.type) ? DISPLAYS[part.type].workVolts : part.type === 'rc522' ? RC522.minVolts : part.type === 'neopixel' ? NEOPIXEL.minVolts
        : part.type === 'hc05' || part.type === 'gps' ? SERIAL_PARTS[part.type].minVolts : part.type === 'usb-serial' ? 0 : undefined;
      if (need === undefined) continue;
      const powered = this.volts_(part.id, 'vcc') - this.volts_(part.id, 'gnd') >= need;
      this.powered.set(part.id, powered);
      // a NeoPixel's chips forget their colours as their power fails (it browns out: they draw only their own again)
      if (!powered && part.type === 'neopixel') this.strips.delete(part.id);
    }
    // an HC-05's STATE is high while a phone is connected (M7 slice 5)
    for (const part of this.spec.parts) {
      if (part.type !== 'hc05') continue;
      const s = (this.parts[part.id] ??= {});
      const on = this.serial.connected(part.id);
      const drives = { state: on ? { volts: 3.3, ohms: 100 } : { volts: 0, ohms: 100_000 } };
      if (JSON.stringify(s.drives) !== JSON.stringify(drives)) { s.drives = drives; changed = true; }
    }
    this.updateEchoes();
    for (const part of this.spec.parts) {
      if (!isSensor(part.type)) continue;
      const s = (this.parts[part.id] ??= {});
      let motion = false;
      if (part.type === 'pir') {
        const hold = this.pirHold.get(part.id);
        if (s.pressed) this.pirHold.set(part.id, Infinity);
        else if (hold === Infinity) this.pirHold.set(part.id, t + SENSORS.pir.holdS * 1e6);
        motion = (this.pirHold.get(part.id) ?? -1) > t;
      }
      const v = (leg: string) => this.solution?.volts[this.connectivity.netOf(`${part.id}.${leg}`) ?? ''] ?? 0;
      const supply = v('vcc') - v('gnd');
      this.powered.set(part.id, supply >= minVolts(part.type, part.props ?? {}));
      const type: string = part.type;
      if (type === 'ds1302') {   // DAT while it sends — through ≈ 1 kΩ: a driver that still drives I/O for the moment
        // between the command's last clock and its switch to input (as they all do) only meets a few mA
        const bit = supply >= minVolts('ds1302') ? this.clocks.get(part.id)?.io() : undefined;
        const drives = { dat: bit === undefined ? { volts: 0, ohms: 1e6 } : { volts: bit ? supply : 0, ohms: 1000 } };
        if (JSON.stringify(s.drives) === JSON.stringify(drives)) continue;
        s.drives = drives;
        changed = true;
        continue;
      }
      if (type === 'pcf8591') {   // AOUT from its DAC
        const chip = this.chips.get(part.id) as Pcf8591 | undefined;
        const volts = supply >= minVolts('pcf8591') ? chip?.aout(supply) : undefined;
        const drives = { aout: volts === undefined ? { volts: 0, ohms: 1e6 } : { volts, ohms: 100 } };
        if (JSON.stringify(s.drives) === JSON.stringify(drives)) continue;
        s.drives = drives;
        changed = true;
        continue;
      }
      if (type in MODULES) {
        const enc = type === 'rotary-encoder' ? this.encoderAt(part.id, t) : {};
        const half = type === 'speed-sensor' ? this.pulseHalfUs(part.id) : Infinity;
        const pulse = half < Infinity && Math.floor(t / half) % 2 === 1;
        const drives = moduleDrives(type, { pressed: s.pressed, position: s.position, pulse, ...enc }, supply);
        if (JSON.stringify(s.drives) === JSON.stringify(drives)) continue;
        s.drives = drives;
        changed = true;
        continue;
      }
      const echo = this.echoes.get(part.id);
      const drive = sensorDrive(part.type, part.props ?? {}, { motion, position: s.position, celsius: s.celsius, echo: !!echo && t >= echo.from && t < echo.to }, supply);
      if (s.drive && Math.abs(s.drive.volts - drive.volts) < 1e-6 && s.drive.ohms === drive.ohms) continue;
      s.drive = drive;
      changed = true;
    }
    return changed;
  }

  /** A servo draws more while it turns (M7): true if one started or stopped turning (solve again). */
  private updateLoads(): boolean {
    let changed = false;
    for (const part of this.spec.parts) {
      if (part.type === 'max7219') {   // it draws what its lit dots take (M7 slice 2), as on 5 V
        const m = this.mxs.get(part.id);
        const s = (this.parts[part.id] ??= {});
        const ohms = m && this.powered.get(part.id) ? Math.round(5 / m.amps()) : undefined;
        if (s.ohms !== ohms) {
          if (ohms === undefined) delete s.ohms;
          else s.ohms = ohms;
          changed = true;
        }
        continue;
      }
      if (part.type === 'neopixel') {   // it draws what its LEDs' colours take (M7 slice 3)
        const strip = this.strips.get(part.id);
        const s = (this.parts[part.id] ??= {});
        const ohms = strip && this.powered.get(part.id) ? Math.round((this.supplyOf(part.id)?.volts ?? 5) / strip.amps() * 1000) / 1000 : undefined;
        if (s.ohms !== ohms) {
          if (ohms === undefined) delete s.ohms;
          else s.ohms = ohms;
          changed = true;
        }
        continue;
      }
      if (part.type !== 'servo') continue;
      const turning = this.arm(part.id).turning;
      const s = (this.parts[part.id] ??= {});
      const ohms = turning ? SERVO.turningOhms : undefined;
      if (s.ohms !== ohms) {
        if (ohms === undefined) delete s.ohms;
        else s.ohms = ohms;
        changed = true;
      }
      if (turning) this.turning.add(part.id);
      else this.turning.delete(part.id);
    }
    return changed;
  }

  private readonly previous = new Map<number, Solution>();   // the last solution of each on / off combination

  /** Solves if anything changed, then lets the pins see new input levels (edges, IRQs). PWM pins are averaged
   *  over their on and off states (M3.3): the circuit is solved for each combination of the PWM pins high and low
   *  and the answers weighted by the duties — an LED on 50 % carries half its current (on a steady duty × 3.3 V it
   *  would stay below its forward voltage). Faults are found in every combination: the peaks are what burn. */
  update(): void {
    this.traceSerial();
    if (this.updateParts()) this.dirty = true;
    if (this.updateDrives()) this.dirty = true;
    if (this.updateLoads()) this.dirty = true;
    if (!this.dirty) {
      if (this.turning.size) this.traceViews();
      return;
    }
    // a sensor's supply comes from the solve, its output goes into it: solve again while a sensor changes (twice at
    // most — supplies don't depend on what sensors output)
    for (let i = 0; i < 3 && this.dirty; i++) {
      this.dirty = false;
      this.solveOnce();
      if (this.updateDrives()) this.dirty = true;
    }
    this.dirty = false;
    this.noteFaults();
    for (const pin of this.netOfPin.keys()) this.pins.recheck(pin);
    this.traceViews();
  }

  private solveOnce(): void {
    const state = this.state();
    const pwm: [string, number][] = [];
    for (const [label, p] of Object.entries(state.pins!)) {
      if (p.mode !== 'pwm') continue;
      if (p.duty <= 0 || p.duty >= 1) state.pins![label] = { mode: 'out', value: p.duty >= 1 ? 1 : 0 };
      else pwm.push([label, p.duty]);
    }
    if (pwm.length === 0 || pwm.length > MAX_PWM_AVERAGED) {
      // more PWM pins than that: their DC average (duty × voltage) — fine for resistive loads
      this.solution = solve(this.netlist, state, this.previous.get(-1));
      this.previous.set(-1, this.solution);
      this.combos = [{ mask: 0, weight: 1, volts: this.solution.volts }];
      this.pwmPins = [];
      this.faults = findFaults(this.spec, this.netlist, this.solution, state, this.connectivity);
    } else {
      this.averagePwm(state, pwm);
    }
  }

  private noteFaults(): void {
    for (const f of this.faults) {
      const key = `${f.kind}:${f.on}`;
      const before = this.seen.get(key);
      if (!before || (f.amps ?? 0) > (before.amps ?? 0) || Math.abs(f.volts ?? 0) > Math.abs(before.volts ?? 0)) this.seen.set(key, f);
      if (f.severity === 'damage' && !this.damage) {
        this.damage = f;
        this.onDamage?.(f);
      }
    }
  }

  /** Every LED (the board's own too) and servo, as the window draws them. */
  partStates(): Record<string, PartView> {
    this.update();
    return Object.fromEntries(this.views);
  }

  private traceViews(): void {
    const t = this.now();
    for (const d of this.netlist.devices) {
      if (d.kind !== 'led') continue;
      const amps = Math.max(0, this.solution!.amps[d.id] ?? 0);
      this.setView(t, d.id, { kind: 'led', amps, brightness: Math.min(1, amps / LED.ratedA) });
    }
    const across = (id: string, a: string, b: string) => this.volts_(id, a) - this.volts_(id, b);
    const mA = (a: number) => Math.round(Math.abs(a) * 1000) / 1000;
    this.traceDisplays();
    for (const part of this.spec.parts) {
      const id = part.id;
      switch (part.type) {
        case 'servo': this.setView(t, id, this.servo(id)); continue;
        case 'motor': {
          const u = across(id, '+', '-');
          const rpm = Math.abs(u) >= MOTOR.startVolts ? Math.round(Math.abs(u) * MOTOR.rpmPerVolt) : 0;
          this.setView(t, id, { kind: 'motor', rpm, direction: rpm ? (u > 0 ? 1 : -1) : 0, amps: mA(this.solution!.amps[id] ?? 0) });
          continue;
        }
        case 'pump':
          this.setView(t, id, { kind: 'pump', running: Math.abs(across(id, '+', '-')) >= PUMP.startVolts, amps: mA(this.solution!.amps[id] ?? 0) });
          continue;
        case 'relay': this.setView(t, id, { kind: 'relay', on: (this.solution!.amps[`${id}:coil`] ?? 0) > 0.02 }); continue;
        case 'l9110s': case 'l298n': {
          const way = (a: string, b: string): -1 | 0 | 1 => { const u = across(id, a, b); return u > 0.5 ? 1 : u < -0.5 ? -1 : 0; };
          const [a, b] = part.type === 'l9110s' ? [way('a1', 'a2'), way('b1', 'b2')] : [way('out1', 'out2'), way('out3', 'out4')];
          this.setView(t, id, { kind: 'driver', a, b });
          continue;
        }
        case 'stepper': this.setView(t, id, this.stepper(id)); continue;
        case 'buzzer-module': this.setView(t, id, this.buzzer(this.connectivity.netOf(`${id}.vcc`) ?? '', `${id}#c`, true, BUZZER_MODULE.minVolts)); continue;
        case 'power-supply': {
          const a = this.solution!.amps;
          this.setView(t, id, { kind: 'supply', on: part.props?.on !== false, top: mA(a[`${id}:top`] ?? 0), bottom: mA(a[`${id}:bottom`] ?? 0) });
          continue;
        }
      }
      if (part.type === 'buzzer') {
        this.setView(t, part.id, this.buzzer(this.connectivity.netOf(`${part.id}.+`) ?? '', this.connectivity.netOf(`${part.id}.-`) ?? '', part.props?.kind === 'passive'));
      }
      if (part.type === 'ds1302') { this.setView(t, part.id, { kind: 'clock', time: this.ds1302(part.id).timeText(t) }); continue; }
      if (isDisplay(part.type)) continue;
      if (part.type === 'rc522') {
        const n = Math.round(this.parts[part.id]?.position ?? 0);
        const r = this.readers.get(part.id);
        const tag = RFID_TAGS[n - 1];
        this.setView(t, part.id, {
          kind: 'rfid', antenna: !!r && !!this.powered.get(part.id) && r.antenna, tag: tag ? n : 0,
          uid: tag ? tag.uid.map((b) => b.toString(16).padStart(2, '0').toUpperCase()).join(' ') : '', last: r?.last ?? '',
        });
        continue;
      }
      if (isSensor(part.type)) {
        const st = this.parts[part.id];
        const first = st?.drives ? Object.values(st.drives)[0] : st?.drive;
        const volts = Math.round((first?.volts ?? 0) * 100) / 100;
        this.setView(t, part.id, { kind: 'sensor', volts, powered: this.powered.get(part.id) ?? false });
      }
    }
  }

  /** A buzzer's sound from the voltage across it in each PWM combination (M6.2): an active one sounds at its own
   *  pitch for the part of the time it has ≥ 2 V (+ above −); a passive one at the frequency of the PWM pin that
   *  swings it most, as loud as the swing and the square wave's fundamental (sin π·duty) make it. */
  private buzzer(plus: string, minus: string, passive: boolean, minSwing: number = BUZZER.passive.minSwing): PartView {
    const across = (volts: Record<string, number>) => (volts[plus] ?? 0) - (volts[minus] ?? 0);
    const round = (v: number) => Math.round(v * 100) / 100;
    if (!passive) {
      const on = this.combos.reduce((t, c) => t + (across(c.volts) >= BUZZER.active.minVolts ? c.weight : 0), 0);
      return on > 0.005 ? { kind: 'buzzer', hz: BUZZER.active.hz, volume: round(Math.min(1, on)) } : { kind: 'buzzer', hz: 0, volume: 0 };
    }
    const base = this.combos.find((c) => c.mask === 0);
    let best: { swing: number; label: string } | undefined;
    this.pwmPins.forEach((label, i) => {
      const high = this.combos.find((c) => c.mask === 1 << i);
      if (!base || !high) return;
      const swing = Math.abs(across(high.volts) - across(base.volts));
      if (swing >= minSwing && (!best || swing > best.swing)) best = { swing, label };
    });
    const pwm = best && this.pins.pwmOf(this.keyOfLabel.get(best.label) ?? '');
    if (!best || !pwm || pwm.freq <= 0 || pwm.duty <= 0 || pwm.duty >= 1) return { kind: 'buzzer', hz: 0, volume: 0 };
    const volume = Math.min(1, best.swing / 3.3) * Math.sin(Math.PI * pwm.duty);
    return { kind: 'buzzer', hz: Math.round(pwm.freq), volume: round(volume) };
  }

  /** A servo's arm now (M7): it turns towards the angle of its pulses at its speed, while it has its 5 V. */
  private arm(id: string): { angle: number; powered: boolean; pulseUs?: number; turning: boolean } {
    const t = this.now();
    const v = (leg: string) => this.volts_(id, leg);
    const powered = this.solution !== undefined && v('vcc') - v('gnd') >= SERVO.minVolts;
    const pin = this.pinOfNet.get(this.connectivity.netOf(`${id}.signal`) ?? '');
    const pwm = pin === undefined ? undefined : this.pins.pwmOf(pin);
    const pulseUs = pwm && pwm.freq > 0 ? Math.round((pwm.duty / pwm.freq) * 1e6) : undefined;
    const a = this.servoArm.get(id) ?? { angle: SERVO.rest, at: t };
    let target: number | undefined;
    if (powered && pulseUs !== undefined && pulseUs >= SERVO.minUs * 0.8 && pulseUs <= SERVO.maxUs * 1.2) {
      target = Math.min(180, Math.max(0, ((pulseUs - SERVO.minUs) / (SERVO.maxUs - SERVO.minUs)) * 180));
      const step = (SERVO.degPerS * Math.max(0, t - a.at)) / 1e6;
      a.angle = Math.abs(target - a.angle) <= step ? target : a.angle + Math.sign(target - a.angle) * step;
    }
    a.at = t;
    this.servoArm.set(id, a);
    return { angle: a.angle, powered, ...(pulseUs !== undefined ? { pulseUs } : {}), turning: target !== undefined && Math.abs(target - a.angle) > 0.5 };
  }

  private servo(id: string): PartView {
    const { angle, powered, pulseUs } = this.arm(id);
    return { kind: 'servo', angle: Math.round(angle), powered, ...(pulseUs !== undefined ? { pulseUs } : {}) };
  }

  /** A stepper's coils as they are now, and its rotor: it follows the coils a half step or a full step at a time
   *  (either way); a jump further than that it can't follow. */
  private stepper(id: string): PartView {
    const coils = [...'ABCD'].filter((c) => (this.solution!.amps[`${id}:${c}`] ?? 0) > STEPPER.onA).join('');
    const r = this.rotors.get(id) ?? { steps: 0 };
    const place = HALF_STEPS.indexOf(coils);
    if (place >= 0) {
      if (r.at === undefined) r.at = place;
      else {
        let d = (place - r.at + 8) % 8;
        if (d > 4) d -= 8;
        if (Math.abs(d) <= 2) {
          r.steps += d;
          r.at = place;
        }
      }
    }
    this.rotors.set(id, r);
    return { kind: 'stepper', steps: r.steps, coils };
  }

  /** Records a part's new state when it differs from the last one (LEDs to 1 %, servos to 1°). */
  private setView(t: number, id: string, view: PartView): void {
    const before = this.views.get(id);
    this.views.set(id, view);
    const same = before && (view.kind === 'led' && before.kind === 'led'
      ? Math.round(view.brightness * 100) === Math.round(before.brightness * 100)
      : JSON.stringify(view) === JSON.stringify(before));
    if (same) return;
    const entry: PartTraceEntry = [t, id, view];
    this.partTrace.push(entry);
    this.onChange?.(entry);
  }

  private averagePwm(state: SimState, pwm: [string, number][]): void {
    const volts: Record<string, number> = {};
    const amps: Record<string, number> = {};
    const faults = new Map<string, Fault>();
    let converged = true;
    let iterations = 0;
    this.combos = [];
    this.pwmPins = pwm.map(([label]) => label);
    for (let mask = 0; mask < 1 << pwm.length; mask++) {
      let weight = 1;
      const pins = { ...state.pins };
      pwm.forEach(([label, duty], i) => {
        const on = (mask >> i) & 1;
        weight *= on ? duty : 1 - duty;
        pins[label] = { mode: 'out', value: on ? 1 : 0 };
      });
      const combo = { ...state, pins };
      const sol = solve(this.netlist, combo, this.previous.get(mask));
      this.previous.set(mask, sol);
      converged &&= sol.converged;
      iterations += sol.iterations;
      this.combos.push({ mask, weight, volts: sol.volts });
      for (const [k, v] of Object.entries(sol.volts)) volts[k] = (volts[k] ?? 0) + weight * v;
      for (const [k, v] of Object.entries(sol.amps)) amps[k] = (amps[k] ?? 0) + weight * v;
      for (const f of findFaults(this.spec, this.netlist, sol, combo, this.connectivity)) {
        const key = `${f.kind}:${f.on}`;
        const before = faults.get(key);
        if (!before || (f.amps ?? 0) > (before.amps ?? 0)) faults.set(key, f);
      }
    }
    this.solution = { volts, amps, converged, iterations };
    this.faults = [...faults.values()];
  }

  /** A device's current (A), averaged over PWM (an LED's, a resistor's …); 0 if it carries none. */
  amps(id: string): number {
    this.update();
    return this.solution!.amps[id] ?? 0;
  }

  /** The solved voltage of a header pin's net. */
  volts(pin: string): number {
    this.update();
    const net = this.netOfPin.get(pin)!;
    return this.solution!.volts[net] ?? 0;
  }

  /** What the program's pins and the parts' inputs are now, for the solver. */
  private state(): SimState {
    const pins: Record<string, PinState> = {};
    for (const [key, label] of this.labelOfPin) {
      const st = this.pins.engineState(key);
      if (st) pins[label] = st;
    }
    return { pins, parts: { ...this.parts } };
  }
}
