import { BREADBOARD, holeOffset, type Point } from '@lib/editor';
import { COLUMNS, railHole, type BreadboardSize } from '@lib/circuit';

/**
 * The circuit's pictures, as in the approved prototype (design/svgparts.py): the breadboard, wires, resistors and
 * LEDs drawn from the holes they use, the push button and the potentiometer. One pitch (0.1 in) = 16 units.
 */
const f = (v: number) => Math.round(v * 10) / 10;

export function Defs() {
  const glows: Record<string, string> = { red: '#ff4b3a', amber: '#ffb000', green: '#3ddc6a', blue: '#4d8dff', white: '#fff6d8' };
  return (
    <defs>
      {Object.entries(glows).map(([k, c]) => (
        <radialGradient key={k} id={`glow-${k}`}>
          <stop offset="0" stopColor={c} stopOpacity=".8" /><stop offset=".45" stopColor={c} stopOpacity=".35" /><stop offset="1" stopColor={c} stopOpacity="0" />
        </radialGradient>
      ))}
      <filter id="lift" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="2" stdDeviation="2" floodOpacity=".28" /></filter>
    </defs>
  );
}

// ------------------------------------------------------------------ breadboard
const RAIL_LINES: [number, string][] = [[7, '#3b6fd8'], [45, '#d94545'], [253, '#d94545'], [291, '#3b6fd8']];
const RAIL_SIGNS: [number, string, string][] = [[21, '−', '#3b6fd8'], [37, '+', '#d94545'], [267, '+', '#d94545'], [283, '−', '#3b6fd8']];

export function Breadboard({ id, size, at, onMouseDown }: { id: string; size: BreadboardSize; at: Point; onMouseDown?: (e: React.MouseEvent) => void }) {
  const { width: w, height: h } = BREADBOARD.size(size);
  const cols = COLUMNS[size];
  const holes: Point[] = [];
  for (let c = 1; c <= cols; c++) {
    for (const r of 'abcdefghij') holes.push(holeOffset(`${r}${c}`, size)!);
    if (railHole(c)) for (const r of ['T-', 'T+', 'B+', 'B-']) holes.push(holeOffset(`${r}${c}`, size)!);
  }
  const label = { fontSize: 7.5, fill: '#a39c8c', textAnchor: 'middle' as const, fontFamily: 'JetBrains Mono Variable, monospace' };
  return (
    <g className="bb" transform={`translate(${at.x},${at.y})`}>
      <rect role="img" aria-label={`Breadboard ${id} (${size})`} className="body" width={w} height={h} rx={7} fill="#f6f4ef" stroke="#d6d0c2" filter="url(#lift)" onMouseDown={onMouseDown} />
      <g pointerEvents="none">
        {RAIL_LINES.map(([y, c]) => <line key={y} x1={14} y1={y} x2={w - 14} y2={y} stroke={c} strokeWidth={1.6} opacity={0.75} />)}
        <rect x={8} y={142} width={w - 16} height={16} rx={2} fill="#ebe7dd" />
        {RAIL_SIGNS.map(([y, s, c]) => (
          <g key={y} fontSize={10} fontWeight={700} fill={c} textAnchor="middle">
            <text x={9} y={y}>{s}</text><text x={w - 9} y={y}>{s}</text>
          </g>
        ))}
        {[1, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60].filter((c) => c <= cols).map((c) => (
          <text key={c} x={BREADBOARD.edge + (c - 1) * 16} y={54} {...label}>{c}</text>
        ))}
        {[...'abcdefghij'].map((r) => (
          <g key={r} {...label}>
            <text x={BREADBOARD.edge - 14} y={BREADBOARD.rows[r]! + 2.6}>{r}</text>
            <text x={w - BREADBOARD.edge + 14} y={BREADBOARD.rows[r]! + 2.6}>{r}</text>
          </g>
        ))}
        <path fill="#4a463e" d={holes.map((p) => `M${f(p.x - 2.7)},${f(p.y - 2.7)}h5.4v5.4h-5.4z`).join('')} />
      </g>
    </g>
  );
}

// ------------------------------------------------------------------ wires
export const WIRE_COLOURS: Record<string, [string, string]> = {
  red: ['#de3b3b', '#9e2626'], black: ['#3a3d42', '#15171a'], yellow: ['#efbd16', '#a68300'], green: ['#2fa253', '#1c6b34'],
  blue: ['#2f6fd6', '#1f4c96'], orange: ['#f08024', '#ad560f'], purple: ['#9160d6', '#5f3a95'], white: ['#f4f5f7', '#9aa1ab'],
};

