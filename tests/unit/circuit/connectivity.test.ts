import { describe, expect, it } from 'vitest';
import { connect, holes, type CircuitSpec } from '@lib/circuit';
import { parseBoard } from '@lib/boards';
import picoJson from '../../../library/boards/pico-w/board.json';
import espJson from '../../../library/boards/esp32-devkit-v1/board.json';
import mbitJson from '../../../library/boards/microbit-v2/board.json';

const pico = parseBoard(picoJson);
const spec = (s: Partial<CircuitSpec>): CircuitSpec => ({ breadboards: [{ id: 'bb1', size: 'half' }], parts: [], wires: [], ...s });
const same = (c: ReturnType<typeof connect>, a: string, b: string) => c.netOf(a) !== undefined && c.netOf(a) === c.netOf(b);

describe('F-12 breadboard holes', () => {
  it('a half breadboard has 30 columns of a–j and four rails with a gap after every five holes', () => {
    const h = holes('half');
    expect(h).toContain('a1');
    expect(h).toContain('j30');
    expect(h).not.toContain('a31');
    expect(h).toContain('T+5');
    expect(h).not.toContain('T+6');          // the gap
    expect(h).toContain('T+7');
    expect(h.filter((x) => x.startsWith('B-'))).toHaveLength(25);
    expect(h).toHaveLength(30 * 10 + 4 * 25);
  });

  it('a full breadboard has 63 columns', () => {
    expect(holes('full')).toContain('j63');
    expect(holes('full')).not.toContain('a64');
  });
});

describe('F-12 strips: what is joined inside the breadboard', () => {
  const c = connect(spec({}));
  it('a–e of one column are one strip', () => {
    for (const r of 'bcde') expect(same(c, 'bb1.a5', `bb1.${r}5`)).toBe(true);
  });
  it('f–j are another strip: the channel splits the column', () => {
    expect(same(c, 'bb1.f5', 'bb1.j5')).toBe(true);
    expect(same(c, 'bb1.e5', 'bb1.f5')).toBe(false);
  });
  it('columns are not joined to each other', () => {
    expect(same(c, 'bb1.a5', 'bb1.a6')).toBe(false);
  });
  it('each rail runs the whole length; the four rails are separate', () => {
    expect(same(c, 'bb1.T+1', 'bb1.T+29')).toBe(true);
    expect(same(c, 'bb1.B-1', 'bb1.B-29')).toBe(true);
    expect(same(c, 'bb1.T+1', 'bb1.T-1')).toBe(false);
    expect(same(c, 'bb1.T+1', 'bb1.B+1')).toBe(false);
  });
  it('two breadboards are not joined', () => {
    const two = connect(spec({ breadboards: [{ id: 'bb1', size: 'half' }, { id: 'bb2', size: 'half' }] }));
    expect(same(two, 'bb1.a5', 'bb2.a5')).toBe(false);
  });
  it('pointsInNet lists everything joined to a hole (hover highlight)', () => {
    expect(c.pointsInNet('bb1.c7').sort()).toEqual(['bb1.a7', 'bb1.b7', 'bb1.c7', 'bb1.d7', 'bb1.e7']);
  });
});

describe('F-12 wires, part legs and board pins join nets', () => {
  it('a wire joins two strips', () => {
    const c = connect(spec({ wires: [{ id: 'w1', a: 'bb1.a5', b: 'bb1.j10' }] }));
    expect(same(c, 'bb1.e5', 'bb1.f10')).toBe(true);
    expect(same(c, 'bb1.e5', 'bb1.f5')).toBe(false);
  });

  it('a part leg is in the net of the hole it is plugged into; its two legs stay apart', () => {
    const c = connect(spec({ parts: [{ id: 'r1', type: 'resistor', props: { ohms: 220 }, legs: { a: 'bb1.a5', b: 'bb1.a10' } }] }));
    expect(same(c, 'r1.a', 'bb1.e5')).toBe(true);
    expect(same(c, 'r1.b', 'bb1.c10')).toBe(true);
    expect(same(c, 'r1.a', 'r1.b')).toBe(false);
  });

  it("a button's legs on one side are joined inside it; the two sides only when pressed (not here)", () => {
    const c = connect(spec({ parts: [{ id: 'btn1', type: 'button', legs: { '1a': 'bb1.e24', '1b': 'bb1.f24', '2a': 'bb1.e26', '2b': 'bb1.f26' } }] }));
    expect(same(c, 'bb1.a24', 'bb1.j24')).toBe(true);
    expect(same(c, 'bb1.a26', 'bb1.j26')).toBe(true);
    expect(same(c, 'bb1.a24', 'bb1.a26')).toBe(false);
  });

  it('every GND pin of the board is one net called GND; AGND too', () => {
    const c = connect(spec({ board: { data: pico } }));
    expect(c.netOf('board.GND@3')).toBe('GND');
    expect(same(c, 'board.GND@3', 'board.GND@38')).toBe(true);
    expect(same(c, 'board.GND@3', 'board.AGND')).toBe(true);
    expect(same(c, 'board.GND@3', 'board.GP0')).toBe(false);
  });

  it("the ESP32's two GND pins are joined", () => {
    const c = connect(spec({ board: { data: parseBoard(espJson) } }));
    expect(same(c, 'board.GND@14', 'board.GND@29')).toBe(true);
  });

  it('a board pin can be named by label; a net with a board pin is named after it', () => {
    const c = connect(spec({ board: { data: pico }, wires: [{ id: 'w1', a: 'board.GP15', b: 'bb1.a5' }, { id: 'w2', a: 'board.GND', b: 'bb1.B-1' }] }));
    expect(c.netOf('bb1.e5')).toBe('GP15');
    expect(c.netOf('bb1.B-29')).toBe('GND');
  });

  it('a board plugged into the breadboard joins each pin to its hole', () => {
    const c = connect(spec({ board: { data: pico, plugs: { GP0: 'bb1.j1', '3V3': 'bb1.a5' } } }));
    expect(c.netOf('bb1.f1')).toBe('GP0');
    expect(c.netOf('bb1.b5')).toBe('3V3');
  });

  it('a net with no board pin is named after its first hole', () => {
    const c = connect(spec({ wires: [{ id: 'w1', a: 'bb1.a7', b: 'bb1.a3' }] }));
    expect(c.netOf('bb1.a7')).toBe('bb1.a3');
  });

  it('every point belongs to exactly one net', () => {
    const c = connect(spec({ board: { data: pico }, parts: [{ id: 'r1', type: 'resistor', props: { ohms: 1000 }, legs: { a: 'bb1.a1', b: 'board.GP2' } }] }));
    const all = c.nets.flatMap((n) => n.points);
    expect(new Set(all).size).toBe(all.length);
    expect(c.nets.find((n) => n.id === 'GP2')!.points).toEqual(expect.arrayContaining(['board.GP2', 'r1.b']));
  });
});

