import { describe, expect, it } from 'vitest';
import { parseBoard } from '@lib/boards';
import type { CircuitSpec, PartSpec } from '@lib/circuit';
import picoJson from '../../library/boards/pico-w/board.json';
import espJson from '../../library/boards/esp32-devkit-v1/board.json';
import mbitJson from '../../library/boards/microbit-v2/board.json';
import { VirtualClock } from '../../src/sim/clock';
import type { PartChange, PartView } from '../../src/sim/circuit';
import { runProject, type RunResult, type SimBoard } from '../../src/sim/run';
import { nodeLoader } from './vm';

/** M7 slice 5 (screens 28–28d), F-34: UART complete — bytes on the wire at their baud rate, the boards' own ports
 *  (ports/rp2/machine_uart.c, ports/esp32/machine_uart.c, microbit_uart.c), a USB-serial adapter and its terminal, an
 *  HC-05 and a phone, a NEO-6M GPS; and SPI's pins, modes and speed. */
const DATA = { 'pico-w': parseBoard(picoJson), 'esp32-devkit-v1': parseBoard(espJson), 'microbit-v2': parseBoard(mbitJson) } as const;
const spec = (board: SimBoard, parts: PartSpec[], wires: [string, string][]): CircuitSpec => ({
  board: { data: DATA[board as keyof typeof DATA] }, breadboards: [], parts, wires: wires.map(([a, b], i) => ({ id: `w${i + 1}`, a, b })),
});
const run = async (board: SimBoard, main: string, circuit?: CircuitSpec, partInputs: PartChange[] = [], seconds = 2): Promise<RunResult> =>
  runProject(await nodeLoader(), { board, files: { 'main.py': main }, clock: new VirtualClock(), circuit, partInputs, maxUs: seconds * 1e6 });
const py = (...lines: string[]) => `${lines.join('\n')}\n`;
const out = (r: RunResult) => r.output.split('\n').filter((l) => l && !l.startsWith('MicroPython'));
function last<K extends PartView['kind']>(r: RunResult, id: string, kind: K) {
  return r.parts.filter(([, p, v]) => p === id && v.kind === kind).at(-1)?.[2] as Extract<PartView, { kind: K }> | undefined;
}
const USB: PartSpec = { id: 'usb1', type: 'usb-serial', legs: {}, props: { baud: 9600 } };
const PICO_USB: [string, string][] = [['board.GP0', 'usb1.rxd'], ['board.GP1', 'usb1.txd'], ['board.GND', 'usb1.gnd']];

