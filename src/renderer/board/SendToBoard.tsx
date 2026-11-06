import { useState } from 'react';
import type { BoardId } from '@lib/boards';
import type { ProjectDoc } from '@lib/project';
import { boardFits, modelOf, versionText, type SendRequest, type SendResult } from '@lib/repl';
import { chipState, kindOf, type Detection, type FoundBoard } from '@lib/usb';
import { Checkbox, Dialog, Icon, MenuButton, RadioGroup } from '../ui';
import { KIND, WANT } from './BoardChip';

/**
 * Send to board (F-50, screen 08): the button beside the board chip, and its dialog — which board, which files go
 * where, run it when copied, keep the board's old main.py. The copying itself is the main process's (only the
 * files that changed go; screen 13b's chip counts them).
 */
export interface SendToBoardProps {
  detection: Detection;
  project: BoardId;
  chosen?: string;
  files: ProjectDoc['files'];
  /** A send under way (from the click until its result). */
  busy: boolean;
  onSend: (id: string, req: SendRequest) => void;
  /** The file Run runs (the open file). */
  entry: string;
  onRunFile: (id: string) => void;
  onOpenConsole: (id: string) => void;
  onBoardFiles: (id: string) => void;
  onHelp: () => void;
}

/** "0.6 KB"; a few bytes as bytes. */
export function size(n: number): string {
  return n < 100 ? `${n} byte${n === 1 ? '' : 's'}` : `${(n / 1024).toFixed(1)} KB`;
}

const bytesOf = (v: string | Uint8Array) => (typeof v === 'string' ? new TextEncoder().encode(v).length : v.length);

export function SendToBoard({ detection, project, chosen, files, busy, onSend, entry, onRunFile, onOpenConsole, onBoardFiles, onHelp }: SendToBoardProps) {
  const [asking, setAsking] = useState(false);
  const state = chipState(detection, project, chosen);
  const sending = busy || state.kind === 'sending';
  const why = state.kind === 'none' ? 'Plug a board in to send to it'
    : state.kind === 'bootsel' ? 'The Pico is in BOOTSEL mode: unplug it and plug it back in without holding the button'
    : state.kind === 'checking' ? 'Checking the board…'
    : undefined;
  return (
    <>
      <span className="sendsplit">
        <button type="button" className="btn" disabled={!!why || sending} title={why} onClick={() => setAsking(true)}>
          <Icon name="usb" /> {sending ? 'Sending…' : 'Send to board'}
        </button>
        <MenuButton label="More ways to send" className="split" alignRight disabled={!!why || sending} items={[
          { label: 'Send to board and run…', icon: 'send', description: 'Copies the files that changed. The board runs main.py now, and every time it starts.', onSelect: () => setAsking(true) },
          { label: `Run ${entry} on the board`, icon: 'play', description: `Runs the file in the editor there now, without saving it as main.py — as Thonny does. The board's own program is unchanged.`, onSelect: () => { if ('board' in state) onRunFile(state.board.id); } },
          { label: "Open the board's console", icon: 'term', description: 'Shows what the board prints; Ctrl+C stops its program and gives its >>> prompt.', onSelect: () => { if ('board' in state) onOpenConsole(state.board.id); } },
          { label: 'Board files…', icon: 'folder', description: "See and copy the board's files, beside this project's.", onSelect: () => { if ('board' in state) onBoardFiles(state.board.id); } },
        ]} />
      </span>
      {asking && 'board' in state && (
        <SendDialog detection={detection} project={project} first={state.board.id} files={files}
          onCancel={() => setAsking(false)} onSend={(id, req) => { setAsking(false); onSend(id, req); }}
          onHelp={() => { setAsking(false); onHelp(); }} />
      )}
    </>
  );
}

interface SendDialogProps {
  detection: Detection;
  project: BoardId;
  first: string;
  files: ProjectDoc['files'];
  onCancel: () => void;
  onSend: (id: string, req: SendRequest) => void;
  onHelp: () => void;
}

