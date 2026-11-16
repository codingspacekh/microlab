import { learnNumber } from './numbers';

/**
 * A Learn page as it is written (M8, F-40; library/learn/**.md): a few lines about the page between two `---`
 * lines, what the part is, then its sections under `## ` headings. Inside a section:
 *
 *   plain lines            a paragraph; `**bold**`, `*italic*`
 *   [current]              a glossary word, underlined — `[flows = current]` shows "flows" and opens "current"
 *   [words](page)          a link to another Learn page
 *   {led.max}              a number from the simulator's model (numbers.ts)
 *   figure: led-inside     one of the app's pictures to play with
 *   | a | b | c |          a row of the numbers' table
 *   = 9 V battery: 470 Ω   a box of worked values, side by side
 *   - **Title** what …     a mistake; `- ! **Title** …` one that breaks something
 *   > a quieter line       a small note
 *
 * No code: a page with a code fence or a backtick is refused by the checker.
 */
export type Inline =
  | { t: 'text'; text: string }
  | { t: 'b'; kids: Inline[] }
  | { t: 'i'; kids: Inline[] }
  /** A glossary word: `word` is its entry, `text` what the page shows. */
  | { t: 'word'; word: string; text: string }
  | { t: 'link'; page: string; kids: Inline[] };

export type Block =
  | { t: 'p'; kids: Inline[]; small?: boolean }
  | { t: 'figure'; name: string }
  | { t: 'table'; rows: Inline[][][] }
  | { t: 'calc'; cells: { label: string; value: string }[] }
  | { t: 'mistakes'; items: { bad: boolean; title: string; kids: Inline[] }[] }
  | { t: 'code' };

export interface Section { title: string; blocks: Block[] }

export interface LearnPage {
  id: string;
  kind: 'part' | 'idea' | 'board';
  /** A part page's part: its type in the parts panel, or 'breadboard'. */
  part?: string;
  title: string;
  /** "Basics · light", over the title. */
  tag: string;
  /** Its line on Learn's home. */
  card: string;
  /** Where you meet it: a few words each. */
  uses: string[];
  /** How many sections stand in the left column, under the heading (screens 30b, 30c). */
  left: number;
  /** What it is: the heading's sentences. */
  lede: Inline[];
  sections: Section[];
  /** What the parser could not read: an unknown number, a line of the heading it does not know. */
  problems: string[];
  /** The page's words as written, without its heading lines: for the search and the checker. */
  text: string;
}

export interface GlossaryWord { word: string; kids: Inline[]; text: string }

// ------------------------------------------------------------------ a line's words
/** `{led.max}` → "30"; an unknown one is left as written and reported. */
function numbers(text: string, problems: string[]): string {
  return text.replace(/\{([^{}]+)\}/g, (all, token: string) => {
    const value = learnNumber(token.trim());
    if (value === undefined) problems.push(`{${token}} is not a number of the simulator`);
    return value ?? all;
  });
}

/** The closing mark of an opening one at `from`, or −1. */
const closing = (text: string, mark: string, from: number) => text.indexOf(mark, from);

export function inline(text: string): Inline[] {
  const out: Inline[] = [];
  let plain = '';
  const flush = () => {
    if (plain) out.push({ t: 'text', text: plain });
    plain = '';
  };
  let i = 0;
  while (i < text.length) {
    if (text.startsWith('**', i)) {
      const end = closing(text, '**', i + 2);
      if (end > i + 2) {
        flush();
        out.push({ t: 'b', kids: inline(text.slice(i + 2, end)) });
        i = end + 2;
      } else {
        plain += '**';
        i += 2;
      }
      continue;
    }
    if (text[i] === '*') {
      // *italic* hugs its words: "2 * 3" is a sum
      const end = closing(text, '*', i + 1);
      if (end > i + 1 && text[i + 1] !== ' ' && text[end - 1] !== ' ' && text[end + 1] !== '*') {
        flush();
        out.push({ t: 'i', kids: inline(text.slice(i + 1, end)) });
        i = end + 1;
        continue;
      }
    } else if (text[i] === '[') {
      const end = closing(text, ']', i + 1);
      if (end > i + 1) {
        const inside = text.slice(i + 1, end);
        const stop = text[end + 1] === '(' ? closing(text, ')', end + 2) : -1;
        flush();
        if (stop > 0) {
          out.push({ t: 'link', page: text.slice(end + 2, stop).trim(), kids: inline(inside) });
          i = stop + 1;
        } else {
          const is = inside.indexOf('=');
          const shown = is < 0 ? inside : inside.slice(0, is);
          out.push({ t: 'word', word: (is < 0 ? inside : inside.slice(is + 1)).trim().toLowerCase(), text: shown.trim() });
          i = end + 1;
        }
        continue;
      }
    }
    plain += text[i];
    i += 1;
  }
  flush();
  return out;
}

/** The words alone, as a reader sees them. */
export function plainText(kids: Inline[]): string {
  return kids.map((k) => (k.t === 'text' || k.t === 'word' ? k.text : plainText(k.kids))).join('');
}

// ------------------------------------------------------------------ a section's blocks
const MISTAKE = /^-\s+(!\s+)?\*\*(.+?)\*\*\s*(.*)$/;