describe('M7 a board UART on the wire (screen 28)', () => {
  it('a loopback: GP4 (UART1 TX) wired to GP1 (UART0 RX) — what one writes the other reads, a byte a ms at 9600', async () => {
    const r = await run('pico-w', py(
      'from machine import UART, Pin', 'import time',
      'a = UART(1, 9600, tx=Pin(4), rx=Pin(5))', 'b = UART(0, 9600, tx=Pin(0), rx=Pin(1))',
      "a.write('hello')", 'print(b.any())', 'time.sleep_ms(3)', 'print(b.any())', 'time.sleep_ms(5)', 'print(b.read())', 'print(b.read())',
    ), spec('pico-w', [], [['board.GP4', 'board.GP1']]));
    expect(r.error).toBeUndefined();
    expect(out(r)).toEqual(['0', '2', "b'hello'", 'None']);
  });

  it('the wrong baud rate: sent at 9600, read at 115200 — garbage, as a real one reads', async () => {
    const r = await run('pico-w', py(
      'from machine import UART, Pin', 'import time',
      'a = UART(1, 9600, tx=Pin(4), rx=Pin(5))', 'b = UART(0, 115200, tx=Pin(0), rx=Pin(1))',
      "a.write('Hello')", 'time.sleep_ms(10)', 'd = b.read()', "print(d != b'Hello', len(d) > 5, 0 in d)",
    ), spec('pico-w', [], [['board.GP4', 'board.GP1']]));
    expect(out(r)).toEqual(['True True True']);
  });

  it('readline() and the timeouts: read() goes on while bytes keep coming; timeout waits for a first', async () => {
    const r = await run('pico-w', py(
      'from machine import UART, Pin', 'import time',
      'a = UART(1, 9600, tx=Pin(4), rx=Pin(5))', 'b = UART(0, 9600, tx=Pin(0), rx=Pin(1), timeout=50)',
      "a.write('one\\ntwo\\n')", 'print(b.readline())', 'print(b.readline())', 'print(b.readline())',
      "a.write('x' * 20)", 't = time.ticks_ms()', 'print(len(b.read(20)), time.ticks_ms() - t >= 19)',
    ), spec('pico-w', [], [['board.GP4', 'board.GP1']]));
    expect(out(r)).toEqual(["b'one\\n'", "b'two\\n'", 'None', '20 True']);
  });

  it('its receive buffer holds rxbuf bytes; what comes after is lost', async () => {
    const r = await run('pico-w', py(
      'from machine import UART, Pin', 'import time',
      'a = UART(1, 115200, tx=Pin(4), rx=Pin(5))', 'b = UART(0, 115200, tx=Pin(0), rx=Pin(1), rxbuf=32)',
      "a.write(bytes(range(100)))", 'time.sleep_ms(20)', 'd = b.read()', 'print(len(d), d[0], d[-1])',
    ), spec('pico-w', [], [['board.GP4', 'board.GP1']]));
    expect(out(r)).toEqual(['32 0 31']);
  });

  it('the Pico W\'s UART pins, its print and its defaults, as machine_uart.c', async () => {
    const r = await run('pico-w', py(
      'from machine import UART, Pin', 'print(UART(0))', 'print(UART(1, 9600, tx=Pin(8), rx=Pin(9)))',
      'try:', '    UART(0, tx=Pin(4))', 'except ValueError as e:', '    print(e)',
      'try:', '    UART(1, rx=Pin(4))', 'except ValueError as e:', '    print(e)',
    ));
    expect(out(r)).toEqual([
      'UART(0, baudrate=115200, bits=8, parity=None, stop=1, tx=0, rx=1, txbuf=256, rxbuf=256, timeout=0, timeout_char=1, invert=None, irq=0)',
      'UART(1, baudrate=9600, bits=8, parity=None, stop=1, tx=8, rx=9, txbuf=256, rxbuf=256, timeout=0, timeout_char=2, invert=None, irq=0)',
      'bad TX pin', 'bad RX pin',
    ]);
  });

  it('the ESP32: UART(0) is the console\'s — what it writes is printed; UART(3) does not exist', async () => {
    const r = await run('esp32-devkit-v1', py('from machine import UART', "UART(0).write('hi from the REPL\\n')", 'UART(3)'));
    expect(out(r)[0]).toBe('hi from the REPL');
    expect(r.error).toMatchObject({ type: 'ValueError', message: 'UART(3) does not exist' });
  });
});

describe('M7 a USB-serial adapter and its terminal (screens 28, 28d)', () => {
  it('what the board sends shows in the terminal; what the terminal sends arrives on the board', async () => {
    const r = await run('pico-w', py(
      'from machine import UART, Pin', 'import time',
      'u = UART(0, 9600, tx=Pin(0), rx=Pin(1))', "u.write('Hello! Type on or off.\\r\\n')",
      'while not u.any():', '    time.sleep_ms(5)', 'time.sleep_ms(10)', "print(u.read())", "u.write('LED on\\r\\n')", 'time.sleep_ms(50)',
    ), spec('pico-w', [USB], PICO_USB), [{ atUs: 100_000, part: 'usb1', text: 'on\r\n' }]);
    expect(r.error).toBeUndefined();
    expect(out(r)).toEqual(["b'on\\r\\n'"]);
    expect(last(r, 'usb1', 'serial')).toMatchObject({ text: 'Hello! Type on or off.\r\nLED on\r\n', sent: 4, received: 32, baud: 9600, heardBaud: 9600 });
  });

  it('the terminal at 115200 where the board sends at 9600: garbage, and it knows the board\'s rate', async () => {
    const r = await run('pico-w', py('from machine import UART, Pin', 'import time', "UART(0, 9600, tx=Pin(0), rx=Pin(1)).write('Hello from UART0\\r\\n')", 'time.sleep_ms(50)'),
      spec('pico-w', [{ ...USB, props: { baud: 115200 } }], PICO_USB));
    const v = last(r, 'usb1', 'serial')!;
    expect(v.text).not.toContain('Hello');
    expect(v.text).toMatch(/[\u0000\uFFFD]/);   // runs of zeros (the terminal card draws them as �) and broken bytes
    expect(v).toMatchObject({ baud: 115200, heardBaud: 9600 });
  });

  it('TX wired to TX: nothing arrives, and a warning naming both', async () => {
    const r = await run('pico-w', py('from machine import UART, Pin', 'import time', "UART(1, 9600, tx=Pin(4), rx=Pin(5)).write('Hello')", 'time.sleep_ms(20)'),
      spec('pico-w', [USB], [['board.GP4', 'usb1.txd'], ['board.GP5', 'usb1.rxd'], ['board.GND', 'usb1.gnd']]));
    expect(last(r, 'usb1', 'serial')?.text ?? '').toBe('');
    expect(r.faults).toEqual([expect.objectContaining({ kind: 'uart-tx-to-tx', severity: 'warning', on: 'GP4', part: "USB1's TXD" })]);
  });
});

