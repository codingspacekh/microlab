import { neopixelShape } from '@lib/circuit/neopixel';
import type { Point } from '@lib/editor';
import type { PartView } from '../../sim/circuit';

/**
 * M7 slice 2's displays as the approved screens 26, 26b, 26c draw them (design/svgparts.py: oled_in, lcd1602,
 * seven_segment, tm1637, max7219). The OLED and the digit stand in the breadboard, drawn from their pins (as if not
 * turned; the caller turns them); the LCD, the TM1637 and the matrix lie beside it, drawn from where they lie, their
 * header pins where the editor puts their terminals (lib/editor parts.ts). Each shows what the sim says it shows.
 */
const FONT = 'Inter Variable, Inter, sans-serif';
const MONO = 'JetBrains Mono Variable, JetBrains Mono, monospace';
const f = (n: number) => Math.round(n * 100) / 100;
const PCB_BLUE = ['#2457a6', '#173c78'] as const;

/** What a display shows while running: the sim's view of it (an OLED's frame, an LCD's rows …), or a digit's eight
 *  segments' brightness (a … g, dp). */
export interface DisplayLook {
  view?: PartView;
  segments?: number[];
}

/** A row of pins sticking out of a module's side: the black strip, the pins to their pads (the terminals), names. */
function SideHeader({ x, ys, labels, right }: { x: number; ys: number[]; labels: string[]; right: boolean }) {
  const d = right ? 1 : -1;
  return (
    <g>
      <rect x={right ? x - 7 : x} y={ys[0]! - 6} width={7} height={ys.at(-1)! - ys[0]! + 12} rx={1} fill="#26282c" />
      {ys.map((y, i) => (
        <g key={i}>
          <line x1={x} y1={y} x2={x + d * 8} y2={y} stroke="#c7ccd2" strokeWidth={2} />
          <circle cx={x + d * 8} cy={y} r={3.6} fill="#d6b24c" stroke="#a8862a" strokeWidth={0.8} />
          <circle cx={x + d * 8} cy={y} r={1.5} fill="#1b2b22" />
          <text x={x - d * 10} y={y + 2} fontSize={5} fontWeight={700} fill="#e9edf2" textAnchor={right ? 'end' : 'start'} fontFamily={FONT} pointerEvents="none">{labels[i]}</text>
        </g>
      ))}
    </g>
  );
}

// ------------------------------------------------------------------ 7 segments (a digit, the TM1637's four)
const SEGMENT_LINES = (x: number, y: number, w: number, h: number, t: number) => {
  const [L, R, T, M, B] = [x + t / 2, x + w - t / 2, y + t / 2, y + h / 2, y + h - t / 2];
  const g = t * 0.75;
  return {
    a: [L + g, T, R - g, T], b: [R, T + g, R, M - g], c: [R, M + g, R, B - g], d: [L + g, B, R - g, B],
    e: [L, M + g, L, B - g], f: [L, T + g, L, M - g], g: [L + g, M, R - g, M],
  } as Record<string, [number, number, number, number]>;
};

/** One leaning 7-segment digit in the box (x, y, w, h); `lit` a … g's brightness 0–1 (and the point's, 8th). */
function Digit({ x, y, w, h, lit, point }: { x: number; y: number; w: number; h: number; lit: number[]; point?: boolean }) {
  const t = Math.max(2, w * 0.17);
  const lines = SEGMENT_LINES(x, y, w, h, t);
  const cx = x + w / 2;
  const cy = y + h / 2;
  return (
    <g transform={`translate(${f(cx)},${f(cy)}) skewX(-7) translate(${f(-cx)},${f(-cy)})`}>
      {'abcdefg'.split('').map((s, i) => {
        const [x1, y1, x2, y2] = lines[s]!;
        const b = lit[i] ?? 0;
        return (
          <g key={s} data-segment={s} data-on={b > 0.01 ? '1' : '0'}>
            {b > 0.01 && <line x1={f(x1)} y1={f(y1)} x2={f(x2)} y2={f(y2)} stroke="#ff3b2a" strokeWidth={f(t * 2.8)} strokeLinecap="round" opacity={f(0.16 * b)} />}
            <line x1={f(x1)} y1={f(y1)} x2={f(x2)} y2={f(y2)} stroke={b > 0.01 ? '#ff3b2a' : '#3a2624'} strokeWidth={f(t)} strokeLinecap="round" opacity={b > 0.01 ? f(0.35 + 0.65 * b) : 1} />
          </g>
        );
      })}
      {point && <circle cx={f(x + w + t * 0.9)} cy={f(y + h - t / 2)} r={f(t * 0.6)} fill={(lit[7] ?? 0) > 0.01 ? '#ff3b2a' : '#3a2624'} />}
    </g>
  );
}

