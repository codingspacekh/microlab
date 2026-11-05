import { useState } from 'react';
import {
  Checkbox, Chips, Icon, RadioGroup, Segmented, Select, Slider, Stepper, Swatches, Switch, TextArea, TextField,
} from '../ui';

/**
 * Screen 12b with the real kit (M4.1b): every control, in every state, live — the design system's page, opened with
 * #controls. The e2e test tabs through it; it is also the place to look when a control's style changes.
 */
const LED = [
  { value: 'red', label: 'Red', hint: '2.0 V', dot: '#e53935' },
  { value: 'yellow', label: 'Yellow', hint: '2.1 V', dot: '#f2b705' },
  { value: 'green', label: 'Green', hint: '2.2 V', dot: '#2fa253' },
  { value: 'blue', label: 'Blue', hint: '3.0 V', dot: '#2f6fd6' },
  { value: 'white', label: 'White', hint: '3.0 V', dot: '#f4f5f7' },
];
const BOARDS = [
  { value: 'microbit-v2', label: 'BBC micro:bit V2' },
  { value: 'pico-w', label: 'Raspberry Pi Pico W' },
  { value: 'esp32-devkit-v1', label: 'ESP32 DevKit V1' },
  { value: 'esp32-devkit-v1-ext', label: 'ESP32 DevKit V1 with extension board' },
];
const WIRES = [
  { value: '#de3b3b', name: 'Red' }, { value: '#3a3d42', name: 'Black' }, { value: '#f08024', name: 'Orange' },
  { value: '#efbd16', name: 'Yellow' }, { value: '#2fa253', name: 'Green' }, { value: '#2f6fd6', name: 'Blue' },
  { value: '#9160d6', name: 'Purple' }, { value: '#f4f5f7', name: 'White' },
];
const noop = () => {};

