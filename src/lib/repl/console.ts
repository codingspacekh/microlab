import { parseUname, type Uname } from './greeting';
import { RawRepl, ReplError, UNAME_CODE, bytesText, latin1, type Link, type ReplOptions } from './raw';

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
  /** Which board it is — asked on the way when a file is run or the board restarted (30 ms). */
  answered?(u: Uname): void;
}

/** Said when a file run on the board ignores every Ctrl-C. */
export const WONT_STOP = "The program on the board doesn't stop when asked — it may catch every error with a bare \"except:\". Unplug the board and plug it back in to stop it.";
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
  /** A file is being started (runFile, before it runs); Stop meanwhile calls it off (M11.8). */
  startingFile = false;
  private calledOff = false;
  /** Stop was asked of the file that runs: Ctrl-C is sent until it ends, and the board is made quiet after. */
  private stopAsked = false;
  /** Counts the files run: a Stop's repeats are for the run they were asked of. */
  private runNo = 0;
  private current: RawRepl | undefined;

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

  /**
   * Stop (Ctrl-C): the program — or the file run here — stops; the board gives its >>> prompt.
   * The class's report after v1.0 ("the board sometimes cannot be stopped"): a file still being started — the raw
   * prompt, the restart (M11.8), the file going to the board — is called off and nothing is written, for a Ctrl-C
   * then is not heard by the board, or breaks the file in two; one that runs gets Ctrl-C again and again until it
   * ends (the board hears none while it still compiles the file); and while another job has the port (a send) nothing
   * is written into its talk.
   */
  async interrupt(): Promise<void> {
    if (this.startingFile) { this.calledOff = true; return; }
    if (this.runningFile) {
      const first = !this.stopAsked;
      this.stopAsked = true;
      await this.write('\x03');
      if (first) this.insist(this.runNo, this.opts.stopTries ?? 6);
      return;
    }
    if (this.muted) return;
    await this.write('\x03');
  }

  /** A file is about to be run (it waits for the port): a Stop from now on calls it off. */
  willRun(): void {
    this.startingFile = true;
    this.calledOff = false;
  }

  /** Until the stopped file ends: Ctrl-C again; after the last try its output is no longer waited for. */
  private insist(run: number, left: number): void {
    setTimeout(() => {
      if (!this.runningFile || this.runNo !== run || !this.stopAsked) return;
      if (left <= 0) { this.current?.abandon(); return; }
      void this.write('\x03').catch(() => {});
      this.insist(run, left - 1);
    }, this.opts.stopMs ?? 500);
  }

  /** Restart: the program stopped quietly (its traceback not shown), then a soft reset — the board runs main.py
   *  again, as when it is switched on. */
  async restart(): Promise<void> {
    this.mute();
    const repl = new RawRepl(this.link, this.opts);
    try {
      await repl.enter();
      await this.ask(repl);
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
    let repl = new RawRepl(this.link, this.opts);
    let prompt = true;
    try {
      if (!this.startingFile) this.willRun();
      await repl.enter();
      await this.ask(repl);
      // a fresh board, as Thonny and the simulator give (Q19, M11.8): a helper copied anew is the one imported
      await repl.reset();
      this.reset();
      if (!this.calledOff) {
        const run = ++this.runNo;
        this.stopAsked = false;
        this.current = repl;
        this.setState({ prompt: false, running: name });
        try {
          await repl.execStream(code, (t) => this.emit(strip(t), 'out'), (t) => this.emit(strip(t), 'err'), () => {
            // the board has the whole file: from here Stop is a Ctrl-C — and a Stop asked meanwhile is sent now
            this.startingFile = false;
            this.runningFile = true;
            if (this.calledOff) void this.interrupt().catch(() => {});
          });
        } catch (e) {
          if (!(e instanceof ReplError) || e.reason !== 'timeout' || !this.stopAsked) throw e;
          // it did not stop: asked once more as a send asks (Ctrl-C twice, then the raw prompt)
          repl.dispose();
          repl = new RawRepl(this.link, this.opts);
          prompt = await repl.enter().then(() => true, (x: unknown) => { if (x instanceof ReplError && x.reason === 'lost') throw x; return false; });
        } finally {
          this.runNo = run + 1;
          this.runningFile = false;
        }
        // stopped by the student: the board goes quiet, as the simulator's does — a soft restart ends its timers,
        // its sounds, its PWM and the micro:bit's display (boot.py runs, main.py doesn't)
        if (prompt && this.stopAsked) await repl.reset().catch((x: unknown) => { if (x instanceof ReplError && x.reason === 'lost') throw x; });
      }
      if (prompt) await repl.leave();
    } finally {
      this.startingFile = false;
      this.runningFile = false;
      this.current = undefined;
      repl.dispose();
      this.unmute();
    }
    if (prompt) this.emit('>>> ', 'out');
    else this.emit(`\n${WONT_STOP}\n`, 'err');
  }

  /** At the raw prompt: which board (its os.uname()); nothing said if it can't be read. */
  private async ask(repl: RawRepl): Promise<void> {
    if (!this.sink.answered) return;
    const u = parseUname((await repl.exec(UNAME_CODE).catch(() => ({ out: '' }))).out);
    if (u) this.sink.answered(u);
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