/** A 0.56" 7-segment digit straddling the gap: pins e d COM c dp (bottom, left to right), g f COM a b (top); its body
 *  covers them, their names at its edges. `lit` a … g, dp, 0–1. */
export function SevenSegment({ bottom, top, lit = [] }: { bottom: Point[]; top: Point[]; lit?: number[] }) {
  const cx = (bottom[0]!.x + bottom[4]!.x) / 2;
  const cy = (bottom[0]!.y + top[0]!.y) / 2;
  const [w, h] = [80, 116];
  return (
    <g className="seven-segment" data-segments={lit.map((b) => (b > 0.01 ? '1' : '0')).join('')}>
      <rect x={cx - w / 2} y={cy - h / 2} width={w} height={h} rx={2} fill="#e9e7e1" stroke="#c9c5bb" filter="url(#lift)" />
      <rect x={cx - w / 2 + 5} y={cy - h / 2 + 12} width={w - 10} height={h - 24} rx={1.5} fill="#1f2023" />
      <Digit x={cx - 21} y={cy - 36} w={40} h={72} lit={lit} point />
      <g fontSize={5.5} fontWeight={700} fill="#6b665c" textAnchor="middle" fontFamily={FONT} pointerEvents="none">
        {top.map((p, i) => <text key={`t${i}`} x={p.x} y={cy - h / 2 + 8.5}>{['g', 'f', 'COM', 'a', 'b'][i]}</text>)}
        {bottom.map((p, i) => <text key={`b${i}`} x={p.x} y={cy + h / 2 - 3.5}>{['e', 'd', 'COM', 'c', 'dp'][i]}</text>)}
      </g>
    </g>
  );
}

// ------------------------------------------------------------------ SSD1306 OLED, standing by its header
/** Lit pixels of an OLED frame (8 pages of 128 bytes as hex, bit 0 a page's top row) as one path of 1-high runs. */
function framePath(frame: string, x0: number, y0: number, k: number): string {
  if (!frame) return '';
  const bytes = frame.match(/../g)!.map((b) => parseInt(b, 16));
  const out: string[] = [];
  for (let y = 0; y < 64; y++) {
    let run = -1;
    for (let x = 0; x <= 128; x++) {
      const on = x < 128 && ((bytes[(y >> 3) * 128 + x]! >> (y & 7)) & 1) === 1;
      if (on && run < 0) run = x;
      if (!on && run >= 0) { out.push(`M${f(x0 + run * k)},${f(y0 + y * k)}h${f((x - run) * k)}v${f(k)}h${f(-(x - run) * k)}z`); run = -1; }
    }
  }
  return out.join('');
}

