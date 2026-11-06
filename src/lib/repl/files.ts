import { modelOf, parseUname, type Uname } from './greeting';
import { RawRepl, ReplError, UNAME_CODE, type Link, type ReplOptions } from './raw';

/**
 * The board's files over the raw REPL (F-50, F-53, Q15). A few small helpers are put on the board for the session
 * (PRELUDE) — plain MicroPython that runs on the micro:bit, the Pico W and the ESP32 alike — and each step is then
 * one short call: list, checksum, read, write in pieces, rename. Pure; the board is any Link.
 */
export const PRELUDE = `import os
def _mlls(d):
 for n in (os.listdir(d) if d else os.listdir()):
  p=d+'/'+n if d else n
  if not hasattr(os,'stat'):
   print('F',os.size(p),p)
   continue
  s=os.stat(p)
  if s[0]&0x4000:
   print('D',p)
   _mlls(p)
  else:
   print('F',s[6],p)
try:
 from binascii import hexlify as _mlhy
except ImportError:
 _mlhy=None
def _mlhex(b):
 return _mlhy(b).decode() if _mlhy else ''.join('%02x'%x for x in b)
def _mlh(p):
 try:
  import hashlib
 except ImportError:
  print('-')
  return
 h=hashlib.sha256()
 f=open(p,'rb')
 while 1:
  b=f.read(256)
  if not b:
   break
  h.update(b)
 f.close()
 print(_mlhex(h.digest()))
def _mlr(p):
 f=open(p,'rb')
 while 1:
  b=f.read(256)
  if not b:
   break
  print(_mlhex(b))
 f.close()
def _mlo(p):
 global _mlf
 _mlf=open(p,'wb')
def _mlc(b):
 _mlf.write(b)
def _mlx():
 _mlf.close()
def _mlmd(p):
 try:
  os.mkdir(p)
 except OSError:
  pass
def _mlrm(p):
 try:
  os.remove(p)
 except OSError:
  pass
def _mlmv(a,b):
 _mlrm(b)
 if hasattr(os,'rename'):
  os.rename(a,b)
  return
 f=open(a,'rb')
 g=open(b,'wb')
 while 1:
  x=f.read(256)
  if not x:
   break
  g.write(x)
 f.close()
 g.close()
 os.remove(a)
`;

/** The temporary name a file is written under until it is checked. */
export const PART = '.mlab-part';
/** Bytes of a file per write call. */
const PIECE = 256;

const py = (s: string) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

/** A Python bytes literal: printable ASCII as it is, everything else \xNN. */
export function pyBytes(b: Uint8Array): string {
  let s = "b'";
  for (const x of b) {
    if (x === 39 || x === 92) s += `\\${String.fromCharCode(x)}`;
    else if (x >= 32 && x < 127) s += String.fromCharCode(x);
    else s += `\\x${x.toString(16).padStart(2, '0')}`;
  }
  return `${s}'`;
}

const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
const unhex = (s: string) => Uint8Array.from(s.match(/../g) ?? [], (h) => parseInt(h, 16));
const lines = (s: string) => s.split(/\r?\n/).filter(Boolean);
const same = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((x, i) => x === b[i]);

export async function sha256(b: Uint8Array): Promise<string> {
  return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', b as Uint8Array<ArrayBuffer>)));
}

/** One session with a board's files: helpers loaded, each call checked for an error. */
export class BoardFiles {
  /** `quietMs`: how long the board may stay silent on a file command (a checksum of a big file prints nothing until
   *  it is done); a long answer that keeps coming is always waited for. */
  constructor(private readonly repl: RawRepl, private readonly quietMs = 5000) {}

  async load(): Promise<void> {
    await this.call(PRELUDE);
  }

  private async call(code: string): Promise<string> {
    const { out, err } = await this.repl.exec(code, this.quietMs);
    if (err) throw new ReplError('refused', `The board answered with an error: ${lines(err).at(-1) ?? err}`);
    return out;
  }

  /** Every file and folder, paths without a leading /. */
  async list(): Promise<{ files: Map<string, number>; dirs: Set<string> }> {
    const files = new Map<string, number>();
    const dirs = new Set<string>();
    for (const l of lines(await this.call("_mlls('')"))) {
      const m = /^F (\d+) (.+)$/.exec(l);
      if (m) files.set(m[2]!, Number(m[1]));
      else if (l.startsWith('D ')) dirs.add(l.slice(2));
    }
    return { files, dirs };
  }

  /** Its SHA-256, or null when the board has no hashlib (the micro:bit). */
  async hash(path: string): Promise<string | null> {
    const h = lines(await this.call(`_mlh(${py(path)})`))[0] ?? '-';
    return h === '-' ? null : h;
  }

  async read(path: string): Promise<Uint8Array> {
    return unhex(lines(await this.call(`_mlr(${py(path)})`)).join(''));
  }

  /** Whether the board's file holds exactly these bytes: by checksum, or read back where there is no hashlib. */
  async holds(path: string, data: Uint8Array): Promise<boolean> {
    const h = await this.hash(path);
    return h === null ? same(await this.read(path), data) : h === await sha256(data);
  }

