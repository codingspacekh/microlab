import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PortInfo } from '@lib/usb';
import { BoardWatcher, listUsbWindows, volumesIn } from '../../../src/main/board-watcher';

/** M10.1 F-55, N-12: the main process looks at the USB ports about once a second and says what changed. */
const PICO: PortInfo = { path: '/dev/tty.usbmodem14201', serialNumber: 'e661', vendorId: '2e8a', productId: '0005' };
const MB: PortInfo = { path: '/dev/tty.usbmodem14202', serialNumber: '9906', vendorId: '0d28', productId: '0204' };

function setup(start: PortInfo[] = []) {
  let ports = start;
  let volumes: string[] = ['Macintosh HD'];
  const changes = vi.fn();
  const listPorts = vi.fn(async () => ports);
  const w = new BoardWatcher({ listPorts, listVolumes: async () => volumes, platform: 'darwin' }, changes);
  return { w, changes, listPorts, set: (p: PortInfo[], v = volumes) => { ports = p; volumes = v; } };
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('M10.1 the board watcher', () => {
  it('looks at once, then about every second; a board plugged in is told within 2 s (N-12)', async () => {
    const s = setup();
    s.w.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(s.changes).not.toHaveBeenCalled();   // nothing there: nothing to tell
    s.set([PICO]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(s.changes).toHaveBeenCalledTimes(1);
    expect(s.changes.mock.calls[0]![0].boards).toMatchObject([{ kind: 'pico', port: '/dev/cu.usbmodem14201' }]);
    expect(s.changes.mock.calls[0]![1]).toMatchObject({ plugged: [{ id: 'e661' }], unplugged: [] });
    s.w.stop();
  });

  it('M10.2 R10 says whether a board was there at the first look (already running) or plugged in since', async () => {
    const there = setup([PICO]);
    there.w.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(there.changes.mock.calls[0]![2]).toBe(true);
    there.w.stop();
    const later = setup();
    later.w.start();
    await vi.advanceTimersByTimeAsync(0);
    later.set([PICO]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(later.changes.mock.calls[0]![2]).toBe(false);
    later.w.stop();
  });

  it('tells only when something changed, and what: unplugged, another board, a BOOTSEL drive', async () => {
    const s = setup([PICO]);
    s.w.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(s.changes).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(3000);
    expect(s.changes).toHaveBeenCalledTimes(1);
    s.set([MB]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(s.changes.mock.calls[1]![1]).toMatchObject({ plugged: [{ id: '9906' }], unplugged: [{ id: 'e661' }] });
    s.set([], ['Macintosh HD', 'RPI-RP2']);
    await vi.advanceTimersByTimeAsync(1000);
    expect(s.changes.mock.calls[2]![0]).toEqual({ boards: [], drives: [{ kind: 'pico-bootsel', volume: 'RPI-RP2' }] });
    expect(s.w.current.drives).toHaveLength(1);
    s.w.stop();
  });

  it('a slow port list never overlaps the next look; a failed one changes nothing', async () => {
    const s = setup([PICO]);
    let release!: () => void;
    s.listPorts.mockImplementationOnce(() => new Promise((r) => { release = () => r([PICO]); }));
    s.w.start();
    await vi.advanceTimersByTimeAsync(3500);
    expect(s.listPorts).toHaveBeenCalledTimes(1);   // still waiting for the first
    release();
    await vi.advanceTimersByTimeAsync(1000);
    expect(s.changes).toHaveBeenCalledTimes(1);
    s.listPorts.mockRejectedValueOnce(new Error('busy'));
    await vi.advanceTimersByTimeAsync(1000);
    expect(s.changes).toHaveBeenCalledTimes(1);
    expect(s.w.current.boards).toHaveLength(1);
    s.w.stop();
  });

  it('stop ends the looking', async () => {
    const s = setup();
    s.w.start();
    await vi.advanceTimersByTimeAsync(0);
    s.w.stop();
    s.set([PICO]);
    await vi.advanceTimersByTimeAsync(5000);
    expect(s.changes).not.toHaveBeenCalled();
  });
});

describe('M10.1 where drives show up', () => {
  it('macOS: /Volumes; Linux: /media/<user> and /run/media/<user>; Windows: none yet (its drive labels come with installing, M10.7)', () => {
    expect(volumesIn('darwin', 'ana')).toEqual(['/Volumes']);
    expect(volumesIn('linux', 'ana')).toEqual(['/media/ana', '/run/media/ana']);
    expect(volumesIn('win32', 'ana')).toEqual([]);
  });
});

describe('M10.1 listing the drives', () => {
  it('a folder that isn\'t there is no drives, never an error', async () => {
    const { listVolumes } = await import('../../../src/main/board-watcher');
    vi.useRealTimers();
    expect(await listVolumes('linux', 'no-such-user-microlab')).toEqual([]);
    expect(await listVolumes('win32', 'x')).toEqual([]);
  });
});

describe('M10.6 R5 on Windows, the device list too (a board\'s chip with no driver)', () => {
  const ESP_NO_DRIVER = [{ usb: '10c4:ea60', ok: false, name: 'CP2102 USB to UART Bridge Controller' }];

  it('is read every third look (PowerShell is slow), and a chip with no port is told', async () => {
    const listUsb = vi.fn(async () => ESP_NO_DRIVER);
    const changes = vi.fn();
    const w = new BoardWatcher({ listPorts: async () => [], listVolumes: async () => [], platform: 'win32', listUsb }, changes);
    w.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(changes.mock.calls[0]![0].noDriver).toEqual([{ usb: '10c4:ea60', chip: 'CP210x', name: 'CP2102 USB to UART Bridge Controller' }]);
    await vi.advanceTimersByTimeAsync(5000);
    expect(listUsb).toHaveBeenCalledTimes(2);
    w.stop();
  });

  it('the PowerShell command and its answer', async () => {
    const run = vi.fn(async () => '{"InstanceId":"USB\\\\VID_1A86&PID_7523\\\\5&1","Status":"Error","FriendlyName":"USB2.0-Serial","Problem":28}');
    expect(await listUsbWindows(run)).toEqual([{ usb: '1a86:7523', ok: false, name: 'USB2.0-Serial' }]);
    expect(run).toHaveBeenCalledWith('powershell.exe', expect.arrayContaining(['-NoProfile', '-Command', expect.stringContaining('Get-PnpDevice -PresentOnly')]));
    expect(await listUsbWindows(async () => { throw new Error('no powershell'); })).toEqual([]);
  });
});
