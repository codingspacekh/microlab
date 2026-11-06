import { useState, type ReactNode } from 'react';
import { HELPED, helperReport, helperView, type BoardKind, type Detection, type HelperAnswers, type HelperAsk } from '@lib/usb';
import type { MicrolabApi } from '../app/api';
import { BOARD_ART } from '../app/boards';
import { Dialog, Icon, Segmented } from '../ui';

/**
 * The connection helper (F-56, §1.13, screen 14): when a board doesn't connect, it finds what is wrong step by step
 * and says what to do, in plain words — from what the app sees (it follows the board as it is plugged in) and from
 * what the student answers. A short report can be copied for the teacher.
 */
export interface ConnectionHelperProps {
  api: MicrolabApi;
  detection: Detection;
  /** The board the project is for: the one helped with first. */
  kind: BoardKind;
  /** The project's board in full, for the report. */
  projectBoard: string;
  chosen?: string;
  onClose: () => void;
  /** Installs MicroPython (F-52). */
  onInstall: (kind: 'pico' | 'microbit') => void;
}

const ART: Record<BoardKind, string> = { pico: BOARD_ART['pico-w'], microbit: BOARD_ART['microbit-v2'], esp32: BOARD_ART['esp32-devkit-v1'] };
const FINDER = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform) ? 'Finder' : 'File Explorer';
const LIGHT: Record<BoardKind, string> = {
  pico: '',
  microbit: 'the small light on its back, by the USB socket',
  esp32: 'its red power light, by the USB socket',
};

export function ConnectionHelper({ api, detection, kind: first, projectBoard, chosen, onClose, onInstall }: ConnectionHelperProps) {
  const [kind, setKind] = useState<BoardKind>(first);
  const [answers, setAnswers] = useState<HelperAnswers>({});
  const [copied, setCopied] = useState(false);
  const v = helperView(kind, detection, answers, chosen);
  const name = HELPED[kind];
  const answer = (a: HelperAnswers) => setAnswers((x) => ({ ...x, ...a }));

  const copy = async () => {
    const system = api.versions.system || (navigator.userAgent.match(/\(([^)]+)\)/)?.[1] ?? navigator.platform);
    await api.app.copy(helperReport({ at: new Date(), app: api.versions.app, system, project: projectBoard, kind, detection, answers }));
    setCopied(true);
  };
  const again = () => {
    setCopied(false);
    const a = v.ask;
    if ('id' in a) void api.boards.check(a.id);
    else setAnswers({});
  };

  return (
    <Dialog title="Help connecting a board" role="dialog" width={820} icon={<Icon name="usb" size={20} />} onCancel={onClose}
      note={copied ? <span role="status">Copied — paste it in a message to the teacher.</span> : <>MicroLab follows the board as you plug it in: the steps change by themselves.</>}
      actions={[
        { label: 'Copy report for the teacher', onClick: () => void copy() },
        { label: 'Check again', onClick: again },
        { label: 'Close', primary: true, onClick: onClose },
      ]}>
      <div className="helper">
        <div className="hleft">
          <Segmented label="The board" hideLabel full value={kind} onChange={(k) => { setKind(k); setAnswers({}); }}
            options={[{ value: 'microbit', label: 'micro:bit' }, { value: 'pico', label: 'Pico W' }, { value: 'esp32', label: 'ESP32' }]} />
          <ol className="steps" aria-label="Steps">
            {v.steps.map((s, i) => (
              <li key={s.id} className={`s is-${s.state}`} aria-current={s.state === 'now' || s.state === 'bad' ? 'step' : undefined}>
                <span className="n">{s.state === 'ok' ? <Icon name="check" size={12} /> : s.state === 'bad' ? <Icon name="x" size={12} /> : s.state === 'skip' ? '–' : i + 1}</span>
                <span>{s.title}<small>{s.note}</small></span>
              </li>
            ))}
          </ol>
        </div>
        <div className="hright">
          <Advice ask={v.ask} kind={kind} name={name} onAnswer={answer} onKind={(k) => { setKind(k); setAnswers({}); }}
            onCheck={(id) => void api.boards.check(id)} onDriver={(chip) => void api.app.openDriverPage(chip)} onReset={() => setAnswers({})} onClose={onClose}
            onInstall={() => { if (kind !== 'esp32') onInstall(kind); }} />
        </div>
      </div>
    </Dialog>
  );
}

