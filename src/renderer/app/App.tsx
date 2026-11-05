import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Divider } from '../ui/Divider';
import { Icon, Logo } from '../ui/Icon';
import type { MicrolabApi } from './api';
import { ControlsPage } from './ControlsPage';

/**
 * The window (M4.1, screens 01–03): the top bar with the three modes, the page, the status bar. In the Workspace the
 * panels share the width as proportions — parts ~17 %, the circuit the rest, code ~34 % — each within limits, and
 * the dividers between them are draggable; where they were left is a setting (N-13).
 */
type Mode = 'workspace' | 'learn' | 'examples';

export interface Layout {
  parts: number;
  side: number;
}

export const DEFAULT_LAYOUT: Layout = { parts: 0.17, side: 0.34 };
const LIMITS = { parts: [220, 360], side: [320, 0.5], canvas: 360 } as const;

export interface AppProps {
  api: MicrolabApi;
  /** The window's width, for tests; measured in the app. */
  width?: number;
}

export function App({ api, width }: AppProps) {
  const [mode, setMode] = useState<Mode>('workspace');
  const controls = useHash() === '#controls';
  return (
    <div className="app">
      <TopBar mode={mode} onMode={setMode} />
      {controls ? <ControlsPage /> : mode === 'workspace' ? <Workspace api={api} width={width} /> : <Later mode={mode} />}
      <StatusBar />
    </div>
  );
}

/** The page's #hash: #controls opens the design system's controls page (screen 12b). */
function useHash() {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const update = () => setHash(window.location.hash);
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, []);
  return hash;
}

const MODES: { id: Mode; label: string; icon: string }[] = [
  { id: 'workspace', label: 'Workspace', icon: 'grid' },
  { id: 'learn', label: 'Learn', icon: 'book' },
  { id: 'examples', label: 'Examples', icon: 'bulb' },
];

function TopBar({ mode, onMode }: { mode: Mode; onMode: (m: Mode) => void }) {
  return (
    <header className="topbar">
      <div className="brand"><Logo /><b>Micro<span>Lab</span></b></div>
      <div className="seg modes" role="tablist" aria-label="Mode">
        {MODES.map((m) => (
          <button key={m.id} type="button" role="tab" aria-selected={mode === m.id} className={mode === m.id ? 'on' : ''} onClick={() => onMode(m.id)}>
            <Icon name={m.icon} size={14} /> {m.label}
          </button>
        ))}
      </div>
      <div className="vsep" />
      <div className="proj"><b>Untitled project</b><span>No board yet</span></div>
      <span className="spacer" />
      <div className="vsep" />
      <button type="button" className="btn run" disabled title="Run (M4.5)"><Icon name="play" size={14} /> Run</button>
      <div className="vsep" />
      <button type="button" className="btn" disabled title="Send to board (M10)"><Icon name="usb" /> Send to board</button>
    </header>
  );
}

function StatusBar() {
  return (
    <footer className="statusbar" role="status">
      <span>Ready</span>
      <span className="r">MicroLab</span>
    </footer>
  );
}

function Later({ mode }: { mode: Mode }) {
  return (
    <main className="later">
      <h1>{mode === 'learn' ? 'Learn' : 'Examples'}</h1>
      <p className="muted">{mode === 'learn' ? 'The part and board pages come in M8.' : 'The examples page comes in M5.'}</p>
    </main>
  );
}

/** px from a proportion of the width, within [min, max]; max may itself be a proportion. */
function px(fraction: number, total: number, [min, max]: readonly [number, number]): number {
  const hi = max <= 1 ? max * total : max;
  return Math.round(Math.min(hi, Math.max(min, fraction * total)));
}

function useWidth(fixed: number | undefined) {
  const ref = useRef<HTMLDivElement>(null);
  const [measured, setMeasured] = useState(() => fixed ?? window.innerWidth);
  useLayoutEffect(() => {
    if (fixed !== undefined || !ref.current) return;
    const el = ref.current;
    const update = () => setMeasured(el.getBoundingClientRect().width || window.innerWidth);
    update();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : undefined;
    ro?.observe(el);
    window.addEventListener('resize', update);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [fixed]);
  return { ref, width: fixed ?? measured };
}

function Workspace({ api, width: fixed }: { api: MicrolabApi; width?: number }) {
  const { ref, width } = useWidth(fixed);
  const [layout, setLayout] = useState<Layout>(DEFAULT_LAYOUT);
  const [drag, setDrag] = useState<Partial<Record<keyof Layout, number>>>({});

  useEffect(() => {
    let live = true;
    void api.settings.get('layout').then((saved) => {
      const s = saved as Partial<Layout> | undefined;
      if (live && s && typeof s.parts === 'number' && typeof s.side === 'number') setLayout({ parts: s.parts, side: s.side });
    });
    return () => { live = false; };
  }, [api]);

  const partsPx = drag.parts ?? px(layout.parts, width, LIMITS.parts);
  const sidePx = drag.side ?? px(layout.side, width, LIMITS.side);
  const commit = (key: keyof Layout) => (value: number) => {
    const next = { ...layout, [key]: value / width };
    setLayout(next);
    setDrag({});
    void api.settings.set('layout', next);
  };
  const sideMax = Math.max(LIMITS.side[0], Math.min(LIMITS.side[1] * width, width - partsPx - LIMITS.canvas));
  const partsMax = Math.max(LIMITS.parts[0], Math.min(LIMITS.parts[1], width - sidePx - LIMITS.canvas));

  return (
    <div className="ws" ref={ref}>
      <section className="parts" aria-label="Parts" style={{ flexBasis: partsPx }}>
        <div className="head"><h3>Parts</h3></div>
      </section>
      <Divider label="Parts panel width" value={partsPx} min={LIMITS.parts[0]} max={partsMax}
        onChange={(v) => setDrag({ parts: v })} onCommit={commit('parts')} />
      <section className="canvas" aria-label="Circuit" />
      <Divider label="Code panel width" value={sidePx} min={LIMITS.side[0]} max={sideMax} edge="right"
        onChange={(v) => setDrag({ side: v })} onCommit={commit('side')} />
      <section className="side" aria-label="Code" style={{ flexBasis: sidePx }}>
        <div className="head"><h3>main.py</h3></div>
      </section>
    </div>
  );
}
