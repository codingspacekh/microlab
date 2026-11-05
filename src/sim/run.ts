import { Console, startMicroPython, type LoadMicroPython, type MicroPython } from './vm';

/**
 * The sim core without a worker (M2.1): a fresh MicroPython, the project's files in its file system, boot.py then
 * main.py, the console, and the error with its file and line (F-21, F-30). The worker (M2.8) wraps this.
 */

/** The project's files by path from the board's root: 'main.py', 'lib/ssd1306.py', 'data/levels.txt'. */
export type ProjectFiles = Record<string, string | Uint8Array>;

export interface SimError {
  /** NameError, OSError, SyntaxError, or the student's own exception class. */
  type: string;
  /** As printed after "Type: " ("name 'y' isn't defined", "[Errno 19] ENODEV"); '' when there is none. */
  message: string;
  /** The innermost frame in the student's own files ('main.py', 'lib/util.py'), if any. */
  file?: string;
  line?: number;
}

export interface RunResult {
  /** Everything the board printed, tracebacks included, as the console shows it. */
  output: string;
  /** done: the program ended (or there was no main.py); error: an exception; stopped: KeyboardInterrupt (Stop). */
  ended: 'done' | 'error' | 'stopped';
  error?: SimError;
}

export interface RunOptions {
  files: ProjectFiles;
  onOutput?: (text: string) => void;
}

/** The sim's own Python (src/python/common), written to a folder the program can't reach once it starts. */
const SIM_MODULES = import.meta.glob<string>('../python/common/*.py', { query: '?raw', import: 'default', eager: true });
const SIM_DIR = '/_sim';
const PROJECT_DIR = '/flash';

export async function runProject(load: LoadMicroPython, options: RunOptions): Promise<RunResult> {
  const console = new Console(options.onOutput);
  const mp = await startMicroPython(load, console);
  writeTree(mp, SIM_DIR, simModules());
  writeTree(mp, PROJECT_DIR, options.files);

  const hidden = Object.keys(simModules()).map((f) => f.replace(/\.py$/, ''));
  let last: string;
  try {
    mp.runPython(`import sys\nsys.path.insert(0, '${SIM_DIR}')\nimport _sim\nsys.path.remove('${SIM_DIR}')`);
    const sim = mp.pyimport('_sim');   // our handle: setup() takes _sim out of sys.modules
    mp.runPython([
      `_sim.setup('${PROJECT_DIR}', ${JSON.stringify(hidden)})`,
      '__sim = _sim',
      'del _sim',
      "__sim.run(['boot.py', 'main.py'], globals())",   // run() drops __sim from the program's namespace
    ].join('\n'));
    last = String(sim.last);
  } catch (e) {
    // Only reached if Python fails outside the student's code (Stop landing in the runner itself).
    last = /KeyboardInterrupt/.test(String(e)) ? 'stopped\n' : `error\n${String(e)}`;
  }
  console.flush();

  const nl = last.indexOf('\n');
  const ended = last.slice(0, nl) as RunResult['ended'];
  const traceback = last.slice(nl + 1);
  return { output: console.output, ended, ...(ended === 'error' ? { error: parseTraceback(traceback) } : {}) };
}

function simModules(): ProjectFiles {
  return Object.fromEntries(Object.entries(SIM_MODULES).map(([path, src]) => [path.slice(path.lastIndexOf('/') + 1), src]));
}

function writeTree(mp: MicroPython, root: string, files: ProjectFiles): void {
  const made = new Set<string>();
  const dir = (path: string) => {
    if (made.has(path)) return;
    made.add(path);
    mp.FS.mkdir(path);
  };
  dir(root);
  for (const [path, data] of Object.entries(files)) {
    const parts = path.split('/');
    for (let i = 1; i < parts.length; i++) dir(`${root}/${parts.slice(0, i).join('/')}`);
    mp.FS.writeFile(`${root}/${path}`, data);
  }
}

/** The traceback as the board printed it → the error: its last line, and the innermost frame of a student file. */
export function parseTraceback(text: string): SimError {
  const lines = text.trimEnd().split('\n');
  const last = lines[lines.length - 1] ?? '';
  const m = /^([A-Za-z_][\w.]*)(?:: ?(.*))?$/.exec(last);
  const error: SimError = m ? { type: m[1]!, message: m[2] ?? '' } : { type: 'Error', message: last };
  for (const line of lines) {
    const f = /^ {2}File "([^"]+)", line (\d+)/.exec(line);
    if (f) {
      error.file = f[1]!.replace(/^\//, '');
      error.line = Number(f[2]);
    }
  }
  return error;
}
