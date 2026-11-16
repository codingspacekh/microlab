import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BATTERIES, BUZZER, echoUs, LED, LED_COLORS, ldrOhms, POWER_SUPPLY, RGB_DIES, SENSORS as SIM_SENSORS } from '../../../src/lib/circuit';
import { PART_KINDS } from '../../../src/lib/editor';
import {
  BASICS, BATTERY_MAH, checkGlossary, checkLearn, checkPage, IDEAS, inline, LDR_PARTNER_OHMS, LEARN_NUMBERS, learnNumber, learnPageFor, loadLearn, parseGlossary, parsePage,
  plainText, searchLearn, SENSORS, type CheckContext, type LearnPage,
} from '../../../src/lib/learn';

/** library/learn as the app reads it: every file's text by its path. */
function library(): Record<string, string> {
  const root = join(__dirname, '../../../library/learn');
  const files: Record<string, string> = {};
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, e.name);
      if (e.isDirectory()) walk(path); else files[path.replaceAll('\\', '/')] = readFileSync(path, 'utf8');
    }
  };
  walk(root);
  return files;
}

const PARTS = [...PART_KINDS.map((k) => k.type as string), 'breadboard'];

const PAGE = `---
id: lamp
kind: part
part: led
title: Lamp
tag: Basics · light
card: A light.
uses: torches | a power light
---
A light. It needs a [current].

## Look inside
figure: lamp-inside

## The idea
A **one-way door** for *current*.

## Its numbers
| Most | {led.max} mA | more, and it burns |
| Legs | long +, short − | the flat edge |

## Connect it
With a resistor.

= 9 V battery: {led.resistor:9} Ω
= 3 V battery: {led.resistor:3} Ω

> A bigger one is safe.

## Mistakes
- ! **No resistor** It burns out.
- **Turned round** It stays dark: see [the pot](pot).
`;

const ctx = (more: Partial<CheckContext> = {}): CheckContext => ({
  pages: ['lamp', 'pot'], parts: PARTS, figures: ['lamp-inside'],
  glossary: parseGlossary('## current\nWhat flows.\n').words, ...more,
});

