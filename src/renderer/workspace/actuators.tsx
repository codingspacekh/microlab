import type { Point } from '@lib/editor';

/**
 * M7 slice 1's parts as the approved screens 25, 25b draw them (design/svgparts.py: servo_in, l9110s, tt_motor,
 * relay_module, pump, uln2003, stepper, l298n, power_supply). A part in the breadboard is drawn from its pins (as
 * if not turned; the caller turns it); its terminals — screws, a socket — are where the editor puts them
 * (lib/editor parts.ts), so a wire's end is always on one. A part beside the breadboard is drawn from where it lies.
 */
const FONT = 'Inter Variable, Inter, sans-serif';
const f = (n: number) => Math.round(n * 100) / 100;
const PCB = { red: ['#b8322a', '#7d1f19'], blue: ['#2457a6', '#173c78'], green: ['#2f7d3f', '#1f5a2b'] } as const;

/** What an actuator shows while running. */
export interface ActLook {
  /** A servo's arm, degrees; it has its 5 V. */
  angle?: number; powered?: boolean;
  /** A motor's speed and way (1: + above −); a pump running. */
  rpm?: number; direction?: number; running?: boolean;
  /** A relay on; a driver's two motors' ways (−1, 0, 1); a ULN2003's coils A–D on; a stepper's half steps. */
  on?: boolean; dirs?: [number, number]; coils?: [boolean, boolean, boolean, boolean]; steps?: number;
}

/** A module's header: the black strip above the holes, the pins, their printed names; the pins go up into the board at `bodyY`. */
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
      <g fontSize={5.5} fontWeight={700} fill="#e9edf2" textAnchor="middle" pointerEvents="none" fontFamily={FONT}>
        {pins.map((p, i) => <text key={i} x={p.x} y={y - 18} fontSize={labels[i]!.length > 4 ? 4.2 : undefined} transform={upright ? `rotate(${upright} ${p.x} ${y - 20})` : undefined}>{labels[i]}</text>)}
      </g>
    </>
  );
}

/** A green screw terminal block over its screws (the points), their names above or below. */
function Screws({ at, labels, below = false, upright = 0 }: { at: Point[]; labels: string[]; below?: boolean; upright?: number }) {
  const x0 = Math.min(...at.map((p) => p.x));
  const x1 = Math.max(...at.map((p) => p.x));
  const y = at[0]!.y;
  return (
    <g className="screws">
      <rect x={x0 - 5} y={y - 6} width={x1 - x0 + 10} height={12} rx={1.5} fill="#2f9d57" stroke="#1d6b3a" />
      {at.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r={3.8} fill="#c7ccd2" stroke="#7d848c" strokeWidth={0.7} />
          <line x1={p.x - 2.4} y1={p.y - 1.2} x2={p.x + 2.4} y2={p.y + 1.2} stroke="#5e656d" strokeWidth={1} />
          <text x={p.x} y={below ? p.y + 14 : p.y - 9} fontSize={5.2} fontWeight={700} fill="#e9edf2" stroke="#1b1d20" strokeWidth={1.6} paintOrder="stroke"
            textAnchor="middle" fontFamily={FONT} pointerEvents="none" transform={upright ? `rotate(${upright} ${p.x} ${below ? p.y + 12 : p.y - 11})` : undefined}>{labels[i]}</text>
        </g>
      ))}
    </g>
  );
}

function Soic8({ cx, cy, label }: { cx: number; cy: number; label: string }) {
  return (
    <>
      <rect x={cx - 7} y={cy - 5} width={14} height={10} rx={1} fill="#1c1e21" />
      {[0, 1, 2, 3].map((i) => <g key={i}><rect x={cx - 6 + i * 3.6} y={cy - 7} width={1.6} height={2} fill="#aab0b7" /><rect x={cx - 6 + i * 3.6} y={cy + 5} width={1.6} height={2} fill="#aab0b7" /></g>)}
      <text x={cx} y={cy + 2} fontSize={3.6} fill="#9aa1ab" textAnchor="middle" fontFamily="JetBrains Mono Variable, monospace" pointerEvents="none">{label}</text>
    </>
  );
}