export function Wire({ a, b, colour, drawing = false }: { a: Point; b: Point; colour: string; drawing?: boolean }) {
  const [c, d] = WIRE_COLOURS[colour] ?? WIRE_COLOURS.green!;
  const dash = drawing ? '7 5' : undefined;
  const path = `M${f(a.x)},${f(a.y)} L${f(b.x)},${f(b.y)}`;
  return (
    <g className="wire" pointerEvents="none">
      <path d={path} fill="none" stroke={d} strokeWidth={5.4} strokeLinecap="round" strokeDasharray={dash} />
      <path d={path} fill="none" stroke={c} strokeWidth={3.4} strokeLinecap="round" strokeDasharray={dash} />
      {(drawing ? [a] : [a, b]).map((p, i) => (
        <g key={i}><circle cx={p.x} cy={p.y} r={3.6} fill={d} /><circle cx={p.x} cy={p.y} r={1.6} fill={c} /></g>
      ))}
    </g>
  );
}

// ------------------------------------------------------------------ parts
const LED_COLOURS: Record<string, [string, string, string]> = {
  red: ['#ef3b2c', '#f2b0aa', 'red'], amber: ['#ffaa00', '#f6d79a', 'amber'], yellow: ['#ffd400', '#f5e9a6', 'amber'],
  green: ['#22b14c', '#a9dcb7', 'green'], blue: ['#2f6fe0', '#b3c8f2', 'blue'], white: ['#f4f4ee', '#e7e7e0', 'white'],
};

/** 5 mm LED: anode in a, cathode in k, the body leaning down from the holes; `on` glows (M4.5). */
export function Led({ a, k, colour = 'red', on = false }: { a: Point; k: Point; colour?: string; on?: boolean }) {
  const [onC, offC, glow] = LED_COLOURS[colour] ?? LED_COLOURS.red!;
  const cx = (a.x + k.x) / 2;
  const cy = a.y + 22;
  return (
    <>
      <path d={`M${a.x},${a.y} L${f(cx - 4)},${f(cy - 7)}`} stroke="#a5abb2" strokeWidth={1.7} fill="none" />
      <path d={`M${k.x},${k.y} L${f(cx + 4)},${f(cy - 7)}`} stroke="#a5abb2" strokeWidth={1.7} fill="none" />
      {on && <circle cx={cx} cy={cy} r={34} fill={`url(#glow-${glow})`} />}
      <circle cx={cx} cy={cy} r={10.5} fill={on ? onC : offC} stroke="rgba(0,0,0,.18)" />
      <path d={`M${f(cx + 7.4)},${f(cy - 7.4)} A10.5 10.5 0 0 1 ${f(cx + 7.4)},${f(cy + 7.4)}`} stroke="rgba(0,0,0,.22)" strokeWidth={2.2} fill="none" />
      <ellipse cx={cx - 3.5} cy={cy - 4} rx={3.2} ry={2.4} fill="#fff" opacity={on ? 0.85 : 0.55} />
    </>
  );
}

const BAND = ['#222', '#6d4c41', '#d32f2f', '#f57c00', '#f5d000', '#2e9e4f', '#2f6fd6', '#8e44ad', '#8a8f96', '#f4f4f4'];

/** The colour bands of a value: two digits, the multiplier, gold (5 %). */
export function bands(ohms: number): string[] {
  const exp = Math.max(0, Math.floor(Math.log10(Math.max(ohms, 10))) - 1);
  const two = Math.round(ohms / 10 ** exp);
  return [BAND[Math.floor(two / 10) % 10]!, BAND[two % 10]!, BAND[exp % 10]!, '#c9a227'];
}

export function Resistor({ a, b, ohms = 220 }: { a: Point; b: Point; ohms?: number }) {
  const ang = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  return (
    <>
      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#a5abb2" strokeWidth={1.8} />
      <g transform={`translate(${f(mx)},${f(my)}) rotate(${f(ang)})`}>
        <rect x={-15} y={-5.5} width={30} height={11} rx={5} fill="#e3cb98" stroke="#bfa26e" strokeWidth={0.8} />
        {bands(ohms).map((c, i) => <rect key={i} x={[-9.5, -4.5, 0.5, 8][i]} y={-5.3} width={2.6} height={10.6} fill={c} />)}
      </g>
    </>
  );
}

