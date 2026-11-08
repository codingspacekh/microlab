import { frameUs, reframe, type Framing } from './uart';

/**
 * The UARTs of a run (M7 slice 5, screens 28–28d): the board's own ports and the parts that talk on UART — a
 * USB-serial adapter (its terminal on the laptop), an HC-05 / JDY-31 Bluetooth module (a phone), a NEO-6M GPS. Bytes
 * go from a TX to every receiver on its net, each read by the receiver's own framing (uart.ts), arriving byte by byte
 * as the line carries them; a board port keeps what arrives in its receive buffer (as long as it is: the rest is lost).
 */
export const SERIAL_PARTS = {
  /** A CP2102 module: USB-powered; its terminal sends from TXD, shows what reaches RXD. */
  'usb-serial': { tx: 'txd', rx: 'rxd', baud: 9600 },
  /** HC-05 (or JDY-31) in data mode: 9600 8N1 as they come; 3.6–6 V (most work from 3.3). */
  hc05: { tx: 'txd', rx: 'rxd', baud: 9600, minVolts: 3.1, loadOhms: 120 },
  /** GY-NEO6MV2: a u-blox NEO-6M, 9600 8N1, NMEA once a second; 3.3–5 V through its regulator. */
  gps: { tx: 'tx', rx: 'rx', baud: 9600, minVolts: 2.7, loadOhms: 110 },
} as const;

export type SerialPartType = keyof typeof SERIAL_PARTS;
export const isSerialPart = (type: string): type is SerialPartType => type in SERIAL_PARTS;

/** Where the GPS starts: Phnom Penh (the teacher's school's city), a fix, 9 satellites, standing still. */
export const GPS_START = { fix: true, lat: 11.5564, lon: 104.9282, sats: 9, kmh: 0 };

const N81 = (baud: number): Framing => ({ baud, bits: 8, parity: -1, stop: 1 });

interface Arrival { us: number; byte: number }

interface Port {
  tx: string;
  rx: string;
  framing: Framing;
  rxbuf: number;
  buffer: number[];
  pending: Arrival[];
  busyUntil: number;
  lost: number;
}

/** A part's side: what reaches it, what it sends. */
interface PartLine {
  id: string;
  type: SerialPartType;
  pending: Arrival[];
  busyUntil: number;
  got: number[];       // bytes received, not yet turned into text
  sent: number;
  received: number;
  heardBaud?: number;  // the baud rate of the board port that last sent to it
  text: string;        // a terminal's text; a phone's messages
  messages: { from: 'phone' | 'board'; text: string }[];
  lastAt: number;
  connected: boolean;
  gps: typeof GPS_START;
  gpsNext?: number;    // when the GPS sends next
  decoder: TextDecoder;
  /** A terminal's baud rate as set on its card while running (over its part's). */
  baud?: number;
}

export interface SerialDeps {
  parts: { id: string; type: string; props?: Record<string, unknown> }[];
  /** The net a part's leg ('usb1.txd') is in. */
  netOf: (point: string) => string | undefined;
  /** The net a board pin (its key, '0') is in. */
  netOfPin: (key: string) => string | undefined;
  powered: (id: string) => boolean;
  /** Milliseconds since 1970 when the run started (the GPS's UTC). */
  wallStartMs: number;
}

/** Keeps the last `n` characters of a terminal's text. */
const TEXT_LIMIT = 4000;
/** Bytes from the board this far apart are one phone message (or a newline ends one). */
const MESSAGE_GAP_US = 50_000;

export class SerialHub {
  private readonly ports = new Map<number, Port>();
  private nextHandle = 1;
  readonly lines = new Map<string, PartLine>();
  /** Each port opened with its TX on a part's TX (or another port's): [port's TX pin key, the other end]. */
  readonly txToTx: [string, string][] = [];
  version = 0;

  constructor(private readonly deps: SerialDeps) {
    for (const p of deps.parts) {
      if (!isSerialPart(p.type)) continue;
      this.lines.set(p.id, {
        id: p.id, type: p.type, pending: [], busyUntil: 0, got: [], sent: 0, received: 0, text: '', messages: [], lastAt: -Infinity,
        connected: false, gps: { ...GPS_START }, decoder: new TextDecoder('utf-8', { fatal: false }),
      });
    }
  }

