import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseBoard, type BoardData } from '@lib/boards';
import { parseProject, toCircuit } from '@lib/project';
import { VirtualClock } from '../../src/sim/clock';
import { check, expectSchema, inputsOf } from '../../src/sim/expect';
import { runProject, type ProjectFiles, type SimBoard } from '../../src/sim/run';
import { nodeLoader } from '../python/vm';

/** M3.6: every example (library/examples/<id>/<board>/: project.json, files/, expect.json) runs headless on its board
 *  with the VirtualClock and shows what its expect.json says. New examples join by themselves. */
const root = join(process.cwd(), 'library/examples');
const boards = new Map<string, BoardData>();
const board = (id: string) => {
  if (!boards.has(id)) boards.set(id, parseBoard(JSON.parse(readFileSync(join(process.cwd(), 'library/boards', id, 'board.json'), 'utf8'))));
  return boards.get(id)!;
};

function files(dir: string, base = dir): ProjectFiles {
  const out: ProjectFiles = {};
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) Object.assign(out, files(path, base));
    else out[relative(base, path)] = readFileSync(path, 'utf8');
  }
  return out;
}

const examples = readdirSync(root).flatMap((id) => readdirSync(join(root, id)).filter((b) => existsSync(join(root, id, b, 'expect.json'))).map((b) => [id, b] as const));

describe('M3.6 the examples are the acceptance suite', () => {
  it('there are examples', () => expect(examples.length).toBeGreaterThanOrEqual(9));

  it.each(examples)('%s on %s', async (id, boardId) => {
    const dir = join(root, id, boardId);
    const project = parseProject(JSON.parse(readFileSync(join(dir, 'project.json'), 'utf8')));
    const e = expectSchema.parse(JSON.parse(readFileSync(join(dir, 'expect.json'), 'utf8')));
    const result = await runProject(await nodeLoader(), {
      board: project.board as SimBoard,
      circuit: toCircuit(project, board(project.board)),
      files: files(join(dir, 'files')),
      clock: new VirtualClock(),
      partInputs: inputsOf(e),
      maxUs: e.seconds * 1e6,
    });
    expect(check(result, e)).toEqual([]);
  }, 30_000);
});
