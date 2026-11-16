import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { Fault } from '@lib/circuit';
import { LED, LED_COLORS } from '@lib/circuit';
import { legsCentre, PART_KINDS } from '@lib/editor';
import { BASICS, checkLearn, IDEAS, SENSORS } from '@lib/learn';
import type { ProjectDoc } from '@lib/project';
import { App } from '../../src/renderer/app/App';
import type { StartRun } from '../../src/renderer/app/useRun';
import { LEARN } from '../../src/renderer/learn/content';
import { FIGURES } from '../../src/renderer/learn/figures';
import { Learn } from '../../src/renderer/learn/Learn';
import type { RunEvents } from '../../src/renderer/sim-client';
import { fakeApi } from './fake-api';
import { newProjectFromStart } from './new-project';
import { partsPanel, startBuilding } from './start-building';

/** M8 slice 8.1 (screens 30, 30b, 30c; F-40, F-42, F-44): Learn's home, a part's page drawn from library/learn with
 *  its picture to play with and its numbers from the simulator, the glossary's words, the search, and the ways in. */
const nav = () => screen.getByRole('navigation', { name: 'Learn' });
const main = (name: string) => screen.getByRole('main', { name });
const section = (name: string) => screen.getByRole('region', { name });

/** Learn alone, going where it is sent. */
function Alone({ start = 'home' }: { start?: string }) {
  const [at, setAt] = useState(start);
  return <Learn at={at} onAt={setAt} />;
}

describe('M8.1 the checker, with the app\'s pictures', () => {
  it('every page of library/learn has every section, a picture the app has, no code, no board, its words in the glossary', () => {
    expect(checkLearn(LEARN, { parts: [...PART_KINDS.map((k) => k.type as string), 'breadboard'], figures: Object.keys(FIGURES) })).toEqual([]);
  });
});

describe('M8.1 Learn\'s home (screen 30)', () => {
  it('the Basics, the big ideas and the sensors; a part whose page is written opens it, the others say soon', () => {
    render(<Alone />);
    const home = main('Learn home');
    expect(within(home).getByRole('heading', { name: 'How electronics works' })).toBeInTheDocument();
    const basics = within(home).getByRole('region', { name: 'Basics' });
    expect(basics).toHaveTextContent(`${BASICS.length} parts`);
    for (const b of BASICS) expect(basics).toHaveTextContent(b.title);
    expect(within(basics).getByRole('button', { name: /^LED/ })).toHaveTextContent('A tiny light that lets current go one way only.');
    // slice 8.2: every basic part's page is written
    expect(within(basics).getAllByRole('button').map((b) => b.querySelector('b')!.textContent)).toEqual(BASICS.map((b) => b.title));
    for (const i of IDEAS) expect(within(home).getByRole('region', { name: 'Big ideas' })).toHaveTextContent(i.title);
    const sensors = within(home).getByRole('region', { name: 'Sensors' });
    for (const s of SENSORS) expect(sensors).toHaveTextContent(s.title);
    // a page not written yet is listed, quieter, and opens nothing
    expect(within(sensors).queryByRole('button', { name: /^Ultrasonic/ })).toBeNull();
    expect(within(sensors).getByLabelText('Ultrasonic HC-SR04: its page comes soon')).toHaveTextContent('soon');

    fireEvent.click(within(basics).getByRole('button', { name: /^LED/ }));
    expect(main('LED')).toBeInTheDocument();
  });

  it('the list at the left: home, the parts by group, the ideas, the glossary — the page shown is marked', () => {
    render(<Alone />);
    expect(within(nav()).getByRole('button', { name: 'Learn home' })).toHaveAttribute('aria-current', 'page');
    const basics = within(nav()).getByRole('group', { name: 'Basics' });
    expect(within(basics).getAllByRole('button').map((b) => b.lastChild!.textContent)).toEqual(BASICS.map((b) => b.title));   // after its small picture
    expect(within(nav()).getByRole('group', { name: 'Sensors' })).toHaveTextContent('Ultrasonic HC-SR04soon');
    fireEvent.click(within(basics).getByRole('button', { name: 'Potentiometer' }));
    expect(within(basics).getByRole('button', { name: 'Potentiometer' })).toHaveAttribute('aria-current', 'page');
    expect(within(nav()).getByRole('button', { name: 'Learn home' })).not.toHaveAttribute('aria-current');
    expect(main('Potentiometer')).toBeInTheDocument();
    fireEvent.click(within(nav()).getByRole('button', { name: 'Glossary' }));
    expect(main('Glossary')).toHaveTextContent('How much electricity flows past a point each second.');
  });
});

