import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The packaged app checks itself (M11, Rev 13; as OneEditor's ONEEDITOR_SELF_CHECK): scripts/package.ts starts the
 * freshly built app with MICROLAB_SELF_CHECK set to a report file; the app looks at everything it needs on that
 * computer — its Python 3.13 runs, MicroLab's runner and help-while-typing scripts, Jedi, its pages, the update
 * address, the updater loads — writes what it found, and quits. A release never ships missing a part.
 */
export interface SelfCheckDeps {
  python: string;
  runner: string;
  assist: string;
  tools: string | undefined;
  renderer: string;
  /** Install MicroPython's firmware (library/firmware: firmware.json and the files it names). */
  firmware: string;
  updatesFile: string;
  runPython: (exe: string) => Promise<string>;
  loadUpdater: () => Promise<unknown>;
}
export interface SelfCheckReport { ok: boolean; checks: Record<string, string | true> }

export async function selfCheck(d: SelfCheckDeps): Promise<SelfCheckReport> {
  const there = (path: string | undefined, what: string): string | true => (path && existsSync(path) ? true : `${what} missing (${path ?? 'none'})`);
  const checks: Record<string, string | true> = {};
  try {
    const v = (await d.runPython(d.python)).trim();
    checks.python = v.startsWith('3.13.') ? `Python ${v}` : `Python ${v}, not the bundled 3.13`;
  } catch (e) {
    checks.python = `Python doesn't run: ${(e as Error).message}`;
  }
  checks.runner = there(d.runner, 'the runner (python3/runner.py)');
  checks.help = there(d.assist, 'the help while typing (python3/assist.py)');
  checks.jedi = there(d.tools && join(d.tools, 'jedi'), 'Jedi (python-tools/jedi)');
  checks.pages = there(join(d.renderer, 'index.html'), "the window's pages (index.html)");
  checks.updates = there(d.updatesFile, 'the update address (updates.json)');
  try {
    const list = JSON.parse(readFileSync(join(d.firmware, 'firmware.json'), 'utf8')) as Record<string, { file?: string }>;
    const missing = Object.values(list).filter((f) => f && typeof f === 'object' && f.file && !existsSync(join(d.firmware, f.file))).map((f) => f.file);
    checks.firmware = missing.length ? `the firmware missing: ${missing.join(', ')}` : true;
  } catch {
    checks.firmware = `Install MicroPython's firmware missing (${join(d.firmware, 'firmware.json')})`;
  }
  try {
    await d.loadUpdater();
    checks.updater = true;
  } catch (e) {
    checks.updater = (e as Error).message;
  }
  const ok = Object.entries(checks).every(([k, v]) => v === true || (k === 'python' && /^Python 3\.13\.\d+$/.test(v)));
  return { ok, checks };
}
