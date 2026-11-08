import { useRef, useState, type CSSProperties } from 'react';
import type { PartView } from '../../sim/circuit';
import { GPS_START } from '../../sim/serial';
import { Icon, Segmented, Select } from '../ui';
import { TextField } from '../ui/TextField';
import type { Live } from './live';

/**
 * M7 slice 5's cards while a program runs (screens 28, 28b, 28c): a USB-serial adapter's terminal — what reached it,
 * a line to send — a phone paired with an HC-05, a GPS's place. What they send goes to the sim through the live slots
 * ('tx0:usb1' … 'txlen:usb1', then 'txseq:usb1' counted on), as the micro:bit card's radio does.
 */
const BAUDS = [9600, 19200, 38400, 57600, 115200];
const ENDINGS = [{ value: 'none', label: 'none' }, { value: 'lf', label: '\\n' }, { value: 'crlf', label: '\\r\\n' }];
const ENDING: Record<string, string> = { none: '', lf: '\n', crlf: '\r\n' };

/** Sends text from a part (64 bytes at most a message). */
function useSend(live: Live, id: string) {
  const seq = useRef(0);
  return (text: string) => {
    const bytes = [...new TextEncoder().encode(text)].slice(0, 64);
    bytes.forEach((b, i) => live.set(`tx${i}:${id}`, b));
    live.set(`txlen:${id}`, bytes.length);
    live.set(`txseq:${id}`, ++seq.current);
  };
}

/** What a terminal shows of the bytes it got: line breaks as they are, other control bytes (a 0, a framing error's
 *  garbage) as �, as a serial monitor shows them. */
export const terminalText = (text: string) => [...text.replace(/\r/g, '')]
  .map((c) => { const n = c.charCodeAt(0); return (n < 32 && c !== '\n' && c !== '\t') || n === 127 ? '\uFFFD' : c; }).join('');

export function TerminalCard({ id, view, live, ending: start = 'crlf', style }: { id: string; view?: PartView; live: Live; ending?: string; style?: CSSProperties }) {
  const v = view?.kind === 'serial' ? view : undefined;
  const [line, setLine] = useState('');
  const [ending, setEnding] = useState(start);
  const [echo, setEcho] = useState<{ at: number; text: string }[]>([]);
  const baud = Number.isNaN(live.value(`baud:${id}`)) ? v?.baud ?? 9600 : live.value(`baud:${id}`);
  const send = useSend(live, id);
  const text = v?.text ?? '';
  // what the terminal sent, shown where it was sent among what came back
  const parts: React.ReactNode[] = [];
  let from = 0;
  for (const [i, e] of echo.filter((x) => x.at <= text.length).entries()) {
    parts.push(terminalText(text.slice(from, e.at)), <span key={i} className="me">{`> ${e.text}\n`}</span>);
    from = e.at;
  }
  parts.push(terminalText(text.slice(from)));
  const garbled = !!v?.heardBaud && Math.abs(v.heardBaud - baud) / baud > 0.02;
  const name = id.toUpperCase();
  return (
    <div className="float serial-card" role="group" aria-label={`${name} serial terminal`} style={style}>
      <div className="ih"><Icon name="term" size={14} /> <b>{name} · serial terminal</b></div>
      <div className="row2 settings">
        <Select label={`${name} baud rate`} hideLabel value={String(baud)} onChange={(b) => live.set(`baud:${id}`, Number(b))}
          options={BAUDS.map((b) => ({ value: String(b), label: `${b} baud` }))} />
        <Select label="Line ending" hideLabel value={ending} onChange={setEnding} options={ENDINGS.map((e) => ({ ...e, label: e.value === 'none' ? 'no line ending' : `ends ${e.label}` }))} />
      </div>
      <pre className="term" aria-label={`What ${name} received`} data-text={text}>{text || echo.length ? parts : <span className="muted">Nothing received yet.</span>}</pre>
      {garbled && <p className="hint"><Icon name="warn" size={12} /> Garbled? The board sends at {v!.heardBaud} baud; this terminal reads {baud}. Set them the same.</p>}
      <form className="row2" onSubmit={(e) => {
        e.preventDefault();
        send(line + ENDING[ending]!);
        setEcho((x) => [...x, { at: text.length, text: line }]);
        setLine('');
      }}>
        <TextField label={`Send from ${name}`} hideLabel value={line} onChange={setLine} placeholder="Send to the board…" />
        <button type="submit" className="btn sm primary" aria-label="Send" title="Send (Enter)"><Icon name="send" size={14} /></button>
      </form>
    </div>
  );
}