/** The SSD1306 0.96" module standing in the breadboard: GND VCC SCL SDA, its screen above — 128×64 pixels, 0.7 px each. */
export function OledModule({ pins, view }: { pins: Point[]; view?: PartView }) {
  const cx = (pins[0]!.x + pins[3]!.x) / 2;
  const y = pins[0]!.y;
  const [w, h] = [112, 96];
  const top = y - 16 - h;
  const k = 0.7;
  const sx = cx - 64 * k;
  const sy = top + 24;
  const o = view?.kind === 'oled' ? view : undefined;
  const lit = o?.on ? o.lit : 0;
  return (
    <g className="oled" data-lit={lit} data-on={o?.on ? '1' : '0'}>
      <rect x={cx - w / 2} y={top} width={w} height={h} rx={4} fill="#16314f" stroke="#0c1d30" filter="url(#lift)" />
      {[[6, 6], [w - 6, 6], [6, h - 6], [w - 6, h - 6]].map(([dx, dy], i) => <circle key={i} cx={cx - w / 2 + dx!} cy={top + dy!} r={2.6} fill="#f6f4ef" stroke="#0c1d30" />)}
      <rect x={sx - 4} y={sy - 4} width={128 * k + 8} height={64 * k + 8} rx={1.5} fill="#05070a" stroke="#2a3a4e" />
      {/* the picture turns with the module, as a real screen does */}
      {o?.on && o.frame && <path d={framePath(o.frame, sx, sy, k)} fill="#9be7ff" opacity={f(0.55 + 0.45 * (o.contrast / 255))} />}
      <text x={cx} y={top + 13} fontSize={5} fill="#cfe0f2" textAnchor="middle" fontFamily={FONT} fontWeight={600} pointerEvents="none">128×64 · I²C</text>
      <ModuleHeader pins={pins} labels={['GND', 'VCC', 'SCL', 'SDA']} bodyY={top + h} />
    </g>
  );
}

/** A module's header in a row, its pins down into the holes (as actuators.tsx's). */
function ModuleHeader({ pins, labels, bodyY }: { pins: Point[]; labels: string[]; bodyY: number }) {
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
        {pins.map((p, i) => <text key={i} x={p.x} y={y - 18}>{labels[i]}</text>)}
      </g>
    </>
  );
}

// ------------------------------------------------------------------ 16×2 LCD, lying beside the breadboard
/** An HD44780's own characters (CGRAM, 8 bytes each, 5 bits a row) drawn as dots in a cell. */
function CustomChar({ x, y, w, h, rows, faint }: { x: number; y: number; w: number; h: number; rows: number[]; faint: boolean }) {
  const dx = w / 6;
  const dy = h / 9;
  const dots = [];
  for (let r = 0; r < 8; r++) for (let c = 0; c < 5; c++) if ((rows[r] ?? 0) >> (4 - c) & 1) dots.push(`M${f(x + dx * (c + 0.5))},${f(y + dy * (r + 0.5))}h${f(dx * 0.85)}v${f(dy * 0.85)}h${f(-dx * 0.85)}z`);
  return <path d={dots.join('')} fill="#1d3a0f" opacity={faint ? 0.16 : 1} />;
}

/** What the HD44780's ROM (A00) shows for a code we draw as text. */
const ROM: Record<number, string> = { 0x5c: '¥', 0x7e: '→', 0x7f: '←', 0xdf: '°', 0xe4: 'µ', 0xf4: 'Ω' };

/** A 16×2 LCD with its I²C backpack behind it, lying at `at` (its board's top left); the backpack's header out of its
 *  left end — GND VCC SDA SCL — next to its blue contrast knob. */
