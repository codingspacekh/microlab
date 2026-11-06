/**
 * When a board's port won't open (F-56, screen 13b "used by another program"): whether another program holds it, and
 * which — named when the app can tell, from the holder's command line (macOS and Linux, `lsof`). Pure.
 */
export type OpenFailure = 'busy' | 'gone' | 'other';

export function openFailure(message: string): OpenFailure {
  if (/cannot lock port|resource busy|access denied|EBUSY|EACCES|permission denied/i.test(message)) return 'busy';
  if (/no such file|file not found|ENOENT|not found/i.test(message)) return 'gone';
  return 'other';
}

const HOLDERS: [RegExp, string][] = [
  [/thonny/i, 'Thonny'],
  [/arduino/i, 'the Arduino IDE'],
  [/\bmu[-_]editor\b|\bmu\.app\b/i, 'Mu'],
  [/mpremote/i, 'mpremote'],
  [/microlab/i, 'another MicroLab window'],
  [/(^|\/)(screen|minicom|picocom|putty|coolterm)(\s|$)/i, ''],
];

/** The command lines of the processes holding the port → a name a student knows. */
export function holderName(commands: string[]): string | undefined {
  for (const c of commands) {
    for (const [re, name] of HOLDERS) {
      const m = re.exec(c);
      if (m) return name || m[2]!;
    }
  }
  return undefined;
}