  private propsOf(id: string) { return this.deps.parts.find((p) => p.id === id)?.props ?? {}; }
  /** A part's framing: the terminal's baud as set on it (its inspector, its card), a module's 9600. */
  framingOf(id: string): Framing {
    const line = this.lines.get(id)!;
    const baud = line.type === 'usb-serial' ? line.baud ?? Number(this.propsOf(id).baud ?? SERIAL_PARTS[line.type].baud) : SERIAL_PARTS[line.type].baud;
    return N81(baud);
  }

  // ------------------------------------------------------------------ the board's ports
  open(tx: string, rx: string, framing: Framing, rxbuf: number): number {
    const h = this.nextHandle++;
    this.ports.set(h, { tx, rx, framing, rxbuf, buffer: [], pending: [], busyUntil: 0, lost: 0 });
    // TX wired to a part's TX, or another open port's: two outputs on one line (screen 28d)
    const net = tx ? this.deps.netOfPin(tx) : undefined;
    if (net !== undefined) {
      for (const line of this.lines.values()) {
        if (this.deps.netOf(`${line.id}.${SERIAL_PARTS[line.type].tx}`) === net) this.txToTx.push([tx, `${line.id}.${SERIAL_PARTS[line.type].tx}`]);
      }
    }
    return h;
  }

  close(h: number): void { this.ports.delete(h); }

  /** Sends from a board port; returns when its last byte has gone (µs). */
  send(h: number, bytes: number[], now: number): number {
    const port = this.ports.get(h);
    if (!port || !bytes.length) return now;
    const start = Math.max(now, port.busyUntil);
    port.busyUntil = start + bytes.length * frameUs(port.framing);
    const net = port.tx ? this.deps.netOfPin(port.tx) : undefined;
    if (net !== undefined) this.deliver(net, bytes, port.framing, start);
    return port.busyUntil;
  }

  busyUntil(h: number): number { return this.ports.get(h)?.busyUntil ?? 0; }

  /** What has arrived in a port's buffer by now. */
  available(h: number, now: number): number {
    this.tick(now);
    const port = this.ports.get(h);
    if (!port) return 0;
    this.pump(port, now);
    return port.buffer.length;
  }

  take(h: number, n: number, now: number): number[] {
    const port = this.ports.get(h);
    if (!port) return [];
    this.available(h, now);
    return port.buffer.splice(0, Math.max(0, Math.min(n, port.buffer.length)));
  }

  /** How long until the next byte reaches the port (µs), or -1 when nothing is on its way. */
  nextUs(h: number, now: number): number {
    const port = this.ports.get(h);
    if (!port) return -1;
    this.tick(now);
    const next = port.pending[0]?.us;
    const rxNet = port.rx ? this.deps.netOfPin(port.rx) : undefined;
    // a GPS on its RX sends once a second
    let gps = Infinity;
    for (const line of this.lines.values()) {
      if (line.type === 'gps' && line.gpsNext !== undefined && rxNet !== undefined && this.deps.netOf(`${line.id}.tx`) === rxNet) gps = Math.min(gps, line.gpsNext + frameUs(N81(9600)));
    }
    const at = Math.min(next ?? Infinity, gps);
    return Number.isFinite(at) ? Math.max(0, at - now) : -1;
  }

  private pump(port: Port, now: number): void {
    while (port.pending.length && port.pending[0]!.us <= now) {
      const a = port.pending.shift()!;
      if (port.buffer.length < port.rxbuf) port.buffer.push(a.byte);
      else port.lost++;
    }
  }

