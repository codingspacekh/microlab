import { describe, expect, it } from 'vitest';
import { NEW_PROJECT_BOARDS } from '@lib/boards';
import { newProject } from '@lib/project';
import { VirtualClock } from '../../src/sim/clock';
import { runProject } from '../../src/sim/run';
import { nodeLoader } from './vm';

/** M4.2 F-01: the starter main.py runs on its board as it is, and shows something (the board's own LED or display). */
describe('M4.2 F-01 the starter program runs', () => {
  it.each(NEW_PROJECT_BOARDS)('on %s, for 2 seconds, without an error, and changes something', async (board) => {
    const d = newProject(board);
    const r = await runProject(await nodeLoader(), { board, files: d.files, clock: new VirtualClock(), maxUs: 2e6 });
    expect(r.error).toBeUndefined();
    expect(r.trace.length + r.display.length).toBeGreaterThan(1);
  }, 20_000);
});
