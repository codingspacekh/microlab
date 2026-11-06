import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { chipState, detect, parsePnp, type PortInfo } from '@lib/usb';

/**
 * M10.6 F-56, R5: an ESP32's USB chip with no driver (mostly on Windows) is on USB but never becomes a serial port —
 * Windows' device list (Get-PnpDevice) shows it, with an error. From a CONSTRUCTED list until one is recorded.
 */
const f = JSON.parse(readFileSync('tests/fixtures/usb/win-esp32-no-driver-constructed.json', 'utf8')) as { ports: PortInfo[]; volumes: string[]; pnp: string };

describe('M10.6 R5 a USB chip with no driver', () => {
  it('Windows\' device list is read: each device\'s USB IDs, whether it works, its name', () => {
    expect(parsePnp(f.pnp)).toEqual([
      { usb: '2e8a:0005', ok: true, name: 'USB Serial Device (COM5)' },
      { usb: '10c4:ea60', ok: false, name: 'CP2102 USB to UART Bridge Controller' },
    ]);
    expect(parsePnp('{"InstanceId":"USB\\\\VID_1A86&PID_7523\\\\5&1","Status":"Error","FriendlyName":"USB2.0-Serial","Problem":28}')).toEqual([
      { usb: '1a86:7523', ok: false, name: 'USB2.0-Serial' },
    ]);
    expect(parsePnp('')).toEqual([]);
    expect(parsePnp('not json')).toEqual([]);
  });

  it('a known ESP32 chip on USB with no serial port: "needs a driver"; a board with its port does not', () => {
    const d = detect(f.ports, f.volumes, 'win32', parsePnp(f.pnp));
    expect(d.boards.map((b) => b.kind)).toEqual(['pico']);
    expect(d.noDriver).toEqual([{ usb: '10c4:ea60', chip: 'CP210x', name: 'CP2102 USB to UART Bridge Controller' }]);
  });

  it('on its own it is what the chip says: "can\'t connect", the driver to install', () => {
    const d = detect(f.ports.slice(0, 1), [], 'win32', parsePnp(f.pnp));
    expect(chipState(d, 'esp32-devkit-v1')).toEqual({ kind: 'no-driver', chip: 'CP210x', usb: '10c4:ea60' });
  });

  it('without a device list (macOS, Linux) nothing is said about drivers', () => {
    expect(detect(f.ports, [], 'darwin').noDriver).toBeUndefined();
  });
});
