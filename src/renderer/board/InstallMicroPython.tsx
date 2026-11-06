import { useEffect, useState } from 'react';
import { installRoute, type Detection, type InstallResult, type InstallStep, type InstallStepId } from '@lib/usb';
import firmware from '../../../library/firmware/firmware.json';
import type { MicrolabApi } from '../app/api';
import { BOARD_ART } from '../app/boards';
import { Dialog, Icon } from '../ui';

/**
 * Installing MicroPython (F-52, Q18, screen 14b): the firmware shipped with the app — the same version the simulator
 * copies, so no internet is needed — copied to the board's drive. A Pico keeps its files; a micro:bit's are copied to
 * this laptop first and put back after. macOS asks once before an app may write to the drive.
 */
export interface InstallMicroPythonProps {
  api: MicrolabApi;
  kind: 'pico' | 'microbit';
  detection: Detection;
  onClose: () => void;
}

const FW = { pico: firmware['pico-w'], microbit: firmware['microbit-v2'] };
const NAME = { pico: 'Pico W', microbit: 'micro:bit' };
/** Not on Windows: macOS asks before an app may write to a removable drive (Linux may mount it read-only). */
const ASKS = typeof navigator === 'undefined' || !/Win/.test(navigator.platform);
const MB = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;

type State = 'now' | 'done' | 'skip' | 'wait' | undefined;

