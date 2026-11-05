import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * The app's settings (panel widths, later the recent files and choices): one JSON file in the app's data
 * folder (architecture §2.2: the window reaches it only through the preload's `settings`). A missing or broken file
 * is no settings, never a crash; writes go to a temporary file first, so a crash mid-write loses nothing.
 */
export class SettingsStore {
  private data: Record<string, unknown>;

  constructor(private readonly file: string) {
    try {
      const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'));
      this.data = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
    } catch {
      this.data = {};
    }
  }

  get(key: string): unknown {
    return this.data[key];
  }

  set(key: string, value: unknown): void {
    this.data[key] = value;
    mkdirSync(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    renameSync(tmp, this.file);
  }
}
