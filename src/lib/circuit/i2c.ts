/**
 * Parts that answer on I²C (M6.4b), at the transaction level the sim's buses work at (M2.7): a write sets the
 * register pointer and writes on from it, a read reads on from it — the register map of most I²C chips. Each part
 * keeps its registers for the whole run; what it measures is read from its inputs when it is asked.
 */
export interface I2CDevice {
  /** A write: its first byte is a register, the rest go into it and the ones after. */
  write(bytes: number[]): void;
  /** A read of `n` bytes from the register pointer on. */
  read(n: number): number[];
}

/** What an MPU6050 measures: its tilt (degrees about Y — X towards the ground — and about X), its temperature. */
export interface MotionInput { tiltx: number; tilty: number; celsius: number }

/** The MPU6050 (RM-MPU-6000A register map; PS-MPU-6000A): 3–5 V on a GY-521. */
export const MPU6050 = {
  minVolts: 3.0, loadOhms: 1000, ad0PullOhms: 4700,
  address: 0x68, whoAmI: 0x68,
  reg: { config: 0x1a, gyroConfig: 0x1b, accelConfig: 0x1c, accel: 0x3b, temp: 0x41, gyro: 0x43, pwr1: 0x6b, whoAmI: 0x75 },
  /** LSB per g at ±2, 4, 8, 16 g; per °/s at ±250, 500, 1000, 2000 °/s. */
  accelLsb: [16384, 8192, 4096, 2048], gyroLsb: [131, 65.5, 32.8, 16.4],
} as const;

export class Mpu6050 implements I2CDevice {
  private regs = new Uint8Array(128);
  private pointer = 0;

  constructor(private readonly input: () => MotionInput) {
    this.reset();
  }

  private reset(): void {
    this.regs.fill(0);
    this.regs[MPU6050.reg.pwr1] = 0x40;   // SLEEP: it powers up asleep
    this.regs[MPU6050.reg.whoAmI] = MPU6050.whoAmI;
  }

  write(bytes: number[]): void {
    if (!bytes.length) return;
    this.pointer = bytes[0]! & 0x7f;
    for (const b of bytes.slice(1)) {
      if (this.pointer === MPU6050.reg.pwr1 && b & 0x80) { this.reset(); continue; }   // DEVICE_RESET
      if (this.pointer !== MPU6050.reg.whoAmI) this.regs[this.pointer] = b;
      this.pointer = (this.pointer + 1) & 0x7f;
    }
  }

  read(n: number): number[] {
    if (this.pointer >= MPU6050.reg.accel && this.pointer < MPU6050.reg.gyro + 6) this.sample();
    const out: number[] = [];
    for (let i = 0; i < n; i++) {
      out.push(this.regs[this.pointer]!);
      this.pointer = (this.pointer + 1) & 0x7f;
    }
    return out;
  }

  /** Fresh readings into 0x3B–0x48 — unless asleep, when they keep what they had (0 after power-up). */
  private sample(): void {
    if (this.regs[MPU6050.reg.pwr1]! & 0x40) return;
    const { tiltx, tilty, celsius } = this.input();
    const rad = Math.PI / 180;
    const g = [Math.sin(tiltx * rad) * Math.cos(tilty * rad), Math.sin(tilty * rad), Math.cos(tiltx * rad) * Math.cos(tilty * rad)];
    const lsb = MPU6050.accelLsb[(this.regs[MPU6050.reg.accelConfig]! >> 3) & 3]!;
    const put = (at: number, v: number) => {
      const x = Math.max(-32768, Math.min(32767, Math.round(v))) & 0xffff;
      this.regs[at] = x >> 8;
      this.regs[at + 1] = x & 0xff;
    };
    g.forEach((v, i) => put(MPU6050.reg.accel + 2 * i, v * lsb));
    put(MPU6050.reg.temp, (celsius - 36.53) * 340);
    for (let i = 0; i < 3; i++) put(MPU6050.reg.gyro + 2 * i, 0);   // still: no rotation
  }
}

