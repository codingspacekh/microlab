import { useId, type ReactNode } from 'react';

/**
 * What Learn's pictures are drawn with (M8): labels and callouts in the page's colours, the canvas's small LED, its
 * breadboard and wires, a resistor's colour bands — the prototype's drawings (design/learnfigs.py, design/svgparts.py).
 */
/** 0.825 → "0.83", 3.3 → "3.3", 0 → "0". */
export const num = (value: number, digits: number) => String(Number(value.toFixed(digits)));
export const kOhms = (ohms: number) => `${num(ohms / 1000, 1)} kΩ`;

// ------------------------------------------------------------------ drawing helpers
export const f = (v: number) => Number(v.toFixed(1));
/** useId's text, safe inside url(#…). */
export const useDefId = () => useId().replace(/[^a-zA-Z0-9]/g, '');

export type Tone = 'ink' | 'muted' | 'accent' | 'plus';

export function Label({ x, y, children, anchor = 'start', size = 11, weight = 600, tone = 'ink' }: {
  x: number; y: number; children: ReactNode; anchor?: 'start' | 'middle' | 'end'; size?: number; weight?: number; tone?: Tone;
}) {
  return <text className={`lf-${tone}`} x={f(x)} y={f(y)} fontSize={size} fontWeight={weight} textAnchor={anchor}>{children}</text>;
}

/** A thin line from the thing to its name; the name, and under it a quieter line. */
export function Callout({ from, to, text, sub, anchor = 'start' }: {
  from: [number, number]; to: [number, number]; text: string; sub?: string; anchor?: 'start' | 'middle' | 'end';
}) {
  const [x1, y1] = from;
  const [x2, y2] = to;
  const dx = anchor === 'start' ? 5 : -5;
  return (
    <g>
      <circle className="lf-dot" cx={f(x1)} cy={f(y1)} r={2.6} />
      <path className="lf-lead" d={`M${f(x1)},${f(y1)} L${f(x2)},${f(y2)}`} />
      <Label x={x2 + dx} y={y2 + 4} anchor={anchor} size={14} weight={700}>{text}</Label>
      {sub && <Label x={x2 + dx} y={y2 + 21} anchor={anchor} size={12.5} weight={500} tone="muted">{sub}</Label>}
    </g>
  );
}

export function RedGlow({ id }: { id: string }) {
  return (
    <radialGradient id={id}>
      <stop offset="0" stopColor="#ff4b3a" stopOpacity={0.8} />
      <stop offset=".45" stopColor="#ff4b3a" stopOpacity={0.35} />
      <stop offset="1" stopColor="#ff4b3a" stopOpacity={0} />
    </radialGradient>
  );
}

/** The small LED of the canvas (design/svgparts.py `led`): its legs in a and k, the body leaning away. */
export function SmallLed({ a, k, state, glow }: { a: [number, number]; k: [number, number]; state: 'off' | 'on' | 'burnt'; glow: string }) {
  const cx = (a[0] + k[0]) / 2;
  const cy = a[1] + 22;
  return (
    <g>
      <path d={`M${a[0]},${a[1]} L${f(cx - 4)},${f(cy - 7)}`} stroke="#a5abb2" strokeWidth={1.7} fill="none" />
      <path d={`M${k[0]},${k[1]} L${f(cx + 4)},${f(cy - 7)}`} stroke="#a5abb2" strokeWidth={1.7} fill="none" />
      {state === 'on' && <circle cx={cx} cy={cy} r={34} fill={`url(#${glow})`} />}
      <circle cx={cx} cy={cy} r={10.5} fill={{ on: '#ef3b2c', off: '#f2b0aa', burnt: '#4b3b35' }[state]} stroke="rgba(0,0,0,.18)" />
      <path d={`M${f(cx + 7.4)},${f(cy - 7.4)} A10.5 10.5 0 0 1 ${f(cx + 7.4)},${f(cy + 7.4)}`} stroke="rgba(0,0,0,.22)" strokeWidth={2.2} fill="none" />
      {state === 'burnt' ? (
        <>
          <path d={`M${f(cx - 5)},${f(cy - 6)} l3,4 -2,3 4,4`} stroke="#1d1512" strokeWidth={1.4} fill="none" />
          <circle cx={cx - 6} cy={cy - 22} r={6} fill="#8c8f94" opacity={0.5} />
          <circle cx={cx + 2} cy={cy - 32} r={8} fill="#8c8f94" opacity={0.38} />
          <circle cx={cx - 3} cy={cy - 45} r={10} fill="#8c8f94" opacity={0.25} />
        </>
      ) : <ellipse cx={cx - 3.5} cy={cy - 4} rx={3.2} ry={2.4} fill="#fff" opacity={state === 'on' ? 0.85 : 0.55} />}
    </g>
  );
}

