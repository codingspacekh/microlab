import { z } from 'zod';
import type { ProjectDoc } from '../project';

/**
 * The library pack (F-54, M6.7): drivers the parts need, shipped with the app so they work offline — each file as its
 * authors wrote it (library/lib-pack/<id>/, unchanged: pack.json keeps its sha256) with its licence beside it. *Add
 * library* puts a library's files in the project's lib/, and its licence as lib/LICENSE-<id>.txt, so the notice
 * travels with the code onto the board. Modules MicroPython already has on a board (dht, onewire, ds18x20) are
 * listed too, so a part can say there is nothing to add.
 */
const board = z.enum(['pico-w', 'esp32-devkit-v1', 'microbit-v2']);
const files = z.record(z.string(), z.string().regex(/^lib\/[A-Za-z0-9_./-]+\.py$/));

const librarySchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  title: z.string(),
  summary: z.string(),
  parts: z.array(z.string()).min(1),
  boards: z.array(board).min(1),
  licence: z.enum(['MIT', 'Apache-2.0', 'BSD-3-Clause']),
  authors: z.string(),
  source: z.string().url(),
  commit: z.string().regex(/^[0-9a-f]{40}$/),
  /** Pack file (in library/lib-pack/<id>/) → where it goes in the project; boardFiles add a board's own. */
  files,
  boardFiles: z.partialRecord(board, files).optional(),
  /** How to start with it, on each board (run as a test against the parts: tests/python/lib-pack.test.ts). */
  use: z.partialRecord(board, z.string()),
  sha256: z.record(z.string(), z.string().regex(/^[0-9a-f]{64}$/)),
});

export const packSchema = z.object({
  libraries: z.array(librarySchema),
  builtIn: z.array(z.object({ modules: z.array(z.string()), parts: z.array(z.string()), boards: z.array(board), note: z.string() })),
});

export type Library = z.infer<typeof librarySchema>;
export type LibPack = z.infer<typeof packSchema>;
export type PackBoard = z.infer<typeof board>;

export function parsePack(json: unknown): LibPack {
  return packSchema.parse(json);
}

/** The licence file's name in the project. */
export const licencePath = (lib: Library) => `lib/LICENSE-${lib.id}.txt`;

/** A library's files on `board`: [file in the pack (under library/lib-pack/), path in the project]; its licence last. */
export function filesFor(lib: Library, boardId: string): [string, string][] {
  const own = lib.boardFiles?.[boardId as PackBoard] ?? {};
  return [...Object.entries({ ...lib.files, ...own }).map(([from, to]) => [`${lib.id}/${from}`, to] as [string, string]),
    [`${lib.id}/LICENSE`, licencePath(lib)]];
}

/** The libraries that run on `board`. */
export const librariesFor = (pack: LibPack, boardId: string) => pack.libraries.filter((l) => l.boards.includes(boardId as PackBoard));

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
  return filesFor(lib, doc.project.board).every(([from, to]) => doc.files[to] === read(from));
}

/** The project's files a library would replace with something different (a file of the same name the student
 *  changed or wrote): Add library asks before it does. */
export function wouldReplace(doc: ProjectDoc, lib: Library, read: (packFile: string) => string): string[] {
  return filesFor(lib, doc.project.board).filter(([from, to]) => to in doc.files && doc.files[to] !== read(from)).map(([, to]) => to);
}

/** The project with the library's files (and its licence) in lib/. */
export function addLibrary(doc: ProjectDoc, lib: Library, read: (packFile: string) => string): ProjectDoc {
  const added = Object.fromEntries(filesFor(lib, doc.project.board).map(([from, to]) => [to, read(from)]));
  return { ...doc, files: { ...doc.files, ...added } };
}