  /** Bytes sent onto a net from a TX: every receiver there reads them by its own framing. */
  private deliver(net: string, bytes: number[], from: Framing, start: number, fromPort = true): void {
    const merge = (into: Arrival[], add: Arrival[]) => { into.push(...add); into.sort((a, b) => a.us - b.us); };
    for (const port of this.ports.values()) {
      if (port.rx && this.deps.netOfPin(port.rx) === net) merge(port.pending, reframe(bytes, from, port.framing, start));
    }
    for (const line of this.lines.values()) {
      if (this.deps.netOf(`${line.id}.${SERIAL_PARTS[line.type].rx}`) !== net) continue;
      if (line.type !== 'usb-serial' && !this.deps.powered(line.id)) continue;
      if (fromPort) line.heardBaud = from.baud;
      merge(line.pending, reframe(bytes, from, this.framingOf(line.id), start));
    }
  }

  // ------------------------------------------------------------------ the parts' side
  /** Text a part sends (a terminal's line, a phone's message) at `now`: from its TX at its framing. */
  partSends(id: string, text: string, now: number): void {
    const line = this.lines.get(id);
    if (!line) return;
    if (line.type === 'hc05') {
      if (!line.connected || !this.deps.powered(id)) return;
      this.note(line, 'phone', text);
    }
    const bytes = [...new TextEncoder().encode(text)];
    const framing = this.framingOf(id);
    const start = Math.max(now, line.busyUntil);
    line.busyUntil = start + bytes.length * frameUs(framing);
    line.sent += bytes.length;
    const net = this.deps.netOf(`${id}.${SERIAL_PARTS[line.type].tx}`);
    if (net !== undefined) this.deliver(net, bytes, framing, start, false);
    this.version++;
  }

  /** A terminal set to another baud rate on its card (screen 28d): what comes next is read at it. */
  setBaud(id: string, baud: number): void {
    const line = this.lines.get(id);
    if (line && baud > 0 && line.baud !== baud) { line.baud = baud; this.version++; }
  }

  setConnected(id: string, on: boolean): void {
    const line = this.lines.get(id);
    if (line && line.connected !== on) { line.connected = on; this.version++; }
  }

  setGps(id: string, change: Partial<typeof GPS_START>): void {
    const line = this.lines.get(id);
    if (!line) return;
    Object.assign(line.gps, Object.fromEntries(Object.entries(change).filter(([, v]) => v !== undefined)));
    this.version++;
  }

  connected(id: string): boolean { return !!this.lines.get(id)?.connected && this.deps.powered(id); }

  private note(line: PartLine, from: 'phone' | 'board', text: string): void {
    const last = line.messages.at(-1);
    if (from === 'board' && last?.from === 'board' && !last.text.endsWith('\n')) last.text += text;
    else line.messages.push({ from, text });
    if (line.messages.length > 20) line.messages.splice(0, line.messages.length - 20);
  }

  /** Time passes: bytes reach the parts (a terminal's text, a phone's messages), a GPS sends its second's sentences. */
  tick(now: number): void {
    for (const line of this.lines.values()) {
      if (line.type === 'gps') this.gpsTick(line, now);
      let changed = false;
      while (line.pending.length && line.pending[0]!.us <= now) {
        const a = line.pending.shift()!;
        if (line.type === 'hc05' && line.messages.length && a.us - line.lastAt > MESSAGE_GAP_US) this.flushBoard(line, true);
        line.got.push(a.byte);
        line.received++;
        line.lastAt = a.us;
        changed = true;
      }
      if (changed) {
        if (line.type === 'usb-serial') {
          line.text = (line.text + line.decoder.decode(new Uint8Array(line.got), { stream: true })).slice(-TEXT_LIMIT);
          line.got = [];
        } else if (line.type === 'hc05') {
          this.flushBoard(line, false);
        } else {
          line.got = [];
        }
        this.version++;
      }
    }
  }

  private flushBoard(line: PartLine, gap: boolean): void {
    const text = line.decoder.decode(new Uint8Array(line.got), { stream: !gap });
    line.got = [];
    if (!line.connected) return;   // nobody listening: what the board sent is gone
    if (gap && line.messages.at(-1)?.from === 'board' && !line.messages.at(-1)!.text.endsWith('\n')) line.messages.at(-1)!.text += '\n';
    if (text) this.note(line, 'board', text);
  }

