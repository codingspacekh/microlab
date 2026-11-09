#!/usr/bin/env node
// Packs every example (library/examples/<id>/<board>/: project.json and files/) as a .mlab the app opens, in a folder
// per board, named by its title: `npm run examples` → out/examples/Raspberry Pi Pico W/Motion alarm (PIR).mlab.
// A .mlab is that folder zipped (src/lib/project/format.ts). For trying the parts by hand (the milestone gates).
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { zipSync } from 'fflate';

const root = join(import.meta.dirname, '..');
const examples = join(root, 'library/examples');
const out = process.argv[2] ?? join(root, 'out/examples');

const tree = (dir, base = dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? tree(join(dir, e.name), base) : [relative(base, join(dir, e.name)).split(sep).join('/')]);

/** A file or folder name every computer takes: Windows refuses < > : " / \ | ? * ("BBC micro:bit V2"). */
const safeName = (s) => s.replace(/[<>:"/\\|?*]/g, '-');

let count = 0;
for (const id of readdirSync(examples).sort()) {
  for (const board of readdirSync(join(examples, id)).sort()) {
    const dir = join(examples, id, board);
    if (!existsSync(join(dir, 'project.json'))) continue;
    const project = readFileSync(join(dir, 'project.json'));
    const { title } = JSON.parse(project.toString('utf8'));
    const entries = { 'project.json': new Uint8Array(project) };
    for (const path of tree(join(dir, 'files'))) entries[`files/${path}`] = new Uint8Array(readFileSync(join(dir, 'files', path)));
    const boardName = JSON.parse(readFileSync(join(root, 'library/boards', board, 'board.json'), 'utf8')).name;
    mkdirSync(join(out, safeName(boardName)), { recursive: true });
    writeFileSync(join(out, safeName(boardName), `${safeName(title)}.mlab`), zipSync(entries));
    count++;
  }
}
console.log(`${count} examples packed in ${out}`);
