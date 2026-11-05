import type { Device, Netlist } from '@lib/circuit';

/**
 * Hand-drawn circuits for the solver tests (MILESTONES §2.4, §3.1), one statement per part, `;` between:
 *   3V3 -[220]- A        a 220 Ω resistor between nets 3V3 and A (220, 4.7k, 10k, 1M)
 *   A -|>|red- GND       a red LED, anode on A, cathode on GND;  -|<|red- is the same LED the other way round
 * GND is the ground. A net named 3V3, 5V or 9V gets a supply of that voltage to GND (0.05 Ω, 1 A limit).
 * Parts are named r1, r2 … and led1, led2 … in the order they appear.
 */
export function netlist(strings: TemplateStringsArray, ...values: unknown[]): Netlist {
  const text = strings.reduce((acc, s, i) => acc + s + (i < values.length ? String(values[i]) : ''), '');
  const devices: Device[] = [];
  const nets = new Set<string>(['GND']);
  const count = { r: 0, led: 0 };

  for (const stmt of text.split(';').map((s) => s.trim()).filter(Boolean)) {
    const m = /^(\S+)\s+-(\[[^\]]+\]|\|[<>]\|[a-z]+)-\s+(\S+)$/.exec(stmt);
    if (!m) throw new Error(`can't read "${stmt}"`);
    const [, a, edge, b] = m as unknown as [string, string, string, string];
    nets.add(a).add(b);
    if (edge.startsWith('[')) {
      devices.push({ kind: 'resistor', id: `r${++count.r}`, a, b, ohms: ohms(edge.slice(1, -1)) });
    } else {
      const forward = edge[1] === '>';
      const color = edge.slice(3);
      devices.push({ kind: 'led', id: `led${++count.led}`, a: forward ? a : b, k: forward ? b : a, color });
    }
  }
  for (const n of nets) {
    const v = /^(\d+)V(\d*)$/.exec(n);
    if (v) devices.push({ kind: 'source', id: `supply:${n}`, plus: n, minus: 'GND', volts: Number(`${v[1]}.${v[2] || 0}`), ohms: 0.05, limitA: 1 });
  }
  return { nets: [...nets], ground: 'GND', devices };
}

function ohms(s: string): number {
  const m = /^([\d.]+)([kM]?)$/.exec(s);
  if (!m) throw new Error(`can't read the value "${s}"`);
  return Number(m[1]) * ({ '': 1, k: 1e3, M: 1e6 } as const)[m[2] as '' | 'k' | 'M'];
}
