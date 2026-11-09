import { acceptCompletion, autocompletion, completionStatus, type Completion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete';
import { localCompletionSource } from '@codemirror/lang-python';
import { syntaxTree } from '@codemirror/language';
import { Prec, StateEffect, StateField, type EditorState, type Extension } from '@codemirror/state';
import { EditorView, ViewPlugin, keymap, showTooltip, type Tooltip, type ViewUpdate } from '@codemirror/view';
import { inText, info, look, signatureDom, withBrackets } from '../editor/assist';
import type { MicrolabApi, PyPlace, PySignature } from '../app/api';

/**
 * Help while typing Python 3 (M12 slice 5b, F-97; screen 02b's look): the names that fit where the cursor is — of
 * Python's modules, of the file, of the libraries installed in MicroLab — each with its explanation, and a call's
 * arguments while it is typed. Jedi answers, in the main process's helper; when it can't (not there, too slow), the
 * names in the file still come, from CodeMirror's Python mode.
 */
const SIGNATURE_DELAY_MS = 120;

function place(state: EditorState, pos: number, path: string): PyPlace {
  const line = state.doc.lineAt(pos);
  return { code: state.doc.toString(), line: line.number, column: pos - line.from, path };
}

function source(api: MicrolabApi, path: () => string) {
  return async (ctx: CompletionContext): Promise<CompletionResult | null> => {
    if (inText(ctx.state, ctx.pos)) return null;
    const word = ctx.matchBefore(/\w+/);
    const dot = ctx.state.sliceDoc(ctx.pos - 1, ctx.pos) === '.';
    // a word typed, a dot, or Ctrl+Space
    if (!word && !dot && !ctx.explicit) return null;
    const from = word ? word.from : ctx.pos;
    const found = await api.python3.complete(place(ctx.state, ctx.pos, path()));
    if (ctx.aborted) return null;
    if (!found.length) return dot ? null : localCompletionSource(ctx);
    const options: Completion[] = found.map((c) => ({
      label: c.name, type: c.type, ...(c.doc ? { info: info(c.doc) } : {}),
      ...(c.call ? { apply: withBrackets(c.call) } : {}),
    }));
    return { from, options, validFor: /^\w*$/ };
  };
}

type SignatureTip = Tooltip & { key: string };
const setSignature = StateEffect.define<SignatureTip | null>();

/** Inside a call's brackets (CodeMirror's Python tree: an ArgList around the cursor). */
function inCall(state: EditorState, pos: number): boolean {
  for (let n: ReturnType<ReturnType<typeof syntaxTree>['resolveInner']> | null = syntaxTree(state).resolveInner(pos, -1); n; n = n.parent) {
    // inside its brackets: after the "(", and not after the ")" that closes it
    if (n.name === 'ArgList') return pos > n.from && !(pos === n.to && state.sliceDoc(n.to - 1, n.to) === ')');
    if (n.name === 'Body' || n.name === 'Script') return false;
  }
  return false;
}

const signatureField = StateField.define<SignatureTip | null>({
  create: () => null,
  update(value, tr) {
    for (const e of tr.effects) if (e.is(setSignature)) value = e.value;
    if (!value) return null;
    // the list of names, when open, is what to read; out of the call, or the text selected: none
    const sel = tr.state.selection.main;
    if (!sel.empty || completionStatus(tr.state) === 'active' || !inCall(tr.state, sel.head)) return null;
    return tr.docChanged ? { ...value, pos: tr.changes.mapPos(value.pos) } : value;
  },
  provide: (f) => showTooltip.from(f),
});

function signaturePlugin(api: MicrolabApi, path: () => string) {
  return ViewPlugin.fromClass(class {
    private timer: ReturnType<typeof setTimeout> | undefined;
    private asked = 0;

    constructor(readonly view: EditorView) {}

    update(u: ViewUpdate) {
      if (!u.docChanged && !u.selectionSet) return;
      clearTimeout(this.timer);
      const sel = u.state.selection.main;
      if (!sel.empty || inText(u.state, sel.head) || !inCall(u.state, sel.head)) return;
      this.timer = setTimeout(() => void this.ask(), SIGNATURE_DELAY_MS);
    }

    async ask() {
      const id = ++this.asked;
      const { state } = this.view;
      const head = state.selection.main.head;
      const s: PySignature | null = await api.python3.signature(place(state, head, path()));
      // the cursor moved on, or a newer question was asked: this answer is old
      if (id !== this.asked || this.view.state.selection.main.head !== head) return;
      const was = this.view.state.field(signatureField);
      const key = s ? `${s.name}:${s.active}:${s.params.join(',')}` : '';
      if (!s) { if (was) this.view.dispatch({ effects: setSignature.of(null) }); return; }
      if (was?.key === key) return;
      this.view.dispatch({ effects: setSignature.of({
        key, pos: head, above: true, strictSide: false, arrow: false,
        create: () => ({ dom: signatureDom(s.name, s.params, s.active, s.doc) }),
      }) });
    }

    destroy() {
      clearTimeout(this.timer);
    }
  });
}

/** The editor's help for a Python 3 file; `path` is the file's path (or its name, not saved yet). */
export function python3Assist(api: MicrolabApi, path: () => string): Extension {
  return [
    look,
    autocompletion({ icons: true, maxRenderedOptions: 60, override: [source(api, path)] }),
    // Tab takes the chosen name, as Enter does (as in the workspace); with no list open it indents
    Prec.highest(keymap.of([{ key: 'Tab', run: acceptCompletion }])),
    signatureField,
    signaturePlugin(api, path),
  ];
}