describe('M8.1 a part\'s page: the LED (screen 30b)', () => {
  it('what it is and where you meet it; its five sections, numbered, the first two beside the heading', () => {
    render(<Alone start="led" />);
    const page = main('LED');
    expect(within(page).getByRole('heading', { level: 1, name: 'LED' })).toBeInTheDocument();
    expect(page).toHaveTextContent('Basics · light');
    expect(page).toHaveTextContent('A tiny light. It glows when a small current flows through it — but only one way round. LED means light-emitting diode.');
    expect(within(page).getByLabelText('Where you meet it')).toHaveTextContent('a power lighttraffic lightstorchesscreens are millions of them');
    expect(within(page).getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(['1Look inside', '2The idea', '3Its numbers', '4Connect it', '5Mistakes']);
    const [left, right] = [...page.querySelectorAll('.lcol')];
    expect(within(left as HTMLElement).getAllByRole('region').map((r) => r.getAttribute('aria-label'))).toEqual(['Look inside', 'The idea']);
    expect(within(right as HTMLElement).getAllByRole('region').map((r) => r.getAttribute('aria-label'))).toEqual(['Its numbers', 'Connect it', 'Mistakes']);
  });

  it('its numbers are the simulator\'s: the push it needs, the best current, the most it can take; its resistors', () => {
    render(<Alone start="led" />);
    const rows = within(section('Its numbers')).getAllByRole('row').map((r) => within(r).getAllByRole('cell').map((c) => c.textContent));
    expect(rows[0]).toEqual(['Push it needs', `≈ ${Math.round(LED_COLORS.red!.vf)} V`, 'red, yellow, green: about 2 V; blue and white: about 3 V']);
    expect(rows[1]!.slice(0, 2)).toEqual(['Best current', `${(LED.ratedA * 1000) / 2}–${LED.ratedA * 1000} mA`]);
    expect(rows[2]!.slice(0, 2)).toEqual(['Most it can take', `${LED.maxA * 1000} mA`]);
    expect(section('Connect it')).toHaveTextContent('3 V battery68 Ω5 V supply220 Ω6 V (4×AA)270 Ω9 V battery470 Ω');
    expect(section('Connect it')).toHaveTextContent('divide by the current you want (0.015 A)');
  });

  it('look inside is the picture to play with: sliding the current past the most burns the chip', () => {
    render(<Alone start="led" />);
    const look = section('Look inside');
    expect(within(look).getByRole('img', { name: /An LED cut open: 15 mA flows through it, it shines bright/ })).toBeInTheDocument();
    const slider = within(look).getByRole('slider', { name: 'Current through it' });
    slider.focus();
    fireEvent.keyDown(slider, { key: 'End' });
    expect(within(look).getByRole('img', { name: /it has burnt out and is dark/ })).toBeInTheDocument();
    // the connection's picture, in its own section
    expect(within(section('Connect it')).getByRole('img', { name: /How to connect an LED/ })).toBeInTheDocument();
  });

  it('the idea in its box; the mistakes, the one that breaks something marked', () => {
    render(<Alone start="led" />);
    expect(section('The idea').querySelector('.idea')).toHaveTextContent('An LED is a one-way door for current.');
    const mistakes = [...section('Mistakes').querySelectorAll('.mistake')];
    expect(mistakes.map((m) => m.querySelector('b')!.textContent)).toEqual(['No resistor', 'The wrong way round', 'Both legs in one column']);
    expect(mistakes.map((m) => !!m.querySelector('.mi.bad'))).toEqual([true, false, false]);
  });

  it('a word with a dotted line opens its lines from the glossary; again, Esc or a click elsewhere closes them', () => {
    render(<Alone start="led" />);
    const word = within(main('LED')).getByRole('button', { name: 'current' });
    expect(word).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(word);
    expect(word).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('note', { name: 'current: what it means' })).toHaveTextContent('How much electricity flows past a point each second. Measured in amps (A); small currents in milliamps (mA): 1000 mA = 1 A.');
    fireEvent.click(word);
    expect(screen.queryByRole('note', { name: 'current: what it means' })).toBeNull();
    fireEvent.click(word);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('note', { name: 'current: what it means' })).toBeNull();
    fireEvent.click(word);
    fireEvent.mouseDown(within(main('LED')).getByRole('heading', { level: 1 }));
    expect(screen.queryByRole('note', { name: 'current: what it means' })).toBeNull();
    // another page starts with none open
    fireEvent.click(word);
    fireEvent.click(within(nav()).getByRole('button', { name: 'Potentiometer' }));
    expect(screen.queryByRole('note')).toBeNull();
  });
});