describe('F-18 problems instead of crashes', () => {
  it('a board pin when there is no board; asking about a point that does not exist', () => {
    const c = connect(spec({ wires: [{ id: 'w1', a: 'board.GP1', b: 'bb1.a1' }] }));
    expect(c.problems).toEqual([{ kind: 'unknown-point', point: 'board.GP1', by: 'w1' }]);
    expect(c.netOf('bb1.z9')).toBeUndefined();
    expect(c.pointsInNet('bb1.z9')).toEqual([]);
  });

  it('a wire to a hole that does not exist, a pin the board does not have, a part of unknown type', () => {
    const c = connect(spec({
      board: { data: pico },
      wires: [{ id: 'w1', a: 'bb1.T+6', b: 'bb1.a1' }, { id: 'w2', a: 'board.GP99', b: 'bb1.a2' }, { id: 'w3', a: 'bb9.a1', b: 'bb1.a3' }],
      parts: [{ id: 'x1', type: 'flux-capacitor', legs: {} }],
    }));
    expect(c.problems).toEqual([
      { kind: 'unknown-part-type', part: 'x1', type: 'flux-capacitor' },
      { kind: 'unknown-point', point: 'bb1.T+6', by: 'w1' },
      { kind: 'unknown-point', point: 'board.GP99', by: 'w2' },
      { kind: 'unknown-point', point: 'bb9.a1', by: 'w3' },
    ]);
  });

  it('a part leg left out, or a leg the part does not have', () => {
    const c = connect(spec({ parts: [{ id: 'r1', type: 'resistor', props: { ohms: 1 }, legs: { a: 'bb1.a1', c: 'bb1.a2' } }] }));
    expect(c.problems).toEqual([
      { kind: 'unknown-leg', part: 'r1', leg: 'c' },
      { kind: 'leg-not-placed', part: 'r1', leg: 'b' },
    ]);
    expect(c.netOf('r1.b')).toBe('r1.b');   // a leg in the air is a net of its own
  });

  it('legs wired to each other in the air: a net with no hole, named after its first point', () => {
    const c = connect(spec({
      parts: [{ id: 'r1', type: 'resistor', props: { ohms: 1 }, legs: { a: 'bb1.a1' } }, { id: 'led1', type: 'led', legs: { k: 'bb1.a2' } }],
      wires: [{ id: 'w1', a: 'r1.b', b: 'led1.a' }, { id: 'w2', a: 'bb1.a3', b: 'bb1.Q1' }],
    }));
    expect(c.netOf('r1.b')).toBe('led1.a');
    expect(c.problems).toContainEqual({ kind: 'unknown-point', point: 'bb1.Q1', by: 'w2' });
  });

  it('a hole on another breadboard is named after that breadboard', () => {
    const c = connect(spec({ breadboards: [{ id: 'bb1', size: 'half' }, { id: 'bb2', size: 'full' }], wires: [{ id: 'w1', a: 'bb2.a1', b: 'bb1.j30' }] }));
    expect(c.netOf('bb2.a1')).toBe('bb1.f30');
  });
});

describe('F-12 the micro:bit GPIO board joins its repeated pins', () => {
  const mbit = parseBoard(mbitJson);
  const c = connect(spec({ board: { data: mbit } }));
  it('both 3.3V pins and the I²C header\'s 3.3V are one net; so are both 5V pins', () => {
    expect(same(c, 'board.3.3V', 'board.3.3V@13')).toBe(true);
    expect(same(c, 'board.3.3V', 'board.3.3V@30')).toBe(true);
    expect(same(c, 'board.5V', 'board.5V@26')).toBe(true);
    expect(same(c, 'board.3.3V', 'board.5V')).toBe(false);
    expect(c.netOf('board.3.3V@13')).toBe('3.3V');
  });
  it('the I²C header\'s SDA and SCL are P20 and P19; its GND is ground', () => {
    expect(c.netOf('board.SDA')).toBe('P20');
    expect(c.netOf('board.SCL')).toBe('P19');
    expect(same(c, 'board.GND@29', 'board.GND')).toBe(true);
  });
  it('a right-angle I²C pin can\'t be plugged into the breadboard', () => {
    const plugged = connect(spec({ board: { data: mbit, plugs: { SDA: 'bb1.a5', P0: 'bb1.a6' } } }));
    expect(plugged.problems).toEqual([{ kind: 'pin-wire-only', pin: 'SDA' }]);
    expect(same(plugged, 'board.P0', 'bb1.e6')).toBe(true);
  });
});

