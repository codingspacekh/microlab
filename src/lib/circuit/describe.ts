import type { Fault } from './faults';

const DIES: Record<string, string> = { r: 'red', y: 'yellow', g: 'green', b: 'blue' };

/**
 * A fault in one plain line with its numbers (M3.5). The friendly wording, the picture and the fix are M9's fault
 * table (screen 04); this is what the console and the tests see until then.
 */
export function describeFault(f: Fault): string {
  const mA = (a?: number) => `${Math.round((a ?? 0) * 1000)} mA`;
  const V = (v?: number) => `${(v ?? 0).toFixed(1)} V`;
  const die = /^(.+):([rygb])$/.exec(f.on);   // an RGB LED's red, green or blue (M6.1); a traffic light's (M7)
  const on = die ? `${die[1]} (${DIES[die[2]!]})` : f.on;
  switch (f.kind) {
    case 'short': return `${f.on}: a short circuit — ${mA(f.amps)}, as much as it can give`;
    case 'led-burnt': return `${on}: the LED burnt out — ${mA(f.amps)} through it, it takes ${mA(f.limitA)} at most`;
    case 'led-over-current': return `${on}: ${mA(f.amps)} through the LED, more than its ${mA(f.ratedA)}`;
    case 'pin-over-current': return `${f.on}: the pin gives ${mA(f.amps)}, more than its safe ${mA(f.limitA)}`;
    case 'board-over-current': return `the board's pins give ${mA(f.amps)} together, more than ${mA(f.limitA)}`;
    case 'supply-over-current': return `${f.on}: ${mA(f.amps)} drawn, more than its ${mA(f.limitA)}`;
    case 'over-voltage': return `${f.on}: ${V(f.volts)} on a pin that takes ${V(f.limitV)} at most`;
    case 'floating': return `${f.on}: an input connected to nothing — what it reads is chance`;
    case 'servo-underpowered': return `${f.on}: the servo has ${V(f.volts)}, it needs 4.8–6 V`;
    case 'motor-on-pin': return `${f.on}: ${f.part} straight on the pin draws ${mA(f.amps)}, a pin gives ${mA(f.limitA)} at most — drive it through a driver (L9110S, L298N)`;
    case 'sensor-underpowered': return `${f.on}: the sensor has ${V(f.volts)}, it needs ${V(f.limitV)} at least`;
  }
}