describe('M8.1 a page you play with: the potentiometer (screen 30c)', () => {
  it('look inside beside the heading, the rest at the right; its legs and how to connect it', () => {
    render(<Alone start="potentiometer" />);
    const page = main('Potentiometer');
    expect(within(page).getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(['1Look inside', '2The idea', '3Its numbers', '4Its legs and how to connect it', '5Mistakes']);
    const [left, right] = [...page.querySelectorAll('.lcol')];
    expect(within(left as HTMLElement).getAllByRole('region')).toHaveLength(1);
    expect(within(right as HTMLElement).getAllByRole('region')).toHaveLength(4);
    expect(section('Its numbers')).toHaveTextContent('Whole track10 kΩbetween legs 1 and 3, whatever the knob says');
    expect(section('Its legs and how to connect it')).toHaveTextContent('Leg 3other endto + (3.3 V); swap 1 and 3 and the knob works backwards');
  });

  it('turning the knob moves leg 2\'s volts, as the simulator works them out: a quarter turn of 3.3 V is 0.83 V', () => {
    render(<Alone start="potentiometer" />);
    const look = section('Look inside');
    expect(within(look).getByRole('img', { name: /leg 2 gets 0.83 V of 3.3 V/ })).toBeInTheDocument();
    const knob = within(look).getByRole('slider', { name: 'Turn the knob' });
    knob.focus();
    fireEvent.keyDown(knob, { key: 'End' });
    expect(within(look).getByRole('img', { name: /leg 2 gets 3.3 V of 3.3 V/ })).toBeInTheDocument();
  });

  it('a word shown one way and kept under another: GND opens ground', () => {
    render(<Alone start="potentiometer" />);
    fireEvent.click(within(main('Potentiometer')).getByRole('button', { name: 'GND' }));
    expect(screen.getByRole('note', { name: 'ground: what it means' })).toHaveTextContent('The − side of the circuit');
  });
});

describe('M8.2 every basic part\'s page', () => {
  it.each(BASICS.map((b) => [b.title, b.id] as const))('%s: its five sections, its picture to play with, its numbers and its mistakes', (title, id) => {
    render(<Alone start={id} />);
    const page = main(title);
    expect(within(page).getByRole('heading', { level: 1, name: title })).toBeInTheDocument();
    expect(within(page).getAllByRole('heading', { level: 2 })).toHaveLength(5);
    expect(within(section('Look inside')).getAllByRole('img').length).toBeGreaterThan(0);
    expect(section('Look inside').querySelector('.says')).not.toBeNull();
    expect(within(section('Its numbers')).getAllByRole('row').length).toBeGreaterThanOrEqual(3);
    expect(section('Mistakes').querySelectorAll('.mistake').length).toBeGreaterThanOrEqual(2);
    // no number was left as a token
    expect(page.textContent).not.toMatch(/[{}]/);
  });

  it('the RGB LED\'s and the LDR\'s numbers are the simulator\'s', () => {
    render(<Alone start="rgb-led" />);
    expect(section('Connect it')).toHaveTextContent('5 V, red220 Ω5 V, green150 Ω5 V, blue150 Ω');
    fireEvent.click(within(nav()).getByRole('button', { name: 'Light sensor (LDR)' }));
    expect(section('Its numbers')).toHaveTextContent('In dim lightabout 15 kΩ');
    expect(section('Connect it')).toHaveTextContent('3 V battery, nearly dark0.4 V3 V battery, a bright room2.3 V');
  });
});

describe('M8.1 the search (F-44)', () => {
  it('finds pages and glossary words as it is typed; a page found opens, and the search is over', () => {
    render(<Alone />);
    fireEvent.change(within(nav()).getByRole('textbox', { name: 'Search Learn' }), { target: { value: 'knob' } });
    const found = main('Search');
    expect(found).toHaveTextContent('1 page and 0 words for “knob”.');
    fireEvent.click(within(found).getByRole('button', { name: /^Potentiometer/ }));
    expect(main('Potentiometer')).toBeInTheDocument();
    expect(within(nav()).getByRole('textbox', { name: 'Search Learn' })).toHaveValue('');
  });

  it('a glossary word found shows its lines; nothing found says so; a page not written yet is named as coming', () => {
    render(<Alone />);
    const box = within(nav()).getByRole('textbox', { name: 'Search Learn' });
    fireEvent.change(box, { target: { value: 'short circuit' } });
    expect(main('Search')).toHaveTextContent('A path from + straight to − with nothing to hold the current back.');
    fireEvent.change(box, { target: { value: 'zebra' } });
    expect(main('Search')).toHaveTextContent('Nothing in Learn matches “zebra”.');
    fireEvent.change(box, { target: { value: 'ultrasonic' } });
    expect(main('Search')).toHaveTextContent('Coming soon: Ultrasonic HC-SR04.');
    fireEvent.change(box, { target: { value: '' } });
    expect(main('Learn home')).toBeInTheDocument();
  });
});

// ------------------------------------------------------------------ in the app: the tab, and the ways in
function fakeSim() {
  const runs: { doc: ProjectDoc; events: RunEvents }[] = [];
  const start: StartRun = (req, events) => {
    runs.push({ ...req, events });
    return { stop: vi.fn(), setInput: vi.fn() };
  };
  const say = (f: (e: RunEvents) => void) => act(() => f(runs.at(-1)!.events));
  return {
    start,
    fault: (f: Fault) => say((e) => e.onFault?.(f)),
    end: (ended: string, faults: Fault[], extra: object) =>
      say((e) => e.onEnd({ output: '', trace: [], pwm: [], analog: [], display: [], sound: [], bus: [], parts: [], faults, ended, ...extra } as never)),
  };
}

async function workspace() {
  const sim = fakeSim();
  render(<App api={fakeApi()} width={1440} startRun={sim.start} />);
  await newProjectFromStart('New Pico W project');
  startBuilding();
  const svg = screen.getByRole('application', { name: 'Circuit canvas' });
  const [vx, vy] = svg.getAttribute('viewBox')!.split(' ').map(Number) as [number, number];
  const place = (name: RegExp, type: string, hole: string) => {
    const c = svg.querySelector(`[data-point="${hole}"]`)!;
    const [cx, cy] = legsCentre(type);
    const at = { clientX: Number(c.getAttribute('cx')) + cx - vx, clientY: Number(c.getAttribute('cy')) + cy - vy, button: 0 };
    fireEvent.mouseDown(within(partsPanel()).getByRole('button', { name }), { clientX: 5, clientY: 5, button: 0 });
    fireEvent.mouseMove(svg, at);
    fireEvent.mouseUp(svg, at);
  };
  return { sim, svg, place };
}

describe('M8.1 Learn in the app', () => {
  it('the Learn tab opens Learn\'s home; with no project open there is no way back to one', () => {
    render(<App api={fakeApi()} width={1440} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Learn' }));
    expect(main('Learn home')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Back to my project' })).toBeNull();
  });

  it('with a project open, Learn\'s top bar has the modes and Back to my project; the page is kept for the next visit', async () => {
    await workspace();
    fireEvent.click(screen.getByRole('tab', { name: 'Learn' }));
    expect(screen.queryByRole('button', { name: 'Run main.py' })).toBeNull();
    fireEvent.click(within(nav()).getByRole('button', { name: 'LED' }));
    fireEvent.click(screen.getByRole('button', { name: 'Back to my project' }));
    expect(screen.getByRole('tab', { name: 'Workspace' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('application', { name: 'Circuit canvas' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Learn' }));
    expect(main('LED')).toBeInTheDocument();
  });
});

describe('M8.1 the ways in from the workspace (F-44)', () => {
  it('the parts panel: a part with a page has Learn about it beside it; one without has not', async () => {
    await workspace();
    const panel = partsPanel();
    expect(within(within(panel).getByRole('button', { name: /^Servo SG90/ }).parentElement!).getAllByRole('button')).toHaveLength(1);
    // the potentiometer's own row (the potentiometer module, further down, opens the same page)
    const row = within(panel).getByRole('button', { name: /^Potentiometer10 kΩ/ }).parentElement!;
    fireEvent.click(within(row).getByRole('button', { name: 'Learn about the potentiometer' }));
    expect(screen.getByRole('tab', { name: 'Learn' })).toHaveAttribute('aria-selected', 'true');
    expect(main('Potentiometer')).toBeInTheDocument();
  });

  it('a module that repeats a basic part opens that part\'s page: the traffic light module, the LED\'s', async () => {
    await workspace();
    const row = within(partsPanel()).getByRole('button', { name: /^Traffic light module/ }).parentElement!;
    fireEvent.click(within(row).getByRole('button', { name: 'Learn about the LED' }));
    expect(main('LED')).toBeInTheDocument();
  });

  it('the inspector: the selected part\'s page', async () => {
    const s = await workspace();
    s.place(/^LED/, 'led', 'bb1.e20');
    fireEvent.click(within(screen.getByRole('complementary', { name: 'Inspector' })).getByRole('button', { name: 'Learn about the LED' }));
    expect(main('LED')).toBeInTheDocument();
    // and back: the part is still there
    fireEvent.click(screen.getByRole('button', { name: 'Back to my project' }));
    expect(screen.getByRole('application', { name: 'Circuit canvas' }).querySelector('[data-part="led1"]')).not.toBeNull();
  });

  it('a part on the canvas: right-click → Learn about this; a part with no page has no menu; Esc puts it away', async () => {
    const s = await workspace();
    s.place(/^LED/, 'led', 'bb1.e20');
    s.place(/^Servo SG90/, 'servo', 'bb1.c5');
    fireEvent.contextMenu(s.svg.querySelector('[data-part="servo1"]')!);
    expect(screen.queryByRole('menu')).toBeNull();
    fireEvent.contextMenu(s.svg.querySelector('[data-part="led1"]')!);
    expect(screen.getByRole('menu', { name: 'LED' })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    fireEvent.contextMenu(s.svg.querySelector('[data-part="led1"]')!);
    fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: 'Learn about this' }));
    expect(main('LED')).toBeInTheDocument();
  });

  it('a fault\'s card: Show me how opens the burnt LED\'s page (screen 04)', async () => {
    const s = await workspace();
    s.place(/^LED/, 'led', 'bb1.e20');
    const burnt: Fault = { kind: 'led-burnt', severity: 'damage', on: 'led1', amps: 0.048, limitA: 0.03, ratedA: 0.02, via: 'GP13', atMs: 1400 };
    fireEvent.click(screen.getByRole('button', { name: 'Run main.py' }));
    s.sim.fault(burnt);
    s.sim.end('fault', [burnt], { fault: { ...burnt, message: '' } });
    fireEvent.click(within(screen.getByRole('group', { name: 'LED1 burnt out' })).getByRole('button', { name: 'Show me how' }));
    expect(main('LED')).toBeInTheDocument();
  });
});
