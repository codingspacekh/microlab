import type { Point } from '@lib/editor';
import type { PartView } from '../../sim/circuit';

/**
 * M7 slice 5's UART parts as the approved screens 28, 28b, 28c draw them (design/svgparts.py: usb_serial, hc05,
 * gps_neo6m): each lies beside the board, drawn from where it lies (its body's top left), its header up out of its top
 * edge where the editor puts its terminals (lib/editor parts.ts topHeader). Their LEDs show what the sim says.
 */
const FONT = 'Inter Variable, Inter, sans-serif';

/** A header along a module's top edge: the black strip, each pin up to its pad (the terminal), its name below. */
function TopHeader({ x0, y, labels, fill = '#e9edf2' }: { x0: number; y: number; labels: string[]; fill?: string }) {
  return (
    <g>
      <rect x={x0 - 9} y={y - 1} width={16 * (labels.length - 1) + 18} height={7} rx={1} fill="#26282c" />
      {labels.map((lab, i) => {
        const px = x0 + 16 * i;
        return (
          <g key={lab}>
            <line x1={px} y1={y} x2={px} y2={y - 10} stroke="#c7ccd2" strokeWidth={2} />
            <circle cx={px} cy={y - 10} r={3.6} fill="#d6b24c" stroke="#a8862a" strokeWidth={0.8} />
            <circle cx={px} cy={y - 10} r={1.5} fill="#1b2b22" />
            <text x={px} y={y + 14} fontSize={5.5} fontWeight={700} fill={fill} textAnchor="middle" fontFamily={FONT} pointerEvents="none">{lab}</text>
          </g>
        );
      })}
    </g>
  );
}

/** A small LED; `flash` restarts its blink each time it changes (a byte went), `blink` its own steady rhythm. */
function Led({ x, y, colour, off, on, flash, blink }: { x: number; y: number; colour: string; off: string; on?: boolean; flash?: number; blink?: string }) {
  if (flash !== undefined && flash > 0) {
    return <rect key={flash} className="led-flash" x={x} y={y} width={6} height={4} rx={1} fill={colour} />;
  }
  return <rect className={blink} x={x} y={y} width={6} height={4} rx={1} fill={on || blink ? colour : off} />;
}

/** The USB-serial adapter (CP2102): its header up — RXD TXD GND 3V3 5V; its USB plug and cable below; TXD and RXD
 *  flash as bytes go (TXD: what its terminal sends; RXD: what reaches it). */
export function UsbSerial({ at: { x, y }, view }: { at: Point; view?: PartView }) {
  const v = view?.kind === 'serial' ? view : undefined;
  const [w, h] = [96, 64];
  return (
    <g className="usb-serial" data-received={v?.received ?? 0} data-sent={v?.sent ?? 0}>
      <rect x={x + 26} y={y + h - 2} width={44} height={30} rx={2} fill="#c9cdd2" stroke="#8f969f" />
      <rect x={x + 32} y={y + h + 6} width={32} height={12} rx={1} fill="#8f969f" />
      <path d={`M${x + 48},${y + h + 28} q0,22 -30,34`} fill="none" stroke="#3a3d42" strokeWidth={5} strokeLinecap="round" />
      <text x={x + 58} y={y + h + 48} fontSize={6} fill="#8f969f" fontFamily={FONT} pointerEvents="none">to the laptop</text>
      <rect x={x} y={y} width={w} height={h} rx={3} fill="#b8322a" stroke="#7d1f19" filter="url(#lift)" />
      <rect x={x + 34} y={y + 24} width={22} height={22} rx={1.5} fill="#1d1e21" />
      <text x={x + 45} y={y + 37} fontSize={4.5} fill="#8f969f" textAnchor="middle" fontFamily={FONT} pointerEvents="none">CP2102</text>
      {([['TXD', v?.sent], ['RXD', v?.received], ['PWR', undefined]] as const).map(([lab, n], i) => (
        <g key={lab}>
          <Led x={x + 66} y={y + 26 + 9 * i} colour="#ff3b2a" off="#5a2420" on={lab === 'PWR'} flash={n} />
          <text x={x + 75} y={y + 30 + 9 * i} fontSize={4.5} fontWeight={700} fill="#f6d9d6" fontFamily={FONT} pointerEvents="none">{lab}</text>
        </g>
      ))}
      <TopHeader x0={x + 16} y={y} labels={['RXD', 'TXD', 'GND', '3V3', '5V']} />
      <text x={x + 10} y={y + 56} fontSize={5.5} fontWeight={700} fill="#f6d9d6" fontFamily={FONT} pointerEvents="none">USB · serial</text>
    </g>
  );
}