export function Lcd1602({ at: { x, y }, view, address = 0x27 }: { at: Point; view?: PartView; address?: number }) {
  const [w, h] = [300, 108];
  const l = view?.kind === 'lcd' ? view : undefined;
  const lightOn = l ? l.backlight : true;
  const faint = !!l?.faint;
  const [wx, wy, ww, wh] = [x + 20, y + 24, w - 40, h - 48];
  const cw = (ww - 12) / 16;
  const ch = 23;
  const cg = l?.cgram?.match(/../g)?.map((b) => parseInt(b, 16)) ?? [];
  return (
    <g className="lcd1602" data-rows={l ? l.rows.join('\n') : ''} data-backlight={lightOn ? '1' : '0'} data-faint={faint ? '1' : '0'}>
      <rect x={x - 38} y={y + 22} width={46} height={80} rx={3} fill="#1d1e21" stroke="#0f1012" filter="url(#lift)" />
      <rect x={x - 17} y={y + 89} width={9} height={9} rx={1.5} fill="#2f74d8" stroke="#1d4f9e" />
      <circle cx={x - 12.5} cy={y + 93.5} r={2.6} fill="#e9ebee" />
      <text x={x - 15} y={y + 29} fontSize={4.4} fontWeight={700} fill="#9aa1ab" textAnchor="middle" fontFamily={FONT} pointerEvents="none">PCF8574</text>
      <SideHeader x={x - 22} ys={[34, 48, 62, 76].map((d) => y + d)} labels={['GND', 'VCC', 'SDA', 'SCL']} right={false} />
      <rect x={x} y={y} width={w} height={h} rx={4} fill="#2f7d3f" stroke="#1f5a2b" filter="url(#lift)" />
      {[[7, 7], [w - 7, 7], [7, h - 7], [w - 7, h - 7]].map(([dx, dy], i) => <circle key={i} cx={x + dx!} cy={y + dy!} r={3.4} fill="#f6f4ef" stroke="#1f5a2b" />)}
      {Array.from({ length: 16 }, (_, i) => <circle key={i} cx={x + 24 + i * 6.5} cy={y + 8} r={1.7} fill="#d6b24c" stroke="#a8862a" strokeWidth={0.5} />)}
      <rect x={x + 14} y={y + 17} width={w - 28} height={h - 34} rx={3} fill="#15171a" />
      <rect x={wx} y={wy} width={ww} height={wh} rx={1.5} fill={lightOn ? (faint ? '#a9cf5c' : '#9fd34a') : '#6f8a3a'} />
      {[0, 1].map((r) => Array.from({ length: 16 }, (_, c) => {
        const cx = wx + 6 + c * cw;
        const cy = wy + 5 + r * (ch + 4);
        const code = l?.on ? (l.rows[r] ?? '').charCodeAt(c) : 0x20;
        const letter = code < 8 ? '' : ROM[code] ?? String.fromCharCode(code);
        return (
          <g key={`${r}-${c}`}>
            <rect x={f(cx + 0.6)} y={f(cy)} width={f(cw - 1.2)} height={ch} fill="#7fae35" opacity={faint ? 0.18 : 0.32} />
            {code < 8 && l?.on ? <CustomChar x={cx} y={cy} w={cw} h={ch} rows={cg.slice(code * 8, code * 8 + 8)} faint={faint} />
              : letter.trim() && <text x={f(cx + cw / 2)} y={f(cy + 17.5)} fontSize={17} fill="#1d3a0f" opacity={faint ? 0.16 : 1} textAnchor="middle" fontFamily={MONO} fontWeight={500} pointerEvents="none">{letter}</text>}
          </g>
        );
      }))}
      <text x={x + w - 16} y={y + h - 6} fontSize={5.5} fontWeight={700} fill="#cfe7d4" textAnchor="end" fontFamily={FONT} pointerEvents="none">1602 · I²C 0x{address.toString(16).toUpperCase()}</text>
    </g>
  );
}