export function InstallMicroPython({ api, kind, detection, onClose }: InstallMicroPythonProps) {
  const fw = FW[kind];
  const name = NAME[kind];
  const [route] = useState(() => installRoute(kind, detection));
  const [phase, setPhase] = useState<'ready' | 'running' | 'done' | 'failed'>('ready');
  const [steps, setSteps] = useState<Partial<Record<InstallStepId, { state: State; done?: number; total?: number }>>>({});
  const [result, setResult] = useState<InstallResult | null>(null);

  useEffect(() => api.boards.onInstallStep((s: InstallStep) => setSteps((x) => ({
    ...x,
    [s.step]: s.state === 'progress' ? { state: 'now', done: s.done, total: s.total } : { ...x[s.step], state: s.state },
  }))), [api]);

  const install = async () => {
    setPhase('running');
    setSteps({});
    setResult(null);
    const r = await api.boards.install(kind);
    setResult(r);
    setPhase(r.ok ? 'done' : 'failed');
  };

  const version = fw.version.replace(/^v/, '');
  const list: { id: InstallStepId; title: string; note: string }[] = kind === 'pico'
    ? [
        ...(route === 'copy' ? [] : [{
          id: 'bootsel' as const,
          title: route === 'bootloader' ? 'MicroLab puts it in BOOTSEL' : 'Put it in BOOTSEL: unplug it, hold the white BOOTSEL button, plug it back in, let go',
          note: route === 'bootloader' ? 'it restarts as a drive called RPI-RP2' : 'a drive called RPI-RP2 appears',
        }]),
        { id: 'copy', title: `Copy MicroPython to ${fw.drive}`, note: MB(fw.size) },
        { id: 'restart', title: `The ${name} restarts with it`, note: "the drive goes away by itself — that's expected" },
        { id: 'answer', title: `It answers: MicroPython ${fw.version}`, note: `then the chip says “${name} · MicroPython ${version.replace(/\.0$/, '')}”` },
      ]
    : [
        { id: 'save', title: 'Copy its files to this laptop', note: 'installing wipes them' },
        { id: 'copy', title: `Copy MicroPython to ${fw.drive}`, note: MB(fw.size) },
        { id: 'restart', title: `The ${name} restarts with it`, note: 'its light flashes; the drive goes and comes back' },
        { id: 'answer', title: `It answers: MicroPython ${version}`, note: `then the chip says “${name} · MicroPython ${version}”` },
        { id: 'restore', title: 'Put its files back', note: 'the same files as before' },
      ];

  const failed = result && !result.ok ? result : null;
  const intro = kind === 'pico'
    ? route === 'copy'
      ? <>The {name} is in BOOTSEL mode: it shows a drive called <span className="mono">RPI-RP2</span> and runs no program.</>
      : route === 'bootloader' ? <>The {name} runs MicroPython — MicroLab restarts it into BOOTSEL to put this version on it.</>
        : <>The {name} has no MicroPython yet. It gets it in BOOTSEL mode, as a drive called <span className="mono">RPI-RP2</span>.</>
    : <>The {name} gets MicroPython from its <span className="mono">MICROBIT</span> drive.</>;

  return (
    <Dialog title={`Install MicroPython on the ${name}`} role="dialog" width={680} icon={<Icon name="cpu" size={20} />}
      onCancel={() => { if (phase === 'running') void api.boards.cancelInstall(); else onClose(); }}
      note={<><Icon name="clock" size={14} /> About {kind === 'pico' ? 20 : 30} seconds</>}
      actions={phase === 'done'
        ? [{ label: 'Close', primary: true, onClick: onClose }]
        : [
            { label: 'Cancel', onClick: () => { if (phase === 'running') void api.boards.cancelInstall(); else onClose(); } },
            { label: phase === 'running' ? 'Installing…' : phase === 'failed' ? 'Try again' : 'Install', primary: true, disabled: phase === 'running', onClick: () => void install() },
          ]}>
      <div className="install">
        <p className="small">{intro} MicroLab puts MicroPython on it — the same version the simulator copies, shipped with the app, so no internet is needed.</p>
        <div className="fwcard">
          <span className="pic"><img src={kind === 'pico' ? BOARD_ART['pico-w'] : BOARD_ART['microbit-v2']} alt="" /></span>
          <div className="col">
            <b>{kind === 'pico' ? `MicroPython ${fw.version} for the ${name}` : `micro:bit MicroPython ${fw.version}`}</b>
            <span className="small muted mono">{fw.file} · {MB(fw.size)}</span>
          </div>
          <span className="pill ok"><Icon name="check" size={12} /> same as the simulator</span>
        </div>
        <div className="tag">Installing</div>
        <ol className="isteps" aria-label="Installing">
          {list.map((s, i) => {
            const st = steps[s.id];
            const pct = st?.total ? `${Math.floor(((st.done ?? 0) / st.total) * 100)} %` : null;
            const cls = st?.state === 'done' ? 'is-ok' : st?.state === 'skip' ? 'is-skip' : st?.state === 'now' || st?.state === 'wait' ? 'is-now' : '';
            return (
              <li key={s.id} className={cls}>
                <span className="n">{st?.state === 'done' ? <Icon name="check" size={12} /> : st?.state === 'skip' ? '–' : i + 1}</span>
                <span><b>{s.title}</b><small>{st?.state === 'now' && pct ? pct : st?.state === 'done' && s.id === 'copy' ? `${MB(fw.size)} — done` : st?.state === 'skip' ? 'nothing to keep' : s.note}</small></span>
              </li>
            );
          })}
        </ol>
        {failed && (
          <div className="note bad" role="alert"><Icon name="warn" />
            <span>{failed.message}{failed.permission && <> <button type="button" className="btn sm" onClick={() => void api.app.showFirmware(kind)}>Show the file</button></>}</span>
          </div>
        )}
        {result?.ok && (
          <div className="note ok" role="status"><Icon name="check" />
            <span>MicroPython {result.version} is on the {name}.{result.restored ? ` Its ${result.restored} file${result.restored === 1 ? ' is' : 's are'} back on it` : ''}{result.keptIn ? ` (and kept in “${result.keptIn.split(/[\\/]/).pop()}”).` : result.restored ? '.' : ''}</span>
          </div>
        )}
        {phase !== 'done' && ASKS && (
          <div className="note warn"><Icon name="warn" />
            <span><b>macOS may ask:</b> “MicroLab would like to access files on a removable volume.” Choose <b>Allow</b> — MicroLab only writes the firmware file.</span>
          </div>
        )}
        <div className="note info"><Icon name="info" />
          <span>{kind === 'pico'
            ? <><b>The {name}'s files stay.</b> Installing MicroPython doesn't touch them.</>
            : <><b>On a micro:bit, installing wipes its files</b> — MicroLab copies them to this laptop first and puts them back after.</>}</span>
        </div>
      </div>
    </Dialog>
  );
}