describe('M8.1 a Learn page as it is written', () => {
  it('its heading lines, what it is, and its sections in order', () => {
    const page = parsePage(PAGE);
    expect(page).toMatchObject({ id: 'lamp', kind: 'part', part: 'led', title: 'Lamp', tag: 'Basics · light', card: 'A light.', uses: ['torches', 'a power light'], left: 1, problems: [] });
    expect(plainText(page.lede)).toBe('A light. It needs a current.');
    expect(page.sections.map((s) => s.title)).toEqual(['Look inside', 'The idea', 'Its numbers', 'Connect it', 'Mistakes']);
  });

  it('a picture, a paragraph with bold and italic, a table, worked values, a small note, mistakes', () => {
    const [look, idea, numbers, connect, mistakes] = parsePage(PAGE).sections;
    expect(look!.blocks).toEqual([{ t: 'figure', name: 'lamp-inside' }]);
    expect(idea!.blocks).toEqual([{ t: 'p', kids: [
      { t: 'text', text: 'A ' }, { t: 'b', kids: [{ t: 'text', text: 'one-way door' }] }, { t: 'text', text: ' for ' },
      { t: 'i', kids: [{ t: 'text', text: 'current' }] }, { t: 'text', text: '.' },
    ] }]);
    const table = numbers!.blocks[0]!;
    expect(table.t === 'table' && table.rows.map((r) => r.map(plainText))).toEqual([['Most', '30 mA', 'more, and it burns'], ['Legs', 'long +, short −', 'the flat edge']]);
    expect(connect!.blocks).toEqual([
      { t: 'p', kids: [{ t: 'text', text: 'With a resistor.' }] },
      { t: 'calc', cells: [{ label: '9 V battery', value: '470 Ω' }, { label: '3 V battery', value: '68 Ω' }] },
      { t: 'p', small: true, kids: [{ t: 'text', text: 'A bigger one is safe.' }] },
    ]);
    const list = mistakes!.blocks[0]!;
    expect(list.t === 'mistakes' && list.items.map((m) => [m.bad, m.title, plainText(m.kids)])).toEqual([
      [true, 'No resistor', 'It burns out.'], [false, 'Turned round', 'It stays dark: see the pot.'],
    ]);
  });

  it('a glossary word, shown as written or by another word; a link to a page', () => {
    expect(inline('a [Current] and [GND = ground], see [the **pot**](pot).')).toEqual([
      { t: 'text', text: 'a ' }, { t: 'word', word: 'current', text: 'Current' }, { t: 'text', text: ' and ' },
      { t: 'word', word: 'ground', text: 'GND' }, { t: 'text', text: ', see ' },
      { t: 'link', page: 'pot', kids: [{ t: 'text', text: 'the ' }, { t: 'b', kids: [{ t: 'text', text: 'pot' }] }] }, { t: 'text', text: '.' },
    ]);
  });

  it('a mark with no partner is only itself: 2 * 3, a lone [ and a lone **', () => {
    expect(plainText(inline('2 * 3 [ and ** end'))).toBe('2 * 3 [ and ** end');
    expect(plainText(inline('[word](page'))).toBe('word(page');
  });

  it('paragraphs are parted by an empty line; lines of one are joined', () => {
    const page = parsePage('---\nid: a\n---\nWhat\nit is.\n\n## One\nfirst\nline\n\nsecond\n');
    expect(plainText(page.lede)).toBe('What it is.');
    expect(page.sections[0]!.blocks.map((b) => b.t === 'p' && plainText(b.kids))).toEqual(['first line', 'second']);
  });

  it('says what it could not read: no heading lines, a line that is not one, an unknown number or kind', () => {
    expect(parsePage('## Look inside\n').problems).toEqual(['the page does not start with its heading lines between two --- lines']);
    const page = parsePage('---\nid: a\ncolour: red\nnonsense\nkind: toy\nleft: many\n---\n{led.nothing} mA\n');
    expect(page.problems).toEqual([
      'heading line “nonsense” is not “name: value”', 'heading line “colour” is not one a page has',
      '{led.nothing} is not a number of the simulator', 'kind “toy” is not part, idea or board',
    ]);
    expect(page).toMatchObject({ kind: 'part', left: 1 });
    expect(plainText(page.lede)).toBe('{led.nothing} mA');
  });

  it('code is kept out of the page, and seen', () => {
    const page = parsePage('---\nid: a\n---\nWhat.\n\n## One\nbefore\n```\nled.on()\n```\nafter\n');
    expect(page.sections[0]!.blocks.map((b) => b.t)).toEqual(['p', 'code', 'p']);
  });

  it('Windows line ends read the same', () => {
    expect(parsePage(PAGE.replaceAll('\n', '\r\n'))).toEqual(parsePage(PAGE));
  });
});

describe('M8.1 the glossary as it is written', () => {
  it('each word under its heading; what is above the first is not a word', () => {
    const { words, problems } = parseGlossary('# Words\nabout them\n\n## Short circuit\nFrom + to −\nwith nothing between.\n\n## current\nWhat flows: see [short circuit].\n');
    expect(problems).toEqual([]);
    expect(Object.keys(words)).toEqual(['short circuit', 'current']);
    expect(words['short circuit']).toMatchObject({ word: 'Short circuit', text: 'From + to − with nothing between.' });
    expect(checkGlossary(words)).toEqual([]);
  });

  it('a word twice, a word that says nothing, a word underlined that it has not, code', () => {
    const { words, problems } = parseGlossary('## current\nWhat `flows`, as [water].\n## Current\nAgain.\n## amp\n');
    expect(problems).toEqual(['the glossary has “Current” twice', 'the glossary\'s “amp” says nothing']);
    expect(checkGlossary(parseGlossary('## current\nWhat `flows`, as [water].\n').words)).toEqual([
      'the glossary\'s “current” underlines “water”, which it does not have', 'the glossary\'s “current” has code',
    ]);
    expect(Object.keys(words)).toEqual(['current', 'amp']);
  });
});