describe('M7 the micro:bit\'s uart and an HC-05 with a phone (screen 28b)', () => {
  const HC: PartSpec = { id: 'bt1', type: 'hc05', legs: {} };
  const WIRES: [string, string][] = [['board.5V', 'bt1.vcc'], ['board.GND', 'bt1.gnd'], ['board.P0', 'bt1.txd'], ['board.P1', 'bt1.rxd']];
  const MAIN = py('from microbit import *', "print('before')", 'uart.init(baudrate=9600, tx=pin1, rx=pin0)', "print('after')",
    'while True:', '    if uart.any():', '        msg = uart.read().decode().strip()', "        if msg == 'on':", '            display.show(Image.HEART)',
    "            uart.write('Heart on\\n')", '    sleep(20)');

  it('the phone\'s message arrives on the micro:bit; its answer shows on the phone; print() after init() goes out of TX too', async () => {
    const r = await run('microbit-v2', MAIN, spec('microbit-v2', [HC], WIRES), [
      { atUs: 50_000, part: 'bt1', connected: true }, { atUs: 200_000, part: 'bt1', text: 'on' },
    ], 1);
    expect(r.error).toBeUndefined();
    expect(out(r)).toEqual(['before']);
    const v = last(r, 'bt1', 'bluetooth')!;
    expect(v).toMatchObject({ on: true, connected: true });
    expect(v.messages).toEqual([{ from: 'phone', text: 'on' }, { from: 'board', text: 'Heart on\n' }]);
    expect(r.display.at(-1)![1]).not.toBe('0'.repeat(25));
  });

  it('with no phone connected nothing is heard either way; the HC-05\'s STATE is high only while one is', async () => {
    const r = await run('microbit-v2', py('from microbit import *', 'uart.init(9600, tx=pin1, rx=pin0)', 'sleep(100)', 'print(pin2.read_digital())', 'sleep(300)', 'print(pin2.read_digital())'),
      spec('microbit-v2', [HC], [...WIRES, ['board.P2', 'bt1.state']]), [{ atUs: 150_000, part: 'bt1', text: 'lost' }, { atUs: 200_000, part: 'bt1', connected: true }]);
    expect(r.error).toBeUndefined();
    expect(last(r, 'bt1', 'bluetooth')?.messages).toEqual([]);
  });

  it('uart without pins is the console: write() prints; any() is False, read() None', async () => {
    const r = await run('microbit-v2', py('from microbit import *', "uart.write('to USB\\n')", 'print(uart.any(), uart.read())'));
    expect(out(r)).toEqual(['to USB', 'False None']);
  });
});