const Led = ({ x, y, on, colour = 'green' }: { x: number; y: number; on: boolean; colour?: 'green' | 'red' }) => (
  <>
    <rect x={x - 3} y={y} width={6} height={3.5} rx={1} fill={on ? (colour === 'green' ? '#34d058' : '#ff4b3a') : colour === 'green' ? '#24313f' : '#4b2a2a'} />
    {on && <circle cx={x} cy={y + 2} r={7} fill={`url(#glow-${colour})`} />}
  </>
);

/** An SG90 by its cable: the plug in three holes S (orange) + (red) − (brown), the servo above, its arm at `angle`. */
export function ServoPlug({ s, v, g, angle = 90, upright = 0 }: { s: Point; v: Point; g: Point; angle?: number; upright?: number }) {
  const cx = v.x;
  const top = s.y - 150;
  return (
    <g className="servo-in">
      {([[s, -6, '#f08024'], [v, 0, '#de3b3b'], [g, 6, '#8b5a3a']] as const).map(([p, dx, col]) => (
        <path key={col} d={`M${cx + dx},${top + 66} C${cx + dx},${top + 96} ${p.x},${p.y - 46} ${p.x},${p.y - 14}`} stroke={col} strokeWidth={3.4} fill="none" strokeLinecap="round" />
      ))}
      <rect x={s.x - 8} y={s.y - 16} width={g.x - s.x + 16} height={11} rx={1.5} fill="#1d1e21" />
      {([[s, 'S'], [v, '+'], [g, '−']] as const).map(([p, t]) => (
        <g key={t}>
          <line x1={p.x} y1={p.y - 5} x2={p.x} y2={p.y} stroke="#c7ccd2" strokeWidth={1.8} />
          <text x={p.x} y={s.y - 8} fontSize={6} fontWeight={700} fill="#e9edf2" textAnchor="middle" fontFamily={FONT} pointerEvents="none"
            transform={upright ? `rotate(${upright} ${p.x} ${s.y - 10})` : undefined}>{t}</text>
        </g>
      ))}
      <g transform={`translate(${cx},${top}) rotate(90)`}>
        <rect x={-30} y={-6} width={12} height={12} rx={2} fill="#2f76c9" /><rect x={58} y={-6} width={12} height={12} rx={2} fill="#2f76c9" />
        <circle cx={-24} cy={0} r={2.6} fill="#173f6e" /><circle cx={64} cy={0} r={2.6} fill="#173f6e" />
        <rect x={-18} y={-24} width={76} height={48} rx={4} fill="#3a8ae0" stroke="#1f5ea8" filter="url(#lift)" />
        <circle cx={0} cy={0} r={13} fill="#2f76c9" stroke="#1f5ea8" />
        <g className="arm" data-angle={Math.round(angle)} transform={`rotate(${f(angle - 90)})`}>
          <path d="M-6,0 L-4,-46 Q0,-52 4,-46 L6,0 Q0,9 -6,0Z" fill="#f4f4f4" stroke="#b9bec5" />
          <circle cx={0} cy={-38} r={1.6} fill="#b9bec5" /><circle cx={0} cy={-28} r={1.6} fill="#b9bec5" /><circle cx={0} cy={-18} r={1.6} fill="#b9bec5" />
          <circle cx={0} cy={0} r={6} fill="#ffffff" stroke="#b9bec5" />
        </g>
      </g>
      <text x={cx} y={top + 40} fontSize={8.5} fontWeight={700} fill="#e8f1fc" textAnchor="middle" fontFamily={FONT} pointerEvents="none">SG90</text>
    </g>
  );
}

/** An L9110S standing in the breadboard: header B-IA B-IB GND VCC A-IA A-IB, its two chips, MOTOR B and A screws; a
 *  motor's LED lights while it turns. */
