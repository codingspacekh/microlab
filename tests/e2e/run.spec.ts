import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';

/** M6.8: a new project is the board alone and the parts panel is folded — put down a half breadboard (where new
 *  projects had theirs) and open the panel, as building a circuit starts. */
const startBuilding = async (win: Page) => {
  await win.getByRole('button', { name: 'Parts', exact: true }).click();
  // a half breadboard taken with the keyboard goes where new projects had theirs (not the Start building card: it goes by itself)
  await win.getByRole('region', { name: 'Parts' }).getByRole('button', { name: /^Half breadboard/ }).press('Enter');
  // opening it fits the circuit beside it again: let that be drawn before anything is measured
  await win.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
};

/** M4 exit gate (E2E): build Blink by hand from a new project on each board, run it, the LED blinks; Stop ends it.
 *  And each board's starter program lights the board itself. The real simulation worker runs here. */
let app: ElectronApplication;
let home: string;

test.beforeEach(async () => {
  home = mkdtempSync(join(tmpdir(), 'microlab-e2e-'));
  app = await electron.launch({ args: ['out/main/index.js'], env: { ...process.env, MICROLAB_USER_DATA: home } });
  const win = await app.firstWindow();
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setContentSize(1440, 900));
  await win.waitForFunction(() => window.innerWidth === 1440);
});

test.afterEach(async () => {
  // unsaved changes would make the window ask before it closes (M4.6): end it without asking
  await app?.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach((w) => w.destroy())).catch(() => {});
  await app?.close();
  rmSync(home, { recursive: true, force: true });
});

