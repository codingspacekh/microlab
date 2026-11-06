import { SerialPort } from 'serialport';
import type { Link } from '@lib/repl';

/**
 * A board's USB serial port as a Link for the raw REPL (architecture §2.6). Opened only while MicroLab talks to the
 * board, then closed, so Thonny and other programs can use it in between (F-55). On macOS the /dev/cu.* side is opened
 * (detect.ts); serialport locks the port, so a second program gets "Cannot lock port" — that is how busy is told.
 */
export interface SerialLink extends Link {
  close(): Promise<void>;
}

/** What openSerial needs of a port: serialport's SerialPort, or its SerialPortMock in the tests. */
interface PortLike {
  isOpen: boolean;
  open(cb: (err: Error | null) => void): void;
  write(data: Buffer, cb: (err: Error | null | undefined) => void): boolean;
  drain(cb: (err: Error | null) => void): void;
  close(cb: (err: Error | null) => void): void;
  on(event: 'data', l: (d: Buffer) => void): unknown;
  off(event: 'data', l: (d: Buffer) => void): unknown;
}

type MakePort = (opts: { path: string; baudRate: number; autoOpen: false }) => PortLike;

const real: MakePort = (o) => new SerialPort(o);

export async function openSerial(path: string, make: MakePort = real): Promise<SerialLink> {
  // 115200 baud: what MicroPython uses on the ESP32's USB chip and the micro:bit; native USB (the Pico) ignores it
  const port = make({ path, baudRate: 115200, autoOpen: false });
  await new Promise<void>((ok, fail) => port.open((err) => (err ? fail(err) : ok())));
  return {
    write: (data) => new Promise<void>((ok, fail) => {
      if (!port.isOpen) { fail(new Error('the port is closed')); return; }
      port.write(Buffer.from(data), (err) => {
        if (err) fail(err);
        else port.drain((e) => (e ? fail(e) : ok()));
      });
    }),
    onData: (listener) => {
      const l = (d: Buffer) => listener(new Uint8Array(d.buffer, d.byteOffset, d.length));
      port.on('data', l);
      return () => { port.off('data', l); };
    },
    close: () => new Promise<void>((ok) => {
      if (!port.isOpen) { ok(); return; }
      port.close(() => ok());
    }),
  };
}
