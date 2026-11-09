import { acceptCompletion, autocompletion, completionStatus, pickedCompletion, type Completion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete';
import { pythonLanguage } from '@codemirror/lang-python';
import { syntaxTree } from '@codemirror/language';
import { Prec, StateField, type EditorState, type Extension } from '@codemirror/state';
import { EditorView, keymap, showTooltip, type Tooltip } from '@codemirror/view';
import { completeAt, signatureAt, type ApiKind } from '@lib/editor';

/**
 * Help while typing (F-20, screen 02b), for the project's board: its modules' names offered as you type, each with
 * a short explanation, and — inside a call — the call's arguments with the one being typed in bold. Python's own
 * words and the names in the file still come from CodeMirror's Python mode.
 */
const TYPES: Record<ApiKind, string> = {
  module: 'namespace', class: 'class', function: 'function', method: 'method', constant: 'constant', object: 'variable', value: 'property',
};

/** Inside a string or a comment nothing is offered. */
export function inText(state: EditorState, pos: number): boolean {
  const node = syntaxTree(state).resolveInner(pos, -1);
  return /String|Comment/.test(node.name);
}

export function info(text: string): () => Node {
  return () => {
    const [first, ...rest] = text.split('\n');
    const box = document.createElement('div');
    box.className = 'ml-doc';
    if (rest.length) {
      const sig = document.createElement('code');
      sig.textContent = first!;
      box.append(sig);
    }
    const p = document.createElement('p');
    p.textContent = rest.length ? rest.join('\n') : first!;
    box.append(p);
    return box;
  };
}

function source(board: string) {
  return (ctx: CompletionContext): CompletionResult | null => {
    if (inText(ctx.state, ctx.pos)) return null;
    const r = completeAt(board, ctx.state.doc.toString(), ctx.pos);
    if (!r) return null;
    // a word typed, a dot, or Ctrl+Space
    if (r.from === ctx.pos && !ctx.explicit && !/[.\s]$/.test(ctx.state.sliceDoc(ctx.pos - 1, ctx.pos))) return null;
    const options: Completion[] = r.options.map((o) => ({
      label: o.label, type: TYPES[o.kind], ...(o.detail ? { detail: o.detail } : {}), info: info(o.info),
      ...(o.call ? { apply: withBrackets(o.call) } : {}),
    }));
    return { from: r.from, options, validFor: /^\w*$/ };
  };
}

/** A call taken with its brackets (the teacher, 2026-11-08): `scroll(|)` when it takes arguments, `is_pressed()|`
 *  when not; a bracket already there is left as it is. */
export function withBrackets(call: 'args' | 'empty') {
  return (view: EditorView, completion: Completion, from: number, to: number) => {
    const open = view.state.sliceDoc(to, to + 1) === '(';
    const insert = open ? completion.label : `${completion.label}()`;
    const anchor = from + insert.length - (!open && call === 'args' ? 1 : 0);
    view.dispatch({ changes: { from, to, insert }, selection: { anchor }, annotations: pickedCompletion.of(completion), userEvent: 'input.complete' });
  };
}

/** A call's arguments as on screen 02b: the one being typed in bold, then what the call does. */
export function signatureDom(label: string, params: string[], active: number, about: string): HTMLElement {
  const dom = document.createElement('div');
  dom.className = 'ml-signature';
  dom.setAttribute('role', 'status');
  const code = document.createElement('code');
  code.append(`${label}(`);
  params.forEach((p, i) => {
    if (i) code.append(', ');
    // the argument being typed (after a bare * they are named: no position to count)
    const star = params.indexOf('*');
    const on = i === active && (star < 0 || i < star);
    if (on) { const b = document.createElement('b'); b.textContent = p; code.append(b); } else code.append(p);
  });
  code.append(')');
  dom.append(code);
  if (about) {
    const doc = document.createElement('p');
    doc.textContent = about;
    dom.append(doc);
  }
  return dom;
}

type SignatureTip = Tooltip & { key: string };

function signatureTooltip(board: string) {
  const compute = (state: EditorState, was: SignatureTip | null): SignatureTip | null => {
    const sel = state.selection.main;
    // the list of names, when open, is what to read: its explanation would sit under this
    if (!sel.empty || inText(state, sel.head) || completionStatus(state) === 'active') return null;
    const s = signatureAt(board, state.doc.toString(), sel.head);
    if (!s) return null;
    // the same call and argument: keep the tooltip where it is (no flicker while typing an argument)
    const start = state.doc.toString().lastIndexOf('(', sel.head);
    const key = `${s.label}:${s.active}:${start}`;
    if (was?.key === key) return was;
    return {
      key,
      pos: sel.head,
      above: true,
      strictSide: false,
      arrow: false,
      create: () => ({ dom: signatureDom(s.label, s.params, s.active, s.doc) }),
    };
  };
  return StateField.define<SignatureTip | null>({
    create: (state) => compute(state, null),
    update: (value, tr) => compute(tr.state, value),
    provide: (f) => showTooltip.from(f),
  });
}

/** The list, its explanation and the arguments as on screen 02b — in CodeMirror's theme, so they win over its own. */
export const look = EditorView.theme({
  '.cm-tooltip.cm-tooltip-autocomplete': { border: '1px solid var(--line)', borderRadius: '8px', background: 'var(--panel)', boxShadow: 'var(--shadow-l)', overflow: 'hidden' },
  '.cm-tooltip.cm-tooltip-autocomplete > ul': { fontFamily: 'var(--mono)', fontSize: '12px', maxHeight: '15.5em', minWidth: '250px' },
  '.cm-tooltip.cm-tooltip-autocomplete > ul > li': { display: 'flex', alignItems: 'center', gap: '8px', padding: '3px 10px 3px 8px', lineHeight: '20px', color: 'var(--tx-1)' },
  '.cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]': { background: 'var(--accent-soft)', color: 'var(--tx-1)' },
  '.cm-completionLabel': { fontWeight: '550' },
  '.cm-completionMatchedText': { textDecoration: 'none', color: 'var(--accent)' },
  '.cm-completionDetail': { marginLeft: 'auto', paddingLeft: '14px', fontStyle: 'normal', fontSize: '11px', color: 'var(--tx-3)', whiteSpace: 'nowrap' },
  '.cm-completionIcon': { width: '14px', padding: '0', opacity: '1', fontWeight: '700', fontSize: '11.5px', textAlign: 'center' },
  '.cm-completionIcon-constant:after': { content: "'C'", color: 'var(--code-num)' },
  '.cm-completionIcon-class:after': { content: "'◆'", color: 'var(--code-fn)', fontSize: '9px' },
  '.cm-completionIcon-function:after, .cm-completionIcon-method:after': { content: "'ƒ'", color: 'var(--code-fn)' },
  '.cm-completionIcon-namespace:after': { content: "'M'", color: 'var(--code-kw)' },
  '.cm-completionIcon-variable:after, .cm-completionIcon-property:after': { content: "'●'", color: 'var(--tx-3)', fontSize: '8px' },
  '.cm-completionIcon-keyword:after': { content: "'k'", color: 'var(--code-kw)' },
  '.cm-tooltip.cm-completionInfo': { border: '1px solid var(--line)', borderRadius: '8px', background: 'var(--panel)', boxShadow: 'var(--shadow-l)', padding: '8px 10px', maxWidth: '320px' },
  '.ml-doc code': { display: 'block', fontFamily: 'var(--mono)', fontSize: '11.5px', color: 'var(--tx-1)', fontWeight: '600', marginBottom: '4px', whiteSpace: 'pre-wrap' },
  '.ml-doc p': { margin: '0', fontFamily: 'var(--font)', fontSize: '12px', lineHeight: '1.45', color: 'var(--tx-2)' },
  '.cm-tooltip.ml-signature': { border: '1px solid var(--line)', borderRadius: '8px', background: 'var(--panel)', boxShadow: 'var(--shadow-m)', padding: '6px 10px', maxWidth: '400px' },
  '.ml-signature code': { fontFamily: 'var(--mono)', fontSize: '12px', color: 'var(--tx-2)' },
  '.ml-signature code b': { color: 'var(--accent)', fontWeight: '700' },
  '.ml-signature p': { margin: '4px 0 0', fontFamily: 'var(--font)', fontSize: '11.5px', lineHeight: '1.4', color: 'var(--tx-3)' },
});

export function boardAssist(board: string): Extension {
  return [
    look,
    pythonLanguage.data.of({ autocomplete: source(board) }),
    autocompletion({ icons: true, maxRenderedOptions: 60 }),
    // Tab takes the chosen completion, as Enter does (the teacher, 2026-11-08); with no list open it indents
    Prec.highest(keymap.of([{ key: 'Tab', run: acceptCompletion }])),
    signatureTooltip(board),
  ];
}
