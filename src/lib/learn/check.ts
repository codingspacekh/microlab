import type { Block, GlossaryWord, Inline, LearnPage } from './parse';

/**
 * The Learn checker (M8's first test): a page is about the part itself, for students of 10–13 — it has every
 * section of F-40 in the agreed order (screens 30b, 30c), a picture to play with, its numbers in a table and its
 * mistakes; no code and no board's name; and every underlined word is in the glossary, every link goes to a page.
 */
export interface CheckContext {
  /** Every page's id. */
  pages: string[];
  glossary: Record<string, GlossaryWord>;
  /** The parts a part page can be about: the parts panel's types, and 'breadboard'. */
  parts: string[];
  /** The app's pictures by name; left out, a figure's name is not checked. */
  figures?: string[];
}

/** A part page's sections, in order; the fourth is "Connect it" or "Its legs and how to connect it". */
const PART_SECTIONS: { name: string; fits: (title: string) => boolean }[] = [
  { name: 'Look inside', fits: (t) => t === 'Look inside' },
  { name: 'The idea', fits: (t) => t === 'The idea' },
  { name: 'Its numbers', fits: (t) => t === 'Its numbers' },
  { name: 'Connect it', fits: (t) => /connect/i.test(t) },
  { name: 'Mistakes', fits: (t) => t === 'Mistakes' },
];

/** A board by its name: Learn's part pages are about no particular board. */
const BOARD_NAME = /\b(pico|micro:?bit|esp32|esp8266|raspberry|arduino|rp2040|GP\d+|GPIO\d+)\b/i;

function walk(kids: Inline[], see: (k: Inline) => void): void {
  for (const k of kids) {
    see(k);
    if (k.t === 'b' || k.t === 'i' || k.t === 'link') walk(k.kids, see);
  }
}

function inlines(block: Block): Inline[][] {
  switch (block.t) {
    case 'p': return [block.kids];
    case 'table': return block.rows.flat();
    case 'mistakes': return block.items.map((m) => m.kids);
    default: return [];
  }
}

export function checkPage(page: LearnPage, ctx: CheckContext): string[] {
  const said = [...page.problems];
  const blocks = page.sections.flatMap((s) => s.blocks);

  for (const name of ['id', 'title', 'tag', 'card'] as const) if (!page[name]) said.push(`it has no ${name}`);
  if (!/^[a-z0-9-]*$/.test(page.id)) said.push(`its id “${page.id}” is not small letters, digits and -`);
  if (!page.lede.length) said.push('it does not say what it is, before the first section');

  if (page.kind === 'part') {
    if (!page.part) said.push('it does not name its part');
    else if (!ctx.parts.includes(page.part)) said.push(`“${page.part}” is not a part of the parts panel`);
    if (!page.uses.length) said.push('it does not say where you meet it (uses)');
    const titles = page.sections.map((s) => s.title);
    const order = PART_SECTIONS.map((want) => titles.findIndex(want.fits));
    PART_SECTIONS.forEach((want, i) => { if (order[i]! < 0) said.push(`it has no “${want.name}” section`); });
    if (order.every((at) => at >= 0) && (titles.length !== PART_SECTIONS.length || order.some((at, i) => at !== i))) {
      said.push(`its sections are not ${PART_SECTIONS.map((s) => s.name).join(' · ')}, in that order`);
    }
    const has = (i: number, t: Block['t']) => page.sections[order[i]!]?.blocks.some((b) => b.t === t);
    if (order[0]! >= 0 && !has(0, 'figure')) said.push('“Look inside” has no picture to play with');
    if (order[2]! >= 0 && !has(2, 'table')) said.push('“Its numbers” has no table');
    if (order[4]! >= 0 && !has(4, 'mistakes')) said.push('“Mistakes” lists none');
    if (page.left > page.sections.length) said.push('more sections are put on the left than it has');
  }

  // an ideas page (F-45) has its own shape: something to play with, and the idea said
  if (page.kind === 'idea') {
    if (!blocks.some((b) => b.t === 'figure')) said.push('it has no picture to play with');
    if (!page.sections.some((s) => s.title === 'The rule')) said.push('it has no “The rule” section');
    if (page.left > page.sections.length) said.push('more sections are put on the left than it has');
  }

  if (page.kind !== 'board') {
    const board = BOARD_NAME.exec(page.text);
    if (board) said.push(`it names a board (“${board[0]}”): ${page.kind === 'part' ? 'a part\'s page' : 'an ideas page'} is about no particular board`);
  }

  if (blocks.some((b) => b.t === 'code') || page.text.includes('`')) said.push('it has code: Learn has none');

  if (ctx.figures) {
    for (const b of blocks) if (b.t === 'figure' && !ctx.figures.includes(b.name)) said.push(`the app has no picture “${b.name}”`);
  }

  const see = (k: Inline) => {
    if (k.t === 'word' && !ctx.glossary[k.word]) said.push(`“${k.word}” is not in the glossary`);
    if (k.t === 'link' && !ctx.pages.includes(k.page)) said.push(`it links to “${k.page}”, which is not a page`);
  };
  walk(page.lede, see);
  for (const b of blocks) for (const kids of inlines(b)) walk(kids, see);
  for (const b of blocks) if (b.t === 'words') for (const w of b.words) if (!ctx.glossary[w]) said.push(`“${w}” is not in the glossary`);

  return [...new Set(said)];
}

/** The glossary's own words: what an entry underlines must be an entry too. */
export function checkGlossary(glossary: Record<string, GlossaryWord>): string[] {
  const said: string[] = [];
  for (const entry of Object.values(glossary)) {
    walk(entry.kids, (k) => {
      if (k.t === 'word' && !glossary[k.word]) said.push(`the glossary's “${entry.word}” underlines “${k.word}”, which it does not have`);
    });
    if (entry.text.includes('`')) said.push(`the glossary's “${entry.word}” has code`);
  }
  return said;
}