export function ControlsPage() {
  const [name, setName] = useState('Traffic lights');
  const [search, setSearch] = useState('servo');
  const [notes, setNotes] = useState('Build with the green LED first, then add the button.');
  const [wire, setWire] = useState('#2fa253');
  const [rgb, setRgb] = useState({ r: 255, g: 80, b: 216 });
  const [led, setLed] = useState('red');
  const [board, setBoard] = useState('pico-w');
  const [ohms, setOhms] = useState(220);
  const [unit, setUnit] = useState('ohm');
  const [angle, setAngle] = useState(200);
  const [run, setRun] = useState(true);
  const [remove, setRemove] = useState(false);
  const [lib, setLib] = useState<boolean | 'mixed'>('mixed');
  const [bb, setBb] = useState('half');
  const [lux, setLux] = useState(620);
  const [temp, setTemp] = useState(24);
  const [cm, setCm] = useState(34);
  const [hover, setHover] = useState(true);
  const [sound, setSound] = useState(false);
  const [autosave, setAutosave] = useState(true);
  const [boards, setBoards] = useState('all');

  const hex = `#${[rgb.r, rgb.g, rgb.b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
  return (
    <main className="fc" aria-label="Form controls">
      <div className="fcol">
        <section className="card">
          <h2>Text fields <small>name · search · value</small></h2>
          <TextField label="Project name" value={name} onChange={setName} help={<>Saved as <span className="mono">{name || 'Untitled'}.mlab</span></>} />
          <TextField label="Search" icon="search" clearable value={search} onChange={setSearch} placeholder="Search parts" />
          <div className="states">
            <div className="st">Normal<TextField label="Normal" hideLabel value="" placeholder="Type here" onChange={noop} /></div>
            <div className="st">Error<TextField label="Error" hideLabel value="main.p y" error onChange={noop} /></div>
            <div className="st">Disabled<TextField label="Disabled" hideLabel value="main.py" disabled onChange={noop} /></div>
          </div>
          <span className="help err"><Icon name="alert" size={12} /> A file name can&apos;t have spaces in MicroPython imports.</span>
          <TextArea label="Notes" value={notes} onChange={setNotes} />
        </section>
        <section className="card">
          <h2>Colour pickers <small>wires · LEDs · NeoPixels</small></h2>
          <Swatches label="Wire colour" colours={WIRES} value={wire} onChange={setWire} help="Red and black are kept for power and GND." />
          <div className="fld">
            <label>NeoPixel 3</label>
            <div className="row" style={{ gap: 10, alignItems: 'stretch' }}>
              <div style={{ width: 64, flex: 'none', borderRadius: 8, background: hex, boxShadow: 'inset 0 0 0 1px rgba(0,0,0,.08)' }} />
              <div className="col" style={{ gap: 6, flex: 1, minWidth: 0 }}>
                <Slider compact label="R" min={0} max={255} value={rgb.r} colour="#e53935" onChange={(r) => setRgb({ ...rgb, r })} />
                <Slider compact label="G" min={0} max={255} value={rgb.g} colour="#2fa253" onChange={(g) => setRgb({ ...rgb, g })} />
                <Slider compact label="B" min={0} max={255} value={rgb.b} colour="#2f6fd6" onChange={(b) => setRgb({ ...rgb, b })} />
              </div>
            </div>
          </div>
        </section>
      </div>
      <div className="fcol">
        <section className="card">
          <h2>Dropdown <small>never a native select</small></h2>
          <Select label="LED colour" options={LED} value={led} onChange={setLed} />
          <Select label="Board" options={BOARDS} value={board} onChange={setBoard} />
          <div className="states">
            <div className="st">Error<Select label="Error" hideLabel options={LED} value={undefined} error onChange={noop} /></div>
            <div className="st">Disabled<Select label="Disabled" hideLabel options={LED} value="red" disabled onChange={noop} /></div>
          </div>
        </section>
        <section className="card">
          <h2>Numbers <small>stepper · quick values</small></h2>
          <div className="fld">
            <div className="two">
              <Stepper label="Resistance" series="e12" min={1} max={10_000_000} value={ohms} onChange={setOhms} />
              <Select label="Unit" options={[{ value: 'ohm', label: 'Ω' }, { value: 'kohm', label: 'kΩ' }]} value={unit} onChange={setUnit} />
            </div>
            <Chips label="Quick values" values={[100, 220, 330, 1000, 4700, 10_000]} value={ohms} onChange={setOhms} />
            <span className="help">− / + step through the standard values (E12).</span>
          </div>
          <Stepper label="Servo angle" unit="°" step={1} value={angle} onChange={setAngle}
            error={angle < 0 || angle > 180 ? 'An SG90 turns 0–180°.' : undefined} />
        </section>
      </div>
      <div className="fcol">
        <section className="card">
          <h2>Checkboxes &amp; radio buttons</h2>
          <div className="col" style={{ gap: 2 }}>
            <Checkbox label="Run it when copied" hint="and show the board's console here" value={run} onChange={setRun} />
            <Checkbox label="Remove other files on the board" hint="files that aren't in this project" value={remove} onChange={setRemove} />
            <Checkbox label="lib/" hint="2 of 3 files chosen" value={lib} onChange={setLib} />
            <Checkbox label="Keep a copy of the old main.py" hint="not on the micro:bit (no space)" value disabled onChange={noop} />
          </div>
          <RadioGroup label="One of" value={bb} onChange={setBb} options={[
            { value: 'half', label: 'Half breadboard', hint: '30 columns' },
            { value: 'full', label: 'Full breadboard', hint: '63 columns' },
            { value: 'none', label: 'No breadboard', hint: 'wires straight to the pins', disabled: true },
          ]} />
        </section>
        <section className="card">
          <h2>Sliders <small>inputs while running</small></h2>
          <Slider label="Light" icon="sun" min={0} max={1000} step={10} value={lux} onChange={setLux} format={(v) => `${v} lx`} />
          <Slider label="Temp" icon="therm" min={-10} max={50} value={temp} onChange={setTemp} format={(v) => `${v} °C`} />
          <Slider label="Distance" min={2} max={400} value={cm} onChange={setCm} format={(v) => `${v} cm`} ticks={[2, 100, 200, 300, 400]} />
          <Slider label="Knob" min={0} max={1023} value={562} disabled onChange={noop} />
        </section>
      </div>
      <div className="fcol">
        <section className="card">
          <h2>Switches &amp; segments</h2>
          <div className="col" style={{ gap: 2 }}>
            <Switch label="Show current on hover" hint="mA and V beside each part while running" value={hover} onChange={setHover} />
            <Switch label="Sound" hint="buzzers and the micro:bit speaker" value={sound} onChange={setSound} />
            <Switch label="Autosave" hint="every minute, and when the app closes" value={autosave} onChange={setAutosave} />
            <Switch label="Wi-Fi pages" hint="IoT phase" value={false} disabled onChange={noop} />
          </div>
          <Segmented label="Show examples for" full value={boards} onChange={setBoards} options={[
            { value: 'all', label: 'All' }, { value: 'microbit', label: 'micro:bit' }, { value: 'pico', label: 'Pico W' }, { value: 'esp32', label: 'ESP32' },
          ]} />
        </section>
      </div>
    </main>
  );
}