/** 12 mm push button: legs at the four corners (1a, 2a top; 1b, 2b bottom). */
export function PushButton({ legs, pressed = false }: { legs: Point[]; pressed?: boolean }) {
  const cx = legs.reduce((s, p) => s + p.x, 0) / legs.length;
  const cy = legs.reduce((s, p) => s + p.y, 0) / legs.length;
  return (
    <>
      {legs.map((p, i) => <line key={i} x1={p.x} y1={p.y} x2={f(cx + (p.x - cx) * 0.55)} y2={f(cy + (p.y - cy) * 0.55)} stroke="#a5abb2" strokeWidth={2} />)}
      <rect x={cx - 20} y={cy - 20} width={40} height={40} rx={4} fill="#2d3136" stroke="#15181b" filter="url(#lift)" />
      <rect x={cx - 15} y={cy - 15} width={30} height={30} rx={3} fill="#8d949c" />
      {[[-11, -11], [11, -11], [-11, 11], [11, 11]].map(([dx, dy]) => <circle key={`${dx}${dy}`} cx={cx + dx!} cy={cy + dy!} r={1.6} fill="#5e656d" />)}
      <circle cx={cx} cy={cy + (pressed ? 1.5 : 0)} r={pressed ? 9 : 10} fill="#2f6fd6" stroke="rgba(0,0,0,.35)" />
      {!pressed && <ellipse cx={cx - 3} cy={cy - 4} rx={4} ry={2.5} fill="#fff" opacity={0.35} />}
    </>
  );
}

/** Rotary potentiometer: ends 1 and 3, wiper 2 in one row; the knob above them. */
export function Potentiometer({ l, w, r, angle = 0 }: { l: Point; w: Point; r: Point; angle?: number }) {
  const cx = w.x;
  const cy = w.y - 30;
  const a = ((angle - 90) * Math.PI) / 180;
  return (
    <>
      {[l, w, r].map((p, i) => <line key={i} x1={p.x} y1={p.y} x2={f(cx + (p.x - cx) * 0.6)} y2={cy + 14} stroke="#a5abb2" strokeWidth={1.8} />)}
      <rect x={cx - 22} y={cy - 18} width={44} height={34} rx={4} fill="#2b5fa8" stroke="#1b3f73" filter="url(#lift)" />
      <circle cx={cx} cy={cy - 1} r={14} fill="#e9ebee" stroke="#9ba2aa" />
      <line x1={cx} y1={cy - 1} x2={f(cx + 11 * Math.cos(a))} y2={f(cy - 1 + 11 * Math.sin(a))} stroke="#2d3136" strokeWidth={2.6} strokeLinecap="round" />
    </>
  );
}

/** A part from its type and the places of its legs. */
export function PartDrawing({ type, legs, props }: { type: string; legs: Record<string, Point>; props?: Record<string, unknown> }) {
  switch (type) {
    case 'resistor': return <Resistor a={legs.a!} b={legs.b!} ohms={Number(props?.ohms ?? 220)} />;
    case 'led': return <Led a={legs.a!} k={legs.k!} colour={String(props?.color ?? 'red')} />;
    case 'button': return <PushButton legs={[legs['1a']!, legs['2a']!, legs['1b']!, legs['2b']!]} />;
    case 'potentiometer': return <Potentiometer l={legs['1']!} w={legs['2']!} r={legs['3']!} />;
    default: return null;
  }
}

// ------------------------------------------------------------------ parts panel icons (design/build.py ICON_PARTS)
export function PartIcon({ type }: { type: string }) {
  const body = {
    resistor: (
      <>
        <line x1="3" y1="16" x2="29" y2="16" stroke="#a5abb2" strokeWidth="1.6" /><rect x="9" y="12" width="14" height="8" rx="4" fill="#e3cb98" />
        <rect x="12" y="12" width="1.6" height="8" fill="#d32f2f" /><rect x="15" y="12" width="1.6" height="8" fill="#d32f2f" /><rect x="18" y="12" width="1.6" height="8" fill="#6d4c41" />
      </>
    ),
    led: (
      <>
        <line x1="13" y1="20" x2="13" y2="29" stroke="#a5abb2" strokeWidth="1.6" /><line x1="19" y1="20" x2="19" y2="27" stroke="#a5abb2" strokeWidth="1.6" />
        <path d="M9,21 V13 a7,7 0 0 1 14,0 V21Z" fill="#ef3b2c" /><rect x="8" y="20" width="16" height="2.5" rx="1" fill="#c62f22" />
      </>
    ),
    button: <><rect x="7" y="7" width="18" height="18" rx="2" fill="#2d3136" /><circle cx="16" cy="16" r="6" fill="#2f6fd6" /></>,
    potentiometer: (
      <>
        <rect x="6" y="9" width="20" height="16" rx="2" fill="#2b5fa8" /><circle cx="16" cy="16" r="6.5" fill="#e9ebee" />
        <line x1="16" y1="16" x2="19" y2="11" stroke="#2d3136" strokeWidth="2" strokeLinecap="round" />
      </>
    ),
  }[type];
  return <svg viewBox="0 0 32 32" aria-hidden="true">{body}</svg>;
}