describe('M8.1 the numbers are the simulator\'s', () => {
  it('an LED\'s currents and forward voltages', () => {
    expect(learnNumber('led.rated')).toBe(String(LED.ratedA * 1000));
    expect(learnNumber('led.max')).toBe(String(LED.maxA * 1000));
    expect(learnNumber('led.dim')).toBe('10');
    expect(learnNumber('led.best')).toBe('15');
    expect(learnNumber('led.best.A')).toBe('0.015');
    expect(learnNumber('led.vf')).toBe(String(Math.round(LED_COLORS.red!.vf)));
    expect(learnNumber('led.vf:blue')).toBe(String(Math.round(LED_COLORS.blue!.vf)));
    expect(learnNumber('led.vf:pink')).toBeUndefined();
  });

  it('the resistor for an LED: what is left of the volts over 15 mA, the next common value above (screen 30b)', () => {
    expect(['3', '5', '6', '9'].map((v) => learnNumber(`led.resistor:${v}`))).toEqual(['68', '220', '270', '470']);
    expect(learnNumber('led.resistor:1.5')).toBeUndefined();   // not enough to open the door
    expect(learnNumber('led.resistor')).toBeUndefined();
    expect(learnNumber('led.resistor:lots')).toBeUndefined();
  });

  it('the potentiometer\'s track, the supply\'s volts, a battery pack\'s', () => {
    expect(learnNumber('pot.track.k')).toBe('10');
    expect(learnNumber('supply.low')).toBe(String(Math.min(...POWER_SUPPLY.choices)));
    expect(learnNumber('supply.high')).toBe(String(Math.max(...POWER_SUPPLY.choices)));
    expect(learnNumber('battery.volts:4xAA')).toBe(String(BATTERIES['4xAA']!.volts));
    expect(learnNumber('battery.volts:car')).toBeUndefined();
    expect(learnNumber('nothing')).toBeUndefined();
    expect(LEARN_NUMBERS).toContain('led.max');
  });
});

describe('M8.2 the basic parts\' numbers are the simulator\'s too', () => {
  it('the RGB LED\'s three chips and their resistors on 5 V (15 mA each)', () => {
    expect(['r', 'g', 'b'].map((leg) => learnNumber(`rgb.vf:${leg}`))).toEqual(RGB_DIES.map((d) => String(Math.round(d[2]))));
    expect(['r', 'g', 'b'].map((leg) => learnNumber(`rgb.resistor:5,${leg}`))).toEqual(['220', '150', '150']);
    expect(learnNumber('rgb.vf:x')).toBeUndefined();
    expect(learnNumber('rgb.resistor:5,x')).toBeUndefined();
    expect(learnNumber('rgb.resistor:2,g')).toBeUndefined();   // 2 V does not open a 3 V chip
    expect(learnNumber('rgb.resistor')).toBeUndefined();
  });

  it('the LDR: its resistance by the light, and the volts it gives with its 10 kΩ partner on 3 V', () => {
    expect(learnNumber('ldr.dark.M')).toBe(String(ldrOhms(0) / 1e6));
    expect(learnNumber('ldr.k:10')).toBe(String(ldrOhms(10) / 1000));
    expect(learnNumber('ldr.k:100')).toBe('3');
    expect(learnNumber('ldr.partner.k')).toBe(String(LDR_PARTNER_OHMS / 1000));
    expect(learnNumber('ldr.battery')).toBe(String(BATTERIES['2xAA']!.volts));
    const volts = (lux: number) => (BATTERIES['2xAA']!.volts * LDR_PARTNER_OHMS) / (ldrOhms(lux) + LDR_PARTNER_OHMS);
    expect(learnNumber('ldr.volts:1')).toBe(volts(1).toFixed(1));
    expect(learnNumber('ldr.volts:100')).toBe(volts(100).toFixed(1));
    expect(learnNumber('ldr.volts')).toBeUndefined();
    expect(learnNumber('ldr.k:-5')).toBeUndefined();
    expect(learnNumber('ldr.k')).toBeUndefined();
  });

  it('the buzzer, a strip of the breadboard, the battery\'s cells and how long they last', () => {
    expect(learnNumber('buzzer.hz')).toBe(String(BUZZER.active.hz));
    expect(learnNumber('buzzer.volts')).toBe(String(BUZZER.active.minVolts));
    expect(learnNumber('buzzer.swing')).toBe(String(BUZZER.passive.minSwing));
    expect(learnNumber('breadboard.strip')).toBe('5');
    expect(learnNumber('battery.cell.volts')).toBe('1.5');
    expect(learnNumber('battery.mah:2xAA')).toBe(String(BATTERY_MAH['2xAA']));
    expect(learnNumber('battery.mah:9V')).toBe('500');
    expect(learnNumber('battery.mah:car')).toBeUndefined();
    expect(learnNumber('battery.hours:2xAA,15')).toBe('130');   // 2000 mAh ÷ 15 mA = 133 h, said as about 130
    expect(learnNumber('battery.hours:car,15')).toBeUndefined();
    expect(learnNumber('battery.hours:2xAA,0')).toBeUndefined();
    expect(learnNumber('battery.hours')).toBeUndefined();
  });
});

