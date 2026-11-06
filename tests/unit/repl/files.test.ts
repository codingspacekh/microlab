import { describe, expect, it, vi } from 'vitest';
import { FakeBoard, ReplError, parsePyCall, pyBytes, sendFiles, type FakeBoardOptions } from '@lib/repl';

/**
 * M10.3 F-50, Q15: Send to board copies the project's files over the raw REPL — only those that changed (size, then
 * checksum), folders made as needed, each under a temporary name and renamed once it is checked, so a cable pulled
 * mid-copy never leaves half a file; the board's other files are left alone; then the board restarts and runs main.py.
 */
const quick = { pauseMs: 0, replyMs: 200, chunkPauseMs: 0 };
const enc = (s: string) => new TextEncoder().encode(s);
const dec = (b: Uint8Array | undefined) => (b ? new TextDecoder().decode(b) : undefined);

function board(files: Record<string, string> = {}, opts: Partial<FakeBoardOptions> = {}) {
  return new FakeBoard({ preset: 'pico-w', program: {}, files: Object.fromEntries(Object.entries(files).map(([k, v]) => [k, enc(v)])), ...opts });
}

describe('M10.3 Python literals for the commands', () => {
  it('bytes: printable as they are, the rest escaped; read back the same', () => {
    const b = Uint8Array.from([104, 105, 0, 39, 92, 10, 255]);
    expect(pyBytes(b)).toBe("b'hi\\x00\\'\\\\\\x0a\\xff'");
    expect(parsePyCall(`_mlc(${pyBytes(b)})`)).toEqual({ name: '_mlc', args: [b] });
    expect(parsePyCall("_mlmv('main.py.mlab-part','main.py')")).toEqual({ name: '_mlmv', args: ['main.py.mlab-part', 'main.py'] });
  });
});

