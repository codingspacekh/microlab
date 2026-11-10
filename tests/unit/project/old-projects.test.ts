import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { connect, solve, toNetlist } from '@lib/circuit';
import { boardData, kindTerminals, partKind, pointAt, sceneOf, terminalAt } from '@lib/editor';
import { checkBeforeRun } from '@lib/project/check';
import { readMlab, toCircuit } from '@lib/project';
import type { BoardId } from '@lib/boards';

/** N-09 (M11.5): a project saved by every released MicroLab opens in this one, all of it. The files were made and
 *  saved by each version's own code (`npm run old-projects`: a new project, every part it offered, wires, a value
 *  changed, a library file) and are never rewritten; a new version's are added when it is released. */
const DIR = 'tests/fixtures/projects/saved-by';
const versions = JSON.parse(readFileSync(join(DIR, 'versions.json'), 'utf8')) as string[];

describe('M11.5 N-09: a project saved by any earlier MicroLab opens', () => {
  it('there is one for every released version since M4 (v0.4.0), on every board', () => {
    expect(versions[0]).toBe('v0.4.0');
    expect(versions).toContain('v0.12.0');
  });

  for (const version of versions) {
    const made = JSON.parse(readFileSync(join(DIR, version, 'made.json'), 'utf8')) as { boards: Record<string, { parts: number; wires: number }> };
    for (const [board, counts] of Object.entries(made.boards)) {
      it(`${version}, ${board}: every part, leg, wire and file is there, drawn where it was, and its circuit runs`, () => {
        const doc = readMlab(readFileSync(join(DIR, version, `${board}.mlab`)));
        const { project } = doc;
        expect(project.board).toBe(board);
        expect(project.parts).toHaveLength(counts.parts);
        expect(project.wires).toHaveLength(counts.wires);
        expect(doc.files['main.py']).toEqual(expect.any(String));
        expect(doc.files['lib/helper.py']).toBe('# a library: 24 °C\n');

        // each part is one this MicroLab knows, with legs it has, each in a hole or on a pin that is drawn
        const scene = sceneOf(project);
        for (const part of project.parts) {
          const kind = partKind(part.type);
          const names = new Set([...Object.keys(kind.legs), ...Object.keys(kindTerminals(part.type, part.props))]);
          for (const [leg, at] of Object.entries(part.legs)) {
            expect(names.has(leg), `${part.id} (${part.type}) has no leg "${leg}"`).toBe(true);
            expect(pointAt(scene, at), `${part.id}.${leg} at ${at}`).toBeDefined();
          }
          if (kind.free) expect(project.view?.parts?.[part.id] ?? scene.view.parts?.[part.id], `${part.id} lies somewhere`).toBeDefined();
        }
        for (const wire of project.wires) {
          for (const end of [wire.a, wire.b]) {
            const [owner, leg] = [end.slice(0, end.indexOf('.')), end.slice(end.indexOf('.') + 1)];
            const part = project.parts.find((p) => p.id === owner);
            expect(pointAt(scene, end) ?? (part && terminalAt(scene, part, leg)), `${wire.id} ends at ${end}`).toBeDefined();
          }
        }

        // the circuit: joined, solved, and checked before a run — nothing throws
        const circuit = toCircuit(project, boardData(board as BoardId));
        expect(() => connect(circuit)).not.toThrow();
        expect(() => solve(toNetlist(circuit).netlist, {})).not.toThrow();
        expect(() => checkBeforeRun(project, boardData(board as BoardId), doc.files)).not.toThrow();
      });
    }
  }
});