describe('M8.4 the sensors\' numbers are the simulator\'s', () => {
  it('the ultrasonic sensor: its reach, the echo\'s time for each cm, and for 100 cm', () => {
    const s = SIM_SENSORS['hc-sr04'];
    expect([learnNumber('sonar.us'), learnNumber('sonar.min'), learnNumber('sonar.max'), learnNumber('sonar.volts')]).toEqual([s.usPerCm, s.minCm, s.maxCm, s.minVolts].map(String));
    expect(learnNumber('sonar.ms:100')).toBe(String(echoUs(100) / 1000));
    expect(learnNumber('sonar.ms')).toBeUndefined();
    expect(learnNumber('sonar.ms:-3')).toBeUndefined();
  });

  it('the DHT\'s two kinds, the PIR, the line sensor, the soil sensor', () => {
    expect(['tmin', 'tmax', 'hmin', 'hmax'].map((n) => learnNumber(`dht.${n}:DHT11`))).toEqual(['0', '50', '20', '90']);
    expect(['tmin', 'tmax', 'hmin', 'hmax'].map((n) => learnNumber(`dht.${n}:DHT22`))).toEqual(['-40', '80', '0', '100']);
    expect(['tmin', 'tmax', 'hmin', 'hmax'].map((n) => learnNumber(`dht.${n}:DHT33`))).toEqual([undefined, undefined, undefined, undefined]);
    expect(learnNumber('dht.volts')).toBe(String(SIM_SENSORS.dht.minVolts));
    expect([learnNumber('pir.hold'), learnNumber('pir.volts'), learnNumber('pir.high')]).toEqual([SIM_SENSORS.pir.holdS, SIM_SENSORS.pir.minVolts, SIM_SENSORS.pir.high].map(String));
    expect(learnNumber('line.volts')).toBe(String(SIM_SENSORS['line-sensor'].minVolts));
    expect([learnNumber('soil.dry'), learnNumber('soil.wet'), learnNumber('soil.volts')]).toEqual(
      [SIM_SENSORS['soil-moisture'].dry, SIM_SENSORS['soil-moisture'].wet, SIM_SENSORS['soil-moisture'].minVolts].map(String));
  });

  it('the temperature chips: 10 mV a degree, the TMP36\'s half volt, what each gives at 22 °C', () => {
    expect(learnNumber('temp.mv')).toBe('10');
    expect([learnNumber('temp.offset:TMP36'), learnNumber('temp.min:TMP36'), learnNumber('temp.max:TMP36'), learnNumber('temp.supply:TMP36')]).toEqual(['0.5', '-40', '125', '2.7']);
    expect([learnNumber('temp.offset:LM35'), learnNumber('temp.min:LM35'), learnNumber('temp.max:LM35'), learnNumber('temp.supply:LM35')]).toEqual(['0', '0', '150', '4']);
    expect(learnNumber('temp.out:TMP36,22')).toBe('0.72');
    expect(learnNumber('temp.out:LM35,22')).toBe('0.22');
    expect(learnNumber('temp.out:TMP36,-10')).toBe('0.4');
    for (const bad of ['temp.out:TMP36', 'temp.out:PT100,22', 'temp.out:TMP36,warm', 'temp.out', 'temp.offset:PT100', 'temp.min:x', 'temp.max:x', 'temp.supply:x']) {
      expect(learnNumber(bad), bad).toBeUndefined();
    }
  });
});

