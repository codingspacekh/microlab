import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { python } from '@codemirror/lang-python';
import { bracketMatching, HighlightStyle, indentOnInput, indentUnit, syntaxHighlighting } from '@codemirror/language';
import { Annotation, Compartment, EditorSelection, EditorState, StateEffect, StateField, type Extension, type Range } from '@codemirror/state';
import { Decoration, drawSelection, EditorView, highlightActiveLine, highlightActiveLineGutter, keymap, lineNumbers, type DecorationSet } from '@codemirror/view';
import { tags as t } from '@lezer/highlight';
import { useEffect, useRef } from 'react';
import { boardAssist } from './assist';
import './editor.css';

/**
 * The code editor (F-20, M4.4 basic): CodeMirror 6 with Python, line numbers, undo, bracket matching and four-space
 * indents (MicroPython's own style), coloured as the prototype (screens 02, 03). Tab indents; Esc then Tab leaves the
 * editor, so the keyboard is never trapped. M5.5 (F-20, screen 02b): the board's modules offered as you type, with a
 * short explanation, and a call's arguments shown while it is typed.
 */
export interface CodeEditorProps {
  /** Said to screen readers: the file's name. */
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** The project's board: its modules are offered (M5.5). */
  board?: string;
  /** The text size (px, M6.8): when it changes the editor measures its lines again — or the line numbers keep the
   *  old height until it is next focused (the teacher, M7). */
  size?: number;
  /** The line the last run's error is on (M9, screen 05): highlighted, its code underlined. */
  errorLine?: number;
  /** Put the cursor on this line and show it (M9: "Go to line 5"); a new object each time it is asked. */
  goTo?: { line: number };
  /** Help while typing from elsewhere (M12: Python 3's, from Jedi) — instead of a board's. */
  assist?: Extension;
}

/** The error's line (M9): a line decoration and its code underlined; it moves with edits, until the next run. */
const setErrorLine = StateEffect.define<number | null>();
const errorLine = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    let out = deco.map(tr.changes);
    for (const e of tr.effects) {
      if (!e.is(setErrorLine)) continue;
      if (e.value === null || e.value < 1 || e.value > tr.state.doc.lines) { out = Decoration.none; continue; }
      const line = tr.state.doc.line(e.value);
      const start = line.from + /^\s*/.exec(line.text)![0].length;
      const marks: Range<Decoration>[] = [Decoration.line({ class: 'cm-error-line' }).range(line.from)];
      if (line.to > start) marks.push(Decoration.mark({ class: 'cm-error-code' }).range(start, line.to));
      out = Decoration.set(marks);
    }
    return out;
  },
  provide: (f) => EditorView.decorations.from(f),
});

/** The text size as CodeMirror's own theme (M7, the teacher's report): set in CSS alone, a size that came after the
 *  editor first measured its lines (a saved setting, read as a project opens) left the line numbers at the old
 *  height until it was focused. A theme it is given is a change it measures for. */
const SIZE_THEMES = new Map<number, ReturnType<typeof EditorView.theme>>();
function sizeTheme(px: number) {
  let t = SIZE_THEMES.get(px);
  if (!t) SIZE_THEMES.set(px, (t = EditorView.theme({ '&': { fontSize: `${px}px` }, '.cm-scroller': { lineHeight: `${px * 1.55}px` } })));
  return t;
}

/** A change put in from outside, not typed: onChange is not told. */
const fromOutside = Annotation.define<boolean>();

const colours = HighlightStyle.define([
  { tag: [t.keyword, t.controlKeyword, t.definitionKeyword, t.moduleKeyword, t.operatorKeyword, t.bool, t.null], color: 'var(--code-kw)' },   // True / False / None too, as in the prototype
  { tag: [t.function(t.variableName), t.function(t.propertyName), t.standard(t.variableName)], color: 'var(--code-fn)' },
  { tag: [t.string, t.special(t.string)], color: 'var(--code-str)' },
  { tag: t.number, color: 'var(--code-num)' },
  { tag: t.comment, color: 'var(--code-com)', fontStyle: 'italic' },
]);

export function CodeEditor({ label, value, onChange, board, size, errorLine: errorAt, goTo, assist }: CodeEditorProps) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const changed = useRef(onChange);
  changed.current = onChange;
  const sizing = useRef(new Compartment());
  const sizeNow = useRef(size);
  sizeNow.current = size;

  useEffect(() => {
    const v = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: value,
        extensions: [
          sizing.current.of(sizeTheme(sizeNow.current ?? 13)),
          lineNumbers(),
          highlightActiveLineGutter(),
          highlightActiveLine(),
          history(),
          drawSelection(),
          indentOnInput(),
          bracketMatching(),
          python(),
          errorLine,
          ...(board ? [boardAssist(board)] : assist ? [assist] : []),
          syntaxHighlighting(colours),
          indentUnit.of('    '),
          EditorState.tabSize.of(4),
          keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
          EditorView.contentAttributes.of({ 'aria-label': label, spellcheck: 'false', autocorrect: 'off', autocapitalize: 'off' }),
          EditorView.updateListener.of((u) => {
            if (u.docChanged && !u.transactions.every((tr) => tr.annotation(fromOutside))) changed.current(u.state.doc.toString());
          }),
        ],
      }),
    });
    view.current = v;
    // its font (JetBrains Mono) may load after the first measure — and a project opens before it has: measure again
    // when the fonts are in, and once the panel is laid out (the teacher, M7: the line numbers kept the fallback's
    // height until the editor was focused)
    const again = () => { if (view.current === v) v.requestMeasure(); };
    const fonts = typeof document !== 'undefined' ? document.fonts : undefined;
    void fonts?.ready.then(again);
    fonts?.addEventListener?.('loadingdone', again);
    const frame = requestAnimationFrame(again);
    return () => { cancelAnimationFrame(frame); fonts?.removeEventListener?.('loadingdone', again); v.destroy(); view.current = null; };
    // made once per file (and board): a new value is put in by the effect below
  }, [label, board]);

  // a new value from outside (another file, another project): replace the text, without telling onChange
  useEffect(() => {
    const v = view.current;
    if (!v || v.state.doc.toString() === value) return;
    v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value }, annotations: fromOutside.of(true) });
  }, [value]);

  // a new size: CodeMirror's theme changed, so it measures its lines and their numbers again
  useEffect(() => {
    view.current?.dispatch({ effects: sizing.current.reconfigure(sizeTheme(size ?? 13)) });
  }, [size]);

  // the error's line (M9): set after each run, and when the editor is made again for its file
  useEffect(() => {
    view.current?.dispatch({ effects: setErrorLine.of(errorAt ?? null) });
  }, [errorAt, label, board]);

  // "Go to line": the cursor at the line's code, scrolled to, the editor focused
  useEffect(() => {
    const v = view.current;
    if (!v || !goTo || goTo.line < 1 || goTo.line > v.state.doc.lines) return;
    const line = v.state.doc.line(goTo.line);
    const at = line.from + /^\s*/.exec(line.text)![0].length;
    v.dispatch({ selection: EditorSelection.cursor(at), effects: EditorView.scrollIntoView(at, { y: 'center' }) });
    v.focus();
  }, [goTo, label, board]);

  return <div className="code-editor" ref={host} />;
}