function SendDialog({ detection, project, first, files, onCancel, onSend, onHelp }: SendDialogProps) {
  const [id, setId] = useState(first);
  const [run, setRun] = useState(true);
  const [keep, setKeep] = useState(true);
  const checks = detection.checks ?? {};
  const paths = Object.keys(files).sort((a, b) => Number(b === 'main.py') - Number(a === 'main.py') || a.localeCompare(b));

  const option = (b: FoundBoard) => {
    const c = checks[b.id];
    const uname = (c?.state === 'micropython' || c?.state === 'sending') ? c.uname : undefined;
    const model = uname ? modelOf(uname) : undefined;
    const fits = model ? boardFits(model.model, project) : b.kind === kindOf(project);
    return {
      value: b.id,
      label: model?.name ?? KIND[b.kind].name,
      hint: (
        <>
          <span>{uname ? `${versionText(uname)} · ${b.port}` : b.port}</span>
          {fits ? <span className="pill ok"><Icon name="check" size={12} /> matches this project</span>
            : <span className="pill warn">this project is for a {WANT[project]}</span>}
        </>
      ),
    };
  };

  return (
    <Dialog title="Send to a real board" role="dialog" width={620} icon={<Icon name="usb" size={20} />} onCancel={onCancel}
      note={run ? <><Icon name="restart" size={14} /> The board restarts after copying</> : undefined}
      actions={[
        { label: 'Cancel', onClick: onCancel },
        { label: run ? 'Send and run' : 'Send', primary: true, onClick: () => onSend(id, { run, keep }) },
      ]}>
      <div className="sendbox">
        <p className="small muted">Copies this project's files to the board over USB — only those that changed — and runs them: the same code that ran in the simulator.</p>
        <RadioGroup label="Boards plugged in" options={detection.boards.map(option)} value={id} onChange={setId} />
        <div className="tag">Files</div>
        <div className="filetable">
          <table className="t">
            <thead><tr><th>On this laptop</th><th>On the board</th><th className="num">Size</th></tr></thead>
            <tbody>
              {paths.map((p) => (
                <tr key={p}>
                  <td className="mono">{p}</td>
                  <td><span className="mono">/{p}</span>{p === 'main.py' && <span className="tiny muted"> the board runs it when it starts</span>}</td>
                  <td className="num">{size(bytesOf(files[p]!))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="col">
          <Checkbox label="Run it when copied" hint="The board restarts and runs main.py — as it will every time it is switched on." value={run} onChange={setRun} />
          <Checkbox label="Keep a copy of the board's old main.py on this laptop" hint="In Documents › MicroLab › Board backups, if the board had one." value={keep} onChange={setKeep} />
        </div>
        <div className="infobox">
          <Icon name="info" />
          <div className="small"><b>Wire the real board like the picture first.</b> Board not listed? Use a USB cable that carries data; ESP32 boards may need the CP210x or CH340 driver. <button type="button" className="btn sm link" onClick={onHelp}>Help connecting…</button></div>
        </div>
      </div>
    </Dialog>
  );
}

/** What a finished send says (screen 16's first lines). */
export function sendMessage(r: Extract<SendResult, { ok: true }>, req: SendRequest): string[] {
  const list = (xs: string[]) => xs.join(', ');
  const were = (xs: string[]) => (xs.length > 1 ? 'were' : 'was');
  const lines = [
    r.sent.length
      ? `Sent to the ${r.board}: ${list(r.sent.map((s) => `${s.path} (${size(s.size)})`))}.${r.same.length ? ` ${list(r.same)} ${were(r.same)} the same — not copied.` : ''}`
      : `Nothing to copy: ${list(r.same)} ${were(r.same)} already on the ${r.board} as ${r.same.length > 1 ? 'they are' : 'it is'}.`,
  ];
  if (req.run) lines.push(`The ${r.board} restarted. On its own it always starts main.py — now it runs this project.`);
  if (r.keptIn) lines.push(`The board's old main.py is kept in “${r.keptIn.split(/[\\/]/).pop()}” (Documents › MicroLab › Board backups).`);
  return lines;
}
