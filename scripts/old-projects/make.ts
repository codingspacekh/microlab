// N-09 (M11.5): a project saved by an older MicroLab — run INSIDE that version's own code (scripts/old-projects.mjs
// bundles this file against the tag's src/lib). For each board, a new project as that version made it, then every
// part that version offered, put where its own editor puts a part (freeSpot, or beside the breadboard), a few wires,
// a value changed, a library file — saved by its own writeMlab. Written only against what every version since M4
// exports; anything newer is looked for first.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as E from '../../src/lib/editor';
import * as P from '../../src/lib/project';

type Project = P.Project;
type Any = Record<string, unknown>;
const editor = E as unknown as Any;

const out = process.argv[2];
if (!out) throw new Error('usage: node make.mjs <folder>');
mkdirSync(out, { recursive: true });

const BOARDS = ['pico-w', 'microbit-v2', 'esp32-devkit-v1'] as const;
const summary: Record<string, { parts: number; wires: number; skipped: string[] }> = {};

for (const board of BOARDS) {
  const doc = P.newProject(board);
  let project: Project = doc.project;
  const files: Record<string, string | Uint8Array> = { ...doc.files, 'lib/helper.py': '# a library: 24 °C\n' };

  // a full breadboard: a new project since M6.8 has none; before that, a half one
  const addBreadboard = editor.addBreadboard as ((p: Project, size: string) => { project: Project }) | undefined;
  const setSize = editor.setBreadboardSize as ((p: Project, id: string, size: string) => Project) | undefined;
  if (project.breadboards.length === 0 && addBreadboard) project = addBreadboard(project, 'full').project;
  else if (project.breadboards[0] && project.breadboards[0].size !== 'full' && setSize) project = setSize(project, project.breadboards[0].id, 'full');

  const skipped: string[] = [];
  const isFree = editor.isFree as ((type: string) => boolean) | undefined;
  let beside = 0;
  for (const kind of E.PART_KINDS as unknown as { type: string; hidden?: boolean }[]) {
    if (kind.hidden) continue;
    if (isFree?.(kind.type)) {
      // a part that lies beside the breadboard (M7): in a row to the right, as the editor would lay it
      const add = E.addPart as unknown as (p: Project, t: string, legs: Record<string, string>, at?: { x: number; y: number }) => { project: Project };
      project = add(project, kind.type, {}, { x: 1400 + (beside % 4) * 260, y: Math.floor(beside / 4) * 260 }).project;
      beside++;
      continue;
    }
    let legs = E.freeSpot(E.sceneOf(project), kind.type);
    if (!legs && addBreadboard && project.breadboards.length < 4) {
      project = addBreadboard(project, 'full').project;
      legs = E.freeSpot(E.sceneOf(project), kind.type);
    }
    if (!legs) { skipped.push(kind.type); continue; }
    project = E.addPart(project, kind.type, legs).project;
  }

  // wires: board pins to free holes on the rails and in the columns (one with a bend), as a student wires them
  const scene = E.sceneOf(project);
  const used = E.usedPoints(project);
  const refs = E.allPoints(scene).map((p) => p.ref);
  const pins = refs.filter((r) => r.startsWith('board.') && !used.has(r));
  const free = refs.filter((r) => !r.startsWith('board.') && !used.has(r));
  const rails = free.filter((r) => /[+-]\d+$/.test(r));
  const holes = free.filter((r) => !/[+-]\d+$/.test(r));
  const ends = [rails[0], rails.at(-1), holes[0], holes.at(-1)];
  ends.forEach((end, i) => {
    if (!end || !pins[i * 3]) return;
    project = E.addWire(project, pins[i * 3]!, end, i === 0 ? [{ x: 40, y: 40 }] : []) ?? project;
  });
  const setColour = editor.setWireColour as ((p: Project, id: string, c: string) => Project) | undefined;
  if (setColour && project.wires[0]) project = setColour(project, project.wires[0].id, 'yellow');

  // a value changed in the inspector
  const setProp = editor.setPartProp as ((p: Project, id: string, k: string, v: number | string | boolean) => Project) | undefined;
  const resistor = project.parts.find((p) => p.type === 'resistor');
  if (setProp && resistor) project = setProp(project, resistor.id, 'ohms', 1000);

  project = { ...project, title: `Every part (${board})` };
  writeFileSync(join(out, `${board}.mlab`), P.writeMlab({ project, files }));
  summary[board] = { parts: project.parts.length, wires: project.wires.length, skipped };
}
console.log(JSON.stringify(summary));
