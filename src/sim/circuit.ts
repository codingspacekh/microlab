import type { BoardData } from '@lib/boards';
import { Bmp280, Max30102, Vl53l0x, BUZZER, dhtBytes, Ds1302, Ds18b20, OneWireBus, type OneWireDevice, ENCODER, Pcf8591, moduleDrives, MODULES, SPEED, Mpu6050, MPU6050, type I2CDevice, echoUs, findFaults, isSensor, LED, minVolts, SENSORS, SENSOR_START, sensorDrive, solve, toNetlist, type CircuitSpec, type Connectivity, type Fault, type Netlist, type PartState, type PinState, type SimState, type Solution } from '@lib/circuit';
import type { Control } from './control';
import type { PinBank } from './pins';

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
}

/** Up to this many PWM pins are averaged exactly (2^n solves: an RGB LED is 3); beyond, their DC average. */
const MAX_PWM_AVERAGED = 4;

/** What the window draws for a part (M3.4, §1.7 behaviours). */
export type PartView =
  /** brightness = current / the LED's 20 mA rating, 0–1 (the window decides how a glow looks). */
  | { kind: 'led'; amps: number; brightness: number }
  /** angle 0–180° from the pulse width (0.5 ms → 0°, 2.5 ms → 180°, SG90); it moves only with ≥ 4.5 V across it. */
  | { kind: 'servo'; angle: number; powered: boolean; pulseUs?: number }
  /** What a buzzer sounds like (M6.2): its pitch in Hz (0: silent) and its loudness 0–1. */
  | { kind: 'buzzer'; hz: number; volume: number }
  /** A sensor module's output (M6.3): its volts, and whether its supply is enough for it to work. */
  | { kind: 'sensor'; volts: number; powered: boolean };

/** [µs, part id, its new state] — one entry per change, as the window would be told. */
export type PartTraceEntry = [number, string, PartView];

/** The live input slots a part takes (sim-client's SLOT): 'pressed:btn1', 'celsius:dht1' … */
/** Parts that answer on I²C (M6.4b, M6.5b). */
const I2C_CHIPS = new Set(['mpu6050', 'pcf8591', 'bmp280', 'vl53l0x', 'max30102']);

const LIVE_KINDS = new Set(['pressed', 'position', 'lux', 'celsius', 'humidity', 'cm', 'tiltx', 'tilty', 'x', 'y', 'steps', 'rpm', 'hpa', 'bpm', 'spo2']);

const SERVO = { minUs: 500, maxUs: 2500, minVolts: 4.5, rest: 90 };

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
  private readonly servoAngle = new Map<string, number>();
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
      changed = true;
    }
    if (this.live) changed = this.readLive(this.live) || changed;
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

  /** An encoder's contacts now: new steps (+ one way, − the other) become four changes each, CW CLK first. */
  private encoderAt(id: string, t: number): { a: boolean; b: boolean } {
    const e = this.encoders.get(id) ?? { steps: 0, phases: [], a: false, b: false };
    const want = Math.round(this.parts[id]?.steps ?? 0);
    let at = Math.max(t, e.phases.at(-1)?.[0] ?? t);
    for (; e.steps !== want; e.steps += Math.sign(want - e.steps)) {
      const cw = want > e.steps;
      for (const [a, b] of (cw ? [[true, false], [true, true], [false, true], [false, false]] : [[false, true], [true, true], [true, false], [false, false]]) as [boolean, boolean][]) {
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

  private updateEchoes(): void {
    const trace = this.pins.trace;
    for (; this.traceSeen < trace.length; this.traceSeen++) {
      const [t, pin, level] = trace[this.traceSeen]!;
      const before = this.levels.get(pin);
      this.levels.set(pin, level);
      const net = this.netOfPin.get(pin);
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
        : part.type === 'vl53l0x' ? 0x29 : part.type === 'max30102' ? 0x57 : 0x48;
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

  private readonly previous = new Map<number, Solution>();   // the last solution of each on / off combination

  /** Solves if anything changed, then lets the pins see new input levels (edges, IRQs). PWM pins are averaged
   *  over their on and off states (M3.3): the circuit is solved for each combination of the PWM pins high and low
   *  and the answers weighted by the duties — an LED on 50 % carries half its current (on a steady duty × 3.3 V it
   *  would stay below its forward voltage). Faults are found in every combination: the peaks are what burn. */
  update(): void {
    if (this.updateParts()) this.dirty = true;
    if (this.updateDrives()) this.dirty = true;
    if (!this.dirty) return;
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
      this.faults = findFaults(this.spec, this.netlist, this.solution, state);
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
    for (const part of this.spec.parts) {
      if (part.type === 'servo') this.setView(t, part.id, this.servo(part.id));
      if (part.type === 'buzzer') this.setView(t, part.id, this.buzzer(part.id, part.props?.kind === 'passive'));
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
  private buzzer(id: string, passive: boolean): PartView {
    const plus = this.connectivity.netOf(`${id}.+`) ?? '';
    const minus = this.connectivity.netOf(`${id}.-`) ?? '';
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
      if (swing >= BUZZER.passive.minSwing && (!best || swing > best.swing)) best = { swing, label };
    });
    const pwm = best && this.pins.pwmOf(this.keyOfLabel.get(best.label) ?? '');
    if (!best || !pwm || pwm.freq <= 0 || pwm.duty <= 0 || pwm.duty >= 1) return { kind: 'buzzer', hz: 0, volume: 0 };
    const volume = Math.min(1, best.swing / 3.3) * Math.sin(Math.PI * pwm.duty);
    return { kind: 'buzzer', hz: Math.round(pwm.freq), volume: round(volume) };
  }

  private servo(id: string): PartView {
    const v = (leg: string) => this.solution!.volts[this.connectivity.netOf(`${id}.${leg}`) ?? ''] ?? 0;
    const powered = v('vcc') - v('gnd') >= SERVO.minVolts;
    const pin = this.pinOfNet.get(this.connectivity.netOf(`${id}.signal`) ?? '');
    const pwm = pin === undefined ? undefined : this.pins.pwmOf(pin);
    const pulseUs = pwm && pwm.freq > 0 ? Math.round((pwm.duty / pwm.freq) * 1e6) : undefined;
    let angle = this.servoAngle.get(id) ?? SERVO.rest;
    if (powered && pulseUs !== undefined && pulseUs >= SERVO.minUs * 0.8 && pulseUs <= SERVO.maxUs * 1.2) {
      angle = Math.round(Math.min(180, Math.max(0, ((pulseUs - SERVO.minUs) / (SERVO.maxUs - SERVO.minUs)) * 180)));
      this.servoAngle.set(id, angle);
    }
    return { kind: 'servo', angle, powered, ...(pulseUs !== undefined ? { pulseUs } : {}) };
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
      for (const f of findFaults(this.spec, this.netlist, sol, combo)) {
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