export const P = 16;
export const ROWS: Record<string, number> = { 'T-': 18, 'T+': 34, 'B+': 264, 'B-': 280 };
[...'abcde'].forEach((r, i) => { ROWS[r] = 62 + i * P; });
[...'fghij'].forEach((r, i) => { ROWS[r] = 174 + i * P; });
export const RAIL_ROWS = ['T-', 'T+', 'B+', 'B-'];
/** Power rails have holes in groups of five with a gap, like a real breadboard. */
export const railHole = (col: number) => (col - 1) % 6 !== 5;

export const WIRE = { red: ['#de3b3b', '#9e2626'], black: ['#3a3d42', '#15171a'] } as const;
/** A resistor's colour bands, 0–9, and gold for its last one. */
export const BAND = ['#222', '#6d4c41', '#d32f2f', '#f57c00', '#f2b705', '#2fa253', '#2f6fd6', '#7e57c2', '#8c8f94', '#f4f5f7'];
export const GOLD = '#c9a227';

/** The four bands of a resistor: its two digits, how many noughts, and gold. */
export function bands(ohms: number): string[] {
  const noughts = Math.floor(Math.log10(ohms) + 1e-9) - 1;
  const digits = Math.round(ohms / 10 ** noughts);
  return [BAND[Math.floor(digits / 10)] ?? BAND[0]!, BAND[digits % 10]!, BAND[noughts] ?? GOLD, GOLD];
}

/** The breadboard of the canvas (design/svgparts.py `Breadboard`), `cols` columns wide, its corner at bx − 24, by. */
export function Breadboard({ bx, by, cols, lift }: { bx: number; by: number; cols: number; lift: string }) {
  const x0 = bx - 24;
  const w = (cols - 1) * P + 48;
  const columns = Array.from({ length: cols }, (_, i) => i + 1);
  const letters = [...'abcdefghij'];
  return (
    <g>
      <rect x={x0} y={by} width={w} height={298} rx={7} fill="#f6f4ef" stroke="#d6d0c2" filter={`url(#${lift})`} />
      {([[7, '#3b6fd8'], [45, '#d94545'], [253, '#d94545'], [291, '#3b6fd8']] as const).map(([y, c]) => (
        <line key={y} x1={x0 + 14} y1={by + y} x2={x0 + w - 14} y2={by + y} stroke={c} strokeWidth={1.6} opacity={0.75} />
      ))}
      <rect x={x0 + 8} y={by + 142} width={w - 16} height={16} rx={2} fill="#ebe7dd" />
      {([[21, '−', '#3b6fd8'], [37, '+', '#d94545'], [267, '+', '#d94545'], [283, '−', '#3b6fd8']] as const).map(([y, s, c]) => (
        <g key={y} fontSize={10} fontWeight={700} fill={c} textAnchor="middle">
          <text x={x0 + 9} y={by + y}>{s}</text>
          <text x={x0 + w - 9} y={by + y}>{s}</text>
        </g>
      ))}
      <g className="lf-holes" fontSize={7.5} fill="#a39c8c" textAnchor="middle">
        {[1, 5, 10, 15, 20, 25, 30].filter((c) => c <= cols).map((c) => <text key={c} x={bx + (c - 1) * P} y={by + 54}>{c}</text>)}
        {letters.map((r) => (
          <g key={r}>
            <text x={bx - 14} y={f(by + ROWS[r]! + 2.6)}>{r}</text>
            <text x={bx + (cols - 1) * P + 14} y={f(by + ROWS[r]! + 2.6)}>{r}</text>
          </g>
        ))}
      </g>
      <g fill="#4a463e">
        {columns.flatMap((c) => [...letters, ...(railHole(c) ? RAIL_ROWS : [])].map((r) => (
          <rect key={`${c}${r}`} x={f(bx + (c - 1) * P - 2.7)} y={f(by + ROWS[r]! - 2.7)} width={5.4} height={5.4} rx={1.2} />
        )))}
      </g>
    </g>
  );
}

export function Wire({ d, ends, colour, thin = false }: { d: string; ends: [number, number][]; colour: keyof typeof WIRE; thin?: boolean }) {
  const [light, dark] = WIRE[colour];
  return (
    <g>
      <path d={d} fill="none" stroke={dark} strokeWidth={thin ? 4.4 : 5.4} strokeLinecap="round" strokeLinejoin="round" />
      <path d={d} fill="none" stroke={light} strokeWidth={thin ? 2.6 : 3.4} strokeLinecap="round" strokeLinejoin="round" />
      {ends.map(([x, y]) => (
        <g key={`${x},${y}`}>
          <circle cx={x} cy={y} r={thin ? 3.2 : 3.6} fill={dark} />
          <circle cx={x} cy={y} r={thin ? 1.4 : 1.6} fill={light} />
        </g>
      ))}
    </g>
  );
}