interface AdviceProps {
  ask: HelperAsk;
  kind: BoardKind;
  name: string;
  onAnswer: (a: HelperAnswers) => void;
  onKind: (k: BoardKind) => void;
  onCheck: (id: string) => void;
  onDriver: (chip: 'CP210x' | 'CH340' | 'CH9102') => void;
  onReset: () => void;
  onClose: () => void;
  onInstall: () => void;
}

/** What the current step asks, or says to do. */
function Advice({ ask, kind, name, onAnswer, onKind, onCheck, onDriver, onReset, onClose, onInstall }: AdviceProps) {
  const q = (text: string) => <p className="q">{text}</p>;
  const buttons = (...b: ReactNode[]) => <div className="answer">{b}</div>;
  const note = (tone: 'info' | 'bad' | 'ok', body: ReactNode) => (
    <div className={`note ${tone}`}><Icon name={tone === 'ok' ? 'check' : tone === 'bad' ? 'warn' : 'info'} /><span>{body}</span></div>
  );
  const pic = <div className="pic"><img src={ART[kind]} alt={`A ${name}`} /></div>;
  switch (ask.kind) {
    case 'plugged':
      return <>{q(`Is the ${name} plugged in at both ends?`)}<p className="small">The USB cable goes into the board and into the laptop. Push both ends in firmly.</p>{pic}
        {buttons(<button key="y" type="button" className="btn" onClick={() => onAnswer({ plugged: true })}><Icon name="check" size={14} /> Yes, it's plugged in</button>)}</>;
    case 'bootsel-test':
      return <>{q(`Does the laptop see the ${name} at all?`)}
        <p className="small">The {name} has no power light, so test the cable like this: <b>unplug it, hold the white BOOTSEL button, plug it back in, then let go.</b></p>{pic}
        <p className="small"><b>Did a drive called <span className="mono">RPI-RP2</span> appear in {FINDER}?</b></p>
        {buttons(
          <button key="y" type="button" className="btn" onClick={() => onAnswer({ bootsel: true })}><Icon name="check" size={14} /> Yes, RPI-RP2 appeared</button>,
          <button key="n" type="button" className="btn" onClick={() => onAnswer({ bootsel: false })}><Icon name="x" size={14} /> No, nothing appeared</button>,
        )}
        {note('info', <><b>Nothing appears?</b> The cable only carries power. <b>It appears?</b> The cable is fine.</>)}</>;
    case 'light':
      return <>{q(`Is the ${name}'s power light on?`)}<p className="small">Look for {LIGHT[kind]}.</p>{pic}
        {buttons(
          <button key="y" type="button" className="btn" onClick={() => onAnswer({ light: true })}><Icon name="check" size={14} /> Yes, it's on</button>,
          <button key="n" type="button" className="btn" onClick={() => onAnswer({ light: false })}><Icon name="x" size={14} /> No, it's off</button>,
        )}</>;
    case 'charge-only':
      return <>{q('The cable only carries power')}
        {note('bad', <>The board gets power but no data, so the laptop can't see it. Most phone-charging cables are like that. <b>Try another USB cable</b> — one that carries data — or another USB port.</>)}
        {buttons(<button key="r" type="button" className="btn" onClick={onReset}>I've changed the cable</button>)}</>;
    case 'no-power':
      return <>{q('The board gets no power')}
        {note('bad', <>Push the cable in firmly at both ends. Try another USB port on the laptop, then another cable.</>)}
        {buttons(<button key="r" type="button" className="btn" onClick={onReset}>Try again</button>)}</>;
    case 'bootsel-mode':
      return <>{q(`The cable is fine — the ${name} is in BOOTSEL mode`)}
        {note('info', <>Like this it runs no program. <b>Unplug it and plug it back in without holding the button</b> — or, if it has no MicroPython yet, install it now.</>)}
        {buttons(<button key="i" type="button" className="btn primary" onClick={onInstall}><Icon name="cpu" size={14} /> Install MicroPython…</button>)}</>;
    case 'wrong-board':
      return <>{q(`A ${HELPED[ask.found]} is plugged in, not a ${name}`)}
        <p className="small">Plug in the {name}, or get help with the {HELPED[ask.found]}.</p>
        {buttons(<button key="k" type="button" className="btn" onClick={() => onKind(ask.found)}>Help with the {HELPED[ask.found]}</button>)}</>;
    case 'driver':
      return <>{q(`This laptop has no driver for the ${ask.chip} chip`)}
        <p className="small">Many ESP32 boards talk over USB through a {ask.chip} chip, and Windows needs a driver for it. Install the driver, then unplug the board and plug it back in.</p>
        {buttons(<button key="d" type="button" className="btn" onClick={() => onDriver(ask.chip)}><Icon name="ext" size={14} /> Open the {ask.chip} driver page</button>)}
        {note('info', <>The page is the chip maker's own (it opens in your browser). A teacher may need to install it on school laptops.</>)}</>;
    case 'not-asked':
      return <>{q(`The ${name} is found`)}<p className="small">Ask it whether it runs MicroPython — its program stops for a moment and starts again.</p>
        {buttons(<button key="a" type="button" className="btn" onClick={() => onCheck(ask.id)}>Ask the board</button>)}</>;
    case 'checking':
      return <>{q(`Asking the ${name}…`)}</>;
    case 'busy':
      return <>{q(`Another program is using the ${name}${ask.by ? ` — ${ask.by}` : ''}.`)}
        {note('bad', <>Close {ask.by ?? 'it'}, or press Stop/Disconnect in it. Only one program at a time can talk to a board.</>)}
        {buttons(<button key="t" type="button" className="btn" onClick={() => onCheck(ask.id)}>Try again</button>)}</>;
    case 'cant-open':
      return <>{q(`MicroLab can see the ${name} but can't talk to it`)}
        {note('bad', <span className="mono">{ask.message}</span>)}
        <p className="small">Unplug it, plug it back in, and try again.</p>
        {buttons(<button key="t" type="button" className="btn" onClick={() => onCheck(ask.id)}>Try again</button>)}</>;
    case 'no-micropython':
      return <>{q(`The ${name} didn't answer as MicroPython does`)}
        {note('bad', <>It may be running a MakeCode or Arduino program, or a program that doesn't stop when asked. Press its reset button and try again.</>)}
        {kind === 'esp32'
          ? <p className="small">An ESP32 gets MicroPython with a flashing tool: Thonny can do it (Tools › Options › Interpreter › <i>Install or update MicroPython</i>, then choose <i>esptool</i>).</p>
          : <p className="small">MicroLab can install MicroPython on it{kind === 'microbit' ? ' — it copies the files on it to this laptop first and puts them back' : ''}.</p>}
        {buttons(
          <button key="t" type="button" className="btn" onClick={() => onCheck(ask.id)}>Try again</button>,
          ...(kind === 'esp32' ? [] : [<button key="i" type="button" className="btn primary" onClick={onInstall}><Icon name="cpu" size={14} /> Install MicroPython…</button>]),
        )}</>;
    case 'ok':
      return <>{q(`The ${name} is connected: ${ask.version}.`)}
        {note('ok', <>Everything works. Use <b>Send to board</b> to put this project on it.</>)}
        {buttons(<button key="c" type="button" className="btn primary" onClick={onClose}>Close</button>)}</>;
  }
}