describe('M8.1 the checker: every section, a picture, no code, no board, every word in the glossary', () => {
  const said = (source: string, more?: Partial<CheckContext>) => checkPage(parsePage(source), ctx(more));

  it('a whole page has nothing said about it', () => {
    expect(said(PAGE)).toEqual([]);
    expect(said(PAGE.replace('## Connect it', '## Its legs and how to connect it'))).toEqual([]);
    expect(said(PAGE, { figures: undefined })).toEqual([]);
  });

  it('a section missing, or out of order, or one too many', () => {
    expect(said(PAGE.replace('## The idea\nA **one-way door** for *current*.\n', ''))).toEqual(['it has no “The idea” section']);
    const swapped = PAGE.replace('## Look inside\nfigure: lamp-inside\n\n', '').replace('## Mistakes', '## Look inside\nfigure: lamp-inside\n\n## Mistakes');
    expect(said(swapped)).toEqual(['its sections are not Look inside · The idea · Its numbers · Connect it · Mistakes, in that order']);
    expect(said(`${PAGE}\n## More\nwords\n`)).toEqual(['its sections are not Look inside · The idea · Its numbers · Connect it · Mistakes, in that order']);
  });

  it('no picture to play with, a picture the app has not, no table of numbers, no mistakes', () => {
    expect(said(PAGE.replace('figure: lamp-inside', 'Look!'))).toEqual(['“Look inside” has no picture to play with']);
    expect(said(PAGE.replace('figure: lamp-inside', 'figure: lamp-outside'))).toEqual(['the app has no picture “lamp-outside”']);
    expect(said(PAGE.replace(/\| .*\|\n/g, 'none\n'))).toEqual(['“Its numbers” has no table']);
    expect(said(PAGE.replace(/- .*\n/g, 'none\n'))).toEqual(['“Mistakes” lists none']);
  });

  it('code, a board\'s name', () => {
    expect(said(PAGE.replace('With a resistor.', 'With `Pin(15)`.'))).toEqual(['it has code: Learn has none']);
    expect(said(PAGE.replace('With a resistor.', '```\nled.on()\n```'))).toEqual(['it has code: Learn has none']);
    expect(said(PAGE.replace('With a resistor.', 'On the Pico W, GP15.'))).toEqual(['it names a board (“Pico”): a part\'s page is about no particular board']);
    expect(said(PAGE.replace('With a resistor.', 'A board\'s analog pin reads it.'))).toEqual([]);
  });

  it('a word the glossary has not, a link to no page, an unknown number', () => {
    expect(said(PAGE, { glossary: {} })).toEqual(['“current” is not in the glossary']);
    expect(said(PAGE, { pages: ['lamp'] })).toEqual(['it links to “pot”, which is not a page']);
    expect(said(PAGE.replace('{led.max}', '{led.most}'))).toEqual(['{led.most} is not a number of the simulator']);
  });

  it('its heading lines: an id, a title, a tag, a card, its part, where you meet it, what it is', () => {
    expect(said('---\nkind: part\nleft: 9\n---\n')).toEqual([
      'it has no id', 'it has no title', 'it has no tag', 'it has no card', 'it does not say what it is, before the first section',
      'it does not name its part', 'it does not say where you meet it (uses)',
      'it has no “Look inside” section', 'it has no “The idea” section', 'it has no “Its numbers” section', 'it has no “Connect it” section', 'it has no “Mistakes” section',
      'more sections are put on the left than it has',
    ]);
    expect(said(PAGE.replace('part: led', 'part: lamp').replace('id: lamp', 'id: The Lamp'))).toEqual([
      'its id “The Lamp” is not small letters, digits and -', '“lamp” is not a part of the parts panel',
    ]);
  });

  it('an ideas page has its own shape (F-45): a picture to play with and the rule; its own glossary\'s words are the glossary\'s', () => {
    const idea = '---\nid: loop\nkind: idea\ntitle: A circuit is a loop\ntag: Big idea\ncard: A loop.\nleft: 2\n---\nCurrent goes round.\n\n'
      + '## Play with it\nfigure: lamp-inside\n\n## The rule\nNo loop, no current.\n\n## Glossary\nwords: Current | circuit\n';
    expect(parsePage(idea).sections[2]!.blocks).toEqual([{ t: 'words', words: ['current', 'circuit'] }]);
    expect(said(idea)).toEqual(['“circuit” is not in the glossary']);
    expect(said(idea.replace(' | circuit', ''))).toEqual([]);
    expect(said(idea.replace('figure: lamp-inside', 'Look.').replace(' | circuit', ''))).toEqual(['it has no picture to play with']);
    expect(said(idea.replace('## The rule', '## Rules').replace(' | circuit', '').replace('left: 2', 'left: 7'))).toEqual([
      'it has no “The rule” section', 'more sections are put on the left than it has',
    ]);
    expect(said(idea.replace('No loop, no current.', 'As on the ESP32.').replace(' | circuit', ''))).toEqual(['it names a board (“ESP32”): an ideas page is about no particular board']);
  });
});