export function L9110sDriver({ pins, screws, dirs = [0, 0], upright = 0 }: { pins: Point[]; screws: Record<string, Point>; dirs?: [number, number]; upright?: number }) {
  const x0 = pins[0]!.x;
  const x5 = pins[5]!.x;
  const cx = (x0 + x5) / 2;
  const y = pins[0]!.y;
  const top = y - 90;
  return (
    <g className="driver l9110s">
      <rect x={cx - (x5 - x0 + 14) / 2} y={top} width={x5 - x0 + 14} height={74} rx={3} fill={PCB.red[0]} stroke={PCB.red[1]} filter="url(#lift)" />
      <Soic8 cx={cx - 20} cy={top + 36} label="9110" /><Soic8 cx={cx + 20} cy={top + 36} label="9110" />
      <text x={cx} y={top + 58} fontSize={5.5} fontWeight={700} fill="#ffd9d4" textAnchor="middle" fontFamily={FONT} pointerEvents="none">L9110S</text>
      <Led x={cx - 20} y={top + 47} on={dirs[1] !== 0} /><Led x={cx + 20} y={top + 47} on={dirs[0] !== 0} />
      <Screws at={[screws.b1!, screws.b2!]} labels={['B1', 'B2']} upright={upright} />
      <Screws at={[screws.a1!, screws.a2!]} labels={['A1', 'A2']} upright={upright} />
      <text x={(screws.b1!.x + screws.b2!.x) / 2} y={top + 25} fontSize={4.6} fontWeight={700} fill="#ffd9d4" textAnchor="middle" fontFamily={FONT} pointerEvents="none">MOTOR B</text>
      <text x={(screws.a1!.x + screws.a2!.x) / 2} y={top + 25} fontSize={4.6} fontWeight={700} fill="#ffd9d4" textAnchor="middle" fontFamily={FONT} pointerEvents="none">MOTOR A</text>
      <Header pins={pins} labels={['B-IA', 'B-IB', 'GND', 'VCC', 'A-IA', 'A-IB']} bodyY={top + 74} upright={upright} />
    </g>
  );
}

/** A relay module on its header S + −: its blue relay, its contact (COM to NO when on), its LEDs, NO COM NC screws. */
export function RelayModule({ pins, screws, on = false, upright = 0 }: { pins: Point[]; screws: Record<string, Point>; on?: boolean; upright?: number }) {
  const cx = (pins[0]!.x + pins[2]!.x) / 2;
  const top = pins[0]!.y - 108;
  return (
    <g className="relay-module" data-on={on ? '1' : '0'}>
      <rect x={cx - 36} y={top} width={72} height={92} rx={3} fill={PCB.blue[0]} stroke={PCB.blue[1]} filter="url(#lift)" />
      <rect x={cx - 26} y={top + 30} width={52} height={36} rx={2} fill="#2f6fd6" stroke="#1d4f9e" />
      <text x={cx} y={top + 44} fontSize={5.6} fontWeight={700} fill="#e8f1fc" textAnchor="middle" fontFamily={FONT} pointerEvents="none">SRD-05VDC</text>
      <text x={cx} y={top + 52} fontSize={4.6} fill="#cfe0f2" textAnchor="middle" fontFamily={FONT} pointerEvents="none">10A 250VAC</text>
      <path className="contact" d={`M${cx - 8},${top + 58} L${cx + (on ? 8 : -2)},${on ? top + 54 : top + 61}`} stroke="#ffd34d" strokeWidth={1.6} strokeLinecap="round" />
      <rect x={cx - 22} y={top + 72} width={6} height={3.5} rx={1} fill="#ff5a4a" />
      <Led x={cx + 19} y={top + 72} on={on} />
      <Screws at={[screws.no!, screws.com!, screws.nc!]} labels={['NO', 'COM', 'NC']} below upright={upright} />
      <Header pins={pins} labels={['S', '+', '−']} bodyY={top + 92} upright={upright} />
    </g>
  );
}