describe('M7 a NEO-6M GPS (screen 28c)', () => {
  const GPS: PartSpec = { id: 'gps1', type: 'gps', legs: {} };
  const WIRES: [string, string][] = [['board.3V3', 'gps1.vcc'], ['board.GND', 'gps1.gnd'], ['board.RX2', 'gps1.tx'], ['board.TX2', 'gps1.rx']];
  const checks = (line: string) => {
    const [body, cs] = line.slice(1).split('*') as [string, string];
    return [...body].reduce((x, c) => x ^ c.charCodeAt(0), 0) === parseInt(cs, 16);
  };

  it('a second after power it sends RMC VTG GGA GSA GSV GLL at 9600, their checksums right; the fix, where, how many', async () => {
    const r = await run('esp32-devkit-v1', py(
      'from machine import UART', 'gps = UART(2, baudrate=9600, timeout=100)', 'n = 0',   // timeout=0 (its default) returns a line as far as it has come
      'while n < 12:', '    line = gps.readline()', '    if line:', "        print(line.decode().strip())", '        n += 1',
    ), spec('esp32-devkit-v1', [GPS], WIRES), [], 3);
    expect(r.error).toBeUndefined();
    const lines = out(r);
    expect(lines.slice(0, 6).map((l) => l.slice(0, 6))).toEqual(['$GPRMC', '$GPVTG', '$GPGGA', '$GPGSA', '$GPGSV', '$GPGSV']);
    expect(lines.every(checks)).toBe(true);
    const gga = lines.find((l) => l.startsWith('$GPGGA'))!.split(',');
    expect(gga.slice(2, 8)).toEqual(['1133.38400', 'N', '10455.69200', 'E', '1', '09']);
  });

  it('searching (no fix): the position fields are empty, as from a real one indoors', async () => {
    const r = await run('esp32-devkit-v1', py('from machine import UART', 'import time', 'gps = UART(2, baudrate=9600)', 'time.sleep_ms(1500)',
      'for l in gps.read().decode().split("\\r\\n"):', "    if l.startswith('$GPGGA') or l.startswith('$GPRMC'):", '        print(l)'),
    spec('esp32-devkit-v1', [GPS], WIRES), [{ atUs: 0, part: 'gps1', fix: false }], 2);
    const lines = out(r);
    expect(lines[0]).toMatch(/^\$GPRMC,\d{6}\.00,V,,,,,,,\d{6},,,N\*[0-9A-F]{2}$/);
    expect(lines[1]).toMatch(/^\$GPGGA,\d{6}\.00,,,,,0,00,99\.99,,,,,,\*[0-9A-F]{2}$/);
  });

  it('with no power it sends nothing', async () => {
    const r = await run('esp32-devkit-v1', py('from machine import UART', 'import time', 'gps = UART(2, baudrate=9600)', 'time.sleep_ms(1500)', 'print(gps.read())'),
      spec('esp32-devkit-v1', [GPS], WIRES.slice(1)), [], 2);
    expect(out(r)).toEqual(['None']);
  });
});

describe('M7 SPI complete', () => {
  it('the Pico W: its pins checked as machine_spi.c, LSB not implemented, its speed what the divider gives (48 MHz)', async () => {
    const r = await run('pico-w', py(
      'from machine import SPI, Pin', 'print(SPI(0, 10_000_000))', 's = SPI(1)', 's.init(baudrate=400_000, polarity=1)', 'print(s)',
      'for kw in ({"sck": Pin(3)}, {"mosi": Pin(2)}, {"miso": Pin(1)}):', '    try:', '        SPI(0, **kw)', '    except ValueError as e:', '        print(e)',
      'try:', '    SPI(0, firstbit=SPI.LSB)', 'except NotImplementedError as e:', '    print(e)',
    ));
    expect(out(r)).toEqual([
      'SPI(0, baudrate=8000000, polarity=0, phase=0, bits=8, sck=18, mosi=19, miso=16)',
      'SPI(1, baudrate=400000, polarity=1, phase=0, bits=8, sck=10, mosi=11, miso=8)',
      'bad SCK pin', 'bad MOSI pin', 'bad MISO pin', 'LSB',
    ]);
  });

  it('a transfer takes its time: 1000 bytes at 1 MHz ≈ 8 ms', async () => {
    const r = await run('pico-w', py('from machine import SPI', 'import time', 's = SPI(0)', 't = time.ticks_us()', 's.write(bytes(1000))', 'print(time.ticks_diff(time.ticks_us(), t) >= 8000)'));
    expect(out(r)).toEqual(['True']);
  });

  it('a MAX7219 sent mode 1 (the other clock edge) reads every bit one place off: its rows go wrong', async () => {
    const matrix: PartSpec = { id: 'm1', type: 'max7219', legs: {} };
    const wires: [string, string][] = [['m1.vcc', 'board.VBUS'], ['m1.gnd', 'board.GND'], ['m1.clk', 'board.GP18'], ['m1.din', 'board.GP19'], ['m1.cs', 'board.GP17']];
    const main = (mode: string) => py('from machine import SPI, Pin', `s = SPI(0, ${mode})`, 'cs = Pin(17, Pin.OUT, value=1)',
      'def reg(r, v):', '    cs(0)', '    s.write(bytes([r, v]))', '    cs(1)', 'reg(0x0C, 1)', 'reg(0x0F, 0)', 'reg(0x0B, 7)', 'reg(1, 0x81)');
    const good = await run('pico-w', main('polarity=0, phase=0'), spec('pico-w', [matrix], wires));
    const bad = await run('pico-w', main('polarity=0, phase=1'), spec('pico-w', [matrix], wires));
    expect(last(good, 'm1', 'matrix')).toMatchObject({ on: true, rows: [0x81, 0, 0, 0, 0, 0, 0, 0] });
    expect(last(bad, 'm1', 'matrix')?.rows).not.toEqual([0x81, 0, 0, 0, 0, 0, 0, 0]);
  });
});
