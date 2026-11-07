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
