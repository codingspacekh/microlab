/**
 * The micro:bit's accelerometer without a body to move (M2.6c): readings in mg set over time (the tilt control,
 * F-35), shakes, and the gestures CODAL reports. The posture rules are CODAL's Accelerometer::instantaneousPosture
 * (tilt tolerance 200 mg, free fall under 400 mg) — from CODAL's source as we know it, to confirm on a board.
 */
export type Vector = [number, number, number];

/** micropython-microbit-v2's gesture names, by CODAL event number (microbithal.h). */
export const GESTURES = ['', 'up', 'down', 'left', 'right', 'face up', 'face down', 'freefall', '3g', '6g', '8g', 'shake', '2g'] as const;
export type Gesture = (typeof GESTURES)[number];

const TILT = 200;
const SHAKE_MS = 500;   // how long a shake stays the current gesture (estimate)

export function posture([x, y, z]: Vector): Gesture {
  const force = Math.sqrt(x * x + y * y + z * z);
  if (force < 400) return 'freefall';
  if (force > 8192) return '8g';
  if (force > 6144) return '6g';
  if (force > 3072) return '3g';
  if (force > 2048) return '2g';
  if (x < -1000 + TILT) return 'left';
  if (x > 1000 - TILT) return 'right';
  if (y < -1000 + TILT) return 'down';
  if (y > 1000 - TILT) return 'up';
  if (z < -1000 + TILT) return 'face up';
  if (z > 1000 - TILT) return 'face down';
  return '';
}

export interface MotionChange {
  atUs: number;
  vector?: Vector;
  gesture?: 'shake';
}

export class Motion {
  private vector: Vector = [0, 0, -1024];   // lying flat on the table, face up
  private current: Gesture;
  private readonly events: Gesture[] = [];
  private readonly script: MotionChange[];
  private next = 0;
  private shakeUntil = -1;

  constructor(changes: MotionChange[], private readonly now: () => number) {
    this.script = [...changes].sort((a, b) => a.atUs - b.atUs);
    this.current = posture(this.vector);
    this.events.push(this.current);   // the first posture is reported as a gesture, as at power-on
  }

  update(): void {
    const t = this.now();
    if (this.shakeUntil >= 0 && t >= this.shakeUntil) {
      this.shakeUntil = -1;
      this.set(posture(this.vector));
    }
    while (this.next < this.script.length && this.script[this.next]!.atUs <= t) {
      const c = this.script[this.next++]!;
      if (c.gesture === 'shake') {
        this.events.push('shake');
        this.current = 'shake';
        this.shakeUntil = c.atUs + SHAKE_MS * 1000;
      } else if (c.vector) {
        this.vector = c.vector;
        if (this.shakeUntil < 0) this.set(posture(this.vector));
      }
    }
  }

  /** The window's tilt (M6.6): this vector from now on. */
  live(v: Vector): void {
    this.update();
    this.vector = v;
    if (this.shakeUntil < 0) this.set(posture(v));
  }

  /** The window's Shake (M6.6): a shake now. */
  shake(): void {
    this.update();
    this.events.push('shake');
    this.current = 'shake';
    this.shakeUntil = this.now() + SHAKE_MS * 1000;
  }

  private set(p: Gesture): void {
    if (p === this.current) return;
    this.current = p;
    this.events.push(p);
  }

  values(): Vector {
    this.update();
    return this.vector;
  }

  gesture(): Gesture {
    this.update();
    return this.current;
  }

  /** Gestures since the last call, oldest first. */
  takeEvents(): Gesture[] {
    this.update();
    return this.events.splice(0);
  }
}
