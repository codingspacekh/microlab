import { z } from 'zod';
import type { ProjectDoc } from '../project';

/**
 * The library pack (F-54, M6.7): drivers the parts need, shipped with the app so they work offline. Each library has
 * builds: on the Pico W and the ESP32 a driver people already use, as its authors wrote it (library/lib-pack/<id>/,
 * unchanged: pack.json keeps its sha256) with its licence beside it; on the micro:bit MicroLab's own, with the same
 * calls, its MIT notice in the file itself (the micro:bit has about 20 KB for files). *Add library* puts a build's
 * files in the project's lib/ (next to main.py on the micro:bit), and an upstream licence as lib/LICENSE-<id>.txt so
 * the notice travels with the code onto the board. Modules MicroPython already has on a board (dht, onewire,
 * ds18x20) are listed too, so a part can say there is nothing to add.
 */
const board = z.enum(['pico-w', 'esp32-devkit-v1', 'microbit-v2']);
const files = z.record(z.string(), z.string().regex(/^(lib\/)?[A-Za-z0-9_./-]+\.py$/));

const buildSchema = z.object({
  boards: z.array(board).min(1),
  licence: z.enum(['MIT', 'Apache-2.0', 'BSD-3-Clause']),
  authors: z.string(),
  /** Where it comes from, and the commit it was taken at; none for MicroLab's own. */
  source: z.string().url().optional(),
  commit: z.string().regex(/^[0-9a-f]{40}$/).optional(),
  /** Its licence file in the pack (copied to lib/LICENSE-<id>.txt); null when the notice is in the file itself. */
  licenceFile: z.string().nullable(),
  /** Pack file (in library/lib-pack/<id>/) → where it goes in the project; boardFiles add a board's own. */
  files,
  boardFiles: z.partialRecord(board, files).optional(),
  /** How to start with it, on each board (run as a test against the parts: tests/python/lib-pack.test.ts). */
  use: z.partialRecord(board, z.string()),
  /** Each upstream file's SHA-256, so it is known to be as its authors wrote it. */
  sha256: z.record(z.string(), z.string().regex(/^[0-9a-f]{64}$/)).optional(),
});

const librarySchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  title: z.string(),
  summary: z.string(),
  parts: z.array(z.string()).min(1),
  builds: z.array(buildSchema).min(1),
});

export const packSchema = z.object({
  libraries: z.array(librarySchema),
  builtIn: z.array(z.object({ modules: z.array(z.string()), parts: z.array(z.string()), boards: z.array(board), note: z.string() })),
});

export type Library = z.infer<typeof librarySchema>;
export type Build = z.infer<typeof buildSchema>;
export type LibPack = z.infer<typeof packSchema>;
export type PackBoard = z.infer<typeof board>;

export function parsePack(json: unknown): LibPack {
  return packSchema.parse(json);
}

/** The library's build for `board`, if it runs there. */
export const buildFor = (lib: Library, boardId: string): Build | undefined => lib.builds.find((b) => b.boards.includes(boardId as PackBoard));

/** The licence file's name in the project. */
export const licencePath = (lib: Library) => `lib/LICENSE-${lib.id}.txt`;

/** A library's files on `board`: [file in the pack (under library/lib-pack/), path in the project]; its licence last,
 *  when it has a file of its own. */
export function filesFor(lib: Library, boardId: string): [string, string][] {
  const b = buildFor(lib, boardId);
  if (!b) return [];
  const own = b.boardFiles?.[boardId as PackBoard] ?? {};
  const code = Object.entries({ ...b.files, ...own }).map(([from, to]) => [`${lib.id}/${from}`, to] as [string, string]);
  return b.licenceFile ? [...code, [`${lib.id}/${b.licenceFile}`, licencePath(lib)]] : code;
}

/** The code files only (no licence), as named in the project. */
export const codeFiles = (lib: Library, boardId: string) => filesFor(lib, boardId).map(([, to]) => to).filter((to) => !to.includes('LICENSE-'));

/** The libraries that run on `board`. */
export const librariesFor = (pack: LibPack, boardId: string) => pack.libraries.filter((l) => buildFor(l, boardId));

/** What a part needs on `board`: a library to add, MicroPython's own modules, or nothing. */
export function needsOf(pack: LibPack, partType: string, boardId: string):
  { kind: 'library'; library: Library } | { kind: 'built-in'; modules: string[]; note: string } | null {
  const library = librariesFor(pack, boardId).find((l) => l.parts.includes(partType));
  if (library) return { kind: 'library', library };
  const b = pack.builtIn.find((x) => x.parts.includes(partType) && x.boards.includes(boardId as PackBoard));
  return b ? { kind: 'built-in', modules: b.modules, note: b.note } : null;
}

/** Whether every file of the library is already in the project, as the pack has it. */
export function isAdded(doc: ProjectDoc, lib: Library, read: (packFile: string) => string): boolean {
  const f = filesFor(lib, doc.project.board);
  return f.length > 0 && f.every(([from, to]) => doc.files[to] === read(from));
}

/** The project's files a library would replace with something different (a file of the same name the student
 *  changed or wrote): Add library asks before it does. */
export function wouldReplace(doc: ProjectDoc, lib: Library, read: (packFile: string) => string): string[] {
  return filesFor(lib, doc.project.board).filter(([from, to]) => to in doc.files && doc.files[to] !== read(from)).map(([, to]) => to);
}

/** The project with the library's files (and its licence) added. */
export function addLibrary(doc: ProjectDoc, lib: Library, read: (packFile: string) => string): ProjectDoc {
  const added = Object.fromEntries(filesFor(lib, doc.project.board).map(([from, to]) => [to, read(from)]));
  return { ...doc, files: { ...doc.files, ...added } };
}