// ------------------------------------------------------------------ the kit's I²C chips (M6.5b, Rev 8)

/** PCF8591 (NXP): 8-bit ADC (4 inputs) and DAC (AOUT), at 0x48 on the module (A2–A0 low); VREF = VCC. */
export const PCF8591 = { address: 0x48, minVolts: 2.5, loadOhms: 3300 } as const;

/** What a PCF8591 reads: its four inputs and VREF, volts above its GND. */
export interface AdcInput { ain: [number, number, number, number]; vref: number }

export class Pcf8591 implements I2CDevice {
  private control = 0;
  private dac = 0;
  private last = 0x80;   // the previous conversion: 0x80 after power-up

  constructor(private readonly input: () => AdcInput) {}

  /** AOUT's volts when it is on (control bit 6), else undefined (high impedance). */
  aout(vref: number): number | undefined {
    return this.control & 0x40 ? (this.dac / 255) * vref : undefined;
  }

  write(bytes: number[]): void {
    if (!bytes.length) return;
    this.control = bytes[0]!;
    if (bytes.length > 1) this.dac = bytes[bytes.length - 1]!;
  }

  read(n: number): number[] {
    const out: number[] = [];
    for (let i = 0; i < n; i++) {
      out.push(this.last);   // each byte is the conversion before it (datasheet §8.3)
      const ch = this.control & 3;
      const { ain, vref } = this.input();
      this.last = vref > 0 ? Math.max(0, Math.min(255, Math.round((ain[ch]! / vref) * 255))) : 0;
      if (this.control & 4) this.control = (this.control & ~3) | ((ch + 1) & 3);   // auto-increment
    }
    return out;
  }
}

/** BMP280 (Bosch BST-BMP280-DS001): 1.71–3.6 V; 0x76 with SDO low, 0x77 high; the datasheet's sample calibration. */
export const BMP280 = {
  minVolts: 1.8, loadOhms: 10_000, address: 0x76, chipId: 0x58,
  calib: { T1: 27504, T2: 26435, T3: -1000, P1: 36477, P2: -10685, P3: 3024, P4: 2855, P5: 140, P6: -7, P7: 15500, P8: -14600, P9: 6000 },
} as const;

/** The datasheet's compensation (§8.1, double precision): °C (and t_fine) from a raw temperature, Pa from a raw pressure. */
export function bmpTemperature(adc: number): { celsius: number; fine: number } {
  const c = BMP280.calib;
  const v1 = (adc / 16384 - c.T1 / 1024) * c.T2;
  const v2 = (adc / 131072 - c.T1 / 8192) ** 2 * c.T3;
  return { celsius: (v1 + v2) / 5120, fine: v1 + v2 };
}
export function bmpPressure(adc: number, fine: number): number {
  const c = BMP280.calib;
  let v1 = fine / 2 - 64000;
  let v2 = (v1 * v1 * c.P6) / 32768 + v1 * c.P5 * 2;
  v2 = v2 / 4 + c.P4 * 65536;
  v1 = ((c.P3 * v1 * v1) / 524288 + c.P2 * v1) / 524288;
  v1 = (1 + v1 / 32768) * c.P1;
  let p = ((1048576 - adc - v2 / 4096) * 6250) / v1;
  p += ((c.P9 * p * p) / 2147483648 + (p * c.P8) / 32768 + c.P7) / 16;
  return p;
}

