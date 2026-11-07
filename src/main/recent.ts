import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { readMlab, type ProjectDoc } from '@lib/project';
import { saveProjectFile } from './project-files';
import type { SettingsStore } from './settings';

/**
 * Recent projects (F-05, screen 01) and the recovery copy (F-03). Recent: every project opened or saved, newest
 * first, at most 8, kept in the settings; each says where it is from the home folder and whether it is still there.
 * Recovery: the open project with changes not yet saved, written whole (zip, then put in place) to the app's data
 * folder every few seconds while it changes and on every run; cleared when it is saved or its changes are given up.
 * A copy found when the app starts means the app ended without either: the start screen offers it back.
 */
export interface RecentEntry { path: string; name: string; board: string; at: number }
export interface RecentItem extends RecentEntry { where: string; missing: boolean }

const MAX = 8;

const isEntry = (e: unknown): e is RecentEntry => {
  const r = e as Partial<RecentEntry> | null;
  return !!r && typeof r.path === 'string' && typeof r.name === 'string' && typeof r.board === 'string' && typeof r.at === 'number';
};

export class Recent {
  constructor(private readonly settings: SettingsStore, private readonly home: string) {}

  private entries(): RecentEntry[] {
    const v = this.settings.get('recent');
    return Array.isArray(v) ? v.filter(isEntry) : [];
  }

  add(e: Omit<RecentEntry, 'at'>, at = Date.now()): void {
    this.settings.set('recent', [{ ...e, at }, ...this.entries().filter((x) => x.path !== e.path)].slice(0, MAX));
  }

  forget(path: string): void {
    this.settings.set('recent', this.entries().filter((x) => x.path !== path));
  }

  list(): RecentItem[] {
    return this.entries().map((e) => {
      const rel = relative(this.home, e.path);
      const where = rel && !rel.startsWith('..') ? rel.split(sep).join('/') : e.path;
      return { ...e, where, missing: !existsSync(e.path) };
    });
  }
}

export interface Recovered { name: string; path?: string; at: number; doc: ProjectDoc }

export class Recovery {
  constructor(private readonly dir: string) {}

  private get file() { return join(this.dir, 'project.mlab'); }
  private get meta() { return join(this.dir, 'about.json'); }

  async write(doc: ProjectDoc, about: { name: string; path?: string }, at = Date.now()): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    const r = await saveProjectFile(this.file, doc);
    if (!r.ok) return;
    await writeFile(this.meta, JSON.stringify({ name: about.name, ...(about.path ? { path: about.path } : {}), at }));
  }

  async get(): Promise<Recovered | null> {
    try {
      const about = JSON.parse(await readFile(this.meta, 'utf8')) as { name: string; path?: string; at: number };
      const doc = readMlab(new Uint8Array(await readFile(this.file)));
      return { name: about.name, ...(about.path ? { path: about.path } : {}), at: about.at, doc };
    } catch {
      return null;
    }
  }

  async clear(): Promise<void> {
    await rm(this.file, { force: true });
    await rm(this.meta, { force: true });
  }
}