/** A ULN2003 board on IN1 IN2 IN3 IN4 − +: its chip, its LEDs A–D lit with the coils, its white socket. */
export function Uln2003({ pins, socket, coils = [false, false, false, false], upright = 0 }: { pins: Point[]; socket: Point[]; coils?: boolean[]; upright?: number }) {
  const x0 = pins[0]!.x;
  const x5 = pins[5]!.x;
  const cx = (x0 + x5) / 2;
  const top = pins[0]!.y - 108;
  const sx = (socket[0]!.x + socket[4]!.x) / 2;
  return (
    <g className="uln2003">
      <rect x={cx - (x5 - x0 + 14) / 2} y={top} width={x5 - x0 + 14} height={92} rx={3} fill={PCB.green[0]} stroke={PCB.green[1]} filter="url(#lift)" />
      <rect x={sx - 18} y={socket[0]!.y - 6} width={36} height={12} rx={1.5} fill="#f4f5f7" stroke="#c9cdd2" />
      {socket.map((p, i) => <rect key={i} x={p.x - 1.75} y={p.y - 3} width={3.5} height={5} fill="#c7ccd2" />)}
      <rect x={cx - 30} y={top + 26} width={40} height={16} rx={1.5} fill="#1c1e21" />
      <text x={cx - 10} y={top + 36} fontSize={5} fill="#9aa1ab" textAnchor="middle" fontFamily="JetBrains Mono Variable, monospace" pointerEvents="none">ULN2003</text>
      {'ABCD'.split('').map((l, i) => {
        const lx = cx + 18 + (i % 2) * 12;
        const ly = top + 24 + Math.floor(i / 2) * 14;
        return (
          <g key={l} data-coil={l} data-on={coils[i] ? '1' : '0'}>
            <Led x={lx} y={ly} on={!!coils[i]} colour="red" />
            <text x={lx} y={ly + 10} fontSize={4.4} fill="#d7f0dc" textAnchor="middle" fontFamily={FONT} pointerEvents="none">{l}</text>
          </g>
        );
      })}
      <text x={cx} y={top + 60} fontSize={5} fontWeight={700} fill="#d7f0dc" textAnchor="middle" fontFamily={FONT} pointerEvents="none">5–12V</text>
      <Header pins={pins} labels={['IN1', 'IN2', 'IN3', 'IN4', '−', '+']} bodyY={top + 92} upright={upright} />
    </g>
  );
}

/** A TT gear motor seen from above, lying beside the breadboard: its shaft at `at`, its tabs; turning, the arrow
 *  says which way and the rpm how fast. */
export function TtMotor({ at: { x, y }, rpm = 0, direction = 1, label }: { at: Point; rpm?: number; direction?: number; label: string }) {
  const turning = rpm > 0;
  const [a0, a1] = direction > 0 ? [-150, 60] : [60, -150];
  const rad = (d: number) => (d * Math.PI) / 180;
  const p0 = { x: x + 20 * Math.cos(rad(a0)), y: y + 20 * Math.sin(rad(a0)) };
  const p1 = { x: x + 20 * Math.cos(rad(a1)), y: y + 20 * Math.sin(rad(a1)) };
  return (
    <g className="tt-motor" data-rpm={rpm} data-direction={turning ? direction : 0}>
      <rect x={x - 34} y={y - 18} width={70} height={36} rx={4} fill="#f2c230" stroke="#b58c12" filter="url(#lift)" />
      <rect x={x + 36} y={y - 15} width={34} height={30} rx={6} fill="#c7ccd2" stroke="#8f969f" />
      <rect x={x + 66} y={y - 6} width={5} height={12} fill="#aab0b7" />
      <circle cx={x} cy={y} r={9} fill="#f6f4ef" stroke="#c9c3b5" />
      <rect x={x - 2.5} y={y - 6} width={5} height={12} rx={1} fill="#e3ddd0" className={turning ? 'shaft turning' : 'shaft'} />
      {([[-8, '#de3b3b'], [8, '#3a3d42']] as const).map(([dy, col]) => (
        <g key={dy}><rect x={x + 71} y={y + dy - 2.5} width={9} height={5} rx={1} fill="#d6b24c" stroke="#a8862a" strokeWidth={0.6} /><circle cx={x + 78} cy={y + dy} r={2} fill={col} /></g>
      ))}
      {turning && (
        <>
          <path d={`M${f(p0.x)},${f(p0.y)} A20 20 0 1 ${direction > 0 ? 1 : 0} ${f(p1.x)},${f(p1.y)}`} stroke="#2563d9" strokeWidth={2.2} fill="none" />
          <path d="M0,-4 L7,0 L0,4Z" fill="#2563d9" transform={`translate(${f(p1.x)},${f(p1.y)}) rotate(${a1 + (direction > 0 ? 90 : -90)})`} />
          <text x={x - 34} y={y - 26} fontSize={9} fontWeight={700} fill="#2563d9" fontFamily={FONT} pointerEvents="none">{rpm} rpm</text>
        </>
      )}
      <text x={x + 4} y={y + 32} fontSize={8} fontWeight={700} fill="#6b5a14" textAnchor="middle" fontFamily={FONT} pointerEvents="none">{label}</text>
    </g>
  );
}

