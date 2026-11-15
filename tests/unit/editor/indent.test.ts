import { describe, expect, it } from 'vitest';
import { indentGuides } from '@lib/editor';

/**
 * 1.0.1 (the class, after v1.0: "indentation preview, like python.microbit.org, to help students write the code in
 * the correct way"): a line down the left of every block — from under the line that opens it (while, if, def …) to
 * its last line — and the block the cursor is in drawn stronger. Worked out from the indentation alone, as Python
 * itself reads it, so a line that is one space out stands out of its block.
 */
const of = (code: string, cursor = 0) => indentGuides(code.split('\n'), cursor);
const cols = (code: string) => of(code, -1).map((g) => g.cols);

describe('1.0.1 the indentation guides', () => {
  it('a block\'s lines have a guide at the column of the line that opens it; nested blocks, one each', () => {
    expect(cols('while True:\n    if x:\n        go()\n    stop()\nprint(1)')).toEqual([[], [0], [0, 4], [0], []]);
  });

  it('an empty line inside a block keeps the block\'s guides; one after the block has none', () => {
    expect(cols('def f():\n    a()\n\n    b()\n\nprint(1)')).toEqual([[], [0], [0], [0], [], []]);
  });

  it('a line of spaces only (the new line being typed) is drawn as deep as its spaces', () => {
    expect(cols('while True:\n    if x:\n        \n    ')).toEqual([[], [0], [0, 4], [0]]);
  });

  it('a line one space out of its block is not in it: the lines after it get a guide at its own column', () => {
    expect(cols('while True:\n    a()\n   b()\n    c()')).toEqual([[], [0], [0], [0, 3]]);
  });

  it('any width of indentation, and tabs (to the next multiple of four)', () => {
    expect(cols('if x:\n  a()\n  if y:\n      b()')).toEqual([[], [0], [0], [0, 2]]);
    expect(cols('if x:\n\tif y:\n\t\tb()')).toEqual([[], [0], [0, 4]]);
  });

  it('the block the cursor is in: its guide is the strong one, on its lines only', () => {
    const code = 'while True:\n    if x:\n        go()\n        on()\n    stop()\nif y:\n    z()';
    // in the if's body: the if's guide (column 4) on its two lines
    expect(of(code, 2).map((g) => g.active)).toEqual([undefined, undefined, 4, 4, undefined, undefined, undefined]);
    // in the while's body, outside the if: the while's guide (column 0), down the whole body — not the next block's
    expect(of(code, 4).map((g) => g.active)).toEqual([undefined, 0, 0, 0, 0, undefined, undefined]);
  });

  it('the cursor on the line that opens a block: that block', () => {
    const code = 'while True:\n    if x:\n        go()\n    stop()';
    expect(of(code, 0).map((g) => g.active)).toEqual([undefined, 0, 0, 0]);
    expect(of(code, 1).map((g) => g.active)).toEqual([undefined, undefined, 4, undefined]);
  });

  it('the cursor outside every block: none is strong', () => {
    expect(of('x = 1\nwhile True:\n    go()', 0).map((g) => g.active)).toEqual([undefined, undefined, undefined]);
  });
});
