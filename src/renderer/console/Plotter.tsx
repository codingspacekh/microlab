import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { rate, type Plot } from '@lib/plot';

/**
 * The Plotter (M9 slice 5, F-26, screen 07): the numbers the program prints, as lines over the last 16 seconds or the
 * last minute; "now" moves on while it runs. Each series in a fixed colour (the validated categorical order), named
 * at its line's end and in the legend; a crosshair reads every series at a moment. The console is its table.
 */
export interface PlotNames { names: string[]; line: number }

/** Series colours, in order (the dataviz reference palette, validated on the panel's white: see docs/acceptance/M9.md). */
export const SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'];
const WINDOWS = [{ s: 16, label: '16 s' }, { s: 60, label: '1 min' }];
const M = { left: 44, right: 84, top: 10, bottom: 24 };

/** About `count` round steps covering lo–hi. */
export function niceTicks(lo: number, hi: number, count = 4): number[] {
  if (!(hi > lo)) { const pad = Math.abs(lo) > 1 ? Math.abs(lo) * 0.1 : 1; lo -= pad; hi += pad; }
  const raw = (hi - lo) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((k) => k >= raw)!;
  const ticks: number[] = [];
  for (let v = Math.floor(lo / step) * step; v <= hi + step * 1e-9; v += step) ticks.push(Math.round(v / step) * step);
  if (ticks.at(-1)! < hi) ticks.push(ticks.at(-1)! + step);
  return ticks;
}

/** A value as the axis and the tooltip show it, with a true minus sign. */
const fmt = (v: number) => (Math.abs(v) >= 1000 || Number.isInteger(v) ? String(Math.round(v * 100) / 100) : v.toPrecision(4).replace(/\.?0+$/, '')).replace(/^-/, '−');