  async write(path: string, data: Uint8Array): Promise<void> {
    await this.call(`_mlo(${py(path)})`);
    for (let i = 0; i < data.length; i += PIECE) await this.call(`_mlc(${pyBytes(data.subarray(i, i + PIECE))})`);
    await this.call('_mlx()');
  }

  async mkdir(path: string): Promise<void> {
    await this.call(`_mlmd(${py(path)})`);
  }

  async remove(path: string): Promise<void> {
    await this.call(`_mlrm(${py(path)})`);
  }

  async move(from: string, to: string): Promise<void> {
    await this.call(`_mlmv(${py(from)},${py(to)})`);
  }
}

export interface SendProgress {
  done: number;
  total: number;
  /** The file being looked at or copied; none when all are done. */
  path?: string;
  /** Which board it is, once it said. */
  uname?: Uname;
}

export interface SendOptions extends ReplOptions {
  /** Restart the board afterwards, so it runs main.py (default true). */
  run?: boolean;
  /** Given the board's old main.py before it is replaced, to keep a copy on the laptop. */
  keepOld?: (path: string, data: Uint8Array) => Promise<void>;
  onProgress?: (p: SendProgress) => void;
  /** How long the board may stay silent on a file command (default 5 s). */
  fileMs?: number;
}

/** What the app asks of Send to board, and what came of it (main process → window). */
export interface SendRequest {
  /** Restart the board afterwards so it runs main.py. */
  run: boolean;
  /** Keep a copy of the board's old main.py on the laptop. */
  keep: boolean;
}

export type SendResult =
  | { ok: true; board: string; sent: { path: string; size: number }[]; same: string[]; kept: string[]; keptIn?: string }
  | { ok: false; message: string };

export interface SendReport {
  uname?: Uname;
  sent: { path: string; size: number }[];
  /** Already on the board as they are: not copied. */
  same: string[];
  /** Old files a copy was kept of. */
  kept: string[];
}

/**
 * Send to board (F-50): only the files that changed; folders made as needed; each file written under a temporary
 * name, checked, then renamed over the old one — a cable pulled mid-copy leaves the old file whole, and the next
 * send finishes the job; main.py last; the board's other files left alone; then the board restarts and runs main.py.
 */
export async function sendFiles(link: Link, project: Record<string, string | Uint8Array>, opts: SendOptions = {}): Promise<SendReport> {
  const repl = new RawRepl(link, opts);
  await repl.enter().catch((e: ReplError) => {
    repl.dispose();
    throw e.reason === 'refused' ? new ReplError('no-micropython', "The board didn't answer as MicroPython does", e.seen) : e;
  });
  let failed: unknown;
  try {
    const uname = parseUname((await repl.exec(UNAME_CODE)).out) ?? undefined;
    const report: SendReport = { ...(uname ? { uname } : {}), sent: [], same: [], kept: [] };
    const paths = Object.keys(project).sort((a, b) => Number(a === 'main.py') - Number(b === 'main.py') || a.localeCompare(b));
    opts.onProgress?.({ done: 0, total: paths.length, ...(uname ? { uname } : {}) });
    if (uname && modelOf(uname).kind === 'microbit') {
      const nested = paths.filter((p) => p.includes('/'));
      if (nested.length) {
        throw new ReplError('refused', `The micro:bit has no folders: ${nested.join(', ')} can't go on it. Move ${nested.length > 1 ? 'them' : 'it'} next to main.py.`);
      }
    }
    const files = new BoardFiles(repl, opts.fileMs);
    await files.load();
    const board = await files.list();
    for (const left of [...board.files.keys()].filter((p) => p.endsWith(PART))) await files.remove(left);
    for (const [i, path] of paths.entries()) {
      opts.onProgress?.({ done: i, total: paths.length, path, ...(uname ? { uname } : {}) });
      const v = project[path]!;
      const data = typeof v === 'string' ? new TextEncoder().encode(v) : v;
      const there = board.files.get(path);
      if (there === data.length && await files.holds(path, data)) {
        report.same.push(path);
        continue;
      }
      if (path === 'main.py' && there !== undefined && opts.keepOld) {
        await opts.keepOld(path, await files.read(path));
        report.kept.push(path);
      }
      const parts = path.split('/').slice(0, -1);
      for (let d = 1; d <= parts.length; d++) {
        const dir = parts.slice(0, d).join('/');
        if (!board.dirs.has(dir)) { await files.mkdir(dir); board.dirs.add(dir); }
      }
      await files.write(path + PART, data);
      if (!await files.holds(path + PART, data)) {
        await files.remove(path + PART);
        throw new ReplError('refused', `${path} arrived changed on the board — try sending again (a loose cable?)`);
      }
      await files.move(path + PART, path);
      report.sent.push({ path, size: data.length });
    }
    opts.onProgress?.({ done: paths.length, total: paths.length, ...(uname ? { uname } : {}) });
    return report;
  } catch (e) {
    failed = e;
    throw e;
  } finally {
    // the board gets its program back — the new main.py, or its own if nothing could be sent
    const back = async () => {
      await repl.leave();
      if (opts.run !== false) await repl.softReset();
    };
    try {
      if (!failed) await back();
      else if (!(failed instanceof ReplError && failed.reason === 'lost')) await back().catch(() => {});
    } finally {
      repl.dispose();
    }
  }
}