const centre = async (win: Page, selector: string) => {
  if (selector.includes('.pitem')) {
    // M7: the panel folds away once the canvas is used — open it again, as a student would
    if (!(await win.locator('section.parts').isVisible())) await win.getByRole('button', { name: 'Parts', exact: true }).click();
    await win.locator(selector).first().scrollIntoViewIfNeeded();   // the panel scrolls
  }
  const b = (await win.locator(selector).first().boundingBox())!;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
};
const drag = async (win: Page, from: { x: number; y: number }, to: { x: number; y: number }) => {
  await win.mouse.move(from.x, from.y);
  await win.mouse.down();
  await win.mouse.move(to.x, to.y, { steps: 6 });
  await win.mouse.up();
};
const between = async (win: Page, a: string, b: string) => {
  const p = await centre(win, `[data-point="${a}"]`);
  const q = await centre(win, `[data-point="${b}"]`);
  return { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
};

/** The code, put in the editor as one paste (no auto-indent on the way). */
async function setCode(win: Page, code: string) {
  await win.getByRole('textbox', { name: 'main.py' }).click();
  await win.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
  await win.keyboard.insertText(code);
}

const BOARDS = [
  { button: 'New Pico W project', example: 'pico-w', pin: 'board.GP15' },
  { button: 'New micro:bit project', example: 'microbit-v2', pin: 'board.P0' },
  { button: 'New ESP32 project', example: 'esp32-devkit-v1', pin: 'board.D15' },
];

for (const b of BOARDS) {
  test(`Blink built by hand on ${b.example}: run it, the LED blinks; Stop ends it`, async () => {
    const win = await app.firstWindow();
    await win.getByRole('button', { name: b.button }).click();
    await startBuilding(win);
    // the circuit of library/examples/blink: GP15 → 220 Ω (a5–a8) → LED (b8–b10) → GND
    await drag(win, await centre(win, '.parts .pitem:has-text("Resistor")'), await between(win, 'bb1.a5', 'bb1.a8'));
    await drag(win, await centre(win, '.parts .pitem:has-text("red, 5 mm")'), await between(win, 'bb1.b8', 'bb1.b10'));
    await drag(win, await centre(win, `[data-point="${b.pin}"]`), await centre(win, '[data-point="bb1.e5"]'));
    await drag(win, await centre(win, '[data-point^="board.GND"]'), await centre(win, '[data-point="bb1.e10"]'));
    await expect(win.getByRole('status')).toContainText('2 parts · 2 wires');
    await setCode(win, readFileSync(`library/examples/blink/${b.example}/files/main.py`, 'utf8'));

    await win.getByRole('button', { name: 'Run main.py' }).click();
    const led = win.locator('[data-part="led1"]');
    await expect(led).toHaveAttribute('data-lit', '1', { timeout: 5000 });
    await expect(led).toHaveAttribute('data-lit', '0', { timeout: 2000 });
    await expect(led).toHaveAttribute('data-lit', '1', { timeout: 2000 });
    await expect(win.getByRole('status')).toContainText('Running at real speed');

    await win.getByRole('button', { name: 'Stop' }).click();
    await expect(win.getByRole('button', { name: 'Run main.py' })).toBeEnabled({ timeout: 1000 });   // N-03: ≤ 0.5 s, with room
    await expect(win.getByRole('log', { name: 'Console' })).toContainText('Stopped.');
  });
}

test('the starter programs light the board itself: the Pico W\'s LED, the micro:bit\'s heart, the ESP32\'s blue LED', async () => {
  const win = await app.firstWindow();
  for (const [button, sel] of [['New Pico W project', '[data-board-led]'], ['New micro:bit project', '[data-display="0909099999999990999000900"]'], ['New ESP32 project', '[data-board-led]']] as const) {
    const menu = win.getByRole('button', { name: 'Project menu' });
    if (await menu.isVisible()) {
      await menu.click();
      await win.getByRole('menuitem', { name: 'New project…' }).click();
    }
    await win.getByRole('button', { name: button }).click();
    await win.getByRole('button', { name: 'Run main.py' }).click();
    await expect(win.locator(sel)).toHaveCount(1, { timeout: 5000 });
    await expect(win.locator(sel)).toHaveCount(0, { timeout: 2000 });   // it blinks: off again
  }
});

test('print() reaches the console; an error says where; the button can be pressed while running', async () => {
  const win = await app.firstWindow();
  await win.getByRole('button', { name: 'New Pico W project' }).click();
  await startBuilding(win);
  await drag(win, await centre(win, '.parts .pitem:has-text("Push button")'), await between(win, 'bb1.e20', 'bb1.f22'));
  await drag(win, await centre(win, '[data-point="board.GP14"]'), await centre(win, '[data-point="bb1.d20"]'));
  await drag(win, await centre(win, '[data-point^="board.GND"]'), await centre(win, '[data-point="bb1.j22"]'));
  await setCode(win, 'from machine import Pin\nimport time\nb = Pin(14, Pin.IN, Pin.PULL_UP)\nprint("ready")\nwhile b.value() == 1:\n    time.sleep_ms(10)\nprint("pressed!")\nprint(nope)\n');
  await win.getByRole('button', { name: 'Run main.py' }).click();
  const log = win.getByRole('log', { name: 'Console' });
  await expect(log).toContainText('ready', { timeout: 5000 });
  const btn = await centre(win, '[data-part="btn1"]');
  await win.mouse.move(btn.x, btn.y);
  await win.mouse.down();
  await expect(log).toContainText('pressed!', { timeout: 2000 });
  await win.mouse.up();
  await expect(log).toContainText("The program stopped with an error (main.py, line 8): NameError: name 'nope' isn't defined");
  await expect(win.getByRole('status')).toContainText('Stopped: an error on line 8');
});

test('M5.6 (Q19): a second file, made with +, runs with Run led_test.py; it imports a library from lib/; Run main.py from the menu', async () => {
  const win = await app.firstWindow();
  await win.getByRole('button', { name: 'New Pico W project' }).click();
  await startBuilding(win);
  const make = async (name: string, code: string) => {
    await win.getByRole('button', { name: 'Add a file or a library' }).click();
    await win.getByRole('menuitem', { name: 'New file…' }).click();
    await win.getByRole('textbox', { name: 'New file' }).fill(name);
    await win.keyboard.press('Enter');
    await win.getByRole('textbox', { name }).click();
    await win.keyboard.insertText(code);
  };
  await make('lib/helper.py', 'def hello():\n    return "hello from lib"\n');
  await make('led_test.py', 'import helper\nprint(helper.hello(), __name__)\n');
  await expect(win.getByRole('tablist', { name: 'Files' }).getByRole('tab')).toHaveCount(3);
  await win.getByRole('button', { name: 'Run led_test.py' }).click();
  const log = win.getByRole('log', { name: 'Console' });
  await expect(log).toContainText('running led_test.py');
  await expect(log).toContainText('hello from lib __main__');
  await expect(win.getByRole('button', { name: 'Run led_test.py' })).toBeVisible();   // it ended by itself

  await win.getByRole('button', { name: 'More ways to run' }).click();
  await win.getByRole('menuitem', { name: /Run main\.py/ }).click();
  await expect(log).toContainText('running main.py');
  await win.getByRole('button', { name: 'Stop' }).click();
});

test('M6.1 (screen 17): while running a slide switch is clicked, a knob dragged, the light on a light sensor set on the Inputs card', async () => {
  const win = await app.firstWindow();
  await win.getByRole('button', { name: 'New Pico W project' }).click();
  await startBuilding(win);
  // slide switch e20–e22: leg 1 (e20) to GND, leg 2 (e21) to GP14; knob e10–e14: GND, GP26, 3V3 (up = more); a light sensor
  await drag(win, await centre(win, '.parts .pitem:has-text("Slide switch")'), await centre(win, '[data-point="bb1.e21"]'));
  await drag(win, await centre(win, '[data-point="board.GND@18"]'), await centre(win, '[data-point="bb1.a20"]'));
  await drag(win, await centre(win, '[data-point="board.GP14"]'), await centre(win, '[data-point="bb1.a21"]'));
  await drag(win, await centre(win, '.parts .pitem:has-text("Potentiometer")'), await centre(win, '[data-point="bb1.e12"]'));
  await drag(win, await centre(win, '[data-point="board.GND@23"]'), await centre(win, '[data-point="bb1.a10"]'));
  await drag(win, await centre(win, '[data-point="board.GP26"]'), await centre(win, '[data-point="bb1.a12"]'));
  await drag(win, await centre(win, '[data-point="board.3V3"]'), await centre(win, '[data-point="bb1.a14"]'));
  await drag(win, await centre(win, '.parts .pitem:has-text("Light sensor")'), await between(win, 'bb1.j26', 'bb1.j28'));
  await expect(win.getByRole('status')).toContainText('3 parts · 5 wires');
  await setCode(win, [
    'from machine import Pin, ADC', 'import time', 'sw = Pin(14, Pin.IN, Pin.PULL_UP)', 'knob = ADC(26)', 'last = None', 'while True:',
    '    now = (sw.value(), knob.read_u16() > 45000)', '    if now != last:',
    '        print("switch", now[0], "knob high" if now[1] else "knob low")', '        last = now', '    time.sleep_ms(20)', '',
  ].join('\n'));

  await win.getByRole('button', { name: 'Run main.py' }).click();
  const log = win.getByRole('log', { name: 'Console' });
  await expect(log).toContainText('switch 0 knob low', { timeout: 5000 });   // slid to 1 joins 2–1: GND
  await win.locator('[data-part="sw1"]').click();
  await expect(log).toContainText('switch 1 knob low', { timeout: 2000 });
  await expect(win.locator('[data-part="sw1"]')).toHaveAttribute('data-position', '1');
  const knob = await centre(win, '[data-part="pot1"]');
  await win.mouse.move(knob.x, knob.y);
  await win.mouse.down();
  await win.mouse.move(knob.x, knob.y - 60, { steps: 4 });
  await win.mouse.up();
  await expect(log).toContainText('switch 1 knob high', { timeout: 2000 });

  const card = win.getByRole('group', { name: 'Inputs' });   // screen 18: one card for every slider
  await expect(card).toContainText('1.4 kΩ');
  await card.getByRole('slider', { name: 'Light on LDR1' }).focus();
  await win.keyboard.press('End');
  await expect(card).toContainText('100 Ω');
  await win.getByRole('button', { name: 'Stop' }).click();
  await expect(card).toHaveCount(0);
});

test('M6.2: a passive buzzer plays the PWM\'s note with the real worker; the status bar turns the sound off', async () => {
  const win = await app.firstWindow();
  await win.getByRole('button', { name: 'New Pico W project' }).click();
  await startBuilding(win);
  await drag(win, await centre(win, '.parts .pitem:has-text("Buzzer")'), await between(win, 'bb1.a10', 'bb1.a13'));
  await win.getByRole('complementary', { name: 'Inspector' }).getByRole('radio', { name: 'Passive' }).click();
  await drag(win, await centre(win, '[data-point="board.GP15"]'), await centre(win, '[data-point="bb1.e10"]'));
  await drag(win, await centre(win, '[data-point="board.GND@18"]'), await centre(win, '[data-point="bb1.e13"]'));
  await setCode(win, 'from machine import Pin, PWM\nimport time\nb = PWM(Pin(15))\nwhile True:\n    for note in (262, 330, 392):\n        b.freq(note)\n        b.duty_u16(32768)\n        time.sleep(0.3)\n');
  await win.getByRole('button', { name: 'Run main.py' }).click();
  const bz = win.locator('[data-part="bz1"]');
  await expect(bz).toHaveAttribute('data-hz', '330', { timeout: 5000 });
  await expect(bz).toHaveAttribute('data-hz', '392', { timeout: 1000 });
  await expect(bz.locator('.waves')).toHaveCount(1);
  await win.getByRole('button', { name: /Sound on/ }).click();
  await expect(win.getByRole('button', { name: /Sound off/ })).toHaveAttribute('aria-pressed', 'false');
  await win.getByRole('button', { name: 'Stop' }).click();
  await expect(bz).toHaveAttribute('data-hz', '0');
});

test('M6.3 (screen 18): a TMP36 set on the Inputs card and a PIR held with the mouse, read by the real worker', async () => {
  const win = await app.firstWindow();
  await win.getByRole('button', { name: 'New Pico W project' }).click();
  await startBuilding(win);
  // TMP36 in f2–f4 (+Vs 3V3, Vout GP26, GND); PIR in f8–f10 (VCC VBUS, OUT GP14, GND)
  await drag(win, await centre(win, '.parts .pitem:has-text("TMP36 · LM35")'), await centre(win, '[data-point="bb1.f3"]'));
  await drag(win, await centre(win, '[data-point="board.3V3"]'), await centre(win, '[data-point="bb1.j2"]'));
  await drag(win, await centre(win, '[data-point="board.GP26"]'), await centre(win, '[data-point="bb1.j3"]'));
  await drag(win, await centre(win, '[data-point="board.GND@23"]'), await centre(win, '[data-point="bb1.j4"]'));
  await drag(win, await centre(win, '.parts .pitem:has-text("PIR motion")'), await centre(win, '[data-point="bb1.f9"]'));
  await drag(win, await centre(win, '[data-point="board.VBUS"]'), await centre(win, '[data-point="bb1.j8"]'));
  await drag(win, await centre(win, '[data-point="board.GP14"]'), await centre(win, '[data-point="bb1.j9"]'));
  await drag(win, await centre(win, '[data-point="board.GND@18"]'), await centre(win, '[data-point="bb1.j10"]'));
  await expect(win.getByRole('status')).toContainText('2 parts · 6 wires');
  await setCode(win, [
    'from machine import Pin, ADC', 'import time', 'temp = ADC(26)', 'pir = Pin(14, Pin.IN)', 'last = None', 'while True:',
    '    now = (round((temp.read_u16() * 3.3 / 65535 - 0.5) * 100), pir.value())', '    if now != last:',
    '        print(now[0], "C", "motion" if now[1] else "still")', '        last = now', '    time.sleep_ms(20)', '',
  ].join('\n'));
  await win.getByRole('button', { name: 'Run main.py' }).click();
  const log = win.getByRole('log', { name: 'Console' });
  await expect(log).toContainText('22 C still', { timeout: 5000 });
  const card = win.getByRole('group', { name: 'Inputs' });
  await card.getByRole('slider', { name: 'Temperature of TMP1' }).focus();
  await win.keyboard.press('End');
  await expect(log).toContainText('60 C still', { timeout: 2000 });
  await expect(card).toContainText('Vout 1.1 V');
  const pir = await centre(win, '[data-part="pir1"] circle');
  await win.mouse.move(pir.x, pir.y);
  await win.mouse.down();
  await expect(log).toContainText('60 C motion', { timeout: 2000 });
  await win.mouse.up();
  await expect(win.locator('[data-part="pir1"] .waves')).toHaveCount(1);   // OUT high for 3 s after
  await expect(log).toContainText(/60 C motion\s*60 C still/, { timeout: 5000 });   // still again after the hold
});

test('M6.4 (screen 19): a DHT22 and an HC-SR04 behind its divider, set on the Inputs card, read by the real worker', async () => {
  const win = await app.firstWindow();
  await win.getByRole('button', { name: 'New Pico W project' }).click();
  await startBuilding(win);
  // DHT in f2–f4: VCC 3V3, DATA GP16, GND
  await drag(win, await centre(win, '.parts .pitem:has-text("DHT11 / DHT22")'), await centre(win, '[data-point="bb1.f3"]'));
  await win.getByRole('complementary', { name: 'Inspector' }).getByRole('radio', { name: 'DHT22' }).click();
  await drag(win, await centre(win, '[data-point="board.3V3"]'), await centre(win, '[data-point="bb1.j2"]'));
  await drag(win, await centre(win, '[data-point="board.GP16"]'), await centre(win, '[data-point="bb1.j3"]'));
  await drag(win, await centre(win, '[data-point="board.GND@38"]'), await centre(win, '[data-point="bb1.j4"]'));
  // HC-SR04 in j20–j23, its board hanging off the bottom edge: VCC VBUS, Trig GP14; Echo → 220 Ω → GP15's column,
  // 220 Ω on to GND (two equal resistors: 5 V becomes 2.5 V, a safe high for a 3.3 V pin)
  await drag(win, await centre(win, '.parts .pitem:has-text("Ultrasonic HC-SR04")'), await between(win, 'bb1.j21', 'bb1.j22'));
  await expect(win.locator('[data-part="sonar1"]')).toHaveAttribute('data-legs', 'bb1.j20 bb1.j21 bb1.j22 bb1.j23');
  await drag(win, await centre(win, '[data-point="board.VBUS"]'), await centre(win, '[data-point="bb1.i20"]'));
  await drag(win, await centre(win, '[data-point="board.GP14"]'), await centre(win, '[data-point="bb1.i21"]'));
  await drag(win, await centre(win, '[data-point="board.GND@18"]'), await centre(win, '[data-point="bb1.i23"]'));
  await drag(win, await centre(win, '.parts .pitem:has-text("Resistor")'), await between(win, 'bb1.h22', 'bb1.h25'));
  await drag(win, await centre(win, '.parts .pitem:has-text("Resistor")'), await between(win, 'bb1.g25', 'bb1.g28'));
  await drag(win, await centre(win, '[data-point="board.GP15"]'), await centre(win, '[data-point="bb1.i25"]'));
  await drag(win, await centre(win, '[data-point="board.GND@13"]'), await centre(win, '[data-point="bb1.i28"]'));
  await setCode(win, [
    'from machine import Pin, time_pulse_us', 'import dht, time', 'air = dht.DHT22(Pin(16))',
    'trig, echo = Pin(14, Pin.OUT), Pin(15, Pin.IN)', 'while True:', '    air.measure()',
    '    trig.value(1)', '    time.sleep_us(10)', '    trig.value(0)', '    cm = time_pulse_us(echo, 1, 30000) / 58',
    "    print('%.1f C %.0f %% %d cm' % (air.temperature(), air.humidity(), cm))", '    time.sleep(0.3)', '',
  ].join('\n'));
  await win.getByRole('button', { name: 'Run main.py' }).click();
  const log = win.getByRole('log', { name: 'Console' });
  await expect(log).toContainText('22.0 C 50 % 100 cm', { timeout: 5000 });
  const card = win.getByRole('group', { name: 'Inputs' });
  await card.getByRole('slider', { name: 'Distance from SONAR1' }).focus();
  await win.keyboard.press('Home');
  await expect(log).toContainText('22.0 C 50 % 2 cm', { timeout: 3000 });
  await card.getByRole('slider', { name: 'Temperature of DHT1' }).focus();
  await win.keyboard.press('End');
  await expect(log).toContainText('60.0 C 50 % 2 cm', { timeout: 3000 });
  await expect(win.getByRole('status')).toContainText('Running at real speed');   // no damage: the divider works
});

test('M6.5a (screen 20): a joystick dragged and an IR obstacle sensor clicked, read by the real worker', async () => {
  const win = await app.firstWindow();
  await win.getByRole('button', { name: 'New Pico W project' }).click();
  await startBuilding(win);
  // joystick in f2–f6: GND, VCC 3V3, VRx GP26; IR obstacle in f10–f12: OUT GP14, GND, VCC 3V3 (the Modules group is
  // far down the parts panel: each item is scrolled into view first)
  await drag(win, await centre(win, '.parts .pitem:has-text("Joystick")'), await centre(win, '[data-point="bb1.f4"]'));
  await drag(win, await centre(win, '[data-point="board.GND@38"]'), await centre(win, '[data-point="bb1.j2"]'));
  await drag(win, await centre(win, '[data-point="board.3V3"]'), await centre(win, '[data-point="bb1.j3"]'));
  await drag(win, await centre(win, '[data-point="board.GP26"]'), await centre(win, '[data-point="bb1.j4"]'));
  await drag(win, await centre(win, '.parts .pitem:has-text("IR obstacle")'), await centre(win, '[data-point="bb1.f11"]'));
  await drag(win, await centre(win, '[data-point="board.GP14"]'), await centre(win, '[data-point="bb1.j10"]'));
  await drag(win, await centre(win, '[data-point="board.GND@18"]'), await centre(win, '[data-point="bb1.j11"]'));
  await drag(win, await centre(win, '[data-point="bb1.i3"]'), await centre(win, '[data-point="bb1.j12"]'));   // VCC from the joystick's 3V3
  await win.keyboard.press('Escape');
  await setCode(win, [
    'from machine import Pin, ADC', 'import time', 'x = ADC(26)', 'ir = Pin(14, Pin.IN)', 'last = None', 'while True:',
    "    now = ('right' if x.read_u16() > 50000 else 'middle', 'blocked' if not ir.value() else 'clear')",
    '    if now != last:', '        print(*now)', '        last = now', '    time.sleep_ms(20)', '',
  ].join('\n'));
  await win.getByRole('button', { name: 'Run main.py' }).click();
  const log = win.getByRole('log', { name: 'Console' });
  await expect(log).toContainText('middle', { timeout: 5000 });
  const stick = await centre(win, '[data-part="joy1"] .stick');
  await win.mouse.move(stick.x, stick.y);
  await win.mouse.down();
  await win.mouse.move(stick.x + 50, stick.y, { steps: 5 });
  await expect(log).toContainText('right', { timeout: 2000 });
  await win.mouse.up();
  await expect(log).toContainText(/right[^]*middle/, { timeout: 2000 });   // it springs back
  const ir = await centre(win, '[data-part="ir1"] circle');   // its IR LED
  await win.mouse.click(ir.x, ir.y);
  await expect(log).toContainText('blocked', { timeout: 2000 });
});

test('M6.5b (screen 21): a DS18B20 read with onewire and ds18x20 by the real worker, its temperature set on the Inputs card', async () => {
  const win = await app.firstWindow();
  await win.getByRole('button', { name: 'New Pico W project' }).click();
  await startBuilding(win);
  await win.locator('.parts .pitem:has-text("DS18B20")').scrollIntoViewIfNeeded();
  await drag(win, await centre(win, '.parts .pitem:has-text("DS18B20")'), await centre(win, '[data-point="bb1.f3"]'));
  await win.keyboard.press('Escape');
  await drag(win, await centre(win, '[data-point="board.GP16"]'), await centre(win, '[data-point="bb1.j2"]'));
  await drag(win, await centre(win, '[data-point="board.3V3"]'), await centre(win, '[data-point="bb1.j3"]'));
  await drag(win, await centre(win, '[data-point="board.GND@38"]'), await centre(win, '[data-point="bb1.j4"]'));
  await setCode(win, [
    'import onewire, ds18x20, time', 'from machine import Pin', 'ds = ds18x20.DS18X20(onewire.OneWire(Pin(16)))',
    'roms = ds.scan()', "print('found', len(roms))", 'while True:', '    ds.convert_temp()', '    time.sleep_ms(750)',
    "    print('%.1f C' % ds.read_temp(roms[0]))", '',
  ].join('\n'));
  await win.getByRole('button', { name: 'Run main.py' }).click();
  const log = win.getByRole('log', { name: 'Console' });
  await expect(log).toContainText('found 1', { timeout: 5000 });
  await expect(log).toContainText('22.0 C', { timeout: 3000 });
  const slider = win.getByRole('group', { name: 'Inputs' }).getByRole('slider', { name: 'Temperature of TEMP1' });
  await slider.focus();
  await win.keyboard.press('End');
  await expect(log).toContainText('100.0 C', { timeout: 3000 });
});

test('M6.6 (screen 06): the micro:bit inputs card — button A held, the temperature and the tilt set, read by the real worker', async () => {
  const win = await app.firstWindow();
  await win.getByRole('button', { name: 'New micro:bit project' }).click();
  await startBuilding(win);
  await setCode(win, [
    'from microbit import *', 'while True:',
    "    print('A' if button_a.is_pressed() else '-', temperature(), accelerometer.get_x())", '    sleep(100)', '',
  ].join('\n'));
  await win.getByRole('button', { name: 'Run main.py' }).click();
  const log = win.getByRole('log', { name: 'Console' });
  await expect(log).toContainText('- 25 0', { timeout: 5000 });
  const card = win.getByRole('group', { name: 'micro:bit inputs' });
  const a = card.getByRole('button', { name: 'A', exact: true });
  const box = (await a.boundingBox())!;
  await win.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await win.mouse.down();
  await expect(log).toContainText('A 25 0', { timeout: 3000 });
  await win.mouse.up();
  await card.getByRole('slider', { name: 'Temperature' }).focus();
  await win.keyboard.press('End');
  await card.getByRole('slider', { name: 'Tilt' }).focus();
  await win.keyboard.press('ArrowRight');
  await expect(log).toContainText('- 50 64', { timeout: 3000 });
});

test('M6.7 (screen 22): Add a library from the + menu puts bmp280 in lib/ with its licence; main.py imports it in the real worker', async () => {
  const win = await app.firstWindow();
  await win.getByRole('button', { name: 'New Pico W project' }).click();
  await startBuilding(win);
  await win.getByRole('button', { name: 'Add a file or a library' }).click();
  await win.getByRole('menuitem', { name: 'Add a library…' }).click();
  const dialog = win.getByRole('dialog', { name: 'Add a library' });
  await dialog.getByRole('button', { name: 'Add bmp280' }).click();
  await expect(dialog.getByRole('listitem', { name: 'BMP280 air pressure' })).toContainText('in lib/');
  await dialog.getByRole('button', { name: 'Close' }).click();
  await setCode(win, "from bmp280 import BMP280\nprint('library', BMP280.__name__)\n");
  await win.getByRole('button', { name: 'Run main.py' }).click();
  await expect(win.getByRole('log', { name: 'Console' })).toContainText('library BMP280', { timeout: 5000 });
  await win.getByRole('button', { name: 'Project files' }).click();
  const files = win.getByRole('complementary', { name: 'Project files' });
  await expect(files.getByRole('treeitem', { name: /bmp280\.py/ })).toBeVisible();
  await expect(files.getByRole('treeitem', { name: /LICENSE-bmp280\.txt/ })).toBeVisible();
  // its buttons stay inside it (issues/layout-1.png: Delete went past its edge)
  const panel = (await files.boundingBox())!;
  for (const b of await files.locator('.fbar button').all()) {
    const box = (await b.boundingBox())!;
    expect(box.x + box.width).toBeLessThanOrEqual(panel.x + panel.width);
  }
});

test('M7.1 (screens 25, 25c): a TT motor dropped beside the breadboard, wired at its tabs — through an L9110S it turns; straight on GP15 the pin is damaged', async () => {
  const win = await app.firstWindow();
  await win.getByRole('button', { name: 'New Pico W project' }).click();
  await startBuilding(win);
  // the L9110S in f8–f13: GND, VCC VBUS, A-IA GP17, A-IB GP16; the motor below the breadboard, on MOTOR A
  await win.locator('.parts .pitem:has-text("L9110S")').scrollIntoViewIfNeeded();
  await drag(win, await centre(win, '.parts .pitem:has-text("L9110S")'), await between(win, 'bb1.f10', 'bb1.f11'));
  const below = await centre(win, '[data-point="bb1.B-20"]');
  await win.locator('.parts .pitem:has-text("TT motor")').scrollIntoViewIfNeeded();
  await drag(win, await centre(win, '.parts .pitem:has-text("TT motor")'), { x: below.x, y: below.y + 90 });
  await drag(win, await centre(win, '[data-point="board.GND@38"]'), await centre(win, '[data-point="bb1.j10"]'));
  await drag(win, await centre(win, '[data-point="board.VBUS"]'), await centre(win, '[data-point="bb1.j11"]'));
  await drag(win, await centre(win, '[data-point="board.GP17"]'), await centre(win, '[data-point="bb1.j12"]'));
  await drag(win, await centre(win, '[data-point="board.GP16"]'), await centre(win, '[data-point="bb1.j13"]'));
  await drag(win, await centre(win, '[data-point="drv1.a1"]'), await centre(win, '[data-point="motor1.+"]'));
  await drag(win, await centre(win, '[data-point="drv1.a2"]'), await centre(win, '[data-point="motor1.-"]'));
  await win.keyboard.press('Escape');
  await setCode(win, ['from machine import Pin', 'import time', 'Pin(16, Pin.OUT, value=0)', 'Pin(17, Pin.OUT, value=1)', 'time.sleep(10)', ''].join('\n'));
  await win.getByRole('button', { name: 'Run main.py' }).click();
  await expect.poll(async () => Number(await win.locator('[data-part="motor1"] .tt-motor').getAttribute('data-rpm')), { timeout: 5000 }).toBeGreaterThan(150);
  await expect(win.locator('[data-part="motor1"] .tt-motor')).toHaveAttribute('data-direction', '1');
  await win.getByRole('button', { name: 'Stop' }).click();
  await expect(win.getByRole('button', { name: 'Run main.py' })).toBeEnabled({ timeout: 2000 });

  // screen 25c: the motor's + straight on GP15 — the wire from MOTOR A taken off first
  await win.locator('[data-wire="w5"]').dispatchEvent('mousedown', { button: 0 });
  await expect(win.getByRole('complementary', { name: 'Inspector' })).toContainText('W5 · Wire');
  await win.getByRole('complementary', { name: 'Inspector' }).getByRole('button', { name: 'Delete' }).click();
  await drag(win, await centre(win, '[data-point="board.GP15"]'), await centre(win, '[data-point="motor1.+"]'));
  await win.keyboard.press('Escape');
  await setCode(win, ['from machine import Pin', 'import time', 'Pin(15, Pin.OUT).on()', 'time.sleep(10)', ''].join('\n'));
  await win.getByRole('button', { name: 'Run main.py' }).click();
  await expect(win.getByRole('log', { name: 'Console' })).toContainText(/GP15: motor1 straight on the pin draws \d+ mA, a pin gives 12 mA at most/, { timeout: 5000 });
  await expect(win.getByRole('status')).toContainText('Stopped: the circuit was damaged');
});

test('M7.2 (screens 26, 26c): a 16×2 LCD dropped beside the breadboard, wired at its backpack\'s pins, its library added from the inspector — it shows what putstr wrote; on 3V3 it is too faint', async () => {
  const win = await app.firstWindow();
  await win.getByRole('button', { name: 'New Pico W project' }).click();
  await startBuilding(win);
  const below = await centre(win, '[data-point="bb1.B-20"]');
  await drag(win, await centre(win, '.parts .pitem:has-text("LCD 16×2")'), { x: below.x, y: below.y + 110 });
  for (const [pin, t] of [['board.GND@38', 'gnd'], ['board.VBUS', 'vcc'], ['board.GP21', 'scl'], ['board.GP20', 'sda']]) {
    await drag(win, await centre(win, `[data-point="${pin}"]`), await centre(win, `[data-point="lcd1.${t}"]`));
    await win.keyboard.press('Escape');   // the wire's inspector closed again, the canvas as it was
    await win.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  }
  await expect(win.locator('[data-wire]')).toHaveCount(4);
  await win.keyboard.press('Escape');
  const lcd = (await win.locator('[data-part="lcd1"] .lcd1602').boundingBox())!;
  await win.mouse.click(lcd.x + lcd.width - 12, lcd.y + lcd.height - 12);   // its board's corner, away from the wires
  await expect(win.getByRole('complementary', { name: 'Inspector' })).toContainText('LCD1');
  await win.getByRole('complementary', { name: 'Inspector' }).getByRole('button', { name: 'Add the lcd library' }).click();
  await setCode(win, ['from machine import Pin, I2C', 'from i2c_lcd import I2cLcd', 'import time',
    'lcd = I2cLcd(I2C(0, sda=Pin(20), scl=Pin(21)), 0x27, 2, 16)', "lcd.putstr('Hello, MicroLab!')", 'time.sleep(10)', ''].join('\n'));
  await win.getByRole('button', { name: 'Run main.py' }).click();
  await expect(win.locator('[data-part="lcd1"] .lcd1602')).toHaveAttribute('data-rows', /^Hello, MicroLab!\n/, { timeout: 5000 });
  await expect(win.locator('[data-part="lcd1"] .lcd1602')).toHaveAttribute('data-faint', '0');
  await win.getByRole('button', { name: 'Stop' }).click();
  await expect(win.getByRole('button', { name: 'Run main.py' })).toBeEnabled({ timeout: 2000 });

  // screen 26c: its VCC on 3V3 — the wire from VBUS taken off first
  await win.locator('[data-wire="w2"]').dispatchEvent('mousedown', { button: 0 });
  await win.getByRole('complementary', { name: 'Inspector' }).getByRole('button', { name: 'Delete' }).click();
  await drag(win, await centre(win, '[data-point="board.3V3"]'), await centre(win, '[data-point="lcd1.vcc"]'));
  await win.keyboard.press('Escape');
  await win.getByRole('button', { name: 'Run main.py' }).click();
  await expect(win.locator('[data-part="lcd1"] .lcd1602')).toHaveAttribute('data-faint', '1', { timeout: 5000 });
  const box = (await win.locator('[data-part="lcd1"] .lcd1602').boundingBox())!;
  await win.mouse.move(box.x + box.width / 2, box.y + 20);
  await expect(win.getByRole('tooltip')).toContainText('too faint to read: a 16×2 LCD needs 5 V');
});

test('M7.3 (screens 27, 27c): a NeoPixel dropped beside the breadboard, made a ring of 12 in its inspector, wired at its pads — its LEDs show what write() sent; hovered, an LED says its colour; data on DOUT lights nothing', async () => {
  const win = await app.firstWindow();
  await win.getByRole('button', { name: 'New Pico W project' }).click();
  await startBuilding(win);
  const below = await centre(win, '[data-point="bb1.B-20"]');
  await drag(win, await centre(win, '.parts .pitem:has-text("NeoPixel")'), { x: below.x, y: below.y + 120 });
  await expect(win.locator('[data-part="neo1"] .neopixel')).toHaveAttribute('data-shape', 'stick');
  const stick = (await win.locator('[data-part="neo1"] .neopixel').boundingBox())!;
  await win.mouse.click(stick.x + stick.width / 2, stick.y + 4);   // its strip, above the LEDs
  const inspector = win.getByRole('complementary', { name: 'Inspector' });
  await expect(inspector).toContainText('NEO1');
  await inspector.getByRole('radio', { name: 'Ring' }).click();
  await expect(win.locator('[data-part="neo1"] .neopixel')).toHaveAttribute('data-leds', '12');
  await win.keyboard.press('Escape');
  for (const [pin, t] of [['board.GND@38', 'gnd'], ['board.VBUS', 'vcc'], ['board.GP0', 'din']]) {
    await drag(win, await centre(win, `[data-point="${pin}"]`), await centre(win, `[data-point="neo1.${t}"]`));
    await win.keyboard.press('Escape');
    await win.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  }
  await expect(win.locator('[data-wire]')).toHaveCount(3);
  await setCode(win, ['from machine import Pin', 'from neopixel import NeoPixel', 'import time', 'np = NeoPixel(Pin(0), 12)',
    'np[0] = (40, 0, 0)', 'np[3] = (0, 0, 80)', 'np.write()', 'time.sleep(10)', ''].join('\n'));
  await win.getByRole('button', { name: 'Run main.py' }).click();
  await expect(win.locator('[data-part="neo1"] .neopixel')).toHaveAttribute('data-lit', '2', { timeout: 5000 });
  await expect(win.getByRole('status')).toContainText(/NeoPixels: 12 LEDs draw \d+ mA of USB's 500 mA/);
  const led = (await win.locator('[data-part="neo1"] [data-led="3"] .np-body').boundingBox())!;
  await win.mouse.move(led.x + led.width / 2, led.y + led.height / 2);
  await expect(win.getByRole('tooltip')).toContainText('NEO1 · LED 3 of 12');
  await expect(win.getByRole('tooltip')).toContainText('(0, 0, 80) — blue, 31 %');
  await win.getByRole('button', { name: 'Stop' }).click();
  await expect(win.getByRole('button', { name: 'Run main.py' })).toBeEnabled({ timeout: 2000 });

  // screen 27c: GP0's wire on DOUT instead — nothing lights
  await win.locator('[data-wire="w3"]').dispatchEvent('mousedown', { button: 0 });
  await inspector.getByRole('button', { name: 'Delete' }).click();
  await drag(win, await centre(win, '[data-point="board.GP0"]'), await centre(win, '[data-point="neo1.dout"]'));
  await win.keyboard.press('Escape');
  await win.getByRole('button', { name: 'Run main.py' }).click();
  await expect(win.locator('[data-part="neo1"] .neopixel')).toHaveAttribute('data-lit', '0', { timeout: 5000 });
  await expect(win.getByRole('status')).toContainText('NeoPixels: 12 LEDs draw');
});

test('M7.4 (screen 06): the micro:bit\'s speaker in the real worker — a built-in sound, a sine sound effect, and silence once the program turns the speaker off', async () => {
  const win = await app.firstWindow();
  await win.getByRole('button', { name: 'New micro:bit project' }).click();
  await setCode(win, ['from microbit import *', 'import audio, music', 'audio.play(Sound.HELLO)',
    'audio.play(audio.SoundEffect(freq_start=400, freq_end=400, duration=1500, waveform=audio.SoundEffect.WAVEFORM_SINE, shape=audio.SoundEffect.SHAPE_LINEAR))',
    'speaker.off()', 'music.pitch(440, 5000)', ''].join('\n'));
  await win.getByRole('button', { name: 'Run main.py' }).click();
  const speaker = win.locator('.speaker');
  await expect(speaker).not.toHaveAttribute('data-hz', '0', { timeout: 3000 });   // hello
  await expect(speaker).toHaveAttribute('data-wave', 'sine', { timeout: 3000 });  // the sound effect
  await expect(win.getByRole('button', { name: /Sound on/ })).toBeVisible();
  await expect(speaker).toHaveAttribute('data-hz', '0', { timeout: 4000 });      // the speaker off: pin 0 plays alone
  await win.getByRole('button', { name: 'Stop' }).click();
});