function blocks(lines: string[]): Block[] {
  const out: Block[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) out.push({ t: 'p', kids: inline(para.join(' ')) });
    para = [];
  };
  const last = <T extends Block['t']>(t: T) => {
    const b = out[out.length - 1];
    return b?.t === t ? (b as Extract<Block, { t: T }>) : undefined;
  };
  let fenced = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (line.startsWith('```')) {
      flush();
      if (!fenced) out.push({ t: 'code' });
      fenced = !fenced;
      continue;
    }
    if (fenced) continue;
    if (!line) { flush(); continue; }
    const figure = /^figure:\s*(\S+)$/.exec(line);
    const mistake = MISTAKE.exec(line);
    if (figure) {
      flush();
      out.push({ t: 'figure', name: figure[1]! });
    } else if (line.startsWith('|') && line.endsWith('|') && line.length > 1) {
      flush();
      const row = line.slice(1, -1).split('|').map((cell) => inline(cell.trim()));
      const table = last('table');
      if (table) table.rows.push(row); else out.push({ t: 'table', rows: [row] });
    } else if (line.startsWith('= ') && line.includes(':')) {
      flush();
      const at = line.lastIndexOf(':');
      const cell = { label: line.slice(2, at).trim(), value: line.slice(at + 1).trim() };
      const calc = last('calc');
      if (calc) calc.cells.push(cell); else out.push({ t: 'calc', cells: [cell] });
    } else if (mistake) {
      flush();
      const item = { bad: !!mistake[1], title: mistake[2]!, kids: inline(mistake[3]!) };
      const list = last('mistakes');
      if (list) list.items.push(item); else out.push({ t: 'mistakes', items: [item] });
    } else if (line.startsWith('> ')) {
      flush();
      out.push({ t: 'p', kids: inline(line.slice(2)), small: true });
    } else para.push(line);
  }
  flush();
  return out;
}

// ------------------------------------------------------------------ a page
const KINDS = ['part', 'idea', 'board'] as const;

/** The lines between the two `---`, and the rest. */
function split(source: string): { head: Record<string, string>; body: string; unknown: string[] } {
  const text = source.replace(/\r\n/g, '\n');
  const head: Record<string, string> = {};
  const unknown: string[] = [];
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(text);
  if (!m) return { head, body: text, unknown: ['the page does not start with its heading lines between two --- lines'] };
  for (const line of m[1]!.split('\n')) {
    const at = line.indexOf(':');
    if (!line.trim()) continue;
    if (at < 1) unknown.push(`heading line “${line}” is not “name: value”`);
    else head[line.slice(0, at).trim()] = line.slice(at + 1).trim();
  }
  return { head, body: text.slice(m[0].length), unknown };
}

const HEAD = ['id', 'kind', 'part', 'title', 'tag', 'card', 'uses', 'left'];

export function parsePage(source: string): LearnPage {
  const { head, body: written, unknown } = split(source);
  const problems = [...unknown];
  for (const name of Object.keys(head)) if (!HEAD.includes(name)) problems.push(`heading line “${name}” is not one a page has`);
  const body = numbers(written, problems);
  const parts: { title: string; lines: string[] }[] = [];
  const first: string[] = [];
  let lines = first;
  for (const line of body.split('\n')) {
    const title = /^##\s+(.+)$/.exec(line);
    if (title) {
      lines = [];
      parts.push({ title: title[1]!.trim(), lines });
    } else lines.push(line);
  }
  const sections: Section[] = parts.map((s) => ({ title: s.title, blocks: blocks(s.lines) }));
  const kind = (KINDS as readonly string[]).includes(head.kind ?? '') ? (head.kind as LearnPage['kind']) : 'part';
  if (head.kind && kind !== head.kind) problems.push(`kind “${head.kind}” is not part, idea or board`);
  const left = Number(head.left ?? 1);
  return {
    id: head.id ?? '',
    kind,
    ...(head.part ? { part: head.part } : {}),
    title: head.title ?? '',
    tag: head.tag ?? '',
    card: head.card ?? '',
    uses: (head.uses ?? '').split('|').map((u) => u.trim()).filter(Boolean),
    left: Number.isInteger(left) && left >= 0 ? left : 1,
    lede: inline(first.map((l) => l.trim()).filter(Boolean).join(' ')),
    sections,
    problems,
    text: body,
  };
}

/** The glossary (library/learn/glossary.md): each word under its own `## ` heading, one or two lines. */
export function parseGlossary(source: string): { words: Record<string, GlossaryWord>; problems: string[] } {
  const problems: string[] = [];
  const words: Record<string, GlossaryWord> = {};
  let word = '';
  let lines: string[] = [];
  const keep = () => {
    if (!word) return;
    const text = lines.map((l) => l.trim()).filter(Boolean).join(' ');
    if (words[word.toLowerCase()]) problems.push(`the glossary has “${word}” twice`);
    if (!text) problems.push(`the glossary's “${word}” says nothing`);
    words[word.toLowerCase()] = { word, kids: inline(text), text };
  };
  for (const line of numbers(source.replace(/\r\n/g, '\n'), problems).split('\n')) {
    const title = /^##\s+(.+)$/.exec(line);
    if (title) {
      keep();
      word = title[1]!.trim();
      lines = [];
    } else if (word) lines.push(line);
  }
  keep();
  return { words, problems };
}
