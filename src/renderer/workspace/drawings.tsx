import { BREADBOARD, holeOffset, turnsOf, type Point } from '@lib/editor';
import { COLUMNS, hasRails, railHole, type BreadboardSize } from '@lib/circuit';
import { L298nBoard, L9110sDriver, PowerSupply, Pump, RelayModule, ServoPlug, Stepper, TtMotor, Uln2003, type ActLook } from './actuators';

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
  const { width: w, height: h, top } = BREADBOARD.size(size);
  const rails = hasRails(size);   // a mini breadboard has none: its body is the rows a–j
  const cols = COLUMNS[size];
  const holes: Point[] = [];
  for (let c = 1; c <= cols; c++) {
    for (const r of 'abcdefghij') holes.push(holeOffset(`${r}${c}`, size)!);
    if (rails && railHole(c)) for (const r of ['T-', 'T+', 'B+', 'B-']) holes.push(holeOffset(`${r}${c}`, size)!);
  }
  const label = { fontSize: 7.5, fill: '#a39c8c', textAnchor: 'middle' as const, fontFamily: 'JetBrains Mono Variable, monospace' };
  return (
    <g className="bb" transform={`translate(${at.x},${at.y})`}>
      <rect role="img" aria-label={`Breadboard ${id} (${size})`} className="body" y={top} width={w} height={h} rx={7} fill="#f6f4ef" stroke="#d6d0c2" filter="url(#lift)" onMouseDown={onMouseDown} />
      <g pointerEvents="none">
        {rails && RAIL_LINES.map(([y, c]) => <line key={y} x1={14} y1={y} x2={w - 14} y2={y} stroke={c} strokeWidth={1.6} opacity={0.75} />)}
        <rect x={8} y={142} width={w - 16} height={16} rx={2} fill="#ebe7dd" />
        {rails && RAIL_SIGNS.map(([y, s, c]) => (
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

/** A sensor module's 3-pin header (M6.3): the black strip above the holes, the pins down into them, their printed
 *  names; the pins go on up into the board at `bodyY`. */
function Header({ pins, labels, bodyY, upright }: { pins: Point[]; labels: string[]; bodyY: number; upright: number }) {
  const xs = pins.map((p) => p.x);
  const y = pins[0]!.y;
  return (
    <>
      <rect x={Math.min(...xs) - 7} y={y - 14} width={Math.max(...xs) - Math.min(...xs) + 14} height={7} rx={1} fill="#26282c" />
      {pins.map((p, i) => (
        <g key={i}>
          <line x1={p.x} y1={p.y} x2={p.x} y2={y - 7} stroke="#c7ccd2" strokeWidth={1.8} />
          <line x1={p.x} y1={y - 14} x2={p.x} y2={bodyY} stroke="#c7ccd2" strokeWidth={1.8} />
        </g>
      ))}
      <g fontSize={5.5} fontWeight={700} fill="#e9edf2" textAnchor="middle" pointerEvents="none" fontFamily="Inter Variable, Inter, sans-serif">
        {pins.map((p, i) => (
          // GPIO1, XSHUT: smaller, so they don't meet their neighbours
          <text key={i} x={p.x} y={y - 18} fontSize={labels[i]!.length > 4 ? 4.2 : undefined} transform={upright ? `rotate(${upright} ${p.x} ${y - 20})` : undefined}>{labels[i]}</text>
        ))}
      </g>
    </>
  );
}

/** HC-SR501 PIR (M6.3, screen 18): pins VCC, OUT, GND; its green board above with the white Fresnel dome; while its
 *  OUT is high (it sees motion, or holds it), waves round the dome. Drawn smaller than real. */
export function Pir({ vcc, out, gnd, motion = false, upright = 0 }: { vcc: Point; out: Point; gnd: Point; motion?: boolean; upright?: number }) {
  const cx = out.x;
  const top = out.y - 16 - 74;
  return (
    <>
      {motion && (
        <g className="waves" pointerEvents="none">
          {([[40, 0.5], [50, 0.32], [60, 0.18]] as const).map(([r, op]) => (
            <path key={r} d={`M${f(cx - r * 0.8)},${f(top + 30 - r * 0.55)} A${r} ${r} 0 0 1 ${f(cx + r * 0.8)},${f(top + 30 - r * 0.55)}`} stroke="#e8590c" strokeWidth={2} fill="none" opacity={op} />
          ))}
        </g>
      )}
      <rect x={cx - 42} y={top} width={84} height={74} rx={4} fill="#2f7d3f" stroke="#1f5a2b" filter="url(#lift)" />
      <circle cx={cx} cy={top + 32} r={27} fill="#f4f4f1" stroke="#d3d3cc" />
      {[20, 13, 6].map((r) => <circle key={r} cx={cx} cy={top + 32} r={r} fill="none" stroke="#e2e2db" strokeWidth={1.2} />)}
      <ellipse cx={cx - 9} cy={top + 22} rx={7} ry={4} fill="#fff" opacity={0.8} />
      <Header pins={[vcc, out, gnd]} labels={['VCC', 'OUT', 'GND']} bodyY={top + 74} upright={upright} />
    </>
  );
}

/** TCRT5000 IR line sensor module (M6.3): pins OUT, GND, VCC; its blue board with the trimmer, the power LED and the
 *  signal LED (lit over white: OUT low); a strip above its head shows the surface under it — white, or the black line. */
export function LineSensor({ out, gnd, vcc, overLine = false, upright = 0 }: { out: Point; gnd: Point; vcc: Point; overLine?: boolean; upright?: number }) {
  const cx = gnd.x;
  const top = gnd.y - 16 - 84;
  return (
    <>
      <rect className="surface" x={cx - 30} y={top - 22} width={60} height={16} rx={3} fill="#fbfbf8" stroke="#cfcfc6" />
      {overLine && <rect x={cx - 30} y={top - 19} width={60} height={10} fill="#1b1c1f" />}
      <rect x={cx - 25} y={top} width={50} height={84} rx={3} fill="#2457a6" stroke="#173c78" filter="url(#lift)" />
      <rect x={cx - 14} y={top + 4} width={28} height={14} rx={2} fill="#1c1e21" />
      <circle cx={cx - 6.5} cy={top + 11} r={4.2} fill="#3a63c9" /><circle cx={cx + 6.5} cy={top + 11} r={4.2} fill="#121314" />
      <rect x={cx - 9} y={top + 30} width={18} height={18} rx={2} fill="#2f74d8" stroke="#1d4f9e" />
      <circle cx={cx} cy={top + 39} r={5} fill="#e9ebee" /><line x1={cx - 3} y1={top + 39} x2={cx + 3} y2={top + 39} stroke="#6b7280" strokeWidth={1.4} />
      <rect x={cx - 16} y={top + 56} width={7} height={4} rx={1} fill="#ff5a4a" />
      <rect x={cx + 9} y={top + 56} width={7} height={4} rx={1} fill={overLine ? '#3a3d42' : '#34d058'} />
      {!overLine && <circle cx={cx + 12.5} cy={top + 58} r={7} fill="url(#glow-green)" />}
      <Header pins={[out, gnd, vcc]} labels={['OUT', 'GND', 'VCC']} bodyY={top + 84} upright={upright} />
    </>
  );
}

/** Capacitive soil moisture sensor v1.2 (M6.3): pins AOUT, VCC, GND; its long black board with the probe's end in a
 *  pot of soil, as wet as `moisture` (0 dry – 1 in water). */
export function SoilSensor({ aout, vcc, gnd, moisture = 0.5, upright = 0 }: { aout: Point; vcc: Point; gnd: Point; moisture?: number; upright?: number }) {
  const cx = vcc.x;
  const top = vcc.y - 16 - 130;
  const mix = (a: number, b: number) => Math.round(a + (b - a) * moisture).toString(16).padStart(2, '0');
  return (
    <>
      <rect x={cx - 23} y={top} width={46} height={130} rx={4} fill="#1d1f22" stroke="#0e0f11" filter="url(#lift)" />
      <path d={`M${cx - 23},${top + 70} h46 M${cx - 18},${top + 70} v-60 l18,-8 l18,8 v60`} stroke="#e8d49a" strokeWidth={1.2} fill="none" opacity={0.6} />
      <rect x={cx - 11} y={top + 82} width={22} height={12} rx={1.5} fill="#2b2e33" /><rect x={cx - 5} y={top + 100} width={10} height={7} rx={1} fill="#2b2e33" />
      <path className="soil" d={`M${cx - 34},${top + 14} h68 l-6,48 h-56 z`} fill={`#${mix(0x8a, 0x4a)}${mix(0x5b, 0x2f)}${mix(0x34, 0x1c)}`} opacity={0.93} />
      <path d={`M${cx - 36},${top + 10} h72 v6 h-72 z`} fill="#b5651d" />
      {[-20, 14, -6, 22].slice(0, Math.round(moisture * 4)).map((dx, i) => (
        <path key={i} d={`M${cx + dx},${top + 26 + i * 8} q3,5 0,7 q-3,-2 0,-7z`} fill="#7fb4ff" opacity={0.9} />
      ))}
      <Header pins={[aout, vcc, gnd]} labels={['AOUT', 'VCC', 'GND']} bodyY={top + 130} upright={upright} />
    </>
  );
}

/** TMP36 or LM35 in a TO-92 (M6.3): its flat face towards you, legs +Vs, Vout, GND; the body above them says which. */
export function TempSensor({ vs, vout, gnd, kind = 'TMP36', upright = 0 }: { vs: Point; vout: Point; gnd: Point; kind?: string; upright?: number }) {
  const cx = vout.x;
  const y = vout.y;
  const turn = (x: number, yy: number) => (upright ? `rotate(${upright} ${f(x)} ${f(yy)})` : undefined);
  return (
    <>
      {[vs, vout, gnd].map((p, i) => <line key={i} x1={p.x} y1={p.y} x2={f(cx + (p.x - cx) * 0.45)} y2={y - 18} stroke="#a5abb2" strokeWidth={1.7} />)}
      <path d={`M${cx - 13},${y - 18} v-20 a13 9 0 0 1 26 0 v20 z`} fill="#1f2125" stroke="#0e0f11" filter="url(#lift)" />
      <text x={cx} y={y - 26} fontSize={5.5} fontWeight={700} fill="#cfd3d8" textAnchor="middle" fontFamily="JetBrains Mono Variable, monospace"
        pointerEvents="none" transform={turn(cx, y - 28)}>{kind}</text>
      <g fontSize={5} fontWeight={700} fill="#6b7280" textAnchor="middle" pointerEvents="none" fontFamily="Inter Variable, Inter, sans-serif">
        {([[vs, '+Vs'], [vout, 'Vout'], [gnd, 'GND']] as const).map(([p, t]) => <text key={t} x={p.x} y={y + 11} transform={turn(p.x, y + 9)}>{t}</text>)}
      </g>
    </>
  );
}

/** DHT11 (blue) or DHT22 (white) on its 3-pin module (M6.4, screen 19): pins VCC, DATA, GND; the grilled case above. */
export function Dht({ vcc, data, gnd, kind = 'DHT11', upright = 0 }: { vcc: Point; data: Point; gnd: Point; kind?: string; upright?: number }) {
  const cx = data.x;
  const top = data.y - 16 - 72;
  const blue = kind === 'DHT11';
  return (
    <>
      <rect x={cx - 26} y={top + 46} width={52} height={26} rx={3} fill="#2457a6" stroke="#173c78" filter="url(#lift)" />
      <rect x={cx - 19} y={top} width={38} height={52} rx={3} fill={blue ? '#3f8fe0' : '#f4f4f1'} stroke="#9aa1a9" filter="url(#lift)" />
      <path fill={blue ? '#1f5ea8' : '#c9cdd2'} d={[0, 1, 2, 3].flatMap((c) => [0, 1, 2, 3, 4, 5].map((r) => `M${cx - 14 + c * 8},${top + 5 + r * 7}h4v4h-4z`)).join('')} />
      <text x={cx} y={top + 64} fontSize={6} fontWeight={700} fill="#e3eef9" textAnchor="middle" fontFamily="JetBrains Mono Variable, monospace"
        pointerEvents="none" transform={upright ? `rotate(${upright} ${cx} ${top + 62})` : undefined}>{kind}</text>
      <Header pins={[vcc, data, gnd]} labels={['VCC', 'DATA', 'GND']} bodyY={top + 72} upright={upright} />
    </>
  );
}

/** MPU6050 on its GY-521 board (M6.4b, screen 19): 8 pins VCC GND SCL SDA XDA XCL AD0 INT; the chip, the X / Y arrows
 *  printed on the board, and a small level whose bubble shows the tilt (degrees about Y, about X). */
export function Gy521({ pins, tilt = [0, 0], upright = 0 }: { pins: Point[]; tilt?: [number, number]; upright?: number }) {
  const cx = (pins[0]!.x + pins[pins.length - 1]!.x) / 2;
  const w = pins[pins.length - 1]!.x - pins[0]!.x + 24;
  const top = pins[0]!.y - 16 - 74;
  const ax = cx + 30;
  const ay = top + 40;
  const lx = cx - 40;
  const ly = top + 30;
  const rad = Math.PI / 180;
  return (
    <>
      <rect x={cx - w / 2} y={top} width={w} height={74} rx={4} fill="#3b5bb7" stroke="#26408a" filter="url(#lift)" />
      {[cx - w / 2 + 9, cx + w / 2 - 9].map((hx) => <circle key={hx} cx={hx} cy={top + 9} r={4} fill="#f6f4ef" stroke="#c9b26a" strokeWidth={1.6} />)}
      <rect x={cx - 14} y={top + 16} width={28} height={28} rx={2} fill="#1c1e21" /><circle cx={cx - 10} cy={top + 20} r={1.4} fill="#5e656d" />
      <path d={`M${ax},${ay} h18 M${ax + 14},${ay - 3} l4,3 l-4,3 M${ax},${ay} v-18 M${ax - 3},${ay - 14} l3,-4 l3,4`} stroke="#e3eef9" strokeWidth={1.3} fill="none" />
      <g fontSize={6} fontWeight={700} fill="#e3eef9" pointerEvents="none" fontFamily="Inter Variable, Inter, sans-serif">
        <text x={ax + 22} y={ay + 2}>X</text><text x={ax - 2} y={ay - 22}>Y</text>
      </g>
      <g className="level">
        <circle cx={lx} cy={ly} r={12} fill="#e9f5ea" stroke="#9fd8b6" /><circle cx={lx} cy={ly} r={4.5} fill="none" stroke="#9fd8b6" />
        <circle className="bubble" cx={f(lx - 8 * Math.sin(tilt[0] * rad))} cy={f(ly + 8 * Math.sin(tilt[1] * rad))} r={3.6} fill="#2fb56a" />
      </g>
      <Header pins={pins} labels={['VCC', 'GND', 'SCL', 'SDA', 'XDA', 'XCL', 'AD0', 'INT']} bodyY={top + 74} upright={upright} />
    </>
  );
}

/** HC-SR04 (M6.4, screens 07, 19): pins VCC, Trig, Echo, GND in a row, its board below them as screen 07 drew it — turned
 *  (R) at the breadboard's top edge it faces away; while it measures, the sound going out. */
export function HcSr04({ vcc, trig, echo, gnd, sounding = false, upright = 0 }: { vcc: Point; trig: Point; echo: Point; gnd: Point; sounding?: boolean; upright?: number }) {
  const cx = (vcc.x + gnd.x) / 2;
  const y = vcc.y;
  const top = y + 16;
  const w = 226;
  const h = 100;
  const turn = (x: number, yy: number) => (upright ? `rotate(${upright} ${f(x)} ${f(yy)})` : undefined);
  return (
    <>
      <rect x={cx - w / 2} y={top} width={w} height={h} rx={5} fill="#1f6fb5" stroke="#134a7b" filter="url(#lift)" />
      {[cx - w / 2 + 54, cx + w / 2 - 54].map((tx) => (
        <g key={tx}>
          <circle cx={tx} cy={top + h / 2 + 4} r={38} fill="#c9cdd2" stroke="#8f969f" />
          <circle cx={tx} cy={top + h / 2 + 4} r={30} fill="#4d545c" opacity={0.55} />
          <circle cx={tx} cy={top + h / 2 + 4} r={22} fill="none" stroke="#9aa1a9" strokeDasharray="2 2" />
          {sounding && (
            <g className="waves" pointerEvents="none">
              {([[48, 0.55], [58, 0.35], [68, 0.2]] as const).map(([r, op]) => (
                <path key={r} d={`M${f(tx - r * 0.6)},${f(top + h + 4 + r * 0.25)} A${r} ${r} 0 0 0 ${f(tx + r * 0.6)},${f(top + h + 4 + r * 0.25)}`} stroke="#2563d9" strokeWidth={2} fill="none" opacity={op} />
              ))}
            </g>
          )}
        </g>
      ))}
      <rect x={cx - 12} y={top + h / 2 - 5} width={24} height={10} rx={5} fill="#c9cdd2" />
      <text x={cx} y={top + h - 8} fontSize={7} fill="#d5e6f7" textAnchor="middle" fontFamily="JetBrains Mono Variable, monospace" fontWeight={600}
        pointerEvents="none" transform={turn(cx, top + h - 10)}>HC-SR04</text>
      <rect x={vcc.x - 7} y={y + 7} width={gnd.x - vcc.x + 14} height={7} rx={1} fill="#26282c" />
      {([[vcc, 'VCC'], [trig, 'Trig'], [echo, 'Echo'], [gnd, 'GND']] as const).map(([p, t]) => (
        <g key={t}>
          <line x1={p.x} y1={p.y} x2={p.x} y2={top} stroke="#c7ccd2" strokeWidth={1.8} />
          <text x={p.x} y={top + 11} fontSize={5.5} fontWeight={700} fill="#e3eef9" textAnchor="middle" fontFamily="Inter Variable, Inter, sans-serif"
            pointerEvents="none" transform={turn(p.x, top + 9)}>{t}</text>
        </g>
      ))}
    </>
  );
}

// ------------------------------------------------------------------ the SunFounder kit's modules (M6.5a, screens 20, 20b)
const PCB: Record<string, [string, string]> = {
  blue: ['#2457a6', '#173c78'], red: ['#b8322a', '#7d1f19'], black: ['#26282c', '#0f1012'], purple: ['#5b3fa0', '#3b2875'], green: ['#2f7d3f', '#1f5a2b'],
};

/** Each kit module's legs in printed order, the names printed by them, its board's colour and height. */
export const KIT: Record<string, { legs: string[]; labels: string[]; pcb: string; h: number }> = {
  'button-module': { legs: ['out', 'vcc', 'gnd'], labels: ['S', 'VCC', 'GND'], pcb: 'black', h: 64 },
  touch: { legs: ['out', 'vcc', 'gnd'], labels: ['SIG', 'VCC', 'GND'], pcb: 'red', h: 64 },
  vibration: { legs: ['vcc', 'gnd', 'out'], labels: ['VCC', 'GND', 'DO'], pcb: 'blue', h: 64 },
  'ir-obstacle': { legs: ['out', 'gnd', 'vcc'], labels: ['OUT', 'GND', 'VCC'], pcb: 'blue', h: 64 },
  hall: { legs: ['out', 'vcc', 'gnd'], labels: ['S', 'VCC', 'GND'], pcb: 'blue', h: 64 },
  flame: { legs: ['ao', 'gnd', 'vcc', 'out'], labels: ['AO', 'GND', 'VCC', 'DO'], pcb: 'blue', h: 64 },
  raindrop: { legs: ['ao', 'out', 'gnd', 'vcc'], labels: ['AO', 'DO', 'GND', 'VCC'], pcb: 'blue', h: 64 },
  'water-level': { legs: ['out', 'vcc', 'gnd'], labels: ['S', 'VCC', 'GND'], pcb: 'red', h: 84 },
  mq2: { legs: ['ao', 'out', 'gnd', 'vcc'], labels: ['AO', 'DO', 'GND', 'VCC'], pcb: 'blue', h: 64 },
  'ldr-module': { legs: ['out', 'vcc', 'gnd'], labels: ['S', 'VCC', 'GND'], pcb: 'blue', h: 64 },
  'pot-module': { legs: ['out', 'vcc', 'gnd'], labels: ['S', 'VCC', 'GND'], pcb: 'blue', h: 64 },
  joystick: { legs: ['gnd', 'vcc', 'vrx', 'vry', 'sw'], labels: ['GND', 'VCC', 'VRx', 'VRy', 'SW'], pcb: 'black', h: 74 },
  'rotary-encoder': { legs: ['clk', 'dt', 'sw', 'vcc', 'gnd'], labels: ['CLK', 'DT', 'SW', 'VCC', 'GND'], pcb: 'blue', h: 70 },
  'speed-sensor': { legs: ['vcc', 'gnd', 'out'], labels: ['VCC', 'GND', 'DO'], pcb: 'blue', h: 64 },
  // the chips (M6.5b, screen 21)
  pcf8591: { legs: ['aout', 'ain3', 'ain2', 'ain1', 'ain0', 'scl', 'sda', 'gnd', 'vcc'], labels: ['AOUT', 'AIN3', 'AIN2', 'AIN1', 'AIN0', 'SCL', 'SDA', 'GND', 'VCC'], pcb: 'blue', h: 58 },
  bmp280: { legs: ['vcc', 'gnd', 'scl', 'sda', 'csb', 'sdo'], labels: ['VCC', 'GND', 'SCL', 'SDA', 'CSB', 'SDO'], pcb: 'purple', h: 58 },
  ds18b20: { legs: ['out', 'vcc', 'gnd'], labels: ['S', 'VCC', 'GND'], pcb: 'blue', h: 58 },
  ds1302: { legs: ['vcc', 'gnd', 'clk', 'dat', 'rst'], labels: ['VCC', 'GND', 'CLK', 'DAT', 'RST'], pcb: 'green', h: 64 },
  vl53l0x: { legs: ['vcc', 'gnd', 'scl', 'sda', 'gpio1', 'xshut'], labels: ['VIN', 'GND', 'SCL', 'SDA', 'GPIO1', 'XSHUT'], pcb: 'purple', h: 58 },
  max30102: { legs: ['vcc', 'scl', 'sda', 'int', 'gnd'], labels: ['VIN', 'SCL', 'SDA', 'INT', 'GND'], pcb: 'purple', h: 58 },
  // the kit's output modules (M7, screens 25, 25b)
  'traffic-module': { legs: ['r', 'y', 'g', 'gnd'], labels: ['R', 'Y', 'G', 'GND'], pcb: 'black', h: 44 },
  'rgb-module': { legs: ['r', 'g', 'b', 'gnd'], labels: ['R', 'G', 'B', '−'], pcb: 'black', h: 44 },
  'buzzer-module': { legs: ['io', 'vcc', 'gnd'], labels: ['I/O', 'VCC', 'GND'], pcb: 'black', h: 50 },
};

/** A small chip in an SOIC package, its pins on two sides. */
function Soic({ cx, y, w = 16, h = 10, label = '' }: { cx: number; y: number; w?: number; h?: number; label?: string }) {
  return (
    <>
      <rect x={cx - w / 2} y={y} width={w} height={h} rx={1} fill="#1c1e21" />
      {[0, 1, 2, 3].map((i) => {
        const x = f(cx - w / 2 + 2 + (i * (w - 4)) / 3 - 1);
        return <g key={i}><rect x={x} y={y - 2} width={2} height={2} fill="#c7ccd2" /><rect x={x} y={y + h} width={2} height={2} fill="#c7ccd2" /></g>;
      })}
      {label && <text x={cx} y={y + h / 2 + 2} fontSize={3.6} fill="#9aa1a9" textAnchor="middle" pointerEvents="none">{label}</text>}
    </>
  );
}

function Trimpot({ x, y }: { x: number; y: number }) {
  return (
    <>
      <rect x={x - 5} y={y - 5} width={10} height={10} rx={1.5} fill="#2f74d8" stroke="#1d4f9e" />
      <circle cx={x} cy={y} r={3} fill="#e9ebee" /><line x1={x - 2} y1={y} x2={x + 2} y2={y} stroke="#6b7280" />
    </>
  );
}

/** A module's power LED (red, dark without power) and its DO LED (green, lit when `on`). */
function ModuleLeds({ x, y, on, powered = true }: { x: number; y: number; on: boolean; powered?: boolean }) {
  on = on && powered;
  return (
    <>
      <rect className={powered ? 'power on' : 'power'} x={x - 9} y={y} width={6} height={3.5} rx={1} fill={powered ? '#ff5a4a' : '#5a2a27'} />
      <rect className={on ? 'do on' : 'do'} x={x + 3} y={y} width={6} height={3.5} rx={1} fill={on ? '#34d058' : '#3a3d42'} />
      {on && <circle cx={x + 6} cy={y + 2} r={6} fill="url(#glow-green)" />}
    </>
  );
}

/** What a kit module shows while running: held, its level 0–1, a joystick's axes, an encoder turning, a wheel's rpm,
 *  a potentiometer module's knob 0–1, the MQ-2's heater hot. */
export interface KitLook {
  pressed?: boolean; level?: number; x?: number; y?: number; turning?: boolean; rpm?: number; knob?: number; hot?: boolean; powered?: boolean;
  /** A PCF8591's AOUT 0–1 of VCC, a VL53L0X measuring, a finger on a MAX30102 (M6.5b). */
  aout?: number; measuring?: boolean; finger?: boolean;
  /** The kit's output modules (M7): the traffic light's R Y G and the RGB module's dies 0–1, the buzzer module's note. */
  lit?: [number, number, number]; note?: string;
}

/** One of the kit's modules (M6.5a, screen 20b): its board standing over its pins, 7 px beyond them each side, its
 *  element on it and — what it senses — over its top edge. */
export function KitModule({ type, pins, look = {}, upright = 0 }: { type: string; pins: Point[]; look?: KitLook; upright?: number }) {
  const k = KIT[type]!;
  const [fill, stroke] = PCB[k.pcb]!;
  const cx = (pins[0]!.x + pins[pins.length - 1]!.x) / 2;
  const w = pins[pins.length - 1]!.x - pins[0]!.x + 14;
  const top = pins[0]!.y - 16 - k.h;
  const lvl = Math.min(1, Math.max(0, look.level ?? 0));
  let el: React.ReactNode = null;
  let above: React.ReactNode = null;
  switch (type) {
    case 'button-module':
      el = (<><rect x={cx - 9} y={top + 12} width={18} height={18} rx={2} fill="#8d949c" stroke="#5e656d" />
        <circle cx={cx} cy={top + 21 + (look.pressed ? 1 : 0)} r={look.pressed ? 5.5 : 6} fill={look.pressed ? '#1f4c96' : '#2f6fd6'} /></>);
      break;
    case 'touch':
      el = (<><circle cx={cx} cy={top + 22} r={13} fill="none" stroke="#e8c26a" strokeWidth={2} />
        <text x={cx} y={top + 46} fontSize={5.5} fontWeight={700} fill="#f6d9d6" textAnchor="middle" pointerEvents="none">TOUCH</text>
        {look.pressed && <ellipse className="finger" cx={cx + 2} cy={top + 20} rx={11} ry={13} fill="#e9b48f" opacity={0.85} stroke="#c98b63" />}</>);
      break;
    case 'vibration':
      el = (<><rect x={cx - 12} y={top + 8} width={24} height={10} rx={5} fill="#c7ccd2" stroke="#8f969f" /><Trimpot x={cx} y={top + 32} /><ModuleLeds x={cx} y={top + 48} powered={look.powered ?? true} on={!!look.pressed} />
        {look.pressed && [-1, 1].map((d) => <path key={d} d={`M${cx + d * 16},${top + 6} q${d * 3},5 0,10 q${-d * 3},5 0,10`} stroke="#e8590c" strokeWidth={1.5} fill="none" />)}</>);
      break;
    case 'ir-obstacle':
      el = (<><circle cx={cx - 8} cy={top + 9} r={5.5} fill="#e9f0fa" stroke="#9aa1a9" /><circle cx={cx + 8} cy={top + 9} r={5.5} fill="#1c1e21" />
        <Trimpot x={cx} y={top + 30} /><ModuleLeds x={cx} y={top + 48} powered={look.powered ?? true} on={lvl >= 0.5} /></>);
      if (lvl >= 0.5) above = <rect className="obstacle" x={cx - 18} y={top - 26} width={36} height={16} rx={2} fill="#c08a52" stroke="#8a5c2e" />;
      break;
    case 'hall':
      el = (<><path d={`M${cx - 6},${top + 22} v-8 a6,4 0 0 1 12,0 v8 z`} fill="#1f2125" />
        <text x={cx} y={top + 30} fontSize={4.5} fill="#cfd3d8" textAnchor="middle" pointerEvents="none">3144</text><ModuleLeds x={cx} y={top + 48} powered={look.powered ?? true} on={lvl >= 0.5} /></>);
      if (lvl >= 0.5) above = (<g className="magnet"><rect x={cx - 18} y={top - 22} width={18} height={12} fill="#d94545" /><rect x={cx} y={top - 22} width={18} height={12} fill="#3b6fd8" />
        <g fontSize={7} fontWeight={700} fill="#fff" textAnchor="middle" pointerEvents="none"><text x={cx - 9} y={top - 13}>N</text><text x={cx + 9} y={top - 13}>S</text></g></g>);
      break;
    case 'flame':
      el = <><circle cx={cx} cy={top + 10} r={6} fill="#1c1e21" /><Trimpot x={cx} y={top + 30} /><ModuleLeds x={cx} y={top + 48} powered={look.powered ?? true} on={lvl >= 0.5} /></>;
      if (lvl > 0) above = (<g className="fire"><path d={`M${cx},${top - 34} q12,14 6,26 q-6,8 -12,0 q-6,-12 6,-26z`} fill="#ff8a00" opacity={f(0.4 + 0.6 * lvl)} />
        <path d={`M${cx},${top - 22} q6,8 3,14 q-3,4 -6,0 q-3,-6 3,-14z`} fill="#ffd43b" /></g>);
      break;
    case 'raindrop':
      el = <><Trimpot x={cx} y={top + 30} /><ModuleLeds x={cx} y={top + 48} powered={look.powered ?? true} on={lvl >= 0.4} /></>;
      above = (<g className="plate"><rect x={cx - 26} y={top - 40} width={52} height={34} rx={2} fill="#2f7d3f" stroke="#1f5a2b" />
        <path d={[34, 28, 22, 16].map((d) => `M${cx - 20},${top - d} h40`).join(' ')} stroke="#d6b24c" strokeWidth={1.6} />
        <path d={`M${cx - 8},${top - 6} v6 M${cx + 8},${top - 6} v6`} stroke="#a5abb2" strokeWidth={1.6} />
        {[[-14, -36], [6, -30], [-2, -24], [16, -20], [-18, -18]].slice(0, Math.round(lvl * 5)).map(([dx, dy], i) => (
          <path key={i} d={`M${cx + dx!},${top + dy!} q3,5 0,7 q-3,-2 0,-7z`} fill="#7fb4ff" />
        ))}</g>);
      break;
    case 'water-level':
      el = (<>{[0, 1, 2, 3, 4].map((i) => <line key={i} x1={cx - 10 + i * 5} y1={top + 6} x2={cx - 10 + i * 5} y2={top + 66} stroke="#e8c26a" strokeWidth={1.6} />)}
        {lvl > 0 && <rect className="water" x={cx - w / 2 - 4} y={top - 2} width={w + 8} height={f(70 * lvl)} fill="#7fb4ff" opacity={0.55} />}</>);
      break;
    case 'mq2':
      el = (<>{look.hot && <circle className="hot" cx={cx} cy={top + 20} r={20} fill="url(#glow-amber)" opacity={0.7} />}
        <circle cx={cx} cy={top + 20} r={15} fill="#c7ccd2" stroke="#8f969f" /><circle cx={cx} cy={top + 20} r={11} fill="#6d747c" stroke="#9aa1a9" />
        <path d={`M${cx - 8},${top + 16} h16 M${cx - 9},${top + 20} h18 M${cx - 8},${top + 24} h16`} stroke="#9aa1a9" strokeWidth={1} />
        <ModuleLeds x={cx} y={top + 48} powered={look.powered ?? true} on={lvl >= 0.4} /></>);
      if (lvl > 0) above = <g className="smoke">{[[-10, 10, 8], [6, 16, 10], [16, 6, 7]].map(([dx, dy, r]) => <circle key={dx} cx={cx + dx!} cy={top - dy!} r={r} fill="#9aa1a9" opacity={f(0.25 + 0.4 * lvl)} />)}</g>;
      break;
    case 'ldr-module':
      el = (<><circle cx={cx} cy={top + 18} r={9} fill="#f2d7a6" stroke="#c9a46a" />
        <path d={`M${cx - 5},${top + 14} h10 v3 h-10 v3 h10 v3 h-10`} stroke="#a5582d" strokeWidth={1.1} fill="none" /><ModuleLeds x={cx} y={top + 48} powered={look.powered ?? true} on={false} /></>);
      break;
    case 'pot-module': {
      const a = (((look.knob ?? 0.5) - 0.5) * 270 - 90) * (Math.PI / 180);
      el = (<><rect x={cx - 15} y={top + 6} width={30} height={30} rx={3} fill="#2b5fa8" stroke="#1b3f73" />
        <circle cx={cx} cy={top + 21} r={11} fill="#e9ebee" stroke="#9ba2aa" />
        <line x1={cx} y1={top + 21} x2={f(cx + 9 * Math.cos(a))} y2={f(top + 21 + 9 * Math.sin(a))} stroke="#2d3136" strokeWidth={2.2} strokeLinecap="round" /></>);
      break;
    }
    case 'joystick': {
      const dx = ((look.x ?? 0.5) - 0.5) * 22;
      const dy = (0.5 - (look.y ?? 0.5)) * 22;
      el = (<><circle cx={cx} cy={top + 34} r={27} fill="#c7ccd2" stroke="#8f969f" />
        <circle className="stick" cx={f(cx + dx)} cy={f(top + 34 + dy)} r={17} fill="#2d3136" stroke="#0f1012" />
        <circle cx={f(cx + dx)} cy={f(top + 34 + dy)} r={12} fill="none" stroke="#4a4e54" strokeDasharray="2 2" /></>);
      break;
    }
    case 'rotary-encoder':
      el = (<><rect x={cx - 17} y={top + 12} width={34} height={34} rx={3} fill="#8d949c" stroke="#5e656d" />
        <circle cx={cx} cy={top + 29} r={13} fill="#c7ccd2" stroke="#8f969f" /><path d={`M${cx - 9},${top + 24} h18`} stroke="#6d747c" strokeWidth={2} />
        {look.turning && <path className="turning" d={`M${cx + 22},${top + 14} A26 26 0 0 1 ${cx + 22},${top + 44} M${cx + 18},${top + 42} l4,3 l3,-4`} stroke="#e8590c" strokeWidth={2} fill="none" />}</>);
      break;
    case 'pcf8591': {
      const a = look.aout ?? 0;
      el = (<><Soic cx={cx} y={top + 12} w={20} h={12} label="PCF8591" />
        {[0, 1, 2].map((i) => <g key={i}><rect x={cx - 40 + i * 12} y={top + 34} width={6} height={9} rx={1} fill="#1c1e21" /><rect x={cx - 39 + i * 12} y={top + 35} width={4} height={4} fill="#e8b10f" /></g>)}
        <rect className={a > 0.01 ? 'aout on' : 'aout'} x={cx + 26} y={top + 36} width={6} height={3.5} rx={1} fill={a > 0.01 ? '#ff5a4a' : '#5a2a27'} />
        {a > 0.01 && <circle cx={cx + 29} cy={top + 38} r={f(4 + 6 * a)} fill="url(#glow-red)" />}</>);
      break;
    }
    case 'bmp280':
      el = (<><rect x={cx - 7} y={top + 14} width={14} height={14} rx={1.5} fill="#c7ccd2" stroke="#8f969f" /><circle cx={cx + 3.5} cy={top + 17.5} r={1.2} fill="#6d747c" />
        <text x={cx} y={top + 44} fontSize={5} fontWeight={700} fill="#e3dff5" textAnchor="middle" pointerEvents="none">BMP280</text></>);
      break;
    case 'ds18b20':
      el = (<><path d={`M${cx - 9},${top + 34} v-14 a9,6 0 0 1 18,0 v14 z`} fill="#1f2125" />
        <text x={cx} y={top + 29} fontSize={3.6} fill="#cfd3d8" textAnchor="middle" pointerEvents="none">18B20</text>
        <rect x={cx + 9} y={top + 40} width={8} height={4} rx={1} fill="#e3cb98" /></>);
      break;
    case 'ds1302':
      el = (<><circle cx={cx} cy={top + 22} r={17} fill="#c7ccd2" stroke="#8f969f" />
        <text x={cx} y={top + 24} fontSize={5} fontWeight={700} fill="#6d747c" textAnchor="middle" pointerEvents="none">CR2032</text>
        <Soic cx={cx - 14} y={top + 46} w={14} h={8} /><rect x={cx + 6} y={top + 46} width={16} height={6} rx={3} fill="#c7ccd2" stroke="#8f969f" /></>);
      break;
    case 'vl53l0x':
      el = (<><rect x={cx - 9} y={top + 12} width={18} height={9} rx={1.5} fill="#1c1e21" />
        <circle cx={cx - 4} cy={top + 16.5} r={2} fill="#3a3d42" /><circle cx={cx + 4} cy={top + 16.5} r={2} fill="#3a3d42" />
        <text x={cx} y={top + 44} fontSize={5} fontWeight={700} fill="#e3dff5" textAnchor="middle" pointerEvents="none">VL53L0X</text></>);
      if (look.measuring) above = (<g className="beam"><path d={`M${cx - 4},${top + 12} L${cx - 4},${top - 46}`} stroke="#e8432a" strokeWidth={1.6} strokeDasharray="3 3" />
        <rect x={cx - 22} y={top - 56} width={44} height={10} rx={2} fill="#c08a52" stroke="#8a5c2e" /></g>);
      break;
    case 'max30102':
      el = (<><rect x={cx - 8} y={top + 12} width={16} height={12} rx={2} fill="#1c1e21" />
        <rect x={cx - 6} y={top + 14} width={5} height={8} rx={1} fill="#8a1d1d" /><rect x={cx + 1} y={top + 14} width={5} height={8} rx={1} fill="#2a2d33" />
        <text x={cx} y={top + 44} fontSize={5} fontWeight={700} fill="#e3dff5" textAnchor="middle" pointerEvents="none">MAX30102</text>
        {look.finger && (<g className="finger"><path d={`M${cx - 14},${top + 40} q-2,-30 14,-34 q16,4 14,34 z`} fill="#e9b48f" opacity={0.92} stroke="#c98b63" />
          <ellipse cx={cx} cy={top + 12} rx={8} ry={4} fill="#f4d3bd" opacity={0.9} />
          {look.powered && <circle cx={cx} cy={top + 22} r={14} fill="url(#glow-red)" opacity={0.6} />}</g>)}</>);
      break;
    case 'traffic-module':
      el = <>{(['#ef3b2c', '#f5c400', '#22b14c'] as const).map((col, i) => {
        const on = (look.lit?.[i] ?? 0) > 0.01;
        const lx = cx - 18 + i * 18;
        return <g key={col} data-light={'ryg'[i]} data-on={on ? '1' : '0'}><circle cx={lx} cy={top + 22} r={6.5} fill={on ? col : '#3a3d42'} stroke="#15171a" />
          {on && <circle cx={lx} cy={top + 22} r={16} fill={`url(#glow-${['red', 'amber', 'green'][i]})`} opacity={f(0.4 + 0.6 * (look.lit?.[i] ?? 0))} />}</g>;
      })}</>;
      break;
    case 'rgb-module': {
      const [r, g, b] = look.lit ?? [0, 0, 0];
      const mix = r || g || b ? `rgb(${Math.round(120 + 135 * r)},${Math.round(120 + 135 * g)},${Math.round(120 + 135 * b)})` : '#e9edf2';
      el = <><circle cx={cx} cy={top + 22} r={9} fill={mix} stroke="#c9d0d8" />
        {([[r, 'red', -3], [g, 'green', 0], [b, 'blue', 3]] as const).map(([v, glow, dx]) => v > 0.01 && <circle key={glow} cx={cx + dx} cy={top + 22} r={f(10 + 12 * v)} fill={`url(#glow-${glow})`} opacity={f(0.4 + 0.6 * v)} />)}</>;
      break;
    }
    case 'buzzer-module':
      el = <><circle cx={cx} cy={top + 24} r={13} fill="#26282c" /><circle cx={cx} cy={top + 24} r={8} fill="none" stroke="#3b3e43" /><circle cx={cx} cy={top + 24} r={2} fill="#0f1012" />
        {look.note && <g className="waves">{[1, 2].map((k) => <path key={k} d={`M${cx + 14 + 5 * k},${top + 14} q${5 + 2 * k},10 0,20`} stroke="#2563d9" strokeWidth={1.5} fill="none" />)}</g>}</>;
      if (look.note) above = <text x={cx} y={top - 6} fontSize={9} fontWeight={700} fill="#2563d9" textAnchor="middle" pointerEvents="none">♪ {look.note}</text>;
      break;
    case 'speed-sensor':
      el = <><rect x={cx - 14} y={top + 4} width={9} height={22} rx={1} fill="#1c1e21" /><rect x={cx + 5} y={top + 4} width={9} height={22} rx={1} fill="#1c1e21" /><ModuleLeds x={cx} y={top + 48} powered={look.powered ?? true} on={(look.rpm ?? 0) > 0} /></>;
      above = (<g className="wheel"><circle cx={cx} cy={top - 12} r={26} fill="#e8b10f" stroke="#a87e08" />
        {Array.from({ length: 20 }, (_, i) => <rect key={i} x={cx - 2} y={top - 36} width={4} height={7} fill="#f6f4ef" transform={`rotate(${i * 18} ${cx} ${top - 12})`} />)}
        <circle cx={cx} cy={top - 12} r={5} fill="#a87e08" />
        {(look.rpm ?? 0) > 0 && <path d={`M${cx - 32},${top - 30} A34 34 0 0 1 ${cx - 10},${top - 44}`} stroke="#e8590c" strokeWidth={2} fill="none" />}</g>);
      break;
  }
  return (
    <>
      {above}
      <rect x={cx - w / 2} y={top} width={w} height={k.h} rx={3} fill={fill} stroke={stroke} filter="url(#lift)" />
      {el}
      <Header pins={pins} labels={k.labels} bodyY={top + k.h} upright={upright} />
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
  /** A PIR's OUT high, a soil sensor's moisture 0–1 (M6.3). */
  motion?: boolean;
  moisture?: number;
  /** An MPU6050's tilt, degrees about Y and X (M6.4b). */
  tilt?: [number, number];
  /** A kit module's state while running (M6.5a). */
  kit?: KitLook;
  /** An actuator's state while running (M7). */
  act?: ActLook;
}

/** `legs`: where its legs are — and its terminals (M7: screws, a socket), and for a part beside the breadboard, '@'
 *  where it lies. */
export function PartDrawing({ type, legs, props, look = {}, label = '' }: { type: string; legs: Record<string, Point>; props?: Record<string, unknown>; look?: PartLook; label?: string }) {
  const act = look.act ?? {};
  switch (type) {
    // M7: the parts that lie beside the breadboard, drawn where they lie
    case 'motor': return legs['@'] ? <TtMotor at={legs['@']} rpm={act.rpm} direction={act.direction} label={label} /> : null;
    case 'pump': return legs['@'] ? <Pump at={legs['@']} running={act.running} label={label} /> : null;
    case 'l298n': return legs['@'] ? <L298nBoard at={legs['@']} dirs={act.dirs} ena={props?.ena !== false} enb={props?.enb !== false} /> : null;
    case 'stepper': {
      const plug = ['blue', 'pink', 'yellow', 'orange', 'red'].map((l) => legs[l]);
      return legs['@'] && plug.every(Boolean) ? <Stepper at={legs['@']} plug={plug as Point[]} steps={act.steps} turning={act.running} /> : null;
    }
    case 'power-supply':
      return <PowerSupply first={legs['t-1']!} pins={['t-1', 't-2', 't+1', 't+2', 'b+1', 'b+2', 'b-1', 'b-2'].map((l) => legs[l]!)} top={Number(props?.top ?? 5)} bottom={Number(props?.bottom ?? 3.3)} on={props?.on !== false} />;
    case 'servo': case 'l9110s': case 'relay': case 'uln2003': {
      const t = partTurns(type, legs);
      const { local, transform } = unturned(legs, t);
      const up = -90 * t;
      const at = (names: string[]) => names.map((n) => local[n]!);
      const pick = (names: string[]) => Object.fromEntries(names.map((n) => [n, local[n]!]));
      const body = type === 'servo' ? <ServoPlug s={local.signal!} v={local.vcc!} g={local.gnd!} angle={act.angle} upright={up} />
        : type === 'l9110s' ? <L9110sDriver pins={at(['b-ia', 'b-ib', 'gnd', 'vcc', 'a-ia', 'a-ib'])} screws={pick(['a1', 'a2', 'b1', 'b2'])} dirs={act.dirs} upright={up} />
        : type === 'relay' ? <RelayModule pins={at(['s', 'vcc', 'gnd'])} screws={pick(['no', 'com', 'nc'])} on={act.on} upright={up} />
        : <Uln2003 pins={at(['in1', 'in2', 'in3', 'in4', '-', '+'])} socket={at(['a', 'b', 'c', 'd', 'm'])} coils={act.coils} upright={up} />;
      return t ? <g transform={transform}>{body}</g> : body;
    }
    case 'resistor': return <Resistor a={legs.a!} b={legs.b!} ohms={Number(props?.ohms ?? 220)} />;
    case 'button': return <PushButton legs={[legs['1a']!, legs['2a']!, legs['1b']!, legs['2b']!]} pressed={look.pressed} />;
    case 'battery': return <Battery plus={legs['+']!} minus={legs['-']!} kind={String(props?.kind ?? '2xAA')} />;
    case 'led': case 'potentiometer': case 'slide-switch': case 'ldr': case 'rgb-led': case 'buzzer':
    case 'pir': case 'line-sensor': case 'soil-moisture': case 'temp-sensor': case 'dht': case 'hc-sr04': case 'mpu6050':
    case 'button-module': case 'touch': case 'vibration': case 'ir-obstacle': case 'hall': case 'flame': case 'raindrop': case 'water-level':
    case 'mq2': case 'ldr-module': case 'pot-module': case 'joystick': case 'rotary-encoder': case 'speed-sensor':
    case 'pcf8591': case 'bmp280': case 'ds18b20': case 'ds1302': case 'vl53l0x': case 'max30102':
    case 'traffic-module': case 'rgb-module': case 'buzzer-module': {
      // drawn as if not turned, then turned about the legs' middle (M5.1); the letters and signs stay upright
      const t = partTurns(type, legs);
      const { local, transform } = unturned(legs, t);
      const up = -90 * t;
      const body = KIT[type] ? <KitModule type={type} pins={KIT[type]!.legs.map((l) => local[l]!)} look={look.kit} upright={up} /> : ({
        led: () => <Led a={local.a!} k={local.k!} colour={String(props?.color ?? 'red')} glow={look.glow} upright={up} />,
        potentiometer: () => <Potentiometer l={local['1']!} w={local['2']!} r={local['3']!} angle={((look.position ?? 0.5) - 0.5) * 270} />,
        'slide-switch': () => <SlideSwitch l={local['1']!} m={local['2']!} r={local['3']!} position={look.position} upright={up} />,
        ldr: () => <Ldr a={local.a!} b={local.b!} />,
        buzzer: () => <Buzzer p={local['+']!} m={local['-']!} sounding={look.sounding} upright={up} />,
        pir: () => <Pir vcc={local.vcc!} out={local.out!} gnd={local.gnd!} motion={look.motion} upright={up} />,
        'line-sensor': () => <LineSensor out={local.out!} gnd={local.gnd!} vcc={local.vcc!} overLine={(look.position ?? 0) >= 0.5} upright={up} />,
        'soil-moisture': () => <SoilSensor aout={local.out!} vcc={local.vcc!} gnd={local.gnd!} moisture={look.moisture} upright={up} />,
        dht: () => <Dht vcc={local.vcc!} data={local.out!} gnd={local.gnd!} kind={String(props?.kind ?? 'DHT11')} upright={up} />,
        'hc-sr04': () => <HcSr04 vcc={local.vcc!} trig={local.trig!} echo={local.echo!} gnd={local.gnd!} sounding={look.sounding} upright={up} />,
        mpu6050: () => <Gy521 pins={['vcc', 'gnd', 'scl', 'sda', 'xda', 'xcl', 'ad0', 'int'].map((l) => local[l]!)} tilt={look.tilt} upright={up} />,
        'temp-sensor': () => <TempSensor vs={local.vcc!} vout={local.out!} gnd={local.gnd!} kind={String(props?.kind ?? 'TMP36')} upright={up} />,
        'rgb-led': () => <RgbLed r={local.r!} c={local.common!} g={local.g!} b={local.b!} dies={look.dies} common={String(props?.common ?? 'cathode')} upright={up} />,
      } as Record<string, () => React.ReactNode>)[type]!();
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
/** The kit's modules' icons as the prototype draws them (design/svgparts.py ICON_PARTS k…): our own constant markup. */
const KIT_ICONS: Record<string, string> = {
  "button-module": "<rect x=\"5\" y=\"9\" width=\"22\" height=\"16\" rx=\"2\" fill=\"#26282c\"/><path d=\"M10,25 v5 M16,25 v5 M22,25 v5\" stroke=\"#a5abb2\" stroke-width=\"1.3\"/><rect x=\"11\" y=\"12\" width=\"10\" height=\"10\" rx=\"1\" fill=\"#8d949c\"/><circle cx=\"16\" cy=\"17\" r=\"3.5\" fill=\"#2f6fd6\"/>",
  "touch": "<rect x=\"5\" y=\"9\" width=\"22\" height=\"16\" rx=\"2\" fill=\"#b8322a\"/><path d=\"M10,25 v5 M16,25 v5 M22,25 v5\" stroke=\"#a5abb2\" stroke-width=\"1.3\"/><circle cx=\"16\" cy=\"17\" r=\"5.5\" fill=\"none\" stroke=\"#e8c26a\" stroke-width=\"1.6\"/>",
  "vibration": "<rect x=\"5\" y=\"9\" width=\"22\" height=\"16\" rx=\"2\" fill=\"#2457a6\"/><path d=\"M10,25 v5 M16,25 v5 M22,25 v5\" stroke=\"#a5abb2\" stroke-width=\"1.3\"/><rect x=\"9\" y=\"12\" width=\"14\" height=\"6\" rx=\"3\" fill=\"#c7ccd2\"/>",
  "ir-obstacle": "<rect x=\"5\" y=\"9\" width=\"22\" height=\"16\" rx=\"2\" fill=\"#2457a6\"/><path d=\"M10,25 v5 M16,25 v5 M22,25 v5\" stroke=\"#a5abb2\" stroke-width=\"1.3\"/><circle cx=\"12\" cy=\"14\" r=\"3.2\" fill=\"#e9f0fa\"/><circle cx=\"20\" cy=\"14\" r=\"3.2\" fill=\"#1c1e21\"/>",
  "hall": "<rect x=\"5\" y=\"9\" width=\"22\" height=\"16\" rx=\"2\" fill=\"#2457a6\"/><path d=\"M10,25 v5 M16,25 v5 M22,25 v5\" stroke=\"#a5abb2\" stroke-width=\"1.3\"/><path d=\"M13,20 v-5 a3,2.5 0 0 1 6,0 v5z\" fill=\"#1f2125\"/><rect x=\"9\" y=\"3\" width=\"7\" height=\"5\" fill=\"#d94545\"/><rect x=\"16\" y=\"3\" width=\"7\" height=\"5\" fill=\"#3b6fd8\"/>",
  "flame": "<rect x=\"5\" y=\"9\" width=\"22\" height=\"16\" rx=\"2\" fill=\"#2457a6\"/><path d=\"M10,25 v5 M16,25 v5 M22,25 v5\" stroke=\"#a5abb2\" stroke-width=\"1.3\"/><path d=\"M16,3 q6,6 3,12 q-3,4 -6,0 q-3,-6 3,-12z\" fill=\"#ff8a00\"/>",
  "raindrop": "<rect x=\"5\" y=\"9\" width=\"22\" height=\"16\" rx=\"2\" fill=\"#2457a6\"/><path d=\"M10,25 v5 M16,25 v5 M22,25 v5\" stroke=\"#a5abb2\" stroke-width=\"1.3\"/><rect x=\"7\" y=\"2\" width=\"18\" height=\"8\" rx=\"1\" fill=\"#2f7d3f\"/><path d=\"M9,4.5 h14 M9,7.5 h14\" stroke=\"#d6b24c\" stroke-width=\"1\"/>",
  "water-level": "<rect x=\"11\" y=\"2\" width=\"10\" height=\"24\" rx=\"1.5\" fill=\"#b8322a\"/><path d=\"M13,3 v14 M16,3 v14 M19,3 v14\" stroke=\"#e8c26a\" stroke-width=\"1\"/><rect x=\"9\" y=\"2\" width=\"14\" height=\"9\" fill=\"#7fb4ff\" opacity=\".6\"/><path d=\"M13,26 v4 M16,26 v4 M19,26 v4\" stroke=\"#a5abb2\" stroke-width=\"1.3\"/>",
  "mq2": "<rect x=\"5\" y=\"9\" width=\"22\" height=\"16\" rx=\"2\" fill=\"#2457a6\"/><path d=\"M10,25 v5 M16,25 v5 M22,25 v5\" stroke=\"#a5abb2\" stroke-width=\"1.3\"/><circle cx=\"16\" cy=\"16\" r=\"6\" fill=\"#c7ccd2\" stroke=\"#8f969f\"/><circle cx=\"16\" cy=\"16\" r=\"3.5\" fill=\"#6d747c\"/>",
  "ldr-module": "<rect x=\"5\" y=\"9\" width=\"22\" height=\"16\" rx=\"2\" fill=\"#2457a6\"/><path d=\"M10,25 v5 M16,25 v5 M22,25 v5\" stroke=\"#a5abb2\" stroke-width=\"1.3\"/><circle cx=\"16\" cy=\"16\" r=\"5\" fill=\"#f2d7a6\" stroke=\"#c9a46a\"/>",
  "pot-module": "<rect x=\"5\" y=\"9\" width=\"22\" height=\"16\" rx=\"2\" fill=\"#2457a6\"/><path d=\"M10,25 v5 M16,25 v5 M22,25 v5\" stroke=\"#a5abb2\" stroke-width=\"1.3\"/><circle cx=\"16\" cy=\"16\" r=\"5.5\" fill=\"#e9ebee\"/><line x1=\"16\" y1=\"16\" x2=\"18\" y2=\"12\" stroke=\"#2d3136\" stroke-width=\"1.6\"/>",
  "joystick": "<rect x=\"4\" y=\"6\" width=\"24\" height=\"20\" rx=\"2\" fill=\"#26282c\"/><circle cx=\"16\" cy=\"16\" r=\"8\" fill=\"#c7ccd2\"/><circle cx=\"17\" cy=\"15\" r=\"5\" fill=\"#2d3136\"/>",
  "rotary-encoder": "<rect x=\"5\" y=\"9\" width=\"22\" height=\"16\" rx=\"2\" fill=\"#2457a6\"/><path d=\"M10,25 v5 M16,25 v5 M22,25 v5\" stroke=\"#a5abb2\" stroke-width=\"1.3\"/><circle cx=\"16\" cy=\"16\" r=\"6\" fill=\"#c7ccd2\" stroke=\"#8f969f\"/><path d=\"M12,14 h8\" stroke=\"#6d747c\" stroke-width=\"1.4\"/>",
  "speed-sensor": "<rect x=\"5\" y=\"9\" width=\"22\" height=\"16\" rx=\"2\" fill=\"#2457a6\"/><path d=\"M10,25 v5 M16,25 v5 M22,25 v5\" stroke=\"#a5abb2\" stroke-width=\"1.3\"/><circle cx=\"16\" cy=\"8\" r=\"7\" fill=\"#e8b10f\"/><rect x=\"11\" y=\"12\" width=\"3\" height=\"8\" fill=\"#1c1e21\"/><rect x=\"18\" y=\"12\" width=\"3\" height=\"8\" fill=\"#1c1e21\"/>",
  "pcf8591": "<rect x=\"2\" y=\"9\" width=\"28\" height=\"15\" rx=\"2\" fill=\"#2457a6\"/><rect x=\"11\" y=\"12\" width=\"10\" height=\"7\" rx=\"1\" fill=\"#1c1e21\"/><path d=\"M5,24 v5 M9,24 v5 M13,24 v5 M17,24 v5 M21,24 v5 M25,24 v5\" stroke=\"#a5abb2\" stroke-width=\"1.2\"/>",
  "bmp280": "<rect x=\"6\" y=\"9\" width=\"20\" height=\"15\" rx=\"2\" fill=\"#5b3fa0\"/><rect x=\"12\" y=\"12\" width=\"8\" height=\"8\" rx=\"1\" fill=\"#c7ccd2\"/><path d=\"M9,24 v5 M13,24 v5 M17,24 v5 M21,24 v5\" stroke=\"#a5abb2\" stroke-width=\"1.2\"/>",
  "ds18b20": "<rect x=\"8\" y=\"9\" width=\"16\" height=\"15\" rx=\"2\" fill=\"#2457a6\"/><path d=\"M12,21 v-6 a4,3 0 0 1 8,0 v6z\" fill=\"#1f2125\"/><path d=\"M12,24 v5 M16,24 v5 M20,24 v5\" stroke=\"#a5abb2\" stroke-width=\"1.3\"/>",
  "ds1302": "<rect x=\"5\" y=\"6\" width=\"22\" height=\"18\" rx=\"2\" fill=\"#2f7d3f\"/><circle cx=\"16\" cy=\"14\" r=\"6\" fill=\"#c7ccd2\"/><path d=\"M8,24 v5 M12,24 v5 M16,24 v5 M20,24 v5 M24,24 v5\" stroke=\"#a5abb2\" stroke-width=\"1.2\"/>",
  "vl53l0x": "<rect x=\"6\" y=\"9\" width=\"20\" height=\"15\" rx=\"2\" fill=\"#5b3fa0\"/><rect x=\"11\" y=\"12\" width=\"10\" height=\"5\" rx=\"1\" fill=\"#1c1e21\"/><path d=\"M14,8 v-6\" stroke=\"#e8432a\" stroke-width=\"1.4\" stroke-dasharray=\"2 1.5\"/>",
  "max30102": "<rect x=\"6\" y=\"9\" width=\"20\" height=\"15\" rx=\"2\" fill=\"#5b3fa0\"/><rect x=\"12\" y=\"12\" width=\"8\" height=\"6\" rx=\"1\" fill=\"#1c1e21\"/><rect x=\"13\" y=\"13\" width=\"3\" height=\"4\" fill=\"#8a1d1d\"/>"
};

/** M7's actuators and output modules, as the prototype draws them (design/svgparts.py ICON_PARTS). */
const M7_ICONS: Record<string, string> = {
  "servo": "<rect x=\"4\" y=\"11\" width=\"22\" height=\"12\" rx=\"2\" fill=\"#3a8ae0\"/><rect x=\"1\" y=\"14\" width=\"4\" height=\"6\" rx=\"1\" fill=\"#2f76c9\"/><rect x=\"25\" y=\"14\" width=\"4\" height=\"6\" rx=\"1\" fill=\"#2f76c9\"/><path d=\"M8,17 L10,5 L12,17Z\" fill=\"#f4f4f4\" stroke=\"#b9bec5\" stroke-width=\".8\"/><circle cx=\"10\" cy=\"17\" r=\"2\" fill=\"#fff\" stroke=\"#b9bec5\" stroke-width=\".8\"/>",
  "motor": "<rect x=\"4\" y=\"9\" width=\"18\" height=\"14\" rx=\"3\" fill=\"#f1c232\"/><rect x=\"22\" y=\"12\" width=\"5\" height=\"8\" rx=\"1\" fill=\"#c9cdd2\"/><circle cx=\"12\" cy=\"16\" r=\"3\" fill=\"#d4a417\"/>",
  "l9110s": "<rect x=\"4\" y=\"5\" width=\"24\" height=\"22\" rx=\"2\" fill=\"#c2312f\"/><rect x=\"11\" y=\"3\" width=\"10\" height=\"10\" rx=\"1\" fill=\"#2d3136\"/><rect x=\"7\" y=\"20\" width=\"18\" height=\"4\" fill=\"#2f8f4f\"/>",
  "l298n": "<rect x=\"3\" y=\"5\" width=\"26\" height=\"22\" rx=\"2\" fill=\"#b8322a\"/><rect x=\"11\" y=\"7\" width=\"10\" height=\"9\" fill=\"#1f2227\"/><rect x=\"5\" y=\"9\" width=\"5\" height=\"4\" fill=\"#2f9d57\"/><rect x=\"22\" y=\"9\" width=\"5\" height=\"4\" fill=\"#2f9d57\"/>",
  "relay": "<rect x=\"5\" y=\"6\" width=\"22\" height=\"20\" rx=\"2\" fill=\"#2f6fd6\"/><rect x=\"8\" y=\"9\" width=\"16\" height=\"9\" rx=\"1\" fill=\"#1f4c96\"/><rect x=\"8\" y=\"21\" width=\"16\" height=\"3\" fill=\"#2f8f4f\"/>",
  "pump": "<path d=\"M7,8 L9,27 Q16,29 23,27 L25,8Z\" fill=\"#9fd0f2\" stroke=\"#7fa9c8\"/><rect x=\"12\" y=\"16\" width=\"8\" height=\"10\" rx=\"2.5\" fill=\"#26282c\"/><path d=\"M17,16 C17,6 26,4 27,8\" stroke=\"#d9e2ea\" stroke-width=\"2\" fill=\"none\"/>",
  "uln2003": "<circle cx=\"16\" cy=\"17\" r=\"11\" fill=\"#c7ccd2\" stroke=\"#8f969f\"/><circle cx=\"16\" cy=\"19\" r=\"7.5\" fill=\"#2f6fd6\"/><circle cx=\"16\" cy=\"13\" r=\"2.6\" fill=\"#d6b24c\"/>",
  "stepper": "<circle cx=\"16\" cy=\"17\" r=\"11\" fill=\"#c7ccd2\" stroke=\"#8f969f\"/><circle cx=\"16\" cy=\"19\" r=\"7.5\" fill=\"#2f6fd6\"/><circle cx=\"16\" cy=\"13\" r=\"2.6\" fill=\"#d6b24c\"/>",
  "traffic-module": "<rect x=\"4\" y=\"11\" width=\"24\" height=\"11\" rx=\"2\" fill=\"#26282c\"/><circle cx=\"10\" cy=\"16.5\" r=\"3\" fill=\"#ef3b2c\"/><circle cx=\"16\" cy=\"16.5\" r=\"3\" fill=\"#f5c400\"/><circle cx=\"22\" cy=\"16.5\" r=\"3\" fill=\"#22b14c\"/>",
  "rgb-module": "<rect x=\"6\" y=\"9\" width=\"20\" height=\"15\" rx=\"2\" fill=\"#26282c\"/><circle cx=\"16\" cy=\"16.5\" r=\"5\" fill=\"#e9edf2\"/><circle cx=\"14\" cy=\"15\" r=\"1.6\" fill=\"#ef3b2c\"/><circle cx=\"18\" cy=\"15\" r=\"1.6\" fill=\"#22b14c\"/><circle cx=\"16\" cy=\"18.5\" r=\"1.6\" fill=\"#2f6fe0\"/>",
  "buzzer-module": "<rect x=\"6\" y=\"9\" width=\"20\" height=\"15\" rx=\"2\" fill=\"#26282c\"/><circle cx=\"16\" cy=\"16.5\" r=\"5.5\" fill=\"#15171a\" stroke=\"#3b3e43\"/>",
  "power-supply": "<rect x=\"5\" y=\"4\" width=\"22\" height=\"24\" rx=\"2\" fill=\"#26282c\"/><rect x=\"8\" y=\"8\" width=\"7\" height=\"6\" fill=\"#15171a\"/><rect x=\"8\" y=\"18\" width=\"7\" height=\"5\" fill=\"#c7ccd2\"/><rect x=\"18\" y=\"9\" width=\"6\" height=\"4\" fill=\"#efbd16\"/><rect x=\"18\" y=\"19\" width=\"6\" height=\"4\" fill=\"#efbd16\"/>",
};

/** A breadboard in the parts panel (M6.8): mini (no rails), half, full — wider as it grows. */
export function BreadboardIcon({ size }: { size: 'mini' | 'half' | 'full' }) {
  const w = { mini: 16, half: 24, full: 30 }[size];
  const x = (32 - w) / 2;
  const cols = { mini: 3, half: 5, full: 6 }[size];
  const dots = [];
  for (let c = 0; c < cols; c++) for (const y of [13, 16, 19]) dots.push(<rect key={`${c}-${y}`} x={x + 3 + c * ((w - 6) / Math.max(1, cols - 1)) - 0.7} y={y - 0.7} width={1.4} height={1.4} fill="#4a463e" />);
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <rect x={x} y={size === 'mini' ? 10 : 7} width={w} height={size === 'mini' ? 12 : 18} rx={2} fill="#f6f4ef" stroke="#cfc8b8" />
      {size !== 'mini' && <><line x1={x + 2} y1={9.5} x2={x + w - 2} y2={9.5} stroke="#d94545" strokeWidth={0.8} /><line x1={x + 2} y1={22.5} x2={x + w - 2} y2={22.5} stroke="#3b6fd8" strokeWidth={0.8} /></>}
      {dots}
    </svg>
  );
}

export function PartIcon({ type }: { type: string }) {
  const markup = KIT_ICONS[type] ?? M7_ICONS[type];
  if (markup) return <svg viewBox="0 0 32 32" aria-hidden="true" dangerouslySetInnerHTML={{ __html: markup }} />;
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
    'hc-sr04': <><rect x="2" y="9" width="28" height="14" rx="2" fill="#1f6fb5" /><circle cx="9" cy="16" r="5.5" fill="#c9cdd2" /><circle cx="23" cy="16" r="5.5" fill="#c9cdd2" /><circle cx="9" cy="16" r="3.5" fill="#6d747c" /><circle cx="23" cy="16" r="3.5" fill="#6d747c" /></>,
    dht: (
      <>
        <rect x="9" y="4" width="14" height="20" rx="2" fill="#3f8fe0" />
        <path fill="#1f5ea8" d={[0, 1, 2].flatMap((c) => [0, 1, 2, 3].map((r) => `M${11 + c * 3.5},${7 + r * 3.5}h2v2h-2z`)).join('')} />
        <path d="M12,24 v5 M15,24 v5 M18,24 v5 M21,24 v5" stroke="#a5abb2" strokeWidth="1.3" />
      </>
    ),
    mpu6050: <><rect x="4" y="8" width="24" height="16" rx="2" fill="#3b5bb7" /><rect x="12" y="11" width="8" height="8" rx="1" fill="#1c1e21" /><path d="M6,27 v3 M9,27 v3 M12,27 v3 M15,27 v3 M18,27 v3 M21,27 v3 M24,27 v3 M27,27 v3" stroke="#a5abb2" strokeWidth="1.2" /></>,
    pir: <><rect x="5" y="17" width="22" height="9" rx="2" fill="#2f8f4f" /><path d="M8,18 a8,8 0 0 1 16,0Z" fill="#f2f3f5" stroke="#c9d0d8" /></>,
    'line-sensor': <><rect x="10" y="3" width="12" height="26" rx="2" fill="#2b5fa8" /><circle cx="16" cy="23" r="3" fill="#2d3136" /><circle cx="16" cy="16" r="2.5" fill="#d6d9de" /></>,
    'soil-moisture': <><path d="M11,3 h10 v20 l-5,6 l-5,-6 z" fill="#1d1f22" /><path d="M13,8 h6 M13,12 h6" stroke="#e8d49a" strokeWidth="1" opacity=".6" /></>,
    'temp-sensor': <><path d="M10,6 h12 v10 a6,3 0 0 1 -12,0Z" fill="#2d3136" /><path d="M12,18 v11 M16,19 v11 M20,18 v11" stroke="#a5abb2" strokeWidth="1.4" /></>,
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
    // the micro:bit GPIO board (M6.9, design/svgparts.py ICON_PARTS gpioboard): the micro:bit in its slot, two rows of pins
    'gpio-board': (
      <>
        <rect x="3" y="12" width="26" height="15" rx="2" fill="#1d4f9e" /><rect x="7" y="4" width="18" height="11" rx="2" fill="#1d1e21" />
        <rect x="6" y="13" width="20" height="3" rx="1" fill="#121a24" />
        {[20, 24].flatMap((y) => Array.from({ length: 9 }, (_, i) => <circle key={`${i}-${y}`} cx={6 + i * 2.5} cy={y} r={0.8} fill="#d3d7dc" />))}
      </>
    ),
  }[type];
  return <svg viewBox="0 0 32 32" aria-hidden="true">{body}</svg>;
}
