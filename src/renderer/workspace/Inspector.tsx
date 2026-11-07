import { useState } from 'react';
import { boardData, deletePart, deleteWire, duplicate, joinsOf, partKind, rotateParts, setBreadboardSize, setPartProp, setWireColour, straighten } from '@lib/editor';
import type { BoardId } from '@lib/boards';
import type { BreadboardSize } from '@lib/circuit';
import type { Project } from '@lib/project';
import { formatValue } from '@lib/units';
import { Chips, Icon, Segmented, Stepper, Swatches } from '../ui';
import { MESSAGES, wireColour, type Selection } from './Canvas';
import { bands, KIT, LED_SWATCHES, PartIcon, WIRE_COLOURS } from './drawings';

/**
 * The inspector (screen 02b, F-14): what the selected part, wire or breadboard is, and what can be set — a resistor's
 * value (E12 stepper, quick values, its colour bands), an LED's colour, a potentiometer's value, an RGB LED's common
 * leg and a battery pack's kind (M6.1, screens 17, 17b), a wire's colour, the breadboard's size. Delete removes a part or a wire (F-11). Only the kit's controls (N-14).
 */
export const SHRINK = 'Parts or wires use columns 31–63: move them first.';
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
  // the kit's modules (M6.5a): drawings.tsx KIT has their printed names
  ...Object.fromEntries(Object.entries(KIT).map(([type, k]) => [type, k.legs.map((l, i): [string, string] => [l, k.labels[i]!])])),
};
const BUZZERS = [{ value: 'active', label: 'Active' }, { value: 'passive', label: 'Passive' }];
const COMMONS = [{ value: 'cathode', label: '− cathode' }, { value: 'anode', label: '+ anode' }];
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
  'rotary-encoder': 'CLK and DT (pulled up on the module) close in turn as it is turned: when CLK falls, DT says which way. SW to GND when pressed — give it Pin.PULL_UP.',
  'speed-sensor': 'A wheel with 20 slots turns in its gap: DO pulses 20 times a turn. Count them in a second for the speed.',
  pcf8591: 'On I²C at 0x48: write 0x40 + the input (0–3), then read 2 bytes — the second is the input, 0–255 of VCC. A second byte written goes out on AOUT.',
  bmp280: 'On I²C at 0x76 (SDO to VCC: 0x77); a 3.3 V part. It starts asleep: write 0x27 to 0xF4, then read 0xF7–0xFC and its calibration at 0x88 — a driver turns them into °C and hPa.',
  ds18b20: 'On 1-Wire: import onewire, ds18x20 (Pico W, ESP32). The module has its 4.7 kΩ pull-up. A reading takes 750 ms after convert_temp(); before the first it says 85 °C.',
  ds1302: 'CLK, DAT and RST to any pins; a driver sends bytes LSB first (lib/ds1302.py in the example). Its coin cell keeps the time while the board is off.',
  vl53l0x: 'On I²C at 0x29 (XSHUT low: off). Its start-up is long: use a driver (Pololu\'s, in MicroPython). A range takes about 30 ms; nothing within 2 m reads 8190.',
  max30102: 'On I²C at 0x57. Set SpO2 mode (0x09 = 3), then read its FIFO: red and IR, 3 bytes each. A program finds the beats in IR, and the oxygen from red against IR.',
  battery: 'A supply of its own, not joined to the board. To use it with the board, join its − to the board\'s GND.',
};
const WIRE_SWATCHES = Object.entries(WIRE_COLOURS).map(([value, [colour]]) => ({ value, name: value[0]!.toUpperCase() + value.slice(1), colour }));

export interface InspectorProps {
  project: Project;
  selection: Selection;
  /** `merge` names the value changed, so a run of changes to it is one undo step (M5.1). */
  onChange: (project: Project, merge?: string) => void;
  onClose: () => void;
  /** Duplicate selects the copy (M5.4). */
  onSelect?: (s: Selection[]) => void;
}

export function Inspector({ project, selection, onChange, onClose, onSelect }: InspectorProps) {
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
    const set = (key: string, v: number | string) => onChange(setPartProp(project, part.id, key, v), `${part.id}.${key}`);
    icon = <PartIcon type={part.type} />;
    title = `${part.id.toUpperCase()} · ${kind.name}`;
    remove = () => deletePart(project, part.id);
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
        <button type="button" className="btn sm icon danger" aria-label="Delete" title="Delete (Delete key)" onClick={() => { onChange(deletePart(project, part.id)); onClose(); }}>
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
  } else {
    const bb = project.breadboards.find((b) => b.id === selection.id);
    if (!bb) return null;
    icon = <Icon name="grid" />;
    title = `${bb.id.toUpperCase()} · Breadboard`;
    rows = (
      <>
        <Row name="Size">
          <Segmented<BreadboardSize> label="Breadboard size" hideLabel value={bb.size}
            options={[{ value: 'half', label: 'Half · 30' }, { value: 'full', label: 'Full · 63' }]}
            onChange={(size) => {
              const next = setBreadboardSize(project, bb.id, size);
              if (!next) { setError(SHRINK); return; }
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
