import { IMPORT_NAME, MODULES, type ApiBoard } from './catalogue';

/** The catalogue as a tree per board: module → class / function / object → method / constant (F-20). */
export type ApiKind = 'module' | 'class' | 'function' | 'method' | 'constant' | 'object' | 'value';

export interface ApiItem {
  name: string;
  kind: ApiKind;
  /** What goes in the brackets, without them: 'id, mode=-1, pull=-1, *, value=None'. */
  sig?: string;
  doc: string;
  /** A class used only for objects (display's): not offered itself. */
  hidden?: boolean;
  /** An object's class, in the same module. */
  type?: string;
  members: Map<string, ApiItem>;
}

const LINE = /^((?:@\w+\s+)*)(~)?([\w.]+)(?:\((.*?)\))?(?::\s*(\w+))?(?:\s*<\s*(\w+))?\s+—\s+(.*)$/;

export function boardApi(boardId: string): ApiBoard {
  if (boardId.startsWith('esp32')) return 'esp32';
  if (boardId.startsWith('microbit')) return 'microbit';
  return 'pico';
}

/** One module's catalogue text for one board; a line it can't read is an error (a typo never goes unseen). */
export function parseModule(name: string, doc: string, text: string, board: ApiBoard): ApiItem {
  const mod: ApiItem = { name, kind: 'module', doc, members: new Map() };
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const m = LINE.exec(line);
    if (!m) throw new Error(`catalogue ${name}: can't read "${line}"`);
    const [, tags, hidden, path, sig, type, base, itemDoc] = m;
    const only = (tags ?? '').split(/\s+/).filter(Boolean).map((t) => t.slice(1));
    if (only.length && !only.includes(board)) continue;
    const parts = path!.split('.');
    const leaf = parts.pop()!;
    let parent = mod;
    for (const p of parts) {
      const next = parent.members.get(p);
      if (!next) throw new Error(`catalogue ${name}: ${path} comes before ${p}`);
      parent = next;
    }
    const kind: ApiKind = type ? 'object'
      : sig !== undefined ? (parent.kind === 'class' ? 'method' : /^[A-Z]/.test(leaf) ? 'class' : 'function')
      : hidden ? 'class'
      : /^[A-Z][A-Z0-9_]*$/.test(leaf) ? 'constant' : 'value';
    parent.members.set(leaf, {
      name: leaf, kind, doc: itemDoc!, members: new Map(base ? parent.members.get(base)?.members ?? [] : []),
      ...(sig !== undefined ? { sig } : {}), ...(hidden ? { hidden: true } : {}), ...(type ? { type } : {}),
    });
  }
  // an object's members are its class's
  for (const item of mod.members.values()) {
    if (item.type) item.members = mod.members.get(item.type)?.members ?? new Map();
  }
  return mod;
}

const cache = new Map<ApiBoard, Map<string, ApiItem>>();

/** The modules a board has, by the name they are imported as. */
export function apiFor(boardId: string): Map<string, ApiItem> {
  const board = boardApi(boardId);
  let api = cache.get(board);
  if (!api) {
    api = new Map();
    for (const [key, m] of Object.entries(MODULES)) {
      if (!m.boards.includes(board)) continue;
      const name = IMPORT_NAME[key] ?? key;
      api.set(name, parseModule(name, m.doc, m.text, board));
    }
    api = new Map([...api.entries()].sort(([a], [b]) => a.localeCompare(b)));
    cache.set(board, api);
  }
  return api;
}