export function PhoneCard({ id, view, live, style }: { id: string; view?: PartView; live: Live; style?: CSSProperties }) {
  const v = view?.kind === 'bluetooth' ? view : undefined;
  const [msg, setMsg] = useState('');
  const send = useSend(live, id);
  const connected = !!v?.connected;
  const name = id.toUpperCase();
  const say = (text: string) => { if (connected && text) send(text); };
  return (
    <div className="float serial-card phone" role="group" aria-label="Phone (Bluetooth)" style={style}>
      <div className="ih"><Icon name="phone" size={14} /> <b>Phone · Bluetooth</b></div>
      <div className="row2">
        <Icon name="bt" size={12} />
        <span className="small">{!v?.on ? <>{name} has no power</> : connected ? <>Connected to <b>{name}</b></> : <>Not connected</>}</span>
        <span className="spacer" />
        <button type="button" className="btn sm" disabled={!v?.on} onClick={() => live.set(`connected:${id}`, connected ? 0 : 1)}>{connected ? 'Disconnect' : 'Connect'}</button>
      </div>
      <div className="bubbles" aria-label="Messages">
        {(v?.messages ?? []).map((m, i) => <span key={i} className={m.from === 'phone' ? 'out' : 'in'}>{m.text.replace(/\r?\n$/, '')}</span>)}
      </div>
      <form className="row2" onSubmit={(e) => { e.preventDefault(); say(msg); setMsg(''); }}>
        <button type="button" className="btn sm" disabled={!connected} onClick={() => say('on')}>on</button>
        <button type="button" className="btn sm" disabled={!connected} onClick={() => say('off')}>off</button>
        <TextField label="A message from the phone" hideLabel value={msg} onChange={setMsg} placeholder="Message…" disabled={!connected} />
        <button type="submit" className="btn sm primary" aria-label="Send from the phone" disabled={!connected || !msg}><Icon name="send" size={14} /></button>
      </form>
    </div>
  );
}

export function GpsCard({ id, view, live, style }: { id: string; view?: PartView; live: Live; style?: CSSProperties }) {
  const v = view?.kind === 'gps' ? view : undefined;
  const get = (k: keyof typeof GPS_START) => { const x = live.value(`${k}:${id}`); return Number.isNaN(x) ? Number(v?.[k] ?? GPS_START[k]) : x; };
  const [lat, setLat] = useState(String(get('lat')));
  const [lon, setLon] = useState(String(get('lon')));
  const [kmh, setKmh] = useState(String(get('kmh')));
  const num = (slot: string, s: string, lo: number, hi: number) => { const n = Number(s); if (s.trim() && Number.isFinite(n) && n >= lo && n <= hi) live.set(`${slot}:${id}`, n); };
  const name = id.toUpperCase();
  return (
    <div className="float serial-card gps-card" role="group" aria-label={`${name} GPS`} style={style}>
      <div className="ih"><Icon name="gps" size={14} /> <b>{name} · NEO-6M</b>{v && !v.on && <span className="tiny muted">· no power</span>}</div>
      <div className="row2"><span className="tiny muted">Fix</span>
        <Segmented label={`${name} fix`} hideLabel value={get('fix') >= 0.5 ? 'fix' : 'searching'} onChange={(f) => live.set(`fix:${id}`, f === 'fix' ? 1 : 0)}
          options={[{ value: 'fix', label: 'Fix' }, { value: 'searching', label: 'Searching' }]} />
      </div>
      <div className="row2"><span className="tiny muted">Latitude</span>
        <TextField label={`${name} latitude`} hideLabel mono value={lat} onChange={(s) => { setLat(s); num('lat', s, -90, 90); }} unit="°" /></div>
      <div className="row2"><span className="tiny muted">Longitude</span>
        <TextField label={`${name} longitude`} hideLabel mono value={lon} onChange={(s) => { setLon(s); num('lon', s, -180, 180); }} unit="°" /></div>
      <div className="row2"><span className="tiny muted">Satellites</span>
        <Segmented label={`${name} satellites`} hideLabel value={String(get('sats'))} onChange={(n) => live.set(`sats:${id}`, Number(n))}
          options={['4', '9', '12'].map((n) => ({ value: n, label: n }))} />
      </div>
      <div className="row2"><span className="tiny muted">Speed</span>
        <TextField label={`${name} speed`} hideLabel mono value={kmh} onChange={(s) => { setKmh(s); num('kmh', s, 0, 999); }} unit="km/h" /></div>
    </div>
  );
}
