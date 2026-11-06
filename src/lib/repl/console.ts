import { RawRepl, bytesText, latin1, type Link, type ReplOptions } from './raw';

/**
 * The real board's console (F-51, screen 16) over a port kept open: what the board prints as it comes — its
 * tracebacks in red — its >>> prompt to type at, Stop (Ctrl-C), Restart (a soft reset: main.py runs again), and
 * running a file there without making it main.py (F-50 Rev 7, as Thonny does). Pure; the board is any Link.
 *
 * At >>> the board echoes what is typed and answers it. After a line ending in ":" it indents the next line itself,
 * which would double a block's own indentation — so a block is sent in paste mode (Ctrl-E … Ctrl-D, recorded on the
 * teacher's micro:bit), its "=== " shown as "... ".
 */
export type ConsoleKind = 'out' | 'err';

export interface ConsoleState {
  /** At the >>> prompt: something can be typed. */
  prompt: boolean;
  /** What runs on the board: "main.py" after a restart, or the file run there; null at the prompt. */
  running: string | null;
}

/** What the student does in a board's console (F-51), window → main process. */
export type ConsoleAction =
  | { do: 'type'; text: string }
  | { do: 'interrupt' }
  | { do: 'restart' }
  | { do: 'run'; name: string; code: string };

export interface ConsoleSink {
  output(text: string, kind: ConsoleKind): void;
  state?(s: ConsoleState): void;
}