// ------------------------------------------------------------------ TM1637 4-digit module, lying beside the breadboard
/** The TM1637 module at `at` (its board's top left): four digits and a colon; its header out of its right edge. */
export function Tm1637Module({ at: { x, y }, view }: { at: Point; view?: PartView }) {
  const [w, h] = [140, 60];
  const d = view?.kind === 'digits' && view.on ? view : undefined;
  const glow = d ? 0.4 + (0.6 * (d.brightness + 1)) / 8 : 0;
  return (
    <g className="tm1637" data-text={d?.text ?? ''}>
      <rect x={x} y={y} width={w} height={h} rx={3} fill={PCB_BLUE[0]} stroke={PCB_BLUE[1]} filter="url(#lift)" />
      {[[5, 5], [5, h - 5]].map(([dx, dy], i) => <circle key={i} cx={x + dx!} cy={y + dy!} r={2.2} fill="#f6f4ef" stroke={PCB_BLUE[1]} />)}
      <rect x={x + 11} y={y + 7} width={112} height={h - 14} rx={1.5} fill="#e9e7e1" stroke="#c9c5bb" />
      <rect x={x + 14} y={y + 10} width={106} height={h - 20} rx={1} fill="#1f2023" />
      {[0, 1, 2, 3].map((i) => {
        const seg = d?.segments[i] ?? 0;
        return <Digit key={i} x={x + 22 + i * 24 + (i >= 2 ? 6 : 0)} y={y + 16} w={15} h={28} lit={[0, 1, 2, 3, 4, 5, 6].map((b) => ((seg >> b) & 1) * glow)} />;
      })}
      {[y + 25, y + 35].map((cy) => <circle key={cy} cx={x + 70} cy={cy} r={1.6} fill={d && (d.segments[1] ?? 0) & 0x80 ? '#ff3b2a' : '#3a2624'} />)}
      <SideHeader x={x + w} ys={[12, 24, 36, 48].map((o) => y + o)} labels={['CLK', 'DIO', 'VCC', 'GND']} right />
    </g>
  );
}

// ------------------------------------------------------------------ MAX7219 8×8 matrix, lying beside the breadboard
/** The MAX7219 module (1088AS) at `at` (its board's top left): 8×8 red dots, its input header out of its left edge
 *  (VCC GND DIN CS CLK), its output header on its right (to chain another). */
export function Max7219Module({ at: { x, y }, view }: { at: Point; view?: PartView }) {
  const [w, h, p] = [124, 128, 13];
  const m = view?.kind === 'matrix' && view.on ? view : undefined;
  const bright = m ? 0.35 + (0.65 * (m.intensity + 1)) / 16 : 0;
  const [mx, my] = [x + 10, y + 8];
  const dots = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const on = !!m && ((m.rows[r] ?? 0) >> (7 - c)) & 1;
      const [cx, cy] = [mx + 2 + p / 2 + c * p, my + 2 + p / 2 + r * p];
      dots.push(
        <g key={`${r}-${c}`}>
          {on ? <circle cx={cx} cy={cy} r={8.5} fill="url(#glow-red)" opacity={f(0.6 * bright)} /> : null}
          <circle cx={cx} cy={cy} r={4.8} fill={on ? '#ff3b2a' : '#4a2c2a'} opacity={on ? f(0.5 + 0.5 * bright) : 1} />
        </g>,
      );
    }
  }
  return (
    <g className="max7219" data-lit={m?.lit ?? 0}>
      <rect x={x} y={y} width={w} height={h} rx={3} fill={PCB_BLUE[0]} stroke={PCB_BLUE[1]} filter="url(#lift)" />
      <rect x={mx} y={my} width={8 * p + 4} height={8 * p + 4} rx={2} fill="#1d1e21" stroke="#0f1012" />
      {dots}
      <text x={x + w / 2} y={y + h - 4} fontSize={5} fontWeight={700} fill="#cfe0f2" textAnchor="middle" fontFamily={FONT} pointerEvents="none">MAX7219 · 8×8</text>
      <SideHeader x={x} ys={[40, 52, 64, 76, 88].map((o) => y + o)} labels={['VCC', 'GND', 'DIN', 'CS', 'CLK']} right={false} />
      <SideHeader x={x + w} ys={[40, 52, 64, 76, 88].map((o) => y + o)} labels={['VCC', 'GND', 'DOUT', 'CS', 'CLK']} right />
    </g>
  );
}