  private gpsTick(line: PartLine, now: number): void {
    if (!this.deps.powered(line.id)) { line.gpsNext = undefined; return; }
    line.gpsNext ??= now + 1_000_000;   // its first sentences a second after it gets power
    for (let at: number = line.gpsNext; at <= now; at = line.gpsNext) {
      const text = nmea(line.gps, this.deps.wallStartMs + at / 1000);
      const bytes = [...new TextEncoder().encode(text)];
      line.sent += bytes.length;
      const net = this.deps.netOf(`${line.id}.tx`);
      if (net !== undefined) this.deliver(net, bytes, N81(9600), at, false);
      line.gpsNext = at + 1_000_000;
      this.version++;
    }
  }
}

// ------------------------------------------------------------------ NMEA, as a u-blox NEO-6M sends it
const checksum = (body: string) => [...body].reduce((x, c) => x ^ c.charCodeAt(0), 0).toString(16).toUpperCase().padStart(2, '0');
const sentence = (body: string) => `$${body}*${checksum(body)}\r\n`;
const PRNS = [2, 5, 12, 13, 15, 18, 20, 24, 25, 26, 29, 31];

function angle(deg: number, lat: boolean): [string, string] {
  const a = Math.abs(deg);
  const d = Math.floor(a);
  const m = (a - d) * 60;
  return [`${String(d).padStart(lat ? 2 : 3, '0')}${m.toFixed(5).padStart(8, '0')}`, lat ? (deg < 0 ? 'S' : 'N') : (deg < 0 ? 'W' : 'E')];
}

/** One second's sentences (RMC, VTG, GGA, GSA, GSV, GLL) at the UTC time `ms`. */
export function nmea(g: typeof GPS_START, ms: number): string {
  const d = new Date(ms);
  const p2 = (n: number) => String(n).padStart(2, '0');
  const time = `${p2(d.getUTCHours())}${p2(d.getUTCMinutes())}${p2(d.getUTCSeconds())}.00`;
  const date = `${p2(d.getUTCDate())}${p2(d.getUTCMonth() + 1)}${p2(d.getUTCFullYear() % 100)}`;
  if (!g.fix) {
    return [
      `GPRMC,${time},V,,,,,,,${date},,,N`, 'GPVTG,,,,,,,,,N', `GPGGA,${time},,,,,0,00,99.99,,,,,,`,
      'GPGSA,A,1,,,,,,,,,,,,,99.99,99.99,99.99', 'GPGSV,1,1,00', `GPGLL,,,,,${time},V,N`,
    ].map(sentence).join('');
  }
  const [lat, ns] = angle(g.lat, true);
  const [lon, ew] = angle(g.lon, false);
  const knots = (g.kmh / 1.852).toFixed(3);
  const sats = Math.max(0, Math.min(12, Math.round(g.sats)));
  const used = PRNS.slice(0, sats);
  const gsa = [...used.map((n) => p2(n)), ...new Array(12 - used.length).fill('')].join(',');
  const gsv: string[] = [];
  const pages = Math.max(1, Math.ceil(sats / 4));
  for (let i = 0; i < pages; i++) {
    const these = used.slice(i * 4, i * 4 + 4).map((n, k) => `${p2(n)},${p2(20 + ((n * 7 + k * 13) % 60))},${String((n * 37) % 360).padStart(3, '0')},${p2(25 + (n % 20))}`);
    gsv.push(`GPGSV,${pages},${i + 1},${p2(sats)}${these.length ? ',' + these.join(',') : ''}`);
  }
  return [
    `GPRMC,${time},A,${lat},${ns},${lon},${ew},${knots},,${date},,,A`,
    `GPVTG,,T,,M,${knots},N,${g.kmh.toFixed(3)},K,A`,
    `GPGGA,${time},${lat},${ns},${lon},${ew},1,${p2(sats)},0.98,12.0,M,-27.5,M,,`,
    `GPGSA,A,3,${gsa},1.62,0.98,1.29`,
    ...gsv,
    `GPGLL,${lat},${ns},${lon},${ew},${time},A,A`,
  ].map(sentence).join('');
}