describe('M8.1 Learn as it is: library/learn', () => {
  const learn = loadLearn(library());
  const page = (id: string): LearnPage => learn.pages[id]!;

  it('the checker finds nothing (the pictures\' names are checked beside the pictures, in the component tests)', () => {
    expect(checkLearn(learn, { parts: PARTS })).toEqual([]);
  });

  it('slice 8.2: every basic part has its page', () => {
    expect(BASICS.filter((b) => !learn.pages[b.id]).map((b) => b.id)).toEqual([]);
    for (const b of BASICS) expect(learn.pages[b.id]).toMatchObject({ kind: 'part', part: b.id });
  });

  it('slice 8.4: every sensor of the first release has its page', () => {
    expect(SENSORS.filter((x) => learn.pages[x.id]?.part !== x.id).map((x) => x.id)).toEqual([]);
    for (const word of ['ultrasound', 'infrared', 'humidity']) expect(learn.glossary[word], word).toBeDefined();
  });

  it('slice 8.3: every big idea has its page, and the glossary its words', () => {
    expect(IDEAS.filter((i) => learn.pages[i.id]?.kind !== 'idea').map((i) => i.id)).toEqual([]);
    for (const word of ['voltage', 'current', 'resistance', 'circuit', 'short circuit', 'ground', 'volt', 'amp', 'milliamp', 'ohm', 'ohm\'s law', 'power', 'watt',
      'series', 'parallel', 'conductor', 'insulator', 'polarity', 'anode', 'cathode', 'forward voltage', 'voltage divider', 'digital', 'analog', 'signal', 'pulse',
      'frequency', 'hertz', 'pwm', 'duty', 'sensor', 'actuator', 'pull-up', 'pin', 'bit']) expect(learn.glossary[word], word).toBeDefined();
    // one or two lines each (F-42)
    for (const entry of Object.values(learn.glossary)) expect(entry.text.length, entry.word).toBeLessThan(220);
  });

  it('the potentiometer leads to the idea it leans on (screen 30c)', () => {
    expect(page('potentiometer').text).toContain('(voltage-current-resistance)');
  });

  it('slice 8.1 has the LED and the potentiometer, each about its part', () => {
    expect(Object.keys(learn.pages).sort()).toEqual(expect.arrayContaining(['led', 'potentiometer']));
    expect(page('led')).toMatchObject({ kind: 'part', part: 'led', title: 'LED', left: 2 });
    expect(page('potentiometer')).toMatchObject({ kind: 'part', part: 'potentiometer', title: 'Potentiometer', left: 1 });
  });

  it('the LED\'s numbers are the simulator\'s: about 2 V, 10–20 mA, 30 mA at most; its resistors', () => {
    const numbers = page('led').sections.find((s) => s.title === 'Its numbers')!.blocks[0]!;
    const rows = numbers.t === 'table' ? numbers.rows.map((r) => r.map(plainText)) : [];
    expect(rows[0]!.slice(0, 2)).toEqual(['Push it needs', `≈ ${Math.round(LED_COLORS.red!.vf)} V`]);
    expect(rows[1]![1]).toBe(`${(LED.ratedA / 2) * 1000}–${LED.ratedA * 1000} mA`);
    expect(rows[2]![1]).toBe(`${LED.maxA * 1000} mA`);
    const calc = page('led').sections.find((s) => s.title === 'Connect it')!.blocks.find((b) => b.t === 'calc')!;
    expect(calc.t === 'calc' && calc.cells).toEqual([
      { label: '3 V battery', value: '68 Ω' }, { label: '5 V supply', value: '220 Ω' }, { label: '6 V (4×AA)', value: '270 Ω' }, { label: '9 V battery', value: '470 Ω' },
    ]);
  });

  it('the potentiometer\'s track is the model\'s 10 kΩ, its + the supply\'s 3.3 V', () => {
    expect(page('potentiometer').text).toContain('| Whole track | 10 kΩ |');
    expect(page('potentiometer').text).toContain('to + (3.3 V)');
  });

  it('every page that is written is one Learn lists, under its own name', () => {
    const listed = [...BASICS, ...SENSORS, ...IDEAS];
    expect(new Set(listed.map((l) => l.id)).size).toBe(listed.length);
    for (const p of Object.values(learn.pages)) {
      const entry = listed.find((l) => l.id === p.id);
      expect(entry, p.id).toBeDefined();
      // an ideas page's heading may say more than its line in the list ("Voltage, current and resistance")
      expect(entry).toMatchObject(p.kind === 'part' ? { title: p.title, card: p.card } : { card: p.card });
    }
    // each basic part and sensor listed is a part of the parts panel (the breadboard is its own thing there)
    for (const l of [...BASICS, ...SENSORS]) expect(PARTS, l.id).toContain(l.id);
  });

  it('a part\'s page: its own, the basic part\'s for a module that repeats it, none where none is written', () => {
    expect(learnPageFor(learn, 'led')?.id).toBe('led');
    expect(learnPageFor(learn, 'traffic-module')?.id).toBe('led');
    expect(learnPageFor(learn, 'pot-module')?.id).toBe('potentiometer');
    expect(learnPageFor(learn, 'gps')).toBeUndefined();
  });

  it('the search: a page by its title first, then by its words; glossary words; every word asked must be there', () => {
    expect(searchLearn(learn, 'led').pages[0]!.id).toBe('led');
    expect(searchLearn(learn, 'WIPER').pages.map((p) => p.id)).toEqual(['potentiometer']);
    expect(searchLearn(learn, 'knob').pages.map((p) => p.id)).toContain('potentiometer');
    expect(searchLearn(learn, 'wiper track').pages.map((p) => p.id)).toEqual(['potentiometer']);
    expect(searchLearn(learn, 'wiper zebra')).toEqual({ pages: [], words: [] });
    expect(searchLearn(learn, '   ')).toEqual({ pages: [], words: [] });
    expect(searchLearn(learn, 'current').words[0]!.word).toBe('current');   // the word itself before the words that mention it
    expect(searchLearn(learn, 'current').words.length).toBeGreaterThan(1);
  });
});

describe('M8.1 Learn\'s files', () => {
  it('a page is known by its file\'s name; a second one of a name, and other files, are not read', () => {
    const learn = loadLearn({ 'a/lamp.md': PAGE, 'b/lamp.md': PAGE, 'a/other.md': PAGE, 'a/notes.txt': 'x', 'glossary.md': '## current\n\n## pot\nA knob.\n' });
    expect(Object.keys(learn.pages)).toEqual(['lamp']);
    expect(Object.keys(learn.glossary)).toEqual(['current', 'pot']);
    expect(learn.problems).toEqual(['other.md: its id is “lamp”, not its file\'s name', 'lamp.md: a second page “lamp”', 'glossary.md: the glossary\'s “current” says nothing']);
    expect(checkLearn(learn, { parts: PARTS, figures: ['lamp-inside'] })).toEqual([...learn.problems, 'lamp: it links to “pot”, which is not a page']);
  });
});
