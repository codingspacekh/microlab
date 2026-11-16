import { checkGlossary, checkPage, type CheckContext } from './check';
import { parseGlossary, parsePage, plainText, type GlossaryWord, type LearnPage } from './parse';

export { checkGlossary, checkPage, type CheckContext } from './check';
export { LEARN_NUMBERS, learnNumber } from './numbers';
export { inline, parseGlossary, parsePage, plainText, type Block, type GlossaryWord, type Inline, type LearnPage, type Section } from './parse';

/**
 * Learn (M8, screens 30–30e): the pages about the parts, for students of 10–13, written in library/learn. This is
 * what Learn has — its pages and its glossary — and what it will have: the first release's parts and ideas are
 * listed here (docs/acceptance/M8-draft.md), each one live as soon as its page is written.
 */
export interface Learn {
  pages: Record<string, LearnPage>;
  glossary: Record<string, GlossaryWord>;
  /** What is wrong with the files themselves; the checker (`checkLearn`) says the rest. */
  problems: string[];
}

export interface Listed { id: string; title: string; card: string }

/** The Basics, in the order of Learn's home (screen 30): a page's id is its part's type. */
export const BASICS: Listed[] = [
  { id: 'breadboard', title: 'Breadboard', card: 'Joins parts without solder: which holes are connected inside.' },
  { id: 'resistor', title: 'Resistor', card: 'Holds the current back. Its stripes tell you how much.' },
  { id: 'led', title: 'LED', card: 'A tiny light that lets current go one way only.' },
  { id: 'rgb-led', title: 'RGB LED', card: 'Red, green and blue in one: mix them into any colour.' },
  { id: 'button', title: 'Push button', card: 'Two metal contacts that touch while you press.' },
  { id: 'slide-switch', title: 'Slide switch', card: 'Stays where you slide it: this way, or that way.' },
  { id: 'potentiometer', title: 'Potentiometer', card: 'A knob that slides along a track: any voltage in between.' },
  { id: 'ldr', title: 'Light sensor (LDR)', card: 'Lets more current through the more light falls on it.' },
  { id: 'buzzer', title: 'Buzzer', card: 'A thin disc that shakes the air: that\'s the sound.' },
  { id: 'battery', title: 'Battery pack', card: 'Where the push comes from: volts, and how long it lasts.' },
];

/** The first release's sensors (M8 slice 8.4). */
export const SENSORS: Listed[] = [
  { id: 'hc-sr04', title: 'Ultrasonic HC-SR04', card: 'Sound takes time: it times an echo to tell how far.' },
  { id: 'dht', title: 'DHT11 / DHT22', card: 'Measures warmth and dampness, and sends them as numbers.' },
  { id: 'pir', title: 'PIR motion', card: 'Sees warmth that moves, not light.' },
  { id: 'temp-sensor', title: 'Temperature', card: 'A chip whose voltage follows the heat.' },
  { id: 'soil-moisture', title: 'Soil moisture', card: 'Tells damp soil from dry.' },
  { id: 'line-sensor', title: 'Line sensor (IR)', card: 'A light and an eye side by side.' },
];

/** The big ideas (F-45), each with its icon. */
export const IDEAS: (Listed & { icon: string })[] = [
  { id: 'voltage-current-resistance', title: 'Voltage, current, resistance', card: 'Push, flow and holding back — like water in pipes.', icon: 'bolt' },
  { id: 'circuit-loop', title: 'A circuit is a loop', card: 'Current only flows when the loop is closed.', icon: 'wire' },
  { id: 'inside-a-breadboard', title: 'Inside a breadboard', card: 'The metal strips under the holes.', icon: 'grid' },
  { id: 'series-and-parallel', title: 'Series and parallel', card: 'One after the other, or side by side.', icon: 'list' },
  { id: 'digital-and-analog', title: 'Digital and analog', card: 'Two levels, or any level in between.', icon: 'sliders' },
  { id: 'pwm', title: 'PWM', card: 'Blinking too fast to see: that is dimming.', icon: 'plot' },
];

/** A module that repeats a basic part has no page of its own: its part's page (the teacher, 2026-11-16: "only a link"). */
const SAME_AS: Record<string, string> = {
  'button-module': 'button',
  'pot-module': 'potentiometer',
  'ldr-module': 'ldr',
  'traffic-module': 'led',
  'rgb-module': 'rgb-led',
  'buzzer-module': 'buzzer',
};

/** library/learn's files (path → text) read into pages and the glossary. */
export function loadLearn(files: Record<string, string>): Learn {
  const learn: Learn = { pages: {}, glossary: {}, problems: [] };
  for (const path of Object.keys(files).sort()) {
    if (!path.endsWith('.md')) continue;
    const name = path.split('/').pop()!;
    if (name === 'glossary.md') {
      const { words, problems } = parseGlossary(files[path]!);
      learn.glossary = { ...learn.glossary, ...words };
      learn.problems.push(...problems.map((p) => `${name}: ${p}`));
      continue;
    }
    const page = parsePage(files[path]!);
    if (page.id !== name.slice(0, -3)) learn.problems.push(`${name}: its id is “${page.id}”, not its file's name`);
    else if (learn.pages[page.id]) learn.problems.push(`${name}: a second page “${page.id}”`);
    else learn.pages[page.id] = page;
  }
  return learn;
}

/** Everything the checker says about Learn, each line with its page; none when all is well. */
export function checkLearn(learn: Learn, ctx: Pick<CheckContext, 'parts' | 'figures'>): string[] {
  const whole: CheckContext = { ...ctx, pages: Object.keys(learn.pages), glossary: learn.glossary };
  return [
    ...learn.problems,
    ...Object.values(learn.pages).flatMap((page) => checkPage(page, whole).map((p) => `${page.id}: ${p}`)),
    ...checkGlossary(learn.glossary),
  ];
}

/** The page a part's *Learn about this* opens, if it is written: its own, or the basic part's it repeats. */
export function learnPageFor(learn: Learn, partType: string): LearnPage | undefined {
  return learn.pages[SAME_AS[partType] ?? partType];
}

/** Lower case, accents and signs dropped: "LED" and "led", "µ" and "u". */
const fold = (text: string) => text.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** The pages and glossary words that have every word of `query`: a page by its title first, then by its text. */
export function searchLearn(learn: Learn, query: string): { pages: LearnPage[]; words: GlossaryWord[] } {
  const wanted = fold(query).split(/\s+/).filter(Boolean);
  if (!wanted.length) return { pages: [], words: [] };
  const has = (text: string) => { const t = fold(text); return wanted.every((w) => t.includes(w)); };
  const pages = Object.values(learn.pages);
  const byTitle = pages.filter((p) => has(`${p.title} ${p.tag}`));
  const byText = pages.filter((p) => !byTitle.includes(p) && has(`${p.card} ${p.uses.join(' ')} ${plainText(p.lede)} ${p.text}`));
  const words = Object.values(learn.glossary).filter((w) => has(w.word) || has(w.text)).sort((a, b) => Number(has(b.word)) - Number(has(a.word)));
  return { pages: [...byTitle, ...byText], words };
}
