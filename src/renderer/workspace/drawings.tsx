import { BREADBOARD, holeOffset, turnsOf, type Point } from '@lib/editor';
import { COLUMNS, railHole, type BreadboardSize } from '@lib/circuit';

/**
 * The circuit's pictures, as in the approved prototype (design/svgparts.py): the breadboard, wires, resistors, LEDs,
 * RGB LEDs, light sensors and battery packs drawn from the holes they use, the push button, the slide switch and the
 * potentiometer (M6.1, screens 17, 17b), the GPIO board's micro-USB plug. One pitch (0.1 in) = 16 units.
 */
const f = (v: number) => Math.round(v * 10) / 10;

export function Defs() {
  const glows: Record<string, string> = { red: '#ff4b3a', amber: '#ffb000', green: '#3ddc6a', blue: '#4d8dff', white: '#fff6d8', mbit: '#ff3a22' };
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

export function Wire({ points, colour, drawing = false }: { points: Point[]; colour: string; drawing?: boolean }) {
  const [c, d] = WIRE_COLOURS[colour] ?? WIRE_COLOURS.green!;
  const dash = drawing ? '7 5' : undefined;
  const path = polyline(points);
  const a = points[0]!;
  const b = points[points.length - 1]!;
  return (
    <g className="wire" pointerEvents="none">
      <path d={path} fill="none" stroke={d} strokeWidth={5.4} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={dash} />
      <path d={path} fill="none" stroke={c} strokeWidth={3.4} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={dash} />
      {(drawing ? [a] : [a, b]).map((p, i) => (
        <g key={i}><circle cx={p.x} cy={p.y} r={3.6} fill={d} /><circle cx={p.x} cy={p.y} r={1.6} fill={c} /></g>
      ))}
    </g>
  );
}

/** A path through the points with rounded corners (design/svgparts.py rpath). */
export function polyline(pts: Point[], radius = 7): string {
  let d = `M${f(pts[0]!.x)},${f(pts[0]!.y)}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const [p0, p1, p2] = [pts[i - 1]!, pts[i]!, pts[i + 1]!];
    const l1 = Math.hypot(p1.x - p0.x, p1.y - p0.y);
    const l2 = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    if (!l1 || !l2) continue;
    const r = Math.min(radius, l1 / 2, l2 / 2);
    d += ` L${f(p1.x - ((p1.x - p0.x) / l1) * r)},${f(p1.y - ((p1.y - p0.y) / l1) * r)}`
      + ` Q${f(p1.x)},${f(p1.y)} ${f(p1.x + ((p2.x - p1.x) / l2) * r)},${f(p1.y + ((p2.y - p1.y) / l2) * r)}`;
  }
  const last = pts[pts.length - 1]!;
  return `${d} L${f(last.x)},${f(last.y)}`;
}

/** The LED colours the circuit knows (lib/circuit LED_COLORS), as drawn. */
export const LED_SWATCHES = [
  { value: 'red', name: 'Red', colour: '#ef3b2c' }, { value: 'yellow', name: 'Yellow', colour: '#ffd400' },
  { value: 'green', name: 'Green', colour: '#22b14c' }, { value: 'blue', name: 'Blue', colour: '#2f6fe0' },
  { value: 'white', name: 'White', colour: '#f4f4ee' },
];

// ------------------------------------------------------------------ parts
const LED_COLOURS: Record<string, [string, string, string]> = {
  red: ['#ef3b2c', '#f2b0aa', 'red'], amber: ['#ffaa00', '#f6d79a', 'amber'], yellow: ['#ffd400', '#f5e9a6', 'amber'],
  green: ['#22b14c', '#a9dcb7', 'green'], blue: ['#2f6fe0', '#b3c8f2', 'blue'], white: ['#f4f4ee', '#e7e7e0', 'white'],
};

/**
 * 5 mm LED, so a student can see which leg is which (the teacher's request, M4.4): the anode (+) leg is the long,
 * bent one, the cathode (−) leg is straight and the rim is flat on its side, as on a real LED; a red "+" and a dark
 * "−" sit by the legs, and each leg says what it is on hover. The body leans down from the holes; `on` glows (M4.5).
 */
export function Led({ a, k, colour = 'red', glow: light = 0, labels = true, upright = 0 }: { a: Point; k: Point; colour?: string; glow?: number; labels?: boolean; upright?: number }) {
  const [onC, offC, glow] = LED_COLOURS[colour] ?? LED_COLOURS.red!;
  const on = light > 0.01;   // brightness = current / the LED's 20 mA rating (M3.4)
  const cx = (a.x + k.x) / 2;
  const cy = a.y + 22;
  const side = Math.sign(k.x - a.x) || 1;           // which way the cathode is
  const r = 10.5;
  const flat = cx + side * r * 0.78;                 // the rim's flat edge, on the cathode's side
  const flatY = Math.sqrt(r * r - (r * 0.78) ** 2);
  // the body: a circle with its cathode side cut flat
  const body = `M${f(flat)},${f(cy - flatY)} A${r} ${r} 0 1 ${side > 0 ? 0 : 1} ${f(flat)},${f(cy + flatY)} Z`;
  // anode: down, a kink outwards, then in to the body; cathode: straight in
  const kink = { x: a.x - side * 5, y: a.y + 9 };
  return (
    <>
      <path className="leg anode" d={`M${a.x},${a.y} L${f(kink.x)},${f(kink.y)} L${f(cx - side * 4)},${f(cy - 7)}`} stroke="#a5abb2" strokeWidth={1.9} fill="none" strokeLinejoin="round">
        <title>Anode (+): the long leg, to the positive side</title>
      </path>
      <path className="leg cathode" d={`M${k.x},${k.y} L${f(cx + side * 4)},${f(cy - 7)}`} stroke="#a5abb2" strokeWidth={1.9} fill="none">
        <title>Cathode (−): the short leg, by the flat edge, to GND</title>
      </path>
      {on && <circle className="glow" cx={cx} cy={cy} r={34} fill={`url(#glow-${glow})`} opacity={f(Math.min(1, 0.3 + 0.7 * Math.sqrt(light)))} />}
      <path d={body} fill={on ? onC : offC} stroke="rgba(0,0,0,.28)" strokeWidth={1} />
      <line x1={f(flat)} y1={f(cy - flatY)} x2={f(flat)} y2={f(cy + flatY)} stroke="rgba(0,0,0,.45)" strokeWidth={1.6} />
      <ellipse cx={cx - 3.5} cy={cy - 4} rx={3.2} ry={2.4} fill="#fff" opacity={on ? 0.85 : 0.55} />
      {labels && (
        <g fontSize={9} fontWeight={800} textAnchor="middle" pointerEvents="none" fontFamily="Inter Variable, Inter, sans-serif">
          <circle cx={f(a.x - side * 9)} cy={f(a.y + 12)} r={5.2} fill="#fff" stroke="#d94545" strokeWidth={1} />
          <text x={f(a.x - side * 9)} y={f(a.y + 15.2)} fill="#d94545" transform={upright ? `rotate(${upright} ${f(a.x - side * 9)} ${f(a.y + 12)})` : undefined}>+</text>
          <circle cx={f(k.x + side * 9)} cy={f(k.y + 12)} r={5.2} fill="#fff" stroke="#3a3d42" strokeWidth={1} />
          <text x={f(k.x + side * 9)} y={f(k.y + 15.2)} fill="#3a3d42" transform={upright ? `rotate(${upright} ${f(k.x + side * 9)} ${f(k.y + 12)})` : undefined}>−</text>
        </g>
      )}
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

/** SS12D00 slide switch (M6.1): legs 1, 2 — the common — and 3 in one row, its body above them; the knob slides
 *  towards leg 1 (position 0: leg 2 joined to leg 1) or leg 3 (position 1: 2 joined to 3). */
export function SlideSwitch({ l, m, r, position = 0, upright = 0 }: { l: Point; m: Point; r: Point; position?: number; upright?: number }) {
  const cx = m.x;
  const cy = m.y - 24;
  const kx = position ? cx + 2 : cx - 18;
  const turn = (x: number, y: number) => (upright ? `rotate(${upright} ${f(x)} ${f(y)})` : undefined);
  return (
    <>
      {[l, m, r].map((p, i) => <line key={i} x1={p.x} y1={p.y} x2={f(cx + (p.x - cx) * 0.8)} y2={cy + 8} stroke="#a5abb2" strokeWidth={1.8} />)}
      <rect x={cx - 26} y={cy - 11} width={52} height={20} rx={3} fill="#2d3136" stroke="#15181b" filter="url(#lift)" />
      <rect x={cx - 19} y={cy - 6} width={38} height={10} rx={2} fill="#15181b" />
      <rect className="knob" x={kx} y={cy - 7} width={16} height={12} rx={1.6} fill="#e9ebee" stroke="#9ba2aa" />
      {[4, 8, 12].map((dx) => <line key={dx} x1={kx + dx} y1={cy - 4} x2={kx + dx} y2={cy + 2} stroke="#9ba2aa" strokeWidth={1} />)}
      <g fontSize={6.5} fontWeight={700} fill="#6b7280" textAnchor="middle" pointerEvents="none">
        <text x={cx - 22} y={cy - 14} transform={turn(cx - 22, cy - 16)}>1</text>
        <text x={cx + 22} y={cy - 14} transform={turn(cx + 22, cy - 16)}>3</text>
      </g>
    </>
  );
}

/** A light-dependent resistor (GL5528, 5 mm, M6.1): legs in holes a and b, the disc leaning down from them, its
 *  red-brown track in a zigzag across it. */
export function Ldr({ a, b, lean = 22 }: { a: Point; b: Point; lean?: number }) {
  const cx = (a.x + b.x) / 2;
  const cy = a.y + lean;
  return (
    <>
      {[a, b].map((p, i) => <path key={i} d={`M${p.x},${p.y} L${f(cx + (p.x - cx) * 0.45)},${f(cy - 8)}`} stroke="#a5abb2" strokeWidth={1.7} fill="none" />)}
      <circle cx={cx} cy={cy} r={11} fill="#f2d7a6" stroke="#c9a46a" />
      <path d={`M${f(cx - 9)},${f(cy - 3)} A11 11 0 0 1 ${f(cx - 4)},${f(cy - 9.8)} M${f(cx + 9)},${f(cy + 3)} A11 11 0 0 1 ${f(cx + 4)},${f(cy + 9.8)}`} stroke="#d6b24c" strokeWidth={2.4} fill="none" />
      <path d={`M${f(cx - 6)},${f(cy - 6)} h12 v3 h-12 v3 h12 v3 h-12 v3 h12`} stroke="#a5582d" strokeWidth={1.3} fill="none" strokeLinejoin="round" />
      <circle cx={cx} cy={cy} r={11} fill="#fff" opacity={0.12} />
    </>
  );
}

const RGB_DIE: [string, string][] = [['#ff3b2c', 'red'], ['#22c55e', 'green'], ['#3b82f6', 'blue']];

/** 5 mm RGB LED (M6.1): legs red, the common — the longest —, green, blue; the milky body leaning down. `dies`: each
 *  die's brightness 0–1 while running; the body takes their mix. Small letters name the legs (− or + on the common). */
export function RgbLed({ r, c, g, b, dies = [0, 0, 0], common = 'cathode', upright = 0, lean = 24 }: {
  r: Point; c: Point; g: Point; b: Point; dies?: [number, number, number]; common?: string; upright?: number; lean?: number;
}) {
  const cx = (r.x + b.x) / 2;
  const cy = r.y + lean;
  const top = Math.max(...dies);
  const lit = top > 0.01;
  const mix = lit ? `#${dies.map((v) => Math.round((255 * v) / top).toString(16).padStart(2, '0')).join('')}` : '';
  return (
    <>
      {([[r, 1.6], [c, 2.1], [g, 1.6], [b, 1.6]] as const).map(([p, w], i) => (
        <path key={i} d={`M${p.x},${p.y} L${f(cx + (p.x - cx) * 0.3)},${f(cy - 8)}`} stroke="#a5abb2" strokeWidth={w} fill="none" />
      ))}
      <g fontSize={6.5} fontWeight={700} fill="#6b7280" textAnchor="middle" pointerEvents="none">
        {([[r, 'R'], [c, common === 'anode' ? '+' : '−'], [g, 'G'], [b, 'B']] as const).map(([p, t]) => (
          <text key={t} x={p.x} y={p.y - 7} transform={upright ? `rotate(${upright} ${p.x} ${p.y - 9})` : undefined}>{t}</text>
        ))}
      </g>
      {RGB_DIE.map(([, glow], i) => dies[i]! > 0.01 && (
        <circle key={glow} className="glow" cx={cx + [-4, 0, 4][i]!} cy={cy} r={34} fill={`url(#glow-${glow})`} opacity={f(Math.min(1, 0.25 + dies[i]!))} />
      ))}
      <circle cx={cx} cy={cy} r={11} fill="#eef1f4" stroke="rgba(0,0,0,.18)" />
      {lit && <circle cx={cx} cy={cy} r={10.5} fill={mix} opacity={f(0.35 + 0.6 * top)} />}
      {RGB_DIE.map(([col], i) => (
        <rect key={col} x={f(cx + [-3.5, 3.5, 0][i]! - 1.4)} y={f(cy + [-1.5, -1.5, 3][i]! - 1.4)} width={2.8} height={2.8} fill={col} opacity={f(0.45 + 0.55 * dies[i]!)} />
      ))}
      <ellipse cx={cx - 3.5} cy={cy - 4.5} rx={3.2} ry={2.2} fill="#fff" opacity={0.6} />
    </>
  );
}

/** Battery packs as drawn (svgparts BATTERY): width, height, cells (0: a 9 V battery), what it says. Smaller than real
 *  (a 4×AA holder is 62 mm across) so they don't hide the breadboard. */
export const BATTERY_LOOK: Record<string, [number, number, number, string]> = {
  '2xAA': [96, 56, 2, '3 V'], '4xAA': [96, 100, 4, '6 V'], '9V': [64, 92, 0, '9 V'],
};
const LEAD_GAP = 26;

/** Where a pack lies: beyond its minus hole, away from the plus one; `world` turns its own (x, y) into the drawing's. */
function packFrame(plus: Point, minus: Point, kind: string) {
  const [w, h, cells, volts] = BATTERY_LOOK[kind] ?? BATTERY_LOOK['2xAA']!;
  const n = Math.hypot(minus.x - plus.x, minus.y - plus.y) || 1;
  const ux = (minus.x - plus.x) / n;
  const uy = (minus.y - plus.y) / n;
  const cx = minus.x + ux * (LEAD_GAP + h / 2);
  const cy = minus.y + uy * (LEAD_GAP + h / 2);
  const rot = (Math.atan2(ux, -uy) * 180) / Math.PI;
  const a = (rot * Math.PI) / 180;
  const world = (lx: number, ly: number): Point => ({ x: cx + lx * Math.cos(a) - ly * Math.sin(a), y: cy + lx * Math.sin(a) + ly * Math.cos(a) });
  return { w, h, cells, volts, cx, cy, rot, world };
}

/** The box round a pack and its leads (its selection box). */
export function batteryBox(plus: Point, minus: Point, kind: string): { x0: number; y0: number; x1: number; y1: number } {
  const { w, h, world } = packFrame(plus, minus, kind);
  const pts = [plus, minus, world(-w / 2, -h / 2), world(w / 2, -h / 2), world(-w / 2, h / 2), world(w / 2, h / 2)];
  return { x0: Math.min(...pts.map((p) => p.x)), y0: Math.min(...pts.map((p) => p.y)), x1: Math.max(...pts.map((p) => p.x)), y1: Math.max(...pts.map((p) => p.y)) };
}

/** A battery pack (M6.1, screen 17b): 2×AA, 4×AA in a holder, or a 9 V battery with its snap; its red lead in the
 *  `plus` hole, its black lead in `minus` — a rail pair — and the pack beyond the minus hole. The writing stays upright. */
export function Battery({ plus, minus, kind = '2xAA' }: { plus: Point; minus: Point; kind?: string }) {
  const { w, h, cells, volts, cx, cy, rot, world } = packFrame(plus, minus, kind);
  const ch = (h - 12) / Math.max(1, cells);
  const centre = world(0, 0);
  return (
    <>
      {([[plus, -12, 'red'], [minus, 12, 'black']] as const).map(([hole, lx, col]) => {
        const e = world(lx, h / 2);
        const m = world(lx, h / 2 + LEAD_GAP * 0.55);
        const [c1, c2] = WIRE_COLOURS[col]!;
        const d = `M${f(e.x)},${f(e.y)} Q${f(m.x)},${f(m.y)} ${hole.x},${hole.y}`;
        return (
          <g key={col} className={`lead ${col}`}>
            <path d={d} fill="none" stroke={c2} strokeWidth={4.4} strokeLinecap="round" />
            <path d={d} fill="none" stroke={c1} strokeWidth={2.6} strokeLinecap="round" />
            <circle cx={hole.x} cy={hole.y} r={3.2} fill={c2} /><circle cx={hole.x} cy={hole.y} r={1.4} fill={c1} />
          </g>
        );
      })}
      <g transform={`translate(${f(cx)},${f(cy)}) rotate(${f(rot)})`}>
        {cells ? (
          <>
            <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={5} fill="#2d3136" stroke="#15181b" filter="url(#lift)" />
            {Array.from({ length: cells }, (_, i) => {
              const y0 = -h / 2 + 6 + i * ch;
              return (
                <g key={i}>
                  <rect x={-w / 2 + 6} y={f(y0 + 1)} width={w - 16} height={f(ch - 2)} rx={f((ch - 2) / 2)} fill="#e8b10f" />
                  <rect x={-w / 2 + 6} y={f(y0 + 1)} width={f((w - 16) * 0.32)} height={f(ch - 2)} rx={f((ch - 2) / 2)} fill="#1c1e21" />
                  <rect x={w / 2 - 10} y={f(y0 + ch / 2 - 3)} width={3} height={6} rx={1} fill="#c7ccd2" />
                </g>
              );
            })}
          </>
        ) : (
          <>
            <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={4} fill="#1f2227" stroke="#0e0f11" filter="url(#lift)" />
            <rect x={-w / 2} y={-h / 2 + 14} width={w} height={f(h * 0.45)} fill="#d6b24c" />
            <rect x={-w / 2 + 4} y={h / 2 - 12} width={w - 8} height={12} rx={3} fill="#15171a" />
          </>
        )}
      </g>
      <text x={f(centre.x)} y={f(centre.y + 3.5)} fontSize={10} fontWeight={700} fill="#fff" stroke="#15171a" strokeWidth={2.4}
        paintOrder="stroke" textAnchor="middle" fontFamily="Inter Variable, Inter, sans-serif" pointerEvents="none">{volts}</text>
      {([[-12, '+', '#ff8a7a'], [12, '−', '#cfd3d8']] as const).map(([lx, sign, col]) => {
        const q = world(lx, h / 2 - 6);
        return <text key={sign} x={f(q.x)} y={f(q.y + 3)} fontSize={8} fontWeight={700} fill={col} textAnchor="middle" pointerEvents="none">{sign}</text>;
      })}
    </>
  );
}

/** A micro-USB cable plugged into the socket whose left end is at `at` (the GPIO board's 5V in, M6.1). */
export function UsbPlug({ at: { x, y } }: { at: Point }) {
  return (
    <g className="usb-plug">
      <path d={`M${x - 30},${y + 8} C${x - 70},${y + 8} ${x - 70},${y + 60} ${x - 110},${y + 60}`} stroke="#2d3136" strokeWidth={7} fill="none" strokeLinecap="round" />
      <rect x={x - 34} y={y - 1} width={28} height={18} rx={4} fill="#3a3d42" stroke="#15171a" />
      <rect x={x - 7} y={y + 3} width={14} height={10} rx={1.5} fill="#c7ccd2" stroke="#8f969f" />
    </g>
  );
}

/** A 12 mm piezo buzzer (M6.2; screen 06): legs + and −, the round body below them; while it sounds, its waves. */
export function Buzzer({ p, m, sounding = false, upright = 0 }: { p: Point; m: Point; sounding?: boolean; upright?: number }) {
  const cx = (p.x + m.x) / 2;
  const cy = p.y + 26;
  return (
    <>
      {[p, m].map((q, i) => <line key={i} x1={q.x} y1={q.y} x2={f(cx + (q.x - cx) * 0.5)} y2={cy - 12} stroke="#a5abb2" strokeWidth={1.8} />)}
      {sounding && (
        <g className="waves" pointerEvents="none">
          {([[30, 0.5], [39, 0.32], [48, 0.18]] as const).map(([r, op]) => (
            <path key={r} d={`M${f(cx + r * 0.7)},${f(cy - r * 0.7)} A${r} ${r} 0 0 1 ${f(cx + r * 0.7)},${f(cy + r * 0.7)}`} stroke="#2563d9" strokeWidth={2} fill="none" opacity={op} />
          ))}
        </g>
      )}
      <circle cx={cx} cy={cy} r={19} fill="#26282c" stroke="#0f1012" filter="url(#lift)" />
      <circle cx={cx} cy={cy} r={12} fill="none" stroke="#3b3e43" />
      <circle cx={cx} cy={cy} r={3} fill="#0f1012" />
      <text x={cx - 12} y={cy - 7} fontSize={9} fontWeight={700} fill="#cfd3d8" textAnchor="middle" pointerEvents="none"
        transform={upright ? `rotate(${upright} ${f(cx - 12)} ${f(cy - 10)})` : undefined}>+</text>
    </>
  );
}

/** A part from its type and the places of its legs. */
export interface PartLook {
  /** An LED's brightness, 0–1, while running (M4.5). */
  glow?: number;
  /** An RGB LED's red, green and blue dies, 0–1 each (M6.1). */
  dies?: [number, number, number];
  /** A push button held down while running. */
  pressed?: boolean;
  /** A slide switch's position (0 / 1) or a knob's (0–1, from leg 1) while running (M6.1). */
  position?: number;
  /** A buzzer sounding while running (M6.2). */
  sounding?: boolean;
}

export function PartDrawing({ type, legs, props, look = {} }: { type: string; legs: Record<string, Point>; props?: Record<string, unknown>; look?: PartLook }) {
  switch (type) {
    case 'resistor': return <Resistor a={legs.a!} b={legs.b!} ohms={Number(props?.ohms ?? 220)} />;
    case 'button': return <PushButton legs={[legs['1a']!, legs['2a']!, legs['1b']!, legs['2b']!]} pressed={look.pressed} />;
    case 'battery': return <Battery plus={legs['+']!} minus={legs['-']!} kind={String(props?.kind ?? '2xAA')} />;
    case 'led': case 'potentiometer': case 'slide-switch': case 'ldr': case 'rgb-led': case 'buzzer': {
      // drawn as if not turned, then turned about the legs' middle (M5.1); the letters and signs stay upright
      const t = partTurns(type, legs);
      const { local, transform } = unturned(legs, t);
      const up = -90 * t;
      const body = {
        led: () => <Led a={local.a!} k={local.k!} colour={String(props?.color ?? 'red')} glow={look.glow} upright={up} />,
        potentiometer: () => <Potentiometer l={local['1']!} w={local['2']!} r={local['3']!} angle={((look.position ?? 0.5) - 0.5) * 270} />,
        'slide-switch': () => <SlideSwitch l={local['1']!} m={local['2']!} r={local['3']!} position={look.position} upright={up} />,
        ldr: () => <Ldr a={local.a!} b={local.b!} />,
        buzzer: () => <Buzzer p={local['+']!} m={local['-']!} sounding={look.sounding} upright={up} />,
        'rgb-led': () => <RgbLed r={local.r!} c={local.common!} g={local.g!} b={local.b!} dies={look.dies} common={String(props?.common ?? 'cathode')} upright={up} />,
      }[type]();
      return t ? <g transform={transform}>{body}</g> : body;
    }
    default: return null;
  }
}

/** Quarter turns of a placed part (0–3); 0 for a part this file doesn't know. */
export function partTurns(type: string, legs: Record<string, Point>): number {
  try { return turnsOf(type, legs); } catch { return 0; }
}

/** The legs turned back `t` quarters about their middle, and the transform that turns the drawing forward again. */
function unturned(legs: Record<string, Point>, t: number): { local: Record<string, Point>; transform: string } {
  const pts = Object.values(legs);
  const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
  const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  const local: Record<string, Point> = {};
  for (const [k, p] of Object.entries(legs)) {
    let [x, y] = [p.x - cx, p.y - cy];
    for (let i = 0; i < t; i++) [x, y] = [y, -x];   // a quarter anticlockwise
    local[k] = { x: f(cx + x), y: f(cy + y) };
  }
  return { local, transform: `rotate(${90 * t} ${f(cx)} ${f(cy)})` };
}

// ------------------------------------------------------------------ the board's own outputs (M4.5)
const BOARD_LED: Record<string, [string, string]> = { green: ['#8dffad', 'green'], blue: ['#8fb8ff', 'blue'] };

/** The board's own LED lit (the Pico W's green, the ESP32's blue), where the board's picture has it. */
export function BoardLed({ at, colour }: { at: Point; colour: 'green' | 'blue' }) {
  const [fill, glow] = BOARD_LED[colour]!;
  return (
    <g data-board-led="1" pointerEvents="none">
      <circle cx={at.x} cy={at.y} r={12} fill={`url(#glow-${glow})`} />
      <rect x={at.x - 3} y={at.y - 2} width={6} height={4} rx={1} fill={fill} />
    </g>
  );
}

/** The micro:bit's 5 × 5 display: each pixel's brightness 0–9, row by row, at the picture's 25 places. */
export function MicrobitDisplay({ at, pixels }: { at: Point[]; pixels: string }) {
  return (
    <g data-display={pixels} pointerEvents="none">
      {at.map((p, i) => {
        const b = Number(pixels[i] ?? 0) / 9;
        if (b <= 0) return null;
        return (
          <g key={i} opacity={f(0.35 + 0.65 * b)}>
            <circle cx={p.x} cy={p.y} r={17} fill="url(#glow-mbit)" />
            <rect x={p.x - 3.5} y={p.y - 6} width={7} height={12} rx={1.5} fill="#ff3a22" />
          </g>
        );
      })}
    </g>
  );
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
    'rgb-led': (
      <>
        {[11, 18, 21.5].map((x) => <line key={x} x1={x} y1="20" x2={x} y2="29" stroke="#a5abb2" strokeWidth="1.4" />)}
        <line x1="14.5" y1="20" x2="14.5" y2="30" stroke="#a5abb2" strokeWidth="1.4" />
        <path d="M9,21 V13 a7,7 0 0 1 14,0 V21Z" fill="#eef1f4" stroke="#c9d0d8" />
        <circle cx="13" cy="13" r="2" fill="#ef3b2c" /><circle cx="18" cy="12" r="2" fill="#22b14c" /><circle cx="16" cy="17" r="2" fill="#2f6fe0" />
      </>
    ),
    buzzer: <><circle cx="16" cy="16" r="10" fill="#26282c" /><circle cx="16" cy="16" r="6" fill="none" stroke="#3b3e43" /><circle cx="16" cy="16" r="1.8" fill="#0f1012" /></>,
    'slide-switch': <><rect x="5" y="11" width="22" height="10" rx="2" fill="#2d3136" /><rect x="8" y="13" width="9" height="6" rx="1" fill="#e9ebee" /></>,
    ldr: (
      <>
        <circle cx="16" cy="14" r="8" fill="#f2d7a6" stroke="#c9a46a" /><path d="M11,12 h10 M11,15 h10 M11,18 h10" stroke="#a5582d" strokeWidth="1.3" />
        <line x1="13" y1="22" x2="13" y2="29" stroke="#a5abb2" strokeWidth="1.5" /><line x1="19" y1="22" x2="19" y2="29" stroke="#a5abb2" strokeWidth="1.5" />
      </>
    ),
    battery: (
      <>
        <rect x="4" y="9" width="22" height="14" rx="2" fill="#2d3136" /><rect x="26" y="13" width="3" height="6" rx="1" fill="#2d3136" />
        <rect x="6" y="11" width="9" height="10" fill="#e8b10f" /><text x="20" y="19.5" fontSize="7" fontWeight="700" fill="#fff" textAnchor="middle">+</text>
      </>
    ),
  }[type];
  return <svg viewBox="0 0 32 32" aria-hidden="true">{body}</svg>;
}
