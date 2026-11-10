import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/** M11.6: every text colour of the design system can be read on the backgrounds it is used on — WCAG AA, 4.5 : 1 —
 *  in the light theme, the dark one and High contrast (the code side and the Python 3 screen, Rev 12). Read from the
 *  app's own CSS; a see-through background (rgba) is laid over the surface under it. */
const APP = readFileSync('src/renderer/app/app.css', 'utf8');
const PY = readFileSync('src/renderer/python3/python3.css', 'utf8');
const EDITOR = readFileSync('src/renderer/editor/editor.css', 'utf8');
const AA = 4.5;

type Rgba = [number, number, number, number];
function block(css: string, selector: string): string {
  const at = css.indexOf(selector);
  if (at < 0) throw new Error(`no ${selector}`);
  return css.slice(css.indexOf('{', at) + 1, css.indexOf('}', at));
}
function tokens(body: string): Record<string, string> {
  return Object.fromEntries([...body.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{3,8}|rgba?\([^)]*\))/g)].map((m) => [m[1]!, m[2]!]));
}
function parse(c: string): Rgba {
  if (c.startsWith('#')) {
    let h = c.slice(1);
    if (h.length === 3) h = [...h].map((x) => x + x).join('');
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), 1];
  }
  const [r, g, b, a = 1] = c.replace(/rgba?\(|\)/g, '').split(',').map(Number);
  return [r!, g!, b!, a];
}
const over = (top: Rgba, under: Rgba): Rgba => [0, 1, 2].map((i) => top[i]! * top[3] + under[i]! * (1 - top[3])).concat(1) as Rgba;
const lum = ([r, g, b]: Rgba) => [r, g, b].map((v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; })
  .reduce((s, c, i) => s + c * [0.2126, 0.7152, 0.0722][i]!, 0);
function ratio(fg: Rgba, bg: Rgba): number {
  const [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x);
  return (a! + 0.05) / (b! + 0.05);
}

const light = tokens(block(APP, ':root'));
const THEMES: Record<string, Record<string, string>> = {
  light,
  dark: { ...light, ...tokens(block(PY, '.pyscreen[data-theme="dark"]')) },
  contrast: { ...light, ...tokens(block(PY, '.pyscreen[data-theme="contrast"]')) },
};
// text → the backgrounds it is used on (a soft one laid over the panel)
const PAIRS: [string, string[]][] = [
  ['tx-1', ['bg', 'panel', 'bg-2']], ['tx-2', ['bg', 'panel', 'bg-2']], ['tx-3', ['bg', 'panel', 'bg-2']],
  ['accent', ['panel', 'bg']], ['accent-ink', ['accent-soft']], ['danger', ['panel']], ['danger-ink', ['danger-soft']],
  ['warn', ['panel']], ['warn-ink', ['warn-soft']], ['success', ['panel']], ['on-inverse', ['inverse']],
  ['code-kw', ['code-bg']], ['code-fn', ['code-bg']], ['code-str', ['code-bg']], ['code-num', ['code-bg']], ['code-com', ['code-bg']],
];

describe('M11.6 contrast: every text colour reads at 4.5 : 1 or more on its backgrounds', () => {
  for (const [theme, t] of Object.entries(THEMES)) {
    it(`the ${theme} theme`, () => {
      const panel = parse(t['panel']!);
      const low: string[] = [];
      for (const [fg, bgs] of PAIRS) {
        for (const bg of bgs) {
          const r = ratio(over(parse(t[fg]!), panel), over(parse(t[bg]!), panel));
          if (r < AA) low.push(`--${fg} on --${bg}: ${r.toFixed(2)}`);
        }
      }
      expect(low).toEqual([]);
    });
  }

  it('the Run button: its words on its green (light, dark and High contrast share it)', () => {
    expect(ratio(parse(light['run-ink']!), parse(light['run']!))).toBeGreaterThanOrEqual(AA);
    expect(ratio(parse(light['run']!), parse(light['panel']!))).toBeGreaterThanOrEqual(AA);   // the timer and status text
  });

  it('the code editor\'s line numbers, in each theme', () => {
    const gutter = (rule: string) => parse(/color:\s*(#[0-9a-fA-F]{3,8})/.exec(rule)![1]!);
    const lightNumbers = gutter(EDITOR.slice(EDITOR.indexOf('.code-editor .cm-gutters {')));
    const darkNumbers = gutter(EDITOR.slice(EDITOR.indexOf('[data-theme="dark"] .code-editor .cm-gutters {')));
    const contrastNumbers = gutter(EDITOR.slice(EDITOR.indexOf('[data-theme="contrast"] .code-editor .cm-gutters {')));
    expect(ratio(lightNumbers, parse(light['code-bg']!))).toBeGreaterThanOrEqual(AA);
    expect(ratio(darkNumbers, parse(THEMES['dark']!['code-bg']!))).toBeGreaterThanOrEqual(AA);
    expect(ratio(contrastNumbers, parse(THEMES['contrast']!['code-bg']!))).toBeGreaterThanOrEqual(AA);
  });
});