/** The 20-bit reading whose compensation is closest to `want` (a binary search; `up`: the value grows with the reading). */
function invert(f: (raw: number) => number, want: number, up: boolean): number {
  let lo = 0;
  let hi = (1 << 20) - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((f(mid) < want) === up) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export interface AirInput { celsius: number; hpa: number }

export class Bmp280 implements I2CDevice {
  private regs = new Uint8Array(256);
  private pointer = 0;

  constructor(private readonly input: () => AirInput) {
    this.reset();
  }

  private reset(): void {
    this.regs.fill(0);
    this.regs[0xd0] = BMP280.chipId;
    const c = BMP280.calib;
    [c.T1, c.T2, c.T3, c.P1, c.P2, c.P3, c.P4, c.P5, c.P6, c.P7, c.P8, c.P9].forEach((v, i) => {
      this.regs[0x88 + 2 * i] = v & 0xff;
      this.regs[0x89 + 2 * i] = (v >> 8) & 0xff;
    });
    this.regs[0xf7] = 0x80;   // the readings' reset value, 0x80000
    this.regs[0xfa] = 0x80;
  }

  write(bytes: number[]): void {
    if (!bytes.length) return;
    this.pointer = bytes[0]!;
    for (const b of bytes.slice(1)) {
      if (this.pointer === 0xe0 && b === 0xb6) { this.reset(); continue; }   // soft reset
      if (this.pointer >= 0xf4 && this.pointer <= 0xf5) this.regs[this.pointer] = b;
      this.pointer = (this.pointer + 1) & 0xff;
    }
  }

  read(n: number): number[] {
    if (this.pointer >= 0xf7 && this.pointer <= 0xfc) this.sample();
    const out: number[] = [];
    for (let i = 0; i < n; i++) {
      out.push(this.regs[this.pointer]!);
      this.pointer = (this.pointer + 1) & 0xff;
    }
    return out;
  }

  /** A measurement into 0xF7–0xFC, unless asleep (ctrl_meas mode 00); a forced one sleeps again after it. */
  private sample(): void {
    const mode = this.regs[0xf4]! & 3;
    if (mode === 0) return;
    const { celsius, hpa } = this.input();
    const t = invert((raw) => bmpTemperature(raw).celsius, celsius, true);
    const fine = bmpTemperature(t).fine;
    const p = invert((raw) => bmpPressure(raw, fine), hpa * 100, false);
    const put = (at: number, raw: number) => {
      this.regs[at] = (raw >> 12) & 0xff;
      this.regs[at + 1] = (raw >> 4) & 0xff;
      this.regs[at + 2] = (raw & 0xf) << 4;
    };
    put(0xf7, p);
    put(0xfa, t);
    if (mode !== 3) this.regs[0xf4] = this.regs[0xf4]! & ~3;
  }
}

/** VL53L0X (ST) on a module (2.6–5.5 V with its regulator): at 0x29 (XSHUT pulled up; low: shut down). */
export const VL53L0X = { address: 0x29, minVolts: 2.6, loadOhms: 330, rangeUs: 30_000, maxMm: 2000, noTarget: 8190 } as const;

/**
 * A VL53L0X as its drivers see it: two pages of registers (0xFF = 1 selects the second, where the stop variable 0x91
 * lives); IDENTIFICATION_MODEL_ID 0xC0 = 0xEE; 0x83 answers the SPAD-info poll; writing bit 0 of SYSRANGE_START (0x00)
 * starts a measurement (the bit reads back clear), RESULT_INTERRUPT_STATUS (0x13) says 0x04 once it is done (≈ 30 ms,
 * the default timing budget), the range in mm at RESULT_RANGE_STATUS + 10 (0x1E, big-endian), SYSTEM_INTERRUPT_CLEAR
 * (0x0B) clears it; mode 0x02: back to back. Anything else is kept as written, as a register.
 */
export class Vl53l0x implements I2CDevice {
  private pages = [new Uint8Array(256), new Uint8Array(256)];
  private pointer = 0;
  private started = -1;     // when the measurement under way started (µs); -1: none
  private ready = false;
  private continuous = false;
  private mm = 0;

  constructor(private readonly now: () => number, private readonly distanceMm: () => number) {
    this.pages[0]![0xc0] = 0xee;
    this.pages[0]![0xc1] = 0xaa;
    this.pages[0]![0xc2] = 0x10;
    this.pages[1]![0x91] = 0x3c;   // the stop variable
    this.pages[1]![0x92] = 0x2c;   // SPAD count and type
  }

  private page(): Uint8Array {
    return this.pages[this.pages[0]![0xff] === 1 ? 1 : 0]!;
  }

  private settle(): void {
    if (this.started < 0 || this.now() < this.started + VL53L0X.rangeUs) return;
    const d = this.distanceMm();
    this.mm = d > VL53L0X.maxMm ? VL53L0X.noTarget : Math.max(0, Math.round(d));
    this.ready = true;
    this.started = this.continuous ? this.now() : -1;
  }

  write(bytes: number[]): void {
    if (!bytes.length) return;
    this.pointer = bytes[0]!;
    for (const b of bytes.slice(1)) {
      const reg = this.pointer;
      if (reg === 0xff) this.pages[0]![0xff] = b;
      else if (this.page() === this.pages[0] && reg === 0x00 && b & 0x03) {   // SYSRANGE_START
        this.continuous = (b & 0x02) !== 0;
        this.started = this.now();
        this.ready = false;
      } else if (this.page() === this.pages[0] && reg === 0x0b) this.ready = false;   // SYSTEM_INTERRUPT_CLEAR
      else this.page()[reg] = b;
      this.pointer = (this.pointer + 1) & 0xff;
    }
  }

  read(n: number): number[] {
    this.settle();
    const out: number[] = [];
    for (let i = 0; i < n; i++) {
      const reg = this.pointer;
      const p0 = this.page() === this.pages[0];
      if (p0 && reg === 0x00) out.push(this.started >= 0 && !this.continuous ? 0 : this.continuous ? 0x02 : 0);
      else if (p0 && reg === 0x13) out.push(this.ready ? 0x04 : 0);
      else if (p0 && reg === 0x14) out.push(this.ready ? 0x5e : 0);
      else if (p0 && reg === 0x1e) out.push(this.mm >> 8);
      else if (p0 && reg === 0x1f) out.push(this.mm & 0xff);
      else if (reg === 0x83) out.push(this.page()[0x83] || 0x10);   // the SPAD-info poll ends
      else out.push(this.page()[reg]!);
      this.pointer = (this.pointer + 1) & 0xff;
    }
    return out;
  }
}

/** MAX30102 (Maxim / Analog Devices) on a module (3.3–5 V): at 0x57, part id 0x15; a 32-sample FIFO. */
export const MAX30102 = { address: 0x57, partId: 0x15, minVolts: 3.0, loadOhms: 600, rates: [50, 100, 200, 400, 800, 1000, 1600, 3200] } as const;

/** What a MAX30102 sees: a finger on it, its heart rate, the blood's oxygen. */
export interface PulseInput { finger: boolean; bpm: number; spo2: number }

/**
 * A MAX30102 as its drivers see it: MODE_CONFIG (0x09: bit 6 reset, 0x02 heart rate — red, 0x03 SpO2 — red and IR),
 * SPO2_CONFIG (0x0A: the sample rate), the FIFO pointers (write 0x04, overflow 0x05, read 0x06) and FIFO_DATA (0x07):
 * each sample is 3 bytes a LED, 18 bits. Samples arrive at the sample rate from when a mode is set; a finger's pulse
 * makes them rise at each beat (a systolic peak and a smaller dicrotic one), red's swing / IR's being the ratio
 * R = (110 − SpO2) / 25 that a program's estimate (SpO2 ≈ 110 − 25 R) turns back.
 */
export class Max30102 implements I2CDevice {
  private regs = new Uint8Array(256);
  private pointer = 0;
  private since = -1;          // when sampling started (µs)
  private made = 0;            // samples made since then
  private fifo: number[][] = [];   // each sample: its bytes
  private byte = 0;            // bytes of the head sample already read
  private rd = 0;
  private overflow = 0;

  constructor(private readonly now: () => number, private readonly input: () => PulseInput) {
    this.reset();
  }

  private reset(): void {
    this.regs.fill(0);
    this.regs[0xff] = MAX30102.partId;
    this.since = -1;
    this.fifo = [];
    this.byte = 0;
    this.rd = 0;
    this.overflow = 0;
  }

  private leds(): number {
    const mode = this.regs[0x09]! & 7;
    return mode === 2 ? 1 : mode === 3 ? 2 : mode === 7 ? 2 : 0;
  }

  private sample(t: number): number[] {
    const { finger, bpm, spo2 } = this.input();
    const s = t / 1e6;
    const phase = ((s * bpm) / 60) % 1;
    const pulse = Math.exp(-(((phase - 0.15) / 0.07) ** 2)) + 0.4 * Math.exp(-(((phase - 0.45) / 0.1) ** 2));
    const noise = Math.sin(s * 37.7) * 20;   // a little, the same each run
    const r = (110 - spo2) / 25;
    const ir = finger ? 100_000 + 1500 * pulse + noise : 1000 + noise;
    const red = finger ? 80_000 + r * 1200 * pulse + noise : 800 + noise;
    const bytes = (v: number) => {
      const x = Math.max(0, Math.min(0x3ffff, Math.round(v)));
      return [(x >> 16) & 3, (x >> 8) & 0xff, x & 0xff];
    };
    return this.leds() === 1 ? bytes(red) : [...bytes(red), ...bytes(ir)];
  }

  /** The samples due by now into the FIFO (32 deep; past that they are lost and counted, rollover off). */
  private fill(): void {
    if (this.since < 0 || !this.leds()) return;
    const rate = MAX30102.rates[(this.regs[0x0a]! >> 2) & 7]!;
    const due = Math.floor(((this.now() - this.since) * rate) / 1e6);
    for (; this.made < due; this.made++) {
      if (this.fifo.length >= 32) { this.overflow = Math.min(31, this.overflow + 1); continue; }
      this.fifo.push(this.sample(this.since + (this.made * 1e6) / rate));
    }
  }

  write(bytes: number[]): void {
    if (!bytes.length) return;
    this.pointer = bytes[0]!;
    for (const b of bytes.slice(1)) {
      const reg = this.pointer;
      if (reg === 0x09 && b & 0x40) { this.reset(); continue; }
      if (reg === 0x09) { this.regs[reg] = b; this.since = this.now(); this.made = 0; this.fifo = []; this.byte = 0; }
      else if (reg === 0x04 || reg === 0x06) { this.fifo = []; this.byte = 0; this.rd = b & 31; }   // pointers cleared
      else if (reg === 0x05) this.overflow = b & 31;
      else if (reg !== 0xff) this.regs[reg] = b;
      if (reg !== 0x07) this.pointer = (this.pointer + 1) & 0xff;
    }
  }

  read(n: number): number[] {
    this.fill();
    const out: number[] = [];
    for (let i = 0; i < n; i++) {
      const reg = this.pointer;
      if (reg === 0x07) {   // FIFO_DATA: the pointer stays on it
        const head = this.fifo[0];
        if (!head) { out.push(0); continue; }
        out.push(head[this.byte++]!);
        if (this.byte >= head.length) { this.fifo.shift(); this.byte = 0; this.rd = (this.rd + 1) & 31; }
        continue;
      }
      if (reg === 0x04) out.push((this.rd + this.fifo.length) & 31);
      else if (reg === 0x05) out.push(this.overflow);
      else if (reg === 0x06) out.push(this.rd);
      else if (reg === 0x00) out.push(this.fifo.length ? 0x40 : 0);   // PPG_RDY
      else out.push(this.regs[reg]!);
      this.pointer = (this.pointer + 1) & 0xff;
    }
    return out;
  }
}
