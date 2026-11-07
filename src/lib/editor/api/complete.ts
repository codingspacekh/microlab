import { apiFor, type ApiItem, type ApiKind } from './model';

/**
 * What to offer where the cursor is (F-20): the board's modules after `import` / `from`, a module's names after
 * `from m import`, the members of whatever is before a dot — a module, its alias, a class, an object (display), or a
 * variable made from a class (led = Pin(…)) — and the names the code has imported. Python's own words come from
 * CodeMirror's Python mode. Pure: the code and the cursor in, the suggestions out.
 */
export interface Suggestion {
  label: string;
  kind: ApiKind;
  /** Short, beside the name: a call's first arguments. */
  detail?: string;
  /** The full signature (if any) on the first line, then the explanation. */
  info: string;
}

/** What each name in the code stands for: a module, a module's member, or an instance of a class. */
type Binding = { item: ApiItem; instance?: boolean };

function scopeOf(board: string, code: string): Map<string, Binding> {
  const api = apiFor(board);
  const scope = new Map<string, Binding>();
  for (const line of code.split('\n')) {
    let m = /^\s*import\s+(.+)$/.exec(line);
    if (m) {
      for (const part of m[1]!.split(',')) {
        const [mod, alias] = part.trim().split(/\s+as\s+/);
        const item = mod ? api.get(mod) : undefined;
        if (item) scope.set(alias ?? mod!, { item });
      }
      continue;
    }
    m = /^\s*from\s+(\w+)\s+import\s+(.+)$/.exec(line);
    if (m) {
      const mod = api.get(m[1]!);
      if (!mod) continue;
      const names = m[2]!.replace(/[()]/g, '').split(',').map((s) => s.trim()).filter(Boolean);
      for (const n of names) {
        if (n === '*') {
          for (const [k, v] of mod.members) if (!v.hidden) scope.set(k, { item: v });
          continue;
        }
        const [name, alias] = n.split(/\s+as\s+/);
        const item = name ? mod.members.get(name) : undefined;
        if (item) scope.set(alias ?? name!, { item });
      }
      continue;
    }
    // led = Pin(15, Pin.OUT) · led = machine.Pin(…) · d = display
    m = /^\s*([A-Za-z_]\w*)\s*=\s*([A-Za-z_][\w.]*)\s*(\()?/.exec(line);
    if (m) {
      const target = resolve(scope, m[2]!);
      if (target && m[3] && target.item.kind === 'class') scope.set(m[1]!, { item: target.item, instance: true });
      else if (target && !m[3] && (target.item.kind === 'object' || target.item.kind === 'module')) scope.set(m[1]!, target);
    }
  }
  return scope;
}

function resolve(scope: Map<string, Binding>, chain: string): Binding | undefined {
  const [first, ...rest] = chain.split('.');
  let b = scope.get(first!);
  for (const p of rest) {
    const next = b?.item.members.get(p);
    if (!next) return undefined;
    b = { item: next };
  }
  return b;
}

/** '(id, mode=-1, pull=-1, …)': the first three arguments. */
function shortSig(sig: string): string {
  const params = splitParams(sig);
  return `(${params.slice(0, 3).join(', ')}${params.length > 3 ? ', …' : ''})`;
}

function suggestion(item: ApiItem, label = item.name): Suggestion {
  const call = item.sig !== undefined;
  return {
    label,
    kind: item.kind,
    ...(call ? { detail: shortSig(item.sig!) } : {}),
    info: call ? `${item.name}(${item.sig})\n${item.doc}` : item.doc,
  };
}

const offer = (items: Iterable<ApiItem>, prefix: string) =>
  [...items].filter((i) => !i.hidden && i.name.startsWith(prefix)).map((i) => suggestion(i));

export function completeAt(board: string, code: string, pos: number): { from: number; options: Suggestion[] } | null {
  const lineStart = code.lastIndexOf('\n', pos - 1) + 1;
  const before = code.slice(lineStart, pos);
  const api = apiFor(board);
  const result = (word: string, options: Suggestion[]) => (options.length ? { from: pos - word.length, options } : null);

  let m = /^\s*(?:import\s+(?:[\w.]+\s*,\s*)*|from\s+)(\w*)$/.exec(before);
  if (m) return result(m[1]!, offer(api.values(), m[1]!));
  m = /^\s*from\s+(\w+)\s+import\s+(?:\(?\s*)?(?:[\w ]+,\s*)*(\w*)$/.exec(before);
  if (m) {
    const mod = api.get(m[1]!);
    return mod ? result(m[2]!, offer(mod.members.values(), m[2]!)) : null;
  }
  const scope = scopeOf(board, code.slice(0, lineStart) + '\n' + before.replace(/[\w.]*$/, ''));
  m = /(?:^|[^\w.])([A-Za-z_][\w.]*)\.(\w*)$/.exec(before);
  if (m) {
    const target = resolve(scope, m[1]!);
    if (!target) return null;
    const members = [...target.item.members.values()].filter((i) => !(target.instance && i.kind === 'class'));
    return result(m[2]!, offer(members, m[2]!));
  }
  m = /(?:^|[^\w.])([A-Za-z_]\w*)$/.exec(before);
  if (m) {
    const word = m[1]!;
    const options = [...scope.entries()]
      .filter(([name]) => name.startsWith(word) && name !== word)
      .map(([name, b]) => suggestion(b.item, name));
    return result(word, options);
  }
  return null;
}

/** A signature's arguments: 'id, mode=-1, *, value=None' → ['id', 'mode=-1', '*', 'value=None']. */
function splitParams(sig: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of sig) {
    if ('([{'.includes(ch)) depth++;
    if (')]}'.includes(ch)) depth--;
    if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** The call the cursor is in: its name, arguments, which one is being typed, and what it does. */
export function signatureAt(board: string, code: string, pos: number): { label: string; params: string[]; active: number; doc: string } | null {
  // back from the cursor to the bracket that is still open, skipping strings and closed brackets
  let depth = 0;
  let commas = 0;
  let quote: string | null = null;
  let open = -1;
  const from = Math.max(0, pos - 2000);
  // strings first, forwards, so quotes are paired properly
  const inString: boolean[] = [];
  for (let i = from; i < pos; i++) {
    const ch = code[i]!;
    if (quote) { inString[i - from] = true; if (ch === '\\') { inString[i - from + 1] = true; i++; } else if (ch === quote) quote = null; continue; }
    if (ch === '"' || ch === "'") { quote = ch; inString[i - from] = true; continue; }
    if (ch === '#') { while (i < pos && code[i] !== '\n') inString[i++ - from] = true; }
  }
  for (let i = pos - 1; i >= from; i--) {
    if (inString[i - from]) continue;
    const ch = code[i]!;
    if (ch === ')' || ch === ']' || ch === '}') depth++;
    else if (ch === '[' || ch === '{') { if (depth === 0) return null; depth--; }
    else if (ch === '(') {
      if (depth === 0) { open = i; break; }
      depth--;
    } else if (ch === ',' && depth === 0) commas++;
  }
  if (open < 0) return null;
  const callee = /([A-Za-z_][\w.]*)\s*$/.exec(code.slice(Math.max(0, open - 200), open))?.[1];
  if (!callee) return null;
  const lineStart = code.lastIndexOf('\n', open) + 1;
  const scope = scopeOf(board, code.slice(0, lineStart));
  const b = resolve(scope, callee);
  if (!b || b.item.sig === undefined) return null;
  return { label: b.item.name, params: splitParams(b.item.sig), active: commas, doc: b.item.doc };
}