/** A small pump in a cup of water, its leads' tabs above it; running, water comes out of its tube. */
export function Pump({ at: { x, y }, running = false, label }: { at: Point; running?: boolean; label: string }) {
  return (
    <g className="pump" data-running={running ? '1' : '0'}>
      <path d={`M${x - 38},${y - 30} L${x - 32},${y + 44} Q${x},${y + 52} ${x + 32},${y + 44} L${x + 38},${y - 30}Z`} fill="#eef5fb" stroke="#b9c7d6" strokeWidth={1.2} />
      <path d={`M${x - 36},${y - 6} L${x - 32},${y + 44} Q${x},${y + 52} ${x + 32},${y + 44} L${x + 36},${y - 6}Z`} fill="#9fd0f2" opacity={0.75} />
      <rect x={x - 14} y={y + 8} width={28} height={30} rx={7} fill="#26282c" />
      <path d={`M${x + 6},${y + 10} C${x + 6},${y - 40} ${x + 50},${y - 48} ${x + 60},${y - 26}`} stroke="#d9e2ea" strokeWidth={5} fill="none" strokeLinecap="round" />
      {running && (
        <>
          <path className="water" d={`M${x + 60},${y - 24} C${x + 64},${y - 14} ${x + 50},${y - 8} ${x + 34},${y - 6}`} stroke="#3b8fd9" strokeWidth={2.6} fill="none" strokeLinecap="round" strokeDasharray="5 3" />
          <text x={x - 44} y={y - 36} fontSize={8.5} fontWeight={700} fill="#2563d9" textAnchor="end" fontFamily={FONT} pointerEvents="none">pumping</text>
        </>
      )}
      {([[-8, '#de3b3b', '#9e2626'], [8, '#3a3d42', '#15171a']] as const).map(([dx, a, b]) => {
        const tx = x + dx;
        const ty = y - 46;
        const d = `M${tx},${y + 10} C${tx},${y - 10} ${tx},${ty + 20} ${tx},${ty + 4}`;
        return <g key={dx}><path d={d} stroke={b} strokeWidth={3.6} fill="none" /><path d={d} stroke={a} strokeWidth={2} fill="none" /><rect x={tx - 3} y={ty - 4} width={6} height={8} rx={1} fill="#d6b24c" stroke="#a8862a" strokeWidth={0.6} /></g>;
      })}
      <text x={x} y={y + 64} fontSize={8} fontWeight={700} fill="#4b5563" textAnchor="middle" fontFamily={FONT} pointerEvents="none">{label}</text>
    </g>
  );
}

/** An L298N lying beside the breadboard (its top-left corner at `at`): heat sink, OUT1–OUT4, 12V GND 5V screws, the
 *  header ENA … ENB and the ENA / ENB jumpers (when on). */
