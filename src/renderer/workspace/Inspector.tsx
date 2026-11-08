import { useState } from 'react';
import { boardData, deleteMany, deleteWire, duplicate, joinsOf, partKind, rotateBoard, rotateParts, setBreadboardSize, setNeoPixel, setPartProp, setUsb, setWireColour, straighten, takeOutOfGpioBoard } from '@lib/editor';
import type { BoardId } from '@lib/boards';
import type { BreadboardSize } from '@lib/circuit';
import { NEOPIXEL, neopixelShape, type NeoPixelShape } from '@lib/circuit/neopixel';
import { onGpioBoard, type Project, type ProjectDoc } from '@lib/project';
import { boardName, boardPicture } from '../app/boards';
import { formatValue } from '@lib/units';
import { Chips, Icon, Segmented, Stepper, Swatches } from '../ui';
import { GPIO_BOARD_TYPE, MESSAGES, wireColour, type Selection } from './Canvas';
import { LibraryLine } from './AddLibrary';
import { bands, KIT, LED_SWATCHES, PartIcon, WIRE_COLOURS } from './drawings';

/**
 * The inspector (screen 02b, F-14): what the selected part, wire or breadboard is, and what can be set — a resistor's
 * value (E12 stepper, quick values, its colour bands), an LED's colour, a potentiometer's value, an RGB LED's common
 * leg and a battery pack's kind (M6.1, screens 17, 17b), a wire's colour, the breadboard's size. Delete removes a part or a wire (F-11). Only the kit's controls (N-14).
 */
