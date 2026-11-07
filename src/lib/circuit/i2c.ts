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