export function L298nBoard({ at: { x, y }, dirs = [0, 0], ena = true, enb = true }: { at: Point; dirs?: [number, number]; ena?: boolean; enb?: boolean }) {
  const w = 150;
  const h = 140;
  const hx = x + 74;
  return (
    <g className="l298n">
      <rect x={x} y={y} width={w} height={h} rx={4} fill="#b8322a" stroke="#7d1f19" filter="url(#lift)" />
      <rect x={x + 45} y={y + 6} width={60} height={48} rx={2} fill="#1f2227" />
      {Array.from({ length: 8 }, (_, i) => <rect key={i} x={x + 49 + i * 7} y={y + 6} width={3.5} height={48} fill="#3a3d42" />)}
      <text x={x + 75} y={y + 68} fontSize={7} fontWeight={700} fill="#ffd9d4" textAnchor="middle" fontFamily={FONT} pointerEvents="none">L298N</text>
      <Screws at={[{ x: x + 12, y: y + 20 }, { x: x + 27, y: y + 20 }]} labels={['OUT1', 'OUT2']} below />
      <Screws at={[{ x: x + 123, y: y + 20 }, { x: x + 138, y: y + 20 }]} labels={['OUT3', 'OUT4']} below />
      <Screws at={[0, 1, 2].map((i) => ({ x: x + 16 + 13 * i, y: y + 124 }))} labels={['12V', 'GND', '5V']} />
      {['ENA', 'IN1', 'IN2', 'IN3', 'IN4', 'ENB'].map((name, i) => {
        const px = hx + i * 11;
        const py = y + h - 16;
        return (
          <g key={name}>
            <rect x={px - 3.5} y={py - 3.5} width={7} height={7} fill="#1c1e21" /><rect x={px - 1.2} y={py - 1.2} width={2.4} height={2.4} fill="#d6b24c" />
            <text x={px} y={py - 8} fontSize={4.4} fontWeight={700} fill="#ffd9d4" textAnchor="middle" fontFamily={FONT} pointerEvents="none">{name}</text>
          </g>
        );
      })}
      {([[0, ena], [5, enb]] as const).map(([i, on]) => on && <rect key={i} data-jumper={i ? 'enb' : 'ena'} x={hx + i * 11 - 4.5} y={y + h - 34} width={9} height={12} rx={1.5} fill="#efbd16" stroke="#a68300" />)}
      {dirs.map((d, i) => <Led key={i} x={x + 22 + i * (w - 44)} y={y + 38} on={d !== 0} />)}
    </g>
  );
}

/** A 28BYJ-48 lying beside the breadboard (its can's middle at `at`), its cable of five to `socket` (the plug's
 *  pins: in a ULN2003's socket, or lying loose); turning, an arrow and its half steps. */
export function Stepper({ at: { x, y }, plug, steps = 0, turning = false }: { at: Point; plug: Point[]; steps?: number; turning?: boolean }) {
  const mid = { x: (plug[0]!.x + plug[4]!.x) / 2, y: plug[0]!.y };
  const angle = ((steps % 4096) / 4096) * 360;
  return (
    <g className="stepper" data-steps={steps}>
      {['#2f6fd6', '#f29bc0', '#efbd16', '#f08024', '#de3b3b'].map((col, i) => {
        const dx = (i - 2) * 3;
        const p = plug[i]!;
        return <path key={col} d={`M${x + dx},${y + 40} C${x + dx},${y + 80} ${p.x},${p.y - 60} ${p.x},${p.y}`} stroke={col} strokeWidth={2.2} fill="none" />;
      })}
      <rect x={mid.x - 18} y={mid.y - 7} width={36} height={9} rx={1.5} fill="#f4f5f7" stroke="#c9cdd2" />
      <rect x={x - 62} y={y - 8} width={124} height={16} rx={8} fill="#b9bfc7" stroke="#8f969f" />
      <circle cx={x - 54} cy={y} r={3} fill="#7d848c" /><circle cx={x + 54} cy={y} r={3} fill="#7d848c" />
      <circle cx={x} cy={y} r={44} fill="#c7ccd2" stroke="#8f969f" filter="url(#lift)" />
      <circle cx={x} cy={y + 6} r={30} fill="#2f6fd6" stroke="#1d4f9e" />
      <circle cx={x} cy={y - 14} r={9} fill="#d6b24c" stroke="#a8862a" />
      <rect className="shaft" x={x - 2} y={y - 21} width={4} height={14} rx={1} fill="#f5e6b0" transform={`rotate(${f(angle)} ${x} ${y - 14})`} />
      <text x={x} y={y + 22} fontSize={7.5} fontWeight={700} fill="#e8f1fc" textAnchor="middle" fontFamily={FONT} pointerEvents="none">28BYJ-48</text>
      {(turning || steps !== 0) && (
        <>
          {turning && <path d={`M${x + 22},${y - 40} A46 46 0 0 1 ${x + 46},${y - 14}`} stroke="#2563d9" strokeWidth={2.2} fill="none" />}
          {turning && <path d="M0,-4 L7,0 L0,4Z" fill="#2563d9" transform={`translate(${x + 47},${y - 12}) rotate(100)`} />}
          <text x={x + 52} y={y - 34} fontSize={9} fontWeight={700} fill="#2563d9" fontFamily={FONT} pointerEvents="none">step {steps}</text>
        </>
      )}
    </g>
  );
}