export const SHRINK = 'Parts or wires use columns 31–63: move them first.';
export const SHRINK_MINI = 'A mini breadboard has 17 columns and no rails: move what is past column 17 or on a rail first.';
const QUICK_OHMS = [100, 220, 330, 1000, 4700, 10_000];
const POTS = [1000, 10_000, 100_000];
const PACKS = [{ value: '2xAA', label: '2×AA · 3 V' }, { value: '4xAA', label: '4×AA · 6 V' }, { value: '9V', label: '9 V' }];
const TEMPS = [{ value: 'TMP36', label: 'TMP36' }, { value: 'LM35', label: 'LM35' }];
const DHTS = [{ value: 'DHT11', label: 'DHT11' }, { value: 'DHT22', label: 'DHT22' }];
/** A sensor module's pins as printed on it, in order (M6.3, screen 18). */
const PRINTED: Record<string, [string, string][]> = {
  pir: [['vcc', 'VCC'], ['out', 'OUT'], ['gnd', 'GND']],
  'line-sensor': [['out', 'OUT'], ['gnd', 'GND'], ['vcc', 'VCC']],
  'soil-moisture': [['out', 'AOUT'], ['vcc', 'VCC'], ['gnd', 'GND']],
  'temp-sensor': [['vcc', '+Vs'], ['out', 'Vout'], ['gnd', 'GND']],
  dht: [['vcc', 'VCC'], ['out', 'DATA'], ['gnd', 'GND']],
  'hc-sr04': [['vcc', 'VCC'], ['trig', 'Trig'], ['echo', 'Echo'], ['gnd', 'GND']],
  mpu6050: [['vcc', 'VCC'], ['gnd', 'GND'], ['scl', 'SCL'], ['sda', 'SDA'], ['xda', 'XDA'], ['xcl', 'XCL'], ['ad0', 'AD0'], ['int', 'INT']],
  // M7: the servo's plug, the drivers' headers
  servo: [['signal', 'S'], ['vcc', '+'], ['gnd', '−']],
  ssd1306: [['gnd', 'GND'], ['vcc', 'VCC'], ['scl', 'SCL'], ['sda', 'SDA']],
  rc522: [['sda', 'SDA'], ['sck', 'SCK'], ['mosi', 'MOSI'], ['miso', 'MISO'], ['irq', 'IRQ'], ['gnd', 'GND'], ['rst', 'RST'], ['vcc', '3.3V']],
  'seven-segment': [['e', 'e'], ['d', 'd'], ['com2', 'COM'], ['c', 'c'], ['dp', 'dp'], ['g', 'g'], ['f', 'f'], ['com1', 'COM'], ['a', 'a'], ['b', 'b']],
  l9110s: [['b-ia', 'B-IA'], ['b-ib', 'B-IB'], ['gnd', 'GND'], ['vcc', 'VCC'], ['a-ia', 'A-IA'], ['a-ib', 'A-IB']],
  relay: [['s', 'S'], ['vcc', '+'], ['gnd', '−']],
  uln2003: [['in1', 'IN1'], ['in2', 'IN2'], ['in3', 'IN3'], ['in4', 'IN4'], ['-', '−'], ['+', '+']],
  // the kit's modules (M6.5a): drawings.tsx KIT has their printed names
  ...Object.fromEntries(Object.entries(KIT).map(([type, k]) => [type, k.legs.map((l, i): [string, string] => [l, k.labels[i]!])])),
};
const BUZZERS = [{ value: 'active', label: 'Active' }, { value: 'passive', label: 'Passive' }];
// M7 (screens 25, 25b)
const TRIGGERS = [{ value: 'high', label: 'S high' }, { value: 'low', label: 'S low' }];
const RAIL_VOLTS = [{ value: '5', label: '5 V' }, { value: '3.3', label: '3.3 V' }];
const ON_OFF = [{ value: 'on', label: 'On' }, { value: 'off', label: 'Off' }];
const COMMONS = [{ value: 'cathode', label: '− cathode' }, { value: 'anode', label: '+ anode' }];
// M7 slice 2 (screen 26): each display's I²C address, as its pads or its backpack set it
const ADDRESSES: Record<string, number[]> = { ssd1306: [0x3c, 0x3d], lcd1602: [0x27, 0x3f] };
/** A part's tip under its rows: what to know when it goes in. */
const TIPS: Record<string, string> = {
  led: 'The long leg (+) goes towards the pin or 3.3 V, the short leg (−) by the flat edge towards GND. Turned round, an LED doesn\'t light.',
  'rgb-led': 'Three LEDs in one: each of R, G and B needs its own resistor. Common cathode: the long leg to GND; common anode: to 3.3 V, and a pin set low lights its colour.',
  'slide-switch': 'The middle leg (2) is joined to leg 1 or to leg 3, whichever way the switch is slid.',
  ldr: 'More light, less resistance: about 15 kΩ in dim light, under 1 kΩ in bright light. With a resistor it makes a voltage an ADC pin can read.',
  'buzzer-active': 'Active: it beeps by itself at its own pitch — a pin on is a beep. + towards the pin, − to GND; turned round, it is silent.',
  'buzzer-passive': 'Passive: it plays the note of the PWM on its pin — PWM(Pin(15), freq=440) is A4; a steady level is silent.',
  pir: 'It needs 5 V (VBUS on the Pico W, VIN on the ESP32, 5V on the micro:bit\'s GPIO board); OUT is 3.3 V while it sees motion, and for 3 s after.',
  'line-sensor': 'OUT is 0 over white and 1 over the black line. Give it 3.3 V: from 5 V its 1 is 5 V, too much for the board\'s pins.',
  'soil-moisture': 'AOUT to an ADC pin: about 2.4 V in dry soil, 0.9 V in water — wetter is lower. 3.3 V or 5 V.',
  'temp-TMP36': 'TMP36: 0.5 V + 10 mV per °C on Vout (0.72 V at 22 °C), from 2.7–5.5 V. Its flat face towards you: +Vs, Vout, GND.',
  'temp-LM35': 'LM35: 10 mV per °C on Vout (0.22 V at 22 °C); it needs 4 V or more — VBUS, VIN or 5V. Flat face towards you: +Vs, Vout, GND.',
  dht: 'DATA to any pin — no resistor: the module has its pull-up. import dht; d = dht.DHT11(Pin(15)); d.measure(); then d.temperature(), d.humidity(). A DHT11 gives a new reading every second, a DHT22 every 2 s.',
  'hc-sr04': 'It needs 5 V (VBUS, VIN or 5V). A 10 µs pulse on Trig, then time_pulse_us on Echo: 58 µs per cm. Echo is 5 V: bring it down with 1 kΩ + 2 kΩ before the board\'s pin, or the pin is damaged.',
  mpu6050: 'SDA and SCL to the board\'s I²C pins (3.3 V or 5 V on VCC). It answers at 0x68 (AD0 high: 0x69) and starts asleep: write 0 to register 0x6B to wake it.',
  'button-module': 'S is pulled up to VCC on the module: it reads 1, and 0 while the button is pressed.',
  touch: 'SIG is 1 while a finger is on the pad, 0 otherwise. 2–5.5 V.',
  vibration: 'DO is 1 while it is shaken, 0 when it is still. The blue screw sets how hard a knock it needs.',
  'ir-obstacle': 'OUT is 0 when something is in front of it (a few cm), 1 when clear. The screw sets how far it sees.',
  hall: 'S is 0 with a magnet near (its south pole to the sensor), 1 otherwise.',
  flame: 'AO falls as a flame comes near (to an ADC pin); DO goes 0 past the screw\'s setting. It sees infrared: a lighter, a candle.',
  raindrop: 'Its plate on two wires; AO falls as the plate gets wet; DO goes 0 past the screw\'s setting.',
  'water-level': 'S to an ADC pin: 0 V dry, higher the deeper it is in water. Keep the board above the water line.',
  mq2: 'Its heater needs 5 V (VBUS, VIN or 5V) and draws ≈ 150 mA. AO rises with gas or smoke — from 5 V it can pass 3.3 V: a divider keeps it in the ADC\'s range. DO goes 0 past the screw\'s setting.',
  'ldr-module': 'S to an ADC pin: more light, more volts.',
  'pot-module': 'S to an ADC pin: from 0 V at one end of its turn to VCC at the other.',
  joystick: 'VRx and VRy to two ADC pins: the middle at rest. SW goes to GND when the stick is pressed — give it Pin.PULL_UP.',
  'rotary-encoder': 'CLK and DT (pulled up on the module) close in turn as it is turned: when CLK falls, DT already low means clockwise. SW to GND when pressed — give it Pin.PULL_UP.',
  'speed-sensor': 'A wheel with 20 slots turns in its gap: DO pulses 20 times a turn. Count them in a second for the speed.',
  pcf8591: 'On I²C at 0x48: write 0x40 + the input (0–3), then read 2 bytes — the second is the input, 0–255 of VCC. A second byte written goes out on AOUT.',
  bmp280: 'On I²C at 0x76 (SDO to VCC: 0x77); a 3.3 V part. It starts asleep: write 0x27 to 0xF4, then read 0xF7–0xFC and its calibration at 0x88 — a driver turns them into °C and hPa.',
  ds18b20: 'On 1-Wire: import onewire, ds18x20 (Pico W, ESP32). The module has its 4.7 kΩ pull-up. A reading takes 750 ms after convert_temp(); before the first it says 85 °C.',
  ds1302: 'CLK, DAT and RST to any pins; a driver sends bytes LSB first (lib/ds1302.py in the example). Its coin cell keeps the time while the board is off.',
  vl53l0x: 'On I²C at 0x29 (XSHUT low: off). Its start-up is long: use a driver (the vl53l0x library, above). A range takes about 30 ms; nothing within 2 m reads 8190.',
  max30102: 'On I²C at 0x57. Set SpO2 mode (0x09 = 3), then read its FIFO: red and IR, 3 bytes each. A program finds the beats in IR, and the oxygen from red against IR.',
  battery: 'A supply of its own, not joined to the board. To use it with the board, join its − to the board\'s GND.',
  // M7 (screens 25, 25b, 25c)
  servo: 'S to a PWM pin at 50 Hz: a 0.5 ms pulse is 0°, 2.5 ms 180°. + needs 5 V (VBUS, VIN or 5V) — on 3.3 V it can\'t turn. It draws ≈ 200 mA while it turns.',
  motor: 'Never straight on a pin: a motor needs far more current than a pin can give. Wire its tabs to a driver\'s screws (L9110S, L298N), the driver on 5 V.',
  pump: 'Like a motor, it needs more than a pin can give: switch it with a relay module or a driver, on a supply of its own (a 4×AA pack).',
  l9110s: 'A-IA high and A-IB low turns MOTOR A one way, the other way round the other way; both low stops it. PWM on one input sets the speed. VCC 2.5–12 V: VBUS, VIN or 5V.',
  l298n: 'IN1 / IN2 turn motor A (OUT1, OUT2), IN3 / IN4 motor B. Its 12V screw takes the motors\' supply (5–12 V), GND joined to the board\'s. Its bridge loses about 2 V.',
  relay: 'S high switches COM from NC to NO; its coil needs 5 V on + (VBUS, VIN or 5V) — on 3.3 V it doesn\'t pull in. What it switches is apart from the board.',
  uln2003: 'IN1–IN4 to four pins, + to 5 V, − to GND. Turn on the coils in turn — A, AB, B, BC … — and the 28BYJ-48 steps: 4096 half steps a turn. Its LEDs show the coils.',
  stepper: 'Its cable goes into the ULN2003\'s socket; it steps as the ULN2003\'s coils turn on in turn.',
  'traffic-module': 'R, Y and G to three pins: each LED has its resistor on the board.',
  'rgb-module': 'R, G and B to three pins (PWM mixes them), − to GND: each die has its resistor on the board.',
  'buzzer-module': 'I/O to a PWM pin: PWM(Pin(15), freq=440) plays A4. VCC 3.3 V or 5 V.',
  'power-supply': 'Up to 700 mA from its own jack or USB, apart from the board: join a GND to the board\'s. Each rail pair\'s jumper is 5 V or 3.3 V — click it on the canvas, or set it here.',
  // M7 slice 2 (screens 26, 26b)
  ssd1306: 'On I²C at 0x3C (0x3D with its pad moved); 3.3–5 V. Draw with the ssd1306 library, then show() sends the picture.',
  lcd1602: 'Needs 5 V: on 3.3 V its letters are too faint to read. Its address must be the one in the code — i2c.scan() lists what answers.',
  'seven-segment': 'Each segment is an LED: a pin to each, COM to GND through a resistor (common cathode). One resistor on COM is shared by the lit segments; one on each keeps them as bright.',
  tm1637: 'Any two pins for CLK and DIO (the tm1637 library); 3.3–5 V.',
  rc522: '3.3 V only — 5 V would damage a real one. SCK, MOSI and MISO to the board\'s SPI pins, SDA (its chip select) and RST to any two (the mfrc522 library). While it runs, hold the card or the key fob to it on the Inputs card.',
  max7219: 'Needs 5 V (VBUS, VIN or 5V). DIN to SPI MOSI, CLK to SCK, CS to any pin; its right-hand header chains another.',
  // M7 slice 5 (screens 28, 28b, 28c)
  'usb-serial': 'Its terminal is what a serial monitor on the laptop shows. The board\'s TX to its RXD, its RX to TXD — they cross; GND to GND. The baud rate must be the board\'s.',
  hc05: 'VCC on 5V; the board\'s TX to its RXD, its RX to TXD, 9600 baud. While the program runs, connect the phone on its card and send it messages.',
  gps: 'Its TX to the board\'s RX (9600 baud): a sentence of where it is once a second. Set its place and fix on its card while the program runs.',
  // M7 slice 3 (screen 27)
  neopixel: 'Its 5V to VBUS, VIN or 5V (3.3 V works, a little dim). DIN to any pin — NeoPixel(Pin(0), 8); DOUT goes on to the next one\'s DIN. Each LED draws up to 60 mA at full white: keep them dim on USB.',
};
const SHAPES = [{ value: 'stick', label: 'Stick' }, { value: 'ring', label: 'Ring' }];
const BAUD_RATES = [9600, 19200, 38400, 57600, 115200].map((b) => ({ value: String(b), label: String(b) }));
const LINE_ENDINGS = [{ value: 'none', label: 'none' }, { value: 'lf', label: '\\n' }, { value: 'crlf', label: '\\r\\n' }];
const BT_KINDS = [{ value: 'HC-05', label: 'HC-05' }, { value: 'JDY-31', label: 'JDY-31' }];
const WIRE_SWATCHES = Object.entries(WIRE_COLOURS).map(([value, [colour]]) => ({ value, name: value[0]!.toUpperCase() + value.slice(1), colour }));