// ------------------------------------------------------------------ RC522 RFID reader (M7, the teacher's request)
/** The RC522 module standing in the breadboard by its eight pins (SDA SCK MOSI MISO IRQ GND RST 3.3V), its board and
 *  antenna above; while running, the tag held to it over its antenna (1 the white card, 2 the blue key fob). */
export function Rc522Module({ pins, view }: { pins: Point[]; view?: PartView }) {
  const cx = (pins[0]!.x + pins[7]!.x) / 2;
  const y = pins[0]!.y;
  const [w, h] = [128, 150];
  const top = y - 16 - h;
  const r = view?.kind === 'rfid' ? view : undefined;
  const coil = [0, 1, 2].map((i) => <rect key={i} x={cx - 46 + i * 5} y={top + 10 + i * 5} width={92 - i * 10} height={78 - i * 10} rx={8 - i * 2} fill="none" stroke="#d6b24c" strokeWidth={1.6} />);
  return (
    <g className="rc522" data-tag={r?.tag ?? 0} data-antenna={r?.antenna ? '1' : '0'}>
      <rect x={cx - w / 2} y={top} width={w} height={h} rx={4} fill={PCB_BLUE[0]} stroke={PCB_BLUE[1]} filter="url(#lift)" />
      {[[6, 6], [w - 6, 6]].map(([dx, dy], i) => <circle key={i} cx={cx - w / 2 + dx!} cy={top + dy!} r={3} fill="#f6f4ef" stroke={PCB_BLUE[1]} />)}
      {coil}
      <rect x={cx - 14} y={top + 98} width={28} height={28} rx={2} fill="#1d1e21" />
      <text x={cx} y={top + 114} fontSize={4.4} fill="#8d939b" textAnchor="middle" fontFamily={FONT} pointerEvents="none">MFRC522</text>
      <rect x={cx + 24} y={top + 104} width={14} height={7} rx={3} fill="#c7ccd2" stroke="#8f969f" />
      <rect x={cx - 40} y={top + 104} width={6} height={3.5} rx={1} fill="#ff5a4a" />
      {r?.antenna && <circle cx={cx - 37} cy={top + 106} r={6} fill="url(#glow-red)" />}
      <text x={cx} y={top + 136} fontSize={5.5} fontWeight={700} fill="#cfe0f2" textAnchor="middle" fontFamily={FONT} pointerEvents="none">RFID-RC522</text>
      {r?.tag === 1 && (
        <g className="rfid-tag" transform={`rotate(-8 ${cx} ${top + 48})`}>
          <rect x={cx - 52} y={top + 18} width={104} height={64} rx={5} fill="#f7f8fa" stroke="#c9d0d8" opacity={0.96} filter="url(#lift)" />
          <text x={cx} y={top + 54} fontSize={7} fontWeight={700} fill="#4b5563" textAnchor="middle" fontFamily={MONO} pointerEvents="none">{r.uid}</text>
        </g>
      )}
      {r?.tag === 2 && (
        <g className="rfid-tag">
          <path d={`M${cx},${top + 14} q30,24 22,52 a24,24 0 0 1 -44,0 q-8,-28 22,-52z`} fill="#2f6fe0" stroke="#1d4f9e" filter="url(#lift)" opacity={0.96} />
          <circle cx={cx} cy={top + 30} r={4} fill="#f6f4ef" stroke="#1d4f9e" />
          <text x={cx} y={top + 62} fontSize={5.5} fontWeight={700} fill="#e9f0fa" textAnchor="middle" fontFamily={MONO} pointerEvents="none">{r.uid}</text>
        </g>
      )}
      <ModuleHeader pins={pins} labels={['SDA', 'SCK', 'MOSI', 'MISO', 'IRQ', 'GND', 'RST', '3.3V']} bodyY={top + h} />
    </g>
  );
}

// ------------------------------------------------------------------ NeoPixels (M7 slice 3, screens 27, 27b, 27c)
/** How a WS2812's colour looks (design/svgparts.py _np_look): its hue at full strength — the eye sees one at an eighth
 *  as plainly lit — with a glow as big as it is bright. */