/** The HC-05 (or JDY-31) on its carrier board: its header up — EN VCC GND TXD RXD STATE; its LED blinks fast until a
 *  phone connects, then twice every 2 s; dark with no power. */
export function Hc05({ at: { x, y }, view, kind = 'HC-05' }: { at: Point; view?: PartView; kind?: string }) {
  const v = view?.kind === 'bluetooth' ? view : undefined;
  const [w, h] = [112, 96];
  const led = !v ? undefined : !v.on ? undefined : v.connected ? 'led-paired' : 'led-pairing';
  return (
    <g className="hc05" data-connected={v?.connected ? '1' : '0'}>
      <rect x={x} y={y} width={w} height={h} rx={3} fill="#2457a6" stroke="#173c78" filter="url(#lift)" />
      <rect x={x + 14} y={y + 22} width={w - 28} height={h - 28} rx={1.5} fill="#f4f5f7" stroke="#c9cdd2" />
      <path d={`M${x + 22},${y + h - 14} h14 v-8 h10 v8 h10 v-8 h10 v8 h10 v-8 h8`} fill="none" stroke="#d6b24c" strokeWidth={1.6} />
      <rect x={x + 36} y={y + 32} width={24} height={24} rx={1} fill="#26282c" />
      <text x={x + w / 2} y={y + 66} fontSize={7} fontWeight={700} fill="#3a3d42" textAnchor="middle" fontFamily={FONT} pointerEvents="none">{kind}</text>
      <circle className={led} cx={x + w - 22} cy={y + 40} r={3} fill={led ? '#ff3b2a' : '#5a2420'} />
      <TopHeader x0={x + 16} y={y} labels={['EN', 'VCC', 'GND', 'TXD', 'RXD', 'STATE']} />
    </g>
  );
}

/** The GPS (GY-NEO6MV2): its header up — GND TX RX VCC; its patch antenna on a cable beside it; its PPS LED blinks once
 *  a second with a fix. */
export function Gps({ at: { x, y }, view }: { at: Point; view?: PartView }) {
  const v = view?.kind === 'gps' ? view : undefined;
  const [w, h] = [88, 88];
  const pps = !!v?.on && v.fix;
  return (
    <g className="gps" data-fix={pps ? '1' : '0'} data-sent={v?.sent ?? 0}>
      <path d={`M${x + w - 10},${y + 60} q30,10 46,-6`} fill="none" stroke="#3a3d42" strokeWidth={2.5} />
      <rect x={x + w + 30} y={y + 10} width={58} height={58} rx={4} fill="#d9c79a" stroke="#a58f5a" filter="url(#lift)" />
      <rect x={x + w + 42} y={y + 22} width={34} height={34} rx={2} fill="#e7dcbc" stroke="#b9a676" />
      <circle cx={x + w + 59} cy={y + 39} r={4} fill="#c7ccd2" stroke="#8f969f" />
      <rect x={x} y={y} width={w} height={h} rx={3} fill="#2457a6" stroke="#173c78" filter="url(#lift)" />
      <rect x={x + 22} y={y + 28} width={40} height={40} rx={1.5} fill="#c9cdd2" stroke="#8f969f" />
      <text x={x + 42} y={y + 46} fontSize={4.6} fontWeight={700} fill="#3a3d42" textAnchor="middle" fontFamily={FONT} pointerEvents="none">u-blox</text>
      <text x={x + 42} y={y + 54} fontSize={4.6} fontWeight={700} fill="#3a3d42" textAnchor="middle" fontFamily={FONT} pointerEvents="none">NEO-6M</text>
      <circle className={pps ? 'led-pps' : undefined} cx={x + 12} cy={y + 76} r={2.6} fill={pps ? '#3ddc6a' : '#244a31'} />
      <text x={x + 18} y={y + 78} fontSize={4.5} fontWeight={700} fill="#cfe0f2" fontFamily={FONT} pointerEvents="none">PPS</text>
      <TopHeader x0={x + 20} y={y} labels={['GND', 'TX', 'RX', 'VCC']} />
    </g>
  );
}
