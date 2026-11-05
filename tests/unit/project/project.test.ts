import { describe, expect, it } from 'vitest';
import { parseBoard } from '@lib/boards';
import { parseProject, toCircuit } from '@lib/project';
import picoJson from '../../../library/boards/pico-w/board.json';

describe('M3 project.json', () => {
  const ok = { format: 1, board: 'pico-w', breadboards: [{ id: 'bb1', size: 'half' }], parts: [], wires: [], plugs: { GP0: 'bb1.c1' }, jumpers: { V: 3.3 } };
  it('reads a project and makes its circuit on the board\'s data', () => {
    const c = toCircuit(parseProject(ok), parseBoard(picoJson));
    expect(c.board).toMatchObject({ plugs: { GP0: 'bb1.c1' }, jumpers: { V: 3.3 } });
    expect(c.breadboards).toEqual([{ id: 'bb1', size: 'half' }]);
    const plain = toCircuit(parseProject({ ...ok, plugs: undefined, jumpers: undefined }), parseBoard(picoJson));
    expect(Object.keys(plain.board!)).toEqual(['data']);
  });
  it('refuses a bad file, saying where', () => {
    expect(() => parseProject({ ...ok, breadboards: [{ id: 'bb1', size: 'huge' }] })).toThrow(/breadboards\.0\.size/);
  });
  it('refuses the wrong board', () => {
    expect(() => toCircuit(parseProject({ ...ok, board: 'microbit-v2' }), parseBoard(picoJson))).toThrow(/for microbit-v2, not pico-w/);
  });
});