export interface InspectorProps {
  project: Project;
  selection: Selection;
  /** `merge` names the value changed, so a run of changes to it is one undo step (M5.1). */
  onChange: (project: Project, merge?: string) => void;
  onClose: () => void;
  /** Duplicate selects the copy (M5.4). */
  onSelect?: (s: Selection[]) => void;
  /** The project's files, for a part's Library line (M6.7, screen 22b): what it needs, and Add. */
  doc?: ProjectDoc;
  onDoc?: (doc: ProjectDoc) => void;
  /** Said on the canvas: what an edit here did there (M6.9: the wires that went with the GPIO board). */
  onNotice?: (text: string) => void;
}

const USB = [{ value: 'in', label: 'Plugged in · 5V' }, { value: 'out', label: 'Out' }];

export function Inspector({ project, selection, onChange, onClose, onSelect, doc, onDoc, onNotice }: InspectorProps) {
  const [error, setError] = useState<string | null>(null);
  const board = project.board as BoardId;
  const label = (ref: string) => {
    if (!ref.startsWith('board.')) return ref.slice(ref.indexOf('.') + 1);
    const pin = boardData(board).pins.find((p) => `board.${p.id}` === ref);
    return pin?.label ?? ref.slice(6);
  };

  let icon: React.ReactNode;
  let title: string;
  let rows: React.ReactNode;
  let remove: (() => Project) | undefined;
  let partActions: React.ReactNode;

  if (selection.kind === 'part') {
    const part = project.parts.find((p) => p.id === selection.id);
    if (!part) return null;
    const kind = partKind(part.type);
    const set = (key: string, v: number | string | boolean) => onChange(setPartProp(project, part.id, key, v), `${part.id}.${key}`);
    icon = <PartIcon type={part.type} />;
    title = `${part.id.toUpperCase()} · ${kind.name}`;
    remove = () => deleteMany(project, { parts: [part.id], wires: [] });
    // screen 02b: Rotate · Duplicate · Delete
    partActions = (
      <div className="actions">
        <button type="button" className="btn sm" title="Rotate (R)" onClick={() => {
          const next = rotateParts(project, [part.id]);
          if (!next) { setError(MESSAGES.noTurn); return; }
          setError(null);
          onChange(next);
        }}><Icon name="rotate" size={14} /> Rotate</button>
        <button type="button" className="btn sm icon" aria-label="Duplicate" title="Duplicate (⌘D / Ctrl+D)" onClick={() => {
          const r = duplicate(project, { parts: [part.id], wires: [] });
          if (!r) { setError(MESSAGES.noCopy); return; }
          setError(null);
          onChange(r.project);
          onSelect?.([{ kind: 'part', id: r.parts[0]! }]);
        }}><Icon name="copy" size={14} /></button>
        <button type="button" className="btn sm icon danger" aria-label="Delete" title="Delete (Delete key)" onClick={() => { onChange(deleteMany(project, { parts: [part.id], wires: [] })); onClose(); }}>
          <Icon name="trash" size={14} />
        </button>
      </div>
    );
    const ohms = Number(part.props?.ohms ?? kind.props.ohms ?? 0);
    rows = (
      <>
        {part.type === 'resistor' && (
          <>
            <Row name="Resistance">
              <Stepper label="Resistance" hideLabel series="e12" min={1} max={10_000_000} unit="Ω" size="sm" value={ohms} onChange={(v) => set('ohms', v)} />
            </Row>
            <Row name=""><Chips label="Common values" values={QUICK_OHMS} value={ohms} onChange={(v) => set('ohms', v)} /></Row>
            <Row name="Colour bands">
              <span className="bands" aria-label={`Colour bands for ${formatValue(ohms)} Ω`}>
                {bands(ohms).map((c, i) => <i key={i} style={{ background: c }} />)}
              </span>
            </Row>
          </>
        )}
        {part.type === 'led' && (
          <Row name="Colour">
            <Swatches label="LED colour" hideLabel colours={LED_SWATCHES} value={String(part.props?.color ?? 'red')} onChange={(v) => set('color', v)} />
          </Row>
        )}
        {part.type === 'rgb-led' && (
          <Row name="Common">
            <Segmented label="Common leg" hideLabel value={String(part.props?.common ?? 'cathode')} onChange={(v) => set('common', v)} options={COMMONS} />
          </Row>
        )}
        {(part.type === 'temp-sensor' || part.type === 'dht') && (
          <Row name="Kind">
            <Segmented label="Sensor kind" hideLabel value={String(part.props?.kind ?? (part.type === 'dht' ? 'DHT11' : 'TMP36'))}
              onChange={(v) => set('kind', v)} options={part.type === 'dht' ? DHTS : TEMPS} />
          </Row>
        )}
        {part.type === 'buzzer' && (
          <Row name="Kind">
            <Segmented label="Buzzer kind" hideLabel value={String(part.props?.kind ?? 'active')} onChange={(v) => set('kind', v)} options={BUZZERS} />
          </Row>
        )}
        {part.type === 'battery' && (
          <Row name="Pack" stack>
            <Segmented label="Battery pack" hideLabel full value={String(part.props?.kind ?? '2xAA')} onChange={(v) => set('kind', v)} options={PACKS} />
          </Row>
        )}
        {ADDRESSES[part.type] && (
          <Row name="Address">
            <Segmented label="I²C address" hideLabel value={String(Number(part.props?.address ?? ADDRESSES[part.type]![0]))} onChange={(v) => set('address', Number(v))}
              options={ADDRESSES[part.type]!.map((a) => ({ value: String(a), label: `0x${a.toString(16).toUpperCase()}` }))} />
          </Row>
        )}
        {part.type === 'neopixel' && (() => {
          const { shape, leds } = neopixelShape(part.props);
          const size = (s: NeoPixelShape, n: number) => onChange(setNeoPixel(project, part.id, s, n));
          return (
            <>
              <Row name="Shape">
                <Segmented label="NeoPixel shape" hideLabel value={shape} onChange={(v) => size(v as NeoPixelShape, v === 'ring' ? 12 : 8)} options={SHAPES} />
              </Row>
              <Row name="LEDs">
                <Segmented label="LEDs" hideLabel value={String(leds)} onChange={(v) => size(shape, Number(v))}
                  options={NEOPIXEL.sizes[shape].map((n) => ({ value: String(n), label: String(n) }))} />
              </Row>
              <Row name="Full white"><span className="small">up to {leds * 60} mA — {leds} LEDs × 60 mA</span></Row>
            </>
          );
        })()}
        {part.type === 'usb-serial' && (
          <>
            <Row name="Baud" stack>
              <Segmented label="Terminal baud rate" hideLabel full value={String(part.props?.baud ?? 9600)} onChange={(v) => set('baud', Number(v))} options={BAUD_RATES} />
            </Row>
            <Row name="Line ending">
              <Segmented label="Line ending" hideLabel value={String(part.props?.ending ?? 'crlf')} onChange={(v) => set('ending', v)} options={LINE_ENDINGS} />
            </Row>
          </>
        )}
        {part.type === 'hc05' && (
          <Row name="Kind">
            <Segmented label="Bluetooth module" hideLabel value={String(part.props?.kind ?? 'HC-05')} onChange={(v) => set('kind', v)} options={BT_KINDS} />
          </Row>
        )}
        {part.type === 'seven-segment' && (
          <Row name="Common">
            <Segmented label="Common pins" hideLabel value={String(part.props?.common ?? 'cathode')} onChange={(v) => set('common', v)} options={COMMONS} />
          </Row>
        )}
        {part.type === 'relay' && (
          <Row name="On with">
            <Segmented label="Relay trigger" hideLabel value={String(part.props?.trigger ?? 'high')} onChange={(v) => set('trigger', v)} options={TRIGGERS} />
          </Row>
        )}
        {part.type === 'l298n' && ([['ena', 'ENA jumper'], ['enb', 'ENB jumper'], ['regulator', '5V-EN jumper']] as const).map(([key, name]) => (
          <Row key={key} name={name}>
            <Segmented label={name} hideLabel value={part.props?.[key] === false ? 'off' : 'on'} onChange={(v) => set(key, v === 'on')} options={ON_OFF} />
          </Row>
        ))}
        {part.type === 'power-supply' && (
          <>
            {(['top', 'bottom'] as const).map((pair) => (
              <Row key={pair} name={pair === 'top' ? 'Top rails' : 'Bottom rails'}>
                <Segmented label={pair === 'top' ? 'Top rails' : 'Bottom rails'} hideLabel value={String(part.props?.[pair] ?? (pair === 'top' ? 5 : 3.3))}
                  onChange={(v) => set(pair, Number(v))} options={RAIL_VOLTS} />
              </Row>
            ))}
            <Row name="Power">
              <Segmented label="Power" hideLabel value={part.props?.on === false ? 'off' : 'on'} onChange={(v) => set('on', v === 'on')} options={ON_OFF} />
            </Row>
          </>
        )}
        {part.type === 'potentiometer' && (
          <Row name="Value">
            <Segmented label="Potentiometer value" hideLabel value={String(ohms)} onChange={(v) => set('ohms', Number(v))}
              options={POTS.map((v) => ({ value: String(v), label: `${formatValue(v)}Ω` }))} />
          </Row>
        )}
        {part.type === 'led' ? (
          <Row name="Legs in">
            <span className="small legs">
              <span><b className="plus">+</b> anode <span className="mono">{label(part.legs.a!)}</span></span>
              <span><b className="minus">−</b> cathode <span className="mono">{label(part.legs.k!)}</span></span>
            </span>
          </Row>
        ) : part.type === 'battery' ? (
          <Row name="Legs in">
            <span className="small legs">
              <span><b className="plus">+</b> red lead <span className="mono">{label(part.legs['+']!)}</span></span>
              <span><b className="minus">−</b> black lead <span className="mono">{label(part.legs['-']!)}</span></span>
            </span>
          </Row>
        ) : part.type === 'buzzer' ? (
          <Row name="Legs in">
            <span className="small legs">
              <span><b className="plus">+</b> <span className="mono">{label(part.legs['+']!)}</span></span>
              <span><b className="minus">−</b> <span className="mono">{label(part.legs['-']!)}</span></span>
            </span>
          </Row>
        ) : part.type === 'stepper' ? (
          <Row name="Cable in">
            <span className="small">{part.legs.red ? `${part.legs.red.slice(0, part.legs.red.indexOf('.')).toUpperCase()}'s socket` : 'nothing — plug it into a ULN2003'}</span>
          </Row>
        ) : kind.free ? (
          <Row name="Lies">
            <span className="small">beside the breadboard — wire its {part.type === 'l298n' ? 'screws and header pins' : ['lcd1602', 'tm1637', 'max7219'].includes(part.type) ? 'header pins' : part.type === 'neopixel' ? 'pads' : ['usb-serial', 'hc05', 'gps'].includes(part.type) ? 'header pins' : 'tabs'}</span>
          </Row>
        ) : part.type === 'power-supply' ? (
          <Row name="Pins in"><span className="small mono">{label(part.legs['t-1']!).replace(/^T-/, 'columns ')}–{Number(label(part.legs['t-1']!).replace(/^T-/, '')) + 1}, both rail pairs</span></Row>
        ) : PRINTED[part.type] ? (
          <Row name="Legs in"><span className="small mono">{PRINTED[part.type]!.map(([leg, name]) => `${name} ${label(part.legs[leg]!)}`).join(', ')}</span></Row>
        ) : part.type === 'rgb-led' ? (
          <Row name="Legs in">
            <span className="small mono">
              {(['r', 'common', 'g', 'b'] as const).map((k) => `${k === 'common' ? (part.props?.common === 'anode' ? '+' : '−') : k.toUpperCase()} ${label(part.legs[k]!)}`).join(', ')}
            </span>
          </Row>
        ) : (
          <Row name="Legs in"><span className="small mono">{Object.values(part.legs).map(label).join(', ')}</span></Row>
        )}
        <Row name="Joins">
          <span className="small joins">{(() => {
            const joins = joinsOf(project, part.id);
            return joins.every((j) => j === 'nothing') ? 'nothing yet' : joins.join(' ↔ ');
          })()}</span>
        </Row>
        {doc && onDoc && <LibraryLine doc={{ ...doc, project }} type={part.type} onDoc={onDoc} />}
        {(() => {
          const tip = TIPS[part.type === 'buzzer' ? `buzzer-${part.props?.kind === 'passive' ? 'passive' : 'active'}`
            : part.type === 'temp-sensor' ? `temp-${part.props?.kind === 'LM35' ? 'LM35' : 'TMP36'}` : part.type];
          return tip ? <p className="tiny muted led-tip">{tip}</p> : null;
        })()}
      </>
    );
  } else if (selection.kind === 'wire') {
    const wire = project.wires.find((w) => w.id === selection.id);
    if (!wire) return null;
    const role = (ref: string) => boardData(board).pins.find((p) => `board.${p.id}` === ref)?.role;
    const colour = wire.color ?? wireColour(wire.id, role(wire.a) ?? role(wire.b));
    icon = <span className="wire-sw" style={{ background: WIRE_COLOURS[colour]?.[0] }} />;
    title = `${wire.id.toUpperCase()} · Wire`;
    remove = () => deleteWire(project, wire.id);
    rows = (
      <>
        <Row name="Colour">
          <Swatches label="Wire colour" hideLabel colours={WIRE_SWATCHES} value={colour} onChange={(v) => onChange(setWireColour(project, wire.id, v), `${wire.id}.color`)} />
        </Row>
        <Row name="Joins"><span className="small mono">{label(wire.a)} ↔ {label(wire.b)}</span></Row>
        <Row name="Bends">
          <span className="bends-row">
            <span className="small">{wire.via?.length ?? 0}</span>
            <button type="button" className="btn sm" disabled={!wire.via?.length} onClick={() => onChange(straighten(project, wire.id))}>Straighten</button>
          </span>
        </Row>
        <p className="tiny muted led-tip">Drag a bend to move it, double-click it to take it away; drag a dot in the middle of a stretch to add one.</p>
      </>
    );
  } else if (selection.kind === 'board' && !onGpioBoard(project)) {
    // M7 (the teacher's request): the board itself, turned a quarter at a time; its wires stay on its pins
    icon = <img src={boardPicture(project)} alt="" draggable={false} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />;
    title = boardName(project);
    rows = (
      <>
        <p className="tiny muted board-sub">Its pins are where its picture has them; turned, the wires stay on them.</p>
        <div className="actions">
          <button type="button" className="btn sm" title="Rotate (R)" onClick={() => onChange(rotateBoard(project))}><Icon name="rotate" size={14} /> Rotate</button>
        </div>
      </>
    );
  } else if (selection.kind === 'board') {
    // M6.9 (screen 24b): the micro:bit's GPIO board — its micro-USB, and the micro:bit taken out of it
    icon = <PartIcon type={GPIO_BOARD_TYPE} />;
    title = 'micro:bit GPIO board';
    rows = (
      <>
        <p className="tiny muted board-sub">The micro:bit is in its slot.</p>
        <Row name="Pins"><span className="small">P0–P20 in two rows · I²C header · 3.3V, 5V, GND</span></Row>
        <Row name="micro-USB">
          <Segmented label="micro-USB cable" hideLabel value={project.usb === false ? 'out' : 'in'} options={USB}
            onChange={(v) => onChange(setUsb(project, v === 'in'))} />
        </Row>
        <p className="tiny muted led-tip">Without the GPIO board the micro:bit has its five rings: 0, 1, 2, 3V and GND.</p>
        <div className="actions">
          <button type="button" className="btn sm" title="Rotate (R)" onClick={() => onChange(rotateBoard(project))}><Icon name="rotate" size={14} /> Rotate</button>
          <button type="button" className="btn sm danger" onClick={() => {
            const r = takeOutOfGpioBoard(project);
            onChange(r.project);
            onNotice?.(MESSAGES.outOfGpioBoard(r.removed));
            onClose();
          }}><Icon name="trash" size={14} /> Take the micro:bit out</button>
        </div>
      </>
    );
  } else {
    const bb = project.breadboards.find((b) => b.id === selection.id);
    if (!bb) return null;
    icon = <Icon name="grid" />;
    title = `${bb.id.toUpperCase()} · Breadboard`;
    rows = (
      <>
        <Row name="Size" stack>
          <Segmented<BreadboardSize> label="Breadboard size" hideLabel full value={bb.size}
            options={[{ value: 'mini', label: 'Mini · 17' }, { value: 'half', label: 'Half · 30' }, { value: 'full', label: 'Full · 63' }]}
            onChange={(size) => {
              const next = setBreadboardSize(project, bb.id, size);
              if (!next) { setError(size === 'mini' ? SHRINK_MINI : SHRINK); return; }
              setError(null);
              onChange(next);
            }} />
        </Row>
        {error && <p className="small inspector-error" role="alert">{error}</p>}
      </>
    );
  }

  return (
    <aside className="float inspector" aria-label="Inspector">
      <div className="ih">
        <span className="pic">{icon}</span>
        <b>{title}</b>
        <span className="spacer" />
        <button type="button" className="btn ghost sm icon" aria-label="Close the inspector" title="Close (Esc)" onClick={onClose}><Icon name="x" size={14} /></button>
      </div>
      {rows}
      {error && selection.kind === 'part' && <p className="small inspector-error" role="alert">{error}</p>}
      {partActions}
      {remove && !partActions && (
        <div className="actions">
          <button type="button" className="btn sm danger" onClick={() => { onChange(remove!()); onClose(); }}>
            <Icon name="trash" size={14} /> Delete
          </button>
          <span className="tiny muted">or press Delete</span>
        </div>
      )}
    </aside>
  );
}

/** A property: its name, then what it is; `stack` puts a wide control under its name. */
function Row({ name, children, stack = false }: { name: string; children: React.ReactNode; stack?: boolean }) {
  return <div className={stack ? 'prop stack' : 'prop'}><span>{name}</span><div className="pv">{children}</div></div>;
}
