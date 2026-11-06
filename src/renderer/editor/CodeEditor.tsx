import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { python } from '@codemirror/lang-python';
import { bracketMatching, HighlightStyle, indentOnInput, indentUnit, syntaxHighlighting } from '@codemirror/language';
import { Annotation, EditorState } from '@codemirror/state';
import { drawSelection, EditorView, highlightActiveLine, highlightActiveLineGutter, keymap, lineNumbers } from '@codemirror/view';
import { tags as t } from '@lezer/highlight';
import { useEffect, useRef } from 'react';
import './editor.css';

/**
 * The code editor (F-20, M4.4 basic): CodeMirror 6 with Python, line numbers, undo, bracket matching and four-space
 * indents (MicroPython's own style), coloured as the prototype (screens 02, 03). Tab indents; Esc then Tab leaves the
 * editor, so the keyboard is never trapped. Autocomplete per board comes in M5 (F-20, screen 02b).
 */
export interface CodeEditorProps {
  /** Said to screen readers: the file's name. */
  label: string;
  value: string;
  onChange: (value: string) => void;
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

export function CodeEditor({ label, value, onChange }: CodeEditorProps) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const changed = useRef(onChange);
  changed.current = onChange;

  useEffect(() => {
    const v = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(),
          highlightActiveLineGutter(),
          highlightActiveLine(),
          history(),
          drawSelection(),
          indentOnInput(),
          bracketMatching(),
          python(),
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
    return () => { v.destroy(); view.current = null; };
    // made once per file: a new value is put in by the effect below
  }, [label]);

  // a new value from outside (another file, another project): replace the text, without telling onChange
  useEffect(() => {
    const v = view.current;
    if (!v || v.state.doc.toString() === value) return;
    v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value }, annotations: fromOutside.of(true) });
  }, [value]);

  return <div className="code-editor" ref={host} />;
}
