import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { readMlab } from '@lib/project';

/** The M6 gate: every example packed as a .mlab (`npm run examples`), so the teacher opens each part's example in the
 *  app, runs it and tries its controls. A .mlab is the example's folder zipped: project.json and files/. */
const root = join(process.cwd(), 'library/examples');
const out = mkdtempSync(join(tmpdir(), 'mlab-examples-'));
afterAll(() => rmSync(out, { recursive: true, force: true }));

const examples = readdirSync(root).flatMap((id) => readdirSync(join(root, id))
  .filter((b) => existsSync(join(root, id, b, 'project.json'))).map((b) => [id, b] as const));

describe('the examples packed as .mlab files', () => {
  execFileSync(process.execPath, ['scripts/pack-examples.mjs', out]);
  const packed = readdirSync(out, { recursive: true, encoding: 'utf8' }).filter((f) => f.endsWith('.mlab'));

  it('one for each example on each board, in a folder per board, named by its title', () => {
    expect(packed).toHaveLength(examples.length);
    expect(packed).toContain(join('Raspberry Pi Pico W', 'Motion alarm (PIR).mlab'));
  });

  it.each(examples)('%s on %s opens with its project and files', (id, board) => {
    const dir = join(root, id, board);
    const json = JSON.parse(readFileSync(join(dir, 'project.json'), 'utf8')) as { title: string };
    const name = JSON.parse(readFileSync(join(process.cwd(), 'library/boards', board, 'board.json'), 'utf8')).name as string;
    const safe = (s: string) => s.replace(/[<>:"/\\|?*]/g, '-');   // as the script: Windows refuses ':' in a name
    const doc = readMlab(readFileSync(join(out, safe(name), `${safe(json.title)}.mlab`)));
    expect(doc.project.board).toBe(board);
    expect(doc.files['main.py']).toBe(readFileSync(join(dir, 'files', 'main.py'), 'utf8'));
  });
});