export function Plotter({ plot, names, running, startedAt }: { plot: Plot; names: PlotNames | null; running: boolean; startedAt?: number }) {
  const [win, setWin] = useState(16);
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 600, h: 200 });
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => { const r = el.getBoundingClientRect(); if (r.width && r.height) setSize({ w: r.width, h: r.height }); };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // "now" moves on while it runs, so the lines scroll even while nothing is printed
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setTick((n) => n + 1), 200);
    return () => clearInterval(t);
  }, [running]);
  const last = plot.times.at(-1) ?? 0;
  const now = running && startedAt ? Math.max(last, (Date.now() - startedAt) / 1000) : last;
  void tick;

  const count = plot.series.length;
  const nameOf = (i: number) => plot.series[i]?.label ?? (names && names.names.length === count ? names.names[i] : undefined) ?? (count === 1 ? 'value' : `value ${i + 1}`);
  const per = rate(plot);
  const from = now - win;
  const visible = useMemo(() => plot.series.map((s) => {
    const k = s.points.findIndex((p) => p[0] >= from);
    return k < 0 ? [] : s.points.slice(Math.max(0, k - 1));
  }), [plot, from]);
  const values = visible.flat().map((p) => p[1]);
  const ticks = values.length ? niceTicks(Math.min(...values), Math.max(...values)) : [0, 1];
  const [lo, hi] = [ticks[0]!, ticks.at(-1)!];
  const pw = Math.max(40, size.w - M.left - M.right);
  const ph = Math.max(40, size.h - M.top - M.bottom);
  const x = (t: number) => M.left + ((t - from) / win) * pw;
  const y = (v: number) => M.top + (1 - (v - lo) / (hi - lo || 1)) * ph;
  const [hover, setHover] = useState<number | null>(null);
  // the moment under the pointer: the nearest sample's time
  const at = hover === null ? null : (() => {
    const t = from + ((hover - M.left) / pw) * win;
    let best: number | null = null;
    for (const p of visible[0] ?? []) if (p[0] >= from && (best === null || Math.abs(p[0] - t) < Math.abs(best - t))) best = p[0];
    return best;
  })();
  // direct labels at each line's end, pushed apart so they don't cover each other
  const ends = visible.map((pts, i) => ({ i, y: pts.length ? y(pts.at(-1)![1]) : NaN })).filter((e) => !Number.isNaN(e.y)).sort((a, b) => a.y - b.y);
  for (let k = 1; k < ends.length; k++) if (ends[k]!.y - ends[k - 1]!.y < 14) ends[k]!.y = ends[k - 1]!.y + 14;

  return (
    <div className="plotter">
      <div className="phead">
        {count > 0 ? (
          <span className="legend">
            {plot.series.map((_, i) => (
              <span key={i} className="key"><i style={{ background: SERIES[i % SERIES.length] }} />{count === 1 ? <b>{nameOf(i)}</b> : nameOf(i)}</span>
            ))}
            <span className="muted">— {names && !plot.series.some((s) => s.label) ? `printed by line ${names.line} · ` : ''}{per ? `${per} a second` : 'printed'}</span>
          </span>
        ) : <span className="muted">Numbers the program prints are drawn here: print(d) for one line, print(x, y) for two.</span>}
        <span className="spacer" />
        <span className="seg sm" role="radiogroup" aria-label="Time shown">
          {WINDOWS.map((w) => (
            <button key={w.s} type="button" role="radio" aria-checked={win === w.s} className={win === w.s ? 'on' : undefined} onClick={() => setWin(w.s)}>{w.label}</button>
          ))}
        </span>
      </div>
      <div className="pbox" ref={box}>
        <svg width={size.w} height={size.h} role="img"
          aria-label={count ? `Plot of ${plot.series.map((s, i) => `${nameOf(i)}, now ${fmt(s.points.at(-1)?.[1] ?? 0)}`).join('; ')}` : 'Plot: nothing printed yet'}
          onMouseMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); const px = e.clientX - r.left; setHover(px >= M.left && px <= M.left + pw ? px : null); }}
          onMouseLeave={() => setHover(null)}>
          <g className="grid">
            {ticks.map((v) => (
              <g key={v}>
                <line x1={M.left} x2={M.left + pw} y1={y(v)} y2={y(v)} />
                <text x={M.left - 6} y={y(v) + 3.5} textAnchor="end">{fmt(v)}</text>
              </g>
            ))}
            {[win, win / 2, 0].map((s) => (
              <text key={s} x={M.left + pw - (s / win) * pw} y={M.top + ph + 16} textAnchor={s === win ? 'start' : s === 0 ? 'end' : 'middle'}>{s === 0 ? 'now' : `−${s} s`}</text>
            ))}
          </g>
          <clipPath id="plot-clip"><rect x={M.left} y={M.top - 3} width={pw} height={ph + 6} /></clipPath>
          <g clipPath="url(#plot-clip)">
            {visible.map((pts, i) => pts.length > 0 && (
              <polyline key={i} className="series" data-series={i} points={pts.map((p) => `${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join(' ')}
                stroke={SERIES[i % SERIES.length]} />
            ))}
          </g>
          {ends.map((e) => (
            <g key={e.i} className="end">
              <line x1={M.left + pw + 4} x2={M.left + pw + 14} y1={e.y} y2={e.y} stroke={SERIES[e.i % SERIES.length]} strokeWidth={2} />
              <text x={M.left + pw + 18} y={e.y + 4}>{nameOf(e.i)}</text>
            </g>
          ))}
          {at !== null && (
            <g className="cross">
              <line x1={x(at)} x2={x(at)} y1={M.top} y2={M.top + ph} />
              {visible.map((pts, i) => {
                const p = pts.find((q) => q[0] === at);
                return p ? <circle key={i} cx={x(p[0])} cy={y(p[1])} r={4} fill={SERIES[i % SERIES.length]} /> : null;
              })}
            </g>
          )}
        </svg>
        {at !== null && (
          <div className="ptip" role="tooltip" style={{ left: Math.min(x(at) + 10, size.w - 150), top: M.top }}>
            <b>{at - now === 0 ? 'now' : `−${Math.abs(at - now).toFixed(1)} s`}</b>
            {visible.map((pts, i) => {
              const p = pts.find((q) => q[0] === at);
              return p ? <span key={i}><i style={{ background: SERIES[i % SERIES.length] }} />{nameOf(i)} <b>{fmt(p[1])}</b></span> : null;
            })}
          </div>
        )}
      </div>
    </div>
  );
}