/** Where the power supply's two jumpers are, from its first pin (T−1): each pair's 5V and 3.3V places (screen 25b). */
export function psuJumpers(first: Point): { top: { five: Point; three: Point }; bottom: { five: Point; three: Point } } {
  const x0 = first.x - 48;
  const y0 = first.y - 18;
  const at = (jy: number) => ({ five: { x: x0, y: jy + 2 }, three: { x: x0 + 15, y: jy + 2 } });
  return { top: at(y0 + 66), bottom: at(y0 + 214) };
}

/** The breadboard power supply on the breadboard's left end: its pins in both rail pairs, each pair's jumper on 5V
 *  or 3.3V, its jack, USB, switch and LED. */
export function PowerSupply({ first, pins, top = 5, bottom = 3.3, on = true }: { first: Point; pins: Point[]; top?: number; bottom?: number; on?: boolean }) {
  const x0 = first.x - 48;
  const y0 = first.y - 18;
  const j = psuJumpers(first);
  return (
    <g className="power-supply" data-on={on ? '1' : '0'}>
      <rect x={x0 - 54} y={y0 + 2} width={98} height={294} rx={4} fill="#26282c" stroke="#0f1012" filter="url(#lift)" />
      <rect x={x0 - 50} y={y0 + 96} width={26} height={30} rx={3} fill="#15171a" /><circle cx={x0 - 37} cy={y0 + 111} r={6} fill="#3a3d42" />
      <rect x={x0 - 50} y={y0 + 168} width={24} height={18} rx={1.5} fill="#c7ccd2" stroke="#8f969f" /><rect x={x0 - 46} y={y0 + 174} width={16} height={6} fill="#4b5563" />
      <g fontSize={5.5} fill="#cfd3d8" textAnchor="middle" fontFamily={FONT} pointerEvents="none">
        <text x={x0 - 37} y={y0 + 140}>6.5–12V</text><text x={x0 - 37} y={y0 + 196}>USB</text><text x={x0} y={y0 + 158}>{on ? 'ON' : 'OFF'}</text>
      </g>
      <rect x={x0 - 12} y={y0 + 136} width={22} height={12} rx={2} fill="#f4f5f7" /><rect x={x0 + (on ? -1 : -10)} y={y0 + 138} width={9} height={8} rx={1} fill="#3a3d42" />
      <Led x={x0 + 23} y={y0 + 140} on={on} />
      {pins.map((p, i) => <rect key={i} x={p.x - 2.2} y={p.y - 2.2} width={4.4} height={4.4} fill="#d6b24c" />)}
      {([[j.top, top, 'top'], [j.bottom, bottom, 'bottom']] as const).map(([at, volts, name]) => (
        <g key={name} data-rails={name} data-volts={volts}>
          <rect x={at.five.x - 2} y={at.five.y - 2} width={34} height={14} rx={2} fill="#15171a" />
          <rect className="jumper" x={(volts === 5 ? at.five : at.three).x} y={at.five.y} width={15} height={10} rx={1.5} fill="#efbd16" stroke="#a68300" />
          <g fontSize={5.2} fill="#cfd3d8" textAnchor="middle" fontFamily={FONT} pointerEvents="none">
            <text x={at.five.x + 4} y={at.five.y + 20}>5V</text><text x={at.three.x + 9} y={at.five.y + 20}>3.3V</text>
          </g>
        </g>
      ))}
    </g>
  );
}