describe('M10.3 F-50 Send to board', () => {
  it('three files, one changed: one written; the rest reported the same', async () => {
    const b = board({ 'main.py': 'old', 'lib/a.py': 'a = 1\n', 'b.py': 'b = 2\n' });
    const r = await sendFiles(b, { 'main.py': 'new code\n', 'lib/a.py': 'a = 1\n', 'b.py': 'b = 2\n' }, quick);
    expect(r.sent).toEqual([{ path: 'main.py', size: 9 }]);
    expect(r.same.sort()).toEqual(['b.py', 'lib/a.py']);
    expect(dec(b.files.get('main.py'))).toBe('new code\n');
    expect(r.uname?.machine).toBe('Raspberry Pi Pico W with RP2040');
  });

  it('same size but different: the checksum finds it', async () => {
    const b = board({ 'main.py': 'aaaa' });
    const r = await sendFiles(b, { 'main.py': 'bbbb' }, quick);
    expect(r.sent.map((s) => s.path)).toEqual(['main.py']);
  });

  it('folders are made as needed; the board\'s other files are left alone', async () => {
    const b = board({ 'boot.py': '# theirs', 'data.txt': 'keep' });
    await sendFiles(b, { 'main.py': 'import x', 'lib/sub/x.py': 'x = 1' }, quick);
    expect([...b.dirs].sort()).toEqual(['lib', 'lib/sub']);
    expect(dec(b.files.get('lib/sub/x.py'))).toBe('x = 1');
    expect(dec(b.files.get('boot.py'))).toBe('# theirs');
    expect(dec(b.files.get('data.txt'))).toBe('keep');
  });

  it('main.py is copied last, so a send cut short never starts new code with old libraries', async () => {
    const b = board();
    const order: string[] = [];
    await sendFiles(b, { 'main.py': 'm', 'a.py': 'a', 'lib/z.py': 'z' }, { ...quick, onProgress: (p) => p.path && order.push(p.path) });
    expect(order.at(-1)).toBe('main.py');
  });

  it('progress: each file in turn, then done', async () => {
    const seen: string[] = [];
    await sendFiles(board(), { 'main.py': 'm', 'a.py': 'a' }, { ...quick, onProgress: (p) => seen.push(`${p.done}/${p.total}${p.path ? ` ${p.path}` : ''}`) });
    expect(seen).toEqual(['0/2', '0/2 a.py', '1/2 main.py', '2/2']);
  });

  it('text is sent as UTF-8; any byte goes through', async () => {
    const b = board();
    const bin = Uint8Array.from({ length: 700 }, (_, i) => i % 256);
    await sendFiles(b, { 'main.py': 'print("25 °C")\n', 'blob.bin': bin }, quick);
    expect(dec(b.files.get('main.py'))).toBe('print("25 °C")\n');
    expect(b.files.get('blob.bin')).toEqual(bin);
  });

  it('then the board restarts and runs main.py; asked not to run, it is left at its prompt', async () => {
    const b = board();
    await sendFiles(b, { 'main.py': 'm' }, quick);
    expect(b.softReboots).toBe(1);
    expect(b.state).toBe('program');
    const c = board();
    await sendFiles(c, { 'main.py': 'm' }, { ...quick, run: false });
    expect(c.softReboots).toBe(0);
    expect(c.state).toBe('friendly');
  });

  it('a copy of the board\'s old main.py is kept when it is replaced — not when it is the same or not there', async () => {
    const keepOld = vi.fn(async () => {});
    const b = board({ 'main.py': '# the teacher\'s own project\n' });
    const r = await sendFiles(b, { 'main.py': 'new' }, { ...quick, keepOld });
    expect(keepOld).toHaveBeenCalledWith('main.py', enc('# the teacher\'s own project\n'));
    expect(r.kept).toEqual(['main.py']);
    keepOld.mockClear();
    await sendFiles(b, { 'main.py': 'new' }, { ...quick, keepOld });
    await sendFiles(board(), { 'main.py': 'new' }, { ...quick, keepOld });
    expect(keepOld).not.toHaveBeenCalled();
  });

  it('unplugged mid-copy: no half file — main.py is still the old one; Send again finishes and tidies up', async () => {
    const b = board({ 'main.py': 'old' });
    const big = 'x = 1\n'.repeat(400);
    b.unplugAt('_mlc', 3);
    await expect(sendFiles(b, { 'main.py': big }, quick)).rejects.toMatchObject({ reason: 'lost' });
    expect(dec(b.files.get('main.py'))).toBe('old');
    expect([...b.files.keys()]).toContain('main.py.mlab-part');
    b.replug();
    const r = await sendFiles(b, { 'main.py': big }, quick);
    expect(r.sent.map((s) => s.path)).toEqual(['main.py']);
    expect(dec(b.files.get('main.py'))).toBe(big);
    expect([...b.files.keys()]).toEqual(['main.py']);
  });

  it('a file that arrives changed is not put in place', async () => {
    const b = board({ 'main.py': 'old' }, { corrupt: true });
    await expect(sendFiles(b, { 'main.py': 'new' }, quick)).rejects.toThrow(/arrived changed/);
    expect(dec(b.files.get('main.py'))).toBe('old');
  });

  it('no MicroPython: refused before anything is sent', async () => {
    await expect(sendFiles(board({}, { silent: true }), { 'main.py': 'm' }, quick)).rejects.toMatchObject({ reason: 'no-micropython' });
  });
});

describe('M10.3 F-21 on the micro:bit (no folders, no os.rename, no hashlib)', () => {
  const mb = (files: Record<string, string> = {}) => board(files, { preset: 'microbit-v2' });

  it('files are compared by reading them back, and put in place by copying', async () => {
    const b = mb({ 'main.py': 'same', 'x.py': 'olde' });
    const r = await sendFiles(b, { 'main.py': 'same', 'x.py': 'newe' }, quick);
    expect(r.same).toEqual(['main.py']);
    expect(r.sent.map((s) => s.path)).toEqual(['x.py']);
    expect(dec(b.files.get('x.py'))).toBe('newe');
    expect([...b.files.keys()].sort()).toEqual(['main.py', 'x.py']);
  });

  it('a file in a folder is refused before anything is written, saying what to do', async () => {
    const b = mb({ 'main.py': 'old' });
    const e = await sendFiles(b, { 'main.py': 'new', 'lib/x.py': 'x' }, quick).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ReplError);
    expect((e as ReplError).message).toMatch(/micro:bit has no folders.*lib\/x\.py/);
    expect(dec(b.files.get('main.py'))).toBe('old');
    expect(b.softReboots).toBe(1);   // its program given back
  });
});
