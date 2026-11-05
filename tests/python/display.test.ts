import { describe, expect, it } from 'vitest';
import { VirtualClock } from '../../src/sim/clock';
import { runProject } from '../../src/sim/run';
import { nodeLoader } from './vm';

/** M2 slice 6b: the micro:bit's display and Image (micropython-microbit-v2 v2.1.2: microbit_display.c,
 *  drv_display.c, microbit_image.c, drv_image.c, microbit_constimage.c). */
const run = async (main: string, options: { lightLevel?: number } = {}) =>
  runProject(await nodeLoader(), { board: 'microbit-v2', files: { 'main.py': `from microbit import *\n${main}` }, clock: new VirtualClock(), ...options });
const at = (line: number) => line + 1;
const HEART = '0909099999999990999000900';
const frames = (display: [number, string][]) => display.map(([t, p]) => [Math.round(t / 1000), p]);

describe('M2.6b display.show', () => {
  it('an image shows at once; the display is traced as 25 brightnesses, row by row', async () => {
    const r = await run('display.show(Image.HEART)\nprint(display.get_pixel(1, 0), display.get_pixel(0, 0))\n');
    expect(frames(r.display)).toEqual([[0, HEART]]);
    expect(r.output).toBe('9 0\n');
  });

  it('a string of two or more characters is an animation: 400 ms a frame, counted in 6 ms ticks (402 ms)', async () => {
    const r = await run('t = running_time()\ndisplay.show("Hi")\nprint(running_time() - t)\n');
    expect(r.display.map(([t]) => Math.round(t / 1000))).toEqual([0, 402]);   // H, then i, which stays
    expect(r.output).toBe('804\n');   // the animation ends one frame after the last
  });

  it('a number shows as its text; a single character as its glyph at once', async () => {
    const r = await run('display.show(7)\n');
    expect(frames(r.display)).toEqual([[0, '9999900090009000900090000']]);   // the font's 7
  });

  it('clear=True blanks the display one delay after the last image; wait=False returns at once', async () => {
    const r = await run('display.show(Image.HEART, delay=100, clear=True)\nt = running_time()\ndisplay.show(Image.ALL_CLOCKS, wait=False)\nprint(running_time() - t)\n');
    expect(frames(r.display).slice(0, 2)).toEqual([[0, HEART], [102, '0'.repeat(25)]]);
    expect(r.output).toBe('0\n');
  });

  it('a list of images, 12 clocks at delay=100: 102 ms each', async () => {
    const r = await run('t = running_time()\ndisplay.show(Image.ALL_CLOCKS, delay=100)\nprint(running_time() - t, len(Image.ALL_CLOCKS))\n');
    expect(r.output).toBe(`${12 * 102} 12\n`);
  });

  it('something that is not an image in the list: TypeError "not an image"', async () => {
    const r = await run('display.show([Image.HEART, 5])\n');
    expect(r.error).toMatchObject({ type: 'TypeError', message: 'not an image', line: at(1) });
  });
});

describe('M2.6b display.scroll', () => {
  it('moves one column every 150 ms, the letter coming in on the right, and ends blank', async () => {
    const r = await run('t = running_time()\ndisplay.scroll("I")\nprint(running_time() - t)\n');
    // "I" is 999:090:090:090:999 in the font's first three columns: 3 columns, a gap, then 4 blank frames
    expect(frames(r.display)).toEqual([
      [0, '0000900000000000000000009'], [150, '0009900009000090000900099'], [300, '0099900090000900009000999'],
      [450, '0999000900009000090009990'], [600, '9990009000090000900099900'], [750, '9900090000900009000099000'],
      [900, '9000000000000000000090000'], [1050, '0'.repeat(25)],
    ]);
    expect(r.output).toBe('1200\n');
  });

  it('wait=False: the program goes on while it scrolls', async () => {
    const r = await run('t = running_time()\ndisplay.scroll("Hello", wait=False)\nprint(running_time() - t)\nsleep(300)\n');
    expect(r.output).toBe('0\n');
    expect(r.display.length).toBe(3);   // frames at 0, 150, 300 ms
  });
});

