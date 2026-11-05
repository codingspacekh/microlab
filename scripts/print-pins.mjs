// Writes the three boards' pin tables as one printable page, for the teacher's M1 check (docs/acceptance/M1.md).
// Run: npm run pins   → out/pin-tables.html (open it, print, tick each pin against the board)
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const boards = ['pico-w', 'esp32-devkit-v1', 'esp32-devkit-v1-ext', 'microbit-v2'].map((id) =>
  JSON.parse(readFileSync(join(root, 'library/boards', id, 'board.json'), 'utf8')));
const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);

const section = (b) => {
  const rows = b.pins.map((p) => {
    const flags = [p.inputOnly && 'input only', p.noPulls && 'no pulls', p.strapping && 'strapping', p.shared && `shared: ${p.shared}`,
      p.same && `same as ${p.same}`, p.wireOnly && 'wire only (right-angle)']
      .filter(Boolean).join(', ');
    return `<tr><td>${p.number}</td><td><b>${esc(p.label)}</b></td><td>${p.gpio ?? ''}</td><td>${p.role}</td>
      <td>${esc(p.functions.join(', '))}</td><td>${esc(flags)}</td><td>${esc(p.note)}</td><td class="tick"></td></tr>`;
  }).join('\n');
  const supplies = b.supplies.map((s) => `${s.pin} ${s.volts} V${s.choices ? ` (jumper: ${s.choices.join(' or ')} V)` : ''}, up to ${s.maxMa} mA${s.usbOnly ? ' (on USB)' : ''}`).join(' · ');
  return `<section><h2>${esc(b.name)} <small>${esc(b.chip)}</small></h2>
    <p>GPIO: ${b.logicVolts} V logic · a pin should give ≤ ${b.gpio.safeMa} mA · pulls ≈ ${b.gpio.pullOhms / 1000} kΩ
    ${b.gpio.totalMa ? `· all pins together ≤ ${b.gpio.totalMa} mA` : ''} · supplies: ${supplies}</p>
    <p class="est">Estimates to confirm: ${esc(b.estimates.join(', ') || 'none')}</p>
    <table><tr><th>#</th><th>Label</th><th>GPIO</th><th>Role</th><th>Functions</th><th>Flags</th><th>Note</th><th>✓</th></tr>${rows}</table>
    <p class="src">Sources: ${esc(b.sources.join(' · '))}</p></section>`;
};

const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>MicroLab — pin tables (M1 check)</title><style>
body{font:12px/1.4 -apple-system,Segoe UI,sans-serif;margin:24px;color:#1d2330}
h1{font-size:18px}h2{font-size:15px;margin:28px 0 4px}small{color:#667;font-weight:400}
table{border-collapse:collapse;width:100%}th,td{border:1px solid #c9ced8;padding:3px 6px;text-align:left;vertical-align:top}
th{background:#eef1f6}td.tick{width:28px}.est{color:#a05a00}.src{color:#667;font-size:11px}
section{break-after:page}</style></head><body>
<h1>MicroLab — pin tables for the M1 check</h1>
<p>Tick each row against the real board and its official pinout. Write any difference next to the row.</p>
${boards.map(section).join('\n')}
</body></html>`;

const out = join(root, 'out', 'pin-tables.html');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, html);
console.log(`Wrote ${out}`);