const PASTE_BANNER = '\npaste mode; Ctrl-C to cancel, Ctrl-D to finish\n=== ';
const TRACEBACK = 'Traceback (most recent call last):';
/** The last line of a traceback: "KeyboardInterrupt: ", "NameError: name 'x' isn't defined". */
const LAST = /^[A-Za-z_][\w.]*(:.*)?$/;
/** No carriage returns, backspaces or terminal codes in what the console shows. */
// eslint-disable-next-line no-control-regex -- terminal codes are control characters
const strip = (t: string) => t.replace(/\x1b\[[0-9;]*[A-Za-z]|\r|\x08/g, '');

/** Board bytes (one char per byte) → what the console shows, UTF-8 decoded across chunks. */
function cleaner() {
  const d = new TextDecoder();
  return (bytes: string) => strip(d.decode(latin1(bytes), { stream: true }));
}

export class BoardConsole {
  private muted = 0;
  private readonly off: () => void;
  private clean = cleaner();
  /** Text not yet passed on: a line that may be the start of a traceback, the paste banner as it comes. */
  private held = '';
  private inTraceback = false;
  private pasting = false;
  private tail = '';
  private st: ConsoleState = { prompt: false, running: null };
  /** A file run here (not the board's own main.py) holds the port until it ends. */
  runningFile = false;

  constructor(private readonly link: Link, private readonly sink: ConsoleSink, private readonly opts: ReplOptions = {}) {
    this.off = link.onData((d) => { if (!this.muted) this.show(this.clean(bytesText(d))); });
  }

  /** Another job (a send, Board files) has the port: what the board says to it is not the student's. */
  mute(): void {
    this.muted++;
  }

  unmute(): void {
    this.muted = Math.max(0, this.muted - 1);
  }

  dispose(): void {
    this.off();
  }

  get state(): ConsoleState {
    return this.st;
  }

  /** Text the student typed at >>> (Enter): a line as it is; a block in paste mode. */
  async type(entry: string): Promise<void> {
    const lines = entry.replace(/\r\n?/g, '\n').replace(/\n+$/, '').split('\n');
    if (lines.length === 1 && !lines[0]!.trimEnd().endsWith(':')) {
      await this.write(`${lines[0]}\r`);
      return;
    }
    this.pasting = true;
    this.held = '';
    await this.write('\x05');
    await this.write(`${lines.join('\r')}\r`);
    await this.write('\x04');
  }

  /** Stop (Ctrl-C): the program — or the file run here — stops; the board gives its >>> prompt. */
  interrupt(): Promise<void> {
    return this.write('\x03');
  }

  /** Restart: the program stopped quietly (its traceback not shown), then a soft reset — the board runs main.py
   *  again, as when it is switched on. */
  async restart(): Promise<void> {
    this.mute();
    const repl = new RawRepl(this.link, this.opts);
    try {
      await repl.enter();
      await repl.leave();
    } finally {
      repl.dispose();
      this.unmute();
    }
    await this.softReset();
  }

  /** At the >>> prompt (after a send): restart softly; main.py runs. */
  async softReset(): Promise<void> {
    this.reset();
    this.setState({ prompt: false, running: 'main.py' });
    await this.write('\x04');
  }

  /** Runs a file on the board without saving it there (F-50 Rev 7): its output as it comes, Stop ends it. */
  async runFile(name: string, code: string): Promise<void> {
    this.mute();
    const repl = new RawRepl(this.link, this.opts);
    try {
      await repl.enter();
      this.reset();
      this.runningFile = true;
      this.setState({ prompt: false, running: name });
      await repl.execStream(code, (t) => this.emit(strip(t), 'out'), (t) => this.emit(strip(t), 'err'));
      await repl.leave();
    } finally {
      this.runningFile = false;
      repl.dispose();
      this.unmute();
    }
    this.emit('>>> ', 'out');
  }

  private write(s: string): Promise<void> {
    return this.link.write(new TextEncoder().encode(s));
  }

  private reset(): void {
    this.clean = cleaner();
    this.held = '';
    this.inTraceback = false;
    this.pasting = false;
  }

  /** The board's own text at the prompt or from its program: tracebacks found line by line, the paste echo tidied. */
  private show(text: string): void {
    let t = this.held + text;
    this.held = '';
    if (this.pasting) {
      const i = t.indexOf(PASTE_BANNER);
      if (i < 0 && PASTE_BANNER.startsWith(t.slice(0, PASTE_BANNER.length)) && t.length < PASTE_BANNER.length) {
        this.held = t;
        return;
      }
      if (i >= 0) t = t.slice(0, i) + t.slice(i + PASTE_BANNER.length);
      t = t.replace(/\n=== /g, '\n... ');
      // the board's "\n=== " can come in pieces ("\n=" then "== "): an ending that may be its start waits
      for (const k of [4, 3, 2, 1]) {
        if (t.endsWith('\n=== '.slice(0, k))) { this.held = t.slice(-k); t = t.slice(0, -k); break; }
      }
      if (/>>> $/.test(t)) this.pasting = false;
    }
    // whole lines: a traceback is red from its first line to its last
    const parts = t.split(/(?<=\n)/);
    for (const [k, line] of parts.entries()) {
      const whole = line.endsWith('\n');
      if (!whole && k === parts.length - 1) {
        if (!this.inTraceback && TRACEBACK.startsWith(line) && line.length > 0) { this.held = line; return; }
        if (this.inTraceback) { this.held = line; return; }
        this.emit(line, 'out');
        return;
      }
      if (!this.inTraceback && line.startsWith(TRACEBACK)) this.inTraceback = true;
      if (this.inTraceback) {
        this.emit(line, 'err');
        if (!line.startsWith(' ') && !line.startsWith(TRACEBACK) && LAST.test(line.trimEnd())) this.inTraceback = false;
      } else {
        this.emit(line, 'out');
      }
    }
  }

  private emit(text: string, kind: ConsoleKind): void {
    if (!text) return;
    this.sink.output(text, kind);
    this.tail = (this.tail + text).slice(-8);
    if (this.tail.endsWith('>>> ')) this.setState({ prompt: true, running: null });
    else if (this.st.prompt) this.setState({ prompt: false, running: this.st.running });
  }

  private setState(s: ConsoleState): void {
    if (s.prompt === this.st.prompt && s.running === this.st.running) return;
    this.st = s;
    this.sink.state?.(s);
  }
}