describe('M2.6b the display\'s pixels, its pins, its light sensor', () => {
  it('set_pixel / get_pixel / clear; bounds errors', async () => {
    const r = await run('display.set_pixel(2, 2, 7)\nprint(display.get_pixel(2, 2))\ndisplay.clear()\nprint(display.get_pixel(2, 2))\ndisplay.set_pixel(5, 0, 9)\n');
    expect(r.output.split('\n').slice(0, 2)).toEqual(['7', '0']);
    expect(r.error).toMatchObject({ type: 'ValueError', message: 'index out of bounds', line: at(5) });
    expect((await run('display.set_pixel(0, 0, 10)\n')).error).toMatchObject({ message: 'brightness out of bounds' });
  });

  it('display.off() frees P3, P4, P6, P7, P10; on() takes them back', async () => {
    const r = await run('display.off()\nprint(display.is_on())\npin3.write_digital(1)\npin3.write_digital(0)\ndisplay.on()\nprint(display.is_on(), pin3.get_mode())\n');
    expect(r.output).toBe('False\nTrue display\n');
  });

  it('read_light_level is 0–255 from the light slider (128 if not set)', async () => {
    expect((await run('print(display.read_light_level())\n')).output).toBe('128\n');
    expect((await run('print(display.read_light_level())\n', { lightLevel: 30 })).output).toBe('30\n');
  });
});

describe('M2.6b Image', () => {
  it('from a string, rows split by ":"; repr and str as the firmware prints them', async () => {
    const r = await run('i = Image("09090:99999:99999:09990:00900")\nprint(repr(i))\nprint(str(Image("90:09")))\n');
    expect(r.output).toBe("Image('09090:99999:99999:09990:00900:')\nImage(\n    '90:'\n    '09:'\n)\n");
  });

  it('width, height, get_pixel; blank Image(w, h); Image(w, h, buffer); a single character is its glyph', async () => {
    const r = await run('print(Image().width(), Image(3, 2).height(), Image(2, 1, bytearray([4, 12])).get_pixel(1, 0))\nprint(repr(Image("1")))\n');
    expect(r.output).toBe("5 2 9\nImage('00900:09900:00900:00900:09990:')\n");
  });

  it('built-in images can\'t be changed; a copy can', async () => {
    const r = await run('h = Image.HEART.copy()\nh.set_pixel(0, 0, 5)\nprint(h.get_pixel(0, 0))\nImage.HEART.set_pixel(0, 0, 5)\n');
    expect(r.output).toContain('5\n');
    expect(r.error).toMatchObject({ type: 'TypeError', message: 'image cannot be modified (try copying first)', line: at(4) });
  });

  it('the firmware\'s errors for bad images and indexes', async () => {
    const err = async (code: string) => (await run(code)).error;
    expect(await err('Image("12a")\n')).toMatchObject({ type: 'ValueError', message: 'unexpected character in Image definition' });
    expect(await err('Image(2, 2, bytearray(3))\n')).toMatchObject({ message: 'image data is incorrect size' });
    expect(await err('Image.HEART.get_pixel(5, 0)\n')).toMatchObject({ message: 'index too large' });
    expect(await err('Image.HEART.get_pixel(-1, 0)\n')).toMatchObject({ message: 'index cannot be negative' });
    expect(await err('Image(5)\n')).toMatchObject({ type: 'TypeError', message: 'Image(s) takes a string' });
    expect(await err('Image.HEART + Image(2, 2)\n')).toMatchObject({ message: 'images must be the same size' });
  });

  it('+ - * / and shift, crop, invert, fill', async () => {
    const r = await run([
      'print(repr(Image.HEART * 0.5))',
      'print(repr(Image("90:00") + Image("05:00")), repr(Image("90:00") - Image("55:00")))',
      'print(repr(Image("12:34").shift_left(1)), repr(Image("12:34").crop(1, 0, 1, 2)), repr(Image("09:90").invert()))',
      'i = Image(2, 1)',
      'i.fill(3)',
      'print(repr(i), repr(Image.HEART / 3))',
    ].join('\n'));
    expect(r.output).toBe([
      "Image('05050:55555:55555:05550:00500:')",
      "Image('95:00:') Image('40:00:')",
      "Image('20:40:') Image('2:4:') Image('90:09:')",
      "Image('33:') Image('03030:33333:33333:03330:00300:')",
      '',
    ].join('\n'));
  });
});
