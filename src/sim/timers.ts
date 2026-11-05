/**
 * Soft timers (machine.Timer, M2.4): each fires at its due time on the run's Clock and queues its callback,
 * which is scheduled like a pin IRQ. A sleep wakes at the next due time, so a 250 ms timer fires at 250 ms.
 */
export interface DueTimer {
  handler: unknown;
  owner: unknown;
}

interface Timer {
  dueUs: number;
  /** 0 for one-shot. */
  periodUs: number;
  handler: unknown;
  owner: unknown;
  order: number;
}

export class TimerBank {
  private readonly timers = new Map<number, Timer>();
  private readonly pending: DueTimer[] = [];
  private order = 0;

  constructor(private readonly now: () => number) {}

  start(id: number, periodUs: number, periodic: boolean, handler: unknown, owner: unknown): void {
    this.timers.set(id, { dueUs: this.now() + periodUs, periodUs: periodic ? periodUs : 0, handler, owner, order: this.order++ });
  }

  stop(id: number): void {
    this.timers.delete(id);
  }

  /** Queues every timer due by now, earliest first (then in the order they were started). */
  update(): void {
    const t = this.now();
    for (;;) {
      let first: [number, Timer] | undefined;
      for (const e of this.timers) {
        if (e[1].dueUs <= t && (!first || e[1].dueUs < first[1].dueUs || (e[1].dueUs === first[1].dueUs && e[1].order < first[1].order))) first = e;
      }
      if (!first) return;
      const [id, timer] = first;
      this.pending.push({ handler: timer.handler, owner: timer.owner });
      if (timer.periodUs > 0) timer.dueUs += timer.periodUs;
      else this.timers.delete(id);
    }
  }

  nextDueUs(): number {
    let next = Infinity;
    for (const timer of this.timers.values()) next = Math.min(next, timer.dueUs);
    return next;
  }

  hasPending(): boolean {
    return this.pending.length > 0;
  }

  takePending(): DueTimer[] {
    return this.pending.splice(0);
  }
}