export function pixelLook([r, g, b]: number[]): { fill?: string; glow: number } {
  const m = Math.max(r!, g!, b!);
  if (!m) return { glow: 0 };
  const hex = [r!, g!, b!].map((c) => Math.round((c * 255) / m).toString(16).padStart(2, '0')).join('');
  return { fill: `#${hex}`, glow: 0.35 + 0.65 * Math.sqrt(m / 255) };
}

/** The colours [r, g, b] in a view's hex, LED 0 first; dark ones when it shows nothing. */
export function pixelsOf(view: PartView | undefined, n: number): number[][] {
  const hex = view?.kind === 'pixels' && view.on ? view.pixels : '';
  return Array.from({ length: n }, (_, i) => {
    const h = hex.slice(6 * i, 6 * i + 6);
    return h.length === 6 ? [0, 2, 4].map((k) => parseInt(h.slice(k, k + 2), 16)) : [0, 0, 0];
  });
}

/** One WS2812B (a 5050 LED): its white body, the round window over its three dies; lit, its colour and a glow. */
function Pixel({ cx, cy, rgb, s, id, i }: { cx: number; cy: number; rgb: number[]; s: number; id: string; i: number }) {
  const { fill, glow } = pixelLook(rgb);
  const gid = `npg-${id}-${i}`;
  return (
    <g data-led={i}>
      {fill && (
        <>
          <radialGradient id={gid}><stop offset="0" stopColor={fill} stopOpacity={0.85} /><stop offset="0.45" stopColor={fill} stopOpacity={0.35} /><stop offset="1" stopColor={fill} stopOpacity={0} /></radialGradient>
          <circle cx={cx} cy={cy} r={f(s * 1.15)} fill={`url(#${gid})`} opacity={f(glow)} pointerEvents="none" />
        </>
      )}
      <rect className="np-body" x={f(cx - s / 2)} y={f(cy - s / 2)} width={s} height={s} rx={1.4} fill="#f4f2ec" stroke="#c9c4b8" strokeWidth={0.8} />
      <circle cx={cx} cy={cy} r={f(s * 0.36)} fill={fill ?? '#e2ddd0'} stroke="#d3cdbf" strokeWidth={0.6} />
      {!fill && [-3, 0, 3].map((dx) => <rect key={dx} x={f(cx + dx - 1)} y={f(cy - 1.4)} width={2} height={2.8} fill="#b9b2a2" />)}
    </g>
  );
}

/** A NeoPixel stick lying beside the breadboard, at `at` (its body's top left): `n` LEDs, LED 0 at DIN's end; DIN 5V GND
 *  out of its left end, DOUT 5V GND out of its right; arrows printed between the LEDs the way the data goes. */
function NeoPixelStick({ at: { x, y }, n, colours, id }: { at: Point; n: number; colours: number[][]; id: string }) {
  const [p, m, h] = [22, 20, 44];
  const w = n * p + 2 * m;
  const pads = [10, 22, 34].map((o) => y + o);
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={3} fill="#1d1e21" stroke="#0f1012" filter="url(#lift)" />
      <text x={x + w / 2} y={y + 7.5} fontSize={4.6} fontWeight={700} fill="#8f969f" textAnchor="middle" fontFamily={FONT} pointerEvents="none">WS2812B · {n}</text>
      {colours.map((c, i) => {
        const cx = x + m + p / 2 + i * p;
        return (
          <g key={i}>
            <Pixel cx={cx} cy={y + 21} rgb={c} s={15} id={id} i={i} />
            <text x={cx} y={y + 38} fontSize={4.8} fontWeight={700} fill="#8f969f" textAnchor="middle" fontFamily={FONT} pointerEvents="none">{i}</text>
            {i < n - 1 && <path d={`M${f(cx + p / 2 - 1.4)},${y + 18.5} l2.6,2.5 l-2.6,2.5`} fill="none" stroke="#c7ccd2" strokeWidth={0.9} pointerEvents="none" />}
          </g>
        );
      })}
      <SideHeader x={x} ys={pads} labels={['DIN', '5V', 'GND']} right={false} />
      <SideHeader x={x + w} ys={pads} labels={['DOUT', '5V', 'GND']} right />
    </g>
  );
}

