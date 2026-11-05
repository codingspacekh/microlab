import { describe, expect, it } from 'vitest';
import { UnionFind } from '@lib/circuit';

describe('UnionFind', () => {
  it('joins sets, whichever is bigger, and joining twice changes nothing', () => {
    const uf = new UnionFind();
    for (const x of ['a', 'b', 'c', 'd']) uf.add(x);
    uf.union('a', 'b');
    uf.union('c', 'a');          // the smaller set joins the bigger one
    uf.union('b', 'c');          // already one set
    expect(uf.find('c')).toBe(uf.find('b'));
    expect(uf.groups().map((g) => g.sort())).toEqual([['a', 'b', 'c'], ['d']]);
  });

  it('find adds a key it has not seen', () => {
    const uf = new UnionFind();
    expect(uf.find('x')).toBe('x');
    expect(uf.has('x')).toBe(true);
  });
});
