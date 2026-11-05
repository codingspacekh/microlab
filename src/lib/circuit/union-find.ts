/** Disjoint sets over string keys, with path halving and union by size (connectivity, F-12). */
export class UnionFind {
  private readonly parent = new Map<string, string>();
  private readonly size = new Map<string, number>();

  add(x: string): void {
    if (!this.parent.has(x)) {
      this.parent.set(x, x);
      this.size.set(x, 1);
    }
  }

  has(x: string): boolean {
    return this.parent.has(x);
  }

  find(x: string): string {
    this.add(x);
    let p = this.parent.get(x)!;
    while (p !== x) {
      const gp = this.parent.get(p)!;
      this.parent.set(x, gp);
      x = p;
      p = this.parent.get(x)!;
    }
    return x;
  }

  union(a: string, b: string): void {
    let ra = this.find(a);
    let rb = this.find(b);
    if (ra === rb) return;
    if (this.size.get(ra)! < this.size.get(rb)!) [ra, rb] = [rb, ra];
    this.parent.set(rb, ra);
    this.size.set(ra, this.size.get(ra)! + this.size.get(rb)!);
  }

  /** Each set as a list, members in the order they were added. */
  groups(): string[][] {
    const byRoot = new Map<string, string[]>();
    for (const x of this.parent.keys()) {
      const r = this.find(x);
      const g = byRoot.get(r);
      if (g) g.push(x);
      else byRoot.set(r, [x]);
    }
    return [...byRoot.values()];
  }
}