/** A NeoPixel ring lying beside the breadboard, at `at` (its middle): `n` LEDs, LED 0 at the top and on clockwise; its
 *  four pads on a header below it — DIN GND 5V DOUT, left to right. */
function NeoPixelRing({ at: { x: cx, y: cy }, n, colours, id }: { at: Point; n: number; colours: number[][]; id: string }) {
  const r = ({ 8: 30, 12: 42, 16: 54, 24: 78 } as Record<number, number>)[n] ?? n * 3.3;
  const [ro, ri] = [r + 12, r - 12];
  const xs = [-18, -6, 6, 18].map((d) => cx + d);
  const hy = cy + ro - 4;
  return (
    <g>
      <rect x={xs[0]! - 8} y={hy} width={52} height={16} rx={2} fill="#26282c" filter="url(#lift)" />
      <path d={`M${cx},${cy - ro} a${ro},${ro} 0 1 0 .01,0z M${cx},${cy - ri} a${ri},${ri} 0 1 1 -.01,0z`} fill="#1d1e21" stroke="#0f1012" fillRule="evenodd" filter="url(#lift)" />
      {xs.map((px, i) => (
        <g key={i}>
          <line x1={px} y1={hy + 16} x2={px} y2={cy + ro + 22} stroke="#c7ccd2" strokeWidth={2} />
          <circle cx={px} cy={cy + ro + 22} r={3.6} fill="#d6b24c" stroke="#a8862a" strokeWidth={0.8} />
          <circle cx={px} cy={cy + ro + 22} r={1.5} fill="#1b2b22" />
          <text x={px} y={hy + 11} fontSize={4.4} fontWeight={700} fill="#e9edf2" textAnchor="middle" fontFamily={FONT} pointerEvents="none">{['DIN', 'GND', '5V', 'DOUT'][i]}</text>
        </g>
      ))}
      {colours.map((c, i) => {
        const a = ((-90 + (360 * i) / n) * Math.PI) / 180;
        return (
          <g key={i}>
            <Pixel cx={f(cx + r * Math.cos(a))} cy={f(cy + r * Math.sin(a))} rgb={c} s={n > 16 ? 12 : 13} id={id} i={i} />
            {n <= 16 && <text x={f(cx + (ri - 6) * Math.cos(a))} y={f(cy + (ri - 6) * Math.sin(a) + 1.8)} fontSize={4.8} fontWeight={700} fill="#8f969f" textAnchor="middle" fontFamily={FONT} pointerEvents="none">{i}</text>}
          </g>
        );
      })}
      <text x={cx} y={cy + 2} fontSize={4.8} fontWeight={700} fill="#8f969f" textAnchor="middle" fontFamily={FONT} pointerEvents="none">WS2812B · {n}</text>
    </g>
  );
}

/** A NeoPixel stick or ring (its props' shape and LED count), each LED in the colour the sim says it shows. */
export function NeoPixel({ at, props, view, id }: { at: Point; props?: Record<string, unknown>; view?: PartView; id: string }) {
  const { shape, leds } = neopixelShape(props);
  const colours = pixelsOf(view, leds);
  const v = view?.kind === 'pixels' ? view : undefined;
  return (
    <g className="neopixel" data-shape={shape} data-leds={leds} data-lit={v?.on ? v.lit : 0} data-pixels={v?.on ? v.pixels : ''}>
      {shape === 'ring' ? <NeoPixelRing at={at} n={leds} colours={colours} id={id} /> : <NeoPixelStick at={at} n={leds} colours={colours} id={id} />}
    </g>
  );
}
