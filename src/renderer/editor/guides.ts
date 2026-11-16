import { type Extension } from '@codemirror/state';
import { Decoration, ViewPlugin, type DecorationSet, type EditorView, type ViewUpdate } from '@codemirror/view';
import { indentGuides, type LineGuides } from '@lib/editor';

/**
 * The indentation guides (1.0.1 — the class after v1.0: "indentation preview, like python.microbit.org, to help
 * students write the code in the correct way"): a thin line down the left of every block, the cursor's block's line
 * stronger. Each line of code is given them as its background — one upright line per block, placed in `ch` (the
 * code fonts are all fixed-width) — so they move with the text's size and font and cost no extra elements.
 * Which lines get which: lib/editor/indent.ts.
 */
const styles = new Map<string, Decoration>();

/** A line's guides as a background: the strong one 2 px, the others 1 px. */
export function guideStyle(g: LineGuides): string {
  const img = g.cols.map((c) => (c === g.active ? 'linear-gradient(var(--guide-on),var(--guide-on))' : 'linear-gradient(var(--guide),var(--guide))'));
  const size = g.cols.map((c) => (c === g.active ? '2px 100%' : '1px 100%'));
  const at = g.cols.map((c) => `${c}ch 0`);
  return `background-image:${img.join(',')};background-size:${size.join(',')};background-position:${at.join(',')};background-repeat:no-repeat`;
}

function decoration(g: LineGuides): Decoration {
  const key = `${g.cols.join(',')}|${g.active ?? ''}`;
  let d = styles.get(key);
  if (!d) styles.set(key, (d = Decoration.line({ class: 'ml-guides', attributes: { style: guideStyle(g) } })));
  return d;
}

function build(view: EditorView): DecorationSet {
  const { doc, selection, tabSize } = view.state;
  // one cursor, nothing selected: its block is the strong one
  const cursor = selection.ranges.length === 1 && selection.main.empty ? doc.lineAt(selection.main.head).number - 1 : -1;
  const all = indentGuides(doc.toString().split('\n'), cursor, tabSize);
  const marks = [];
  for (const { from, to } of view.visibleRanges) {
    for (let n = doc.lineAt(from).number, last = doc.lineAt(to).number; n <= last; n++) {
      const g = all[n - 1];
      if (g?.cols.length) marks.push(decoration(g).range(doc.line(n).from));
    }
  }
  return Decoration.set(marks);
}

export function indentationGuides(): Extension {
  return ViewPlugin.fromClass(class {
    decorations: DecorationSet;
    constructor(view: EditorView) { this.decorations = build(view); }
    update(u: ViewUpdate) {
      if (u.docChanged || u.selectionSet || u.viewportChanged) this.decorations = build(u.view);
    }
  }, { decorations: (v) => v.decorations });
}
