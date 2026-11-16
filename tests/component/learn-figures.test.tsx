import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LED, WIPER_OHMS } from '../../src/lib/circuit';
import { FIGURES } from '../../src/renderer/learn/figures';

/**
 * M8 Learn's pictures to play with (screens 30b the LED, 30c the potentiometer): the control changes the drawing's
 * description and the sentence under it, and the numbers are the simulator's (src/lib/circuit) — rated 20 mA, burnt
 * above 30 mA; a 10 kΩ track with 3.3 V across it.
 */

function show(name: string) {
  const Figure = FIGURES[name]!;
  return render(<Figure />);
}

/** Moves a kit slider to `value` from the keyboard: Home, then PageUp (ten steps) and ArrowRight (one). */
function slideTo(thumb: HTMLElement, value: number) {
  const now = () => Number(thumb.getAttribute('aria-valuenow'));
  fireEvent.keyDown(thumb, { key: 'Home' });
  while (now() + 10 <= value) fireEvent.keyDown(thumb, { key: 'PageUp' });
  while (now() < value) fireEvent.keyDown(thumb, { key: 'ArrowRight' });
  expect(now()).toBe(value);
}

const says = () => screen.getByRole('status').textContent ?? '';

describe('the LED, cut open (screen 30b)', () => {
  const setup = () => {
    show('led-inside');
    return { thumb: screen.getByRole('slider', { name: 'Current through it' }), picture: () => screen.getByRole('img', { name: /cut open/ }) };
  };

  it('starts at 15 mA and shines bright, as the screen says', () => {
    const { thumb, picture } = setup();
    expect(thumb).toHaveAttribute('aria-valuenow', '15');
    expect(thumb).toHaveAttribute('aria-valuemin', '0');
    expect(thumb).toHaveAttribute('aria-valuemax', '40');
    expect(thumb).toHaveAttribute('aria-valuetext', '15 mA');
    expect(says()).toBe('At 15 mA it shines bright. The current comes in at the long leg, crosses the tiny chip — that\'s where the light is made — and leaves by the short leg. Slide past 30 mA and the chip gets too hot: it burns out, for good.');
    expect(picture()).toHaveAccessibleName('An LED cut open: 15 mA flows through it, it shines bright');
  });

  it('with no current it is dark', () => {
    const { thumb, picture } = setup();
    slideTo(thumb, 0);
    expect(says()).toMatch(/At 0 mA no current flows/);
    expect(says()).toMatch(/dark/);
    expect(picture()).toHaveAccessibleName(/no current flows through it, it is dark/);
  });

  it('a little current: it glows dimly', () => {
    const { thumb, picture } = setup();
    slideTo(thumb, 4);
    expect(says()).toMatch(/At 4 mA it glows, but only dimly/);
    expect(picture()).toHaveAccessibleName(/4 mA flows through it, it glows dimly/);
  });

  it('at 25 mA it is more than its 20 mA: too much, it will not last', () => {
    const { thumb, picture } = setup();
    slideTo(thumb, 25);
    expect(says()).toMatch(/At 25 mA/);
    expect(says()).toMatch(/more than its 20 mA/);
    expect(says()).toMatch(/too much — it will not last/);
    expect(says()).not.toMatch(/burnt/);
    expect(picture()).toHaveAccessibleName(/25 mA flows through it, more than its 20 mA/);
  });

  it('the rated current is still right, the most it can take is not yet burnt — as the simulator has it', () => {
    const { thumb } = setup();
    slideTo(thumb, 20);
    expect(says()).toMatch(/At 20 mA it shines bright/);
    slideTo(thumb, 30);
    expect(says()).toMatch(/too much — it will not last/);
    expect(says()).not.toMatch(/burnt/);
    slideTo(thumb, 31);
    expect(says()).toMatch(/burnt out/);
  });

  it('at 35 mA it has burnt out, and stays burnt — for good — until a new LED is taken', () => {
    const { thumb, picture } = setup();
    expect(screen.queryByRole('button', { name: 'New LED' })).toBeNull();
    slideTo(thumb, 35);
    expect(says()).toMatch(/More than 30 mA went through it/);
    expect(says()).toMatch(/burnt out, for good/);
    expect(picture()).toHaveAccessibleName(/it has burnt out/);

    slideTo(thumb, 15);                                   // sliding back does not mend it
    expect(says()).toMatch(/burnt out, for good/);
    expect(says()).not.toMatch(/shines bright/);
    expect(picture()).toHaveAccessibleName(/it has burnt out/);

    fireEvent.click(screen.getByRole('button', { name: 'New LED' }));
    expect(thumb).toHaveAttribute('aria-valuenow', '15');
    expect(says()).toMatch(/At 15 mA it shines bright/);
    expect(picture()).toHaveAccessibleName(/it shines bright/);
    expect(screen.queryByRole('button', { name: 'New LED' })).toBeNull();
  });

  it('its 20 and 30 are the simulator\'s rated and greatest current', () => {
    expect(LED.ratedA * 1000).toBe(20);
    expect(LED.maxA * 1000).toBe(30);
    const { thumb } = setup();
    expect(says()).toContain(`Slide past ${LED.maxA * 1000} mA`);
    slideTo(thumb, 25);
    expect(says()).toContain(`more than its ${LED.ratedA * 1000} mA`);
    expect(says()).toContain(`Slide past ${LED.maxA * 1000} mA`);
    slideTo(thumb, 35);
    expect(says()).toContain(`More than ${LED.maxA * 1000} mA`);
  });

  it('the row of three states says which one applies now', () => {
    const { thumb } = setup();
    const row = () => screen.getByRole('img', { name: /at three currents/ });
    expect(row()).toHaveAccessibleName(/dark at 0 mA, bright at 15 mA, burnt out over 30 mA\. Now: bright/);
    slideTo(thumb, 0);
    expect(row()).toHaveAccessibleName(/Now: dark/);
    slideTo(thumb, 25);
    expect(row()).toHaveAccessibleName(/Now: in between/);
    slideTo(thumb, 35);
    expect(row()).toHaveAccessibleName(/Now: burnt out/);
  });
});

describe('the potentiometer, its cover off (screen 30c)', () => {
  const setup = () => {
    const { container } = show('pot-inside');
    return {
      thumb: screen.getByRole('slider', { name: 'Turn the knob' }),
      picture: () => screen.getByRole('img', { name: /potentiometer/ }),
      drawn: () => [...container.querySelectorAll('svg[role="img"] text')].map((t) => t.textContent),
    };
  };

  it('starts a quarter of the way round: 0.83 V of 3.3 V, 2.5 kΩ and 7.5 kΩ', () => {
    const { thumb, picture, drawn } = setup();
    expect(thumb).toHaveAttribute('aria-valuenow', '25');
    expect(thumb).toHaveAttribute('aria-valuetext', '25 %');
    expect(says()).toBe('A quarter of the way round, the wiper touches the track a quarter of the way along. So leg 2 gets a quarter of the push: 0.83 V of 3.3 V. Turn it all the way and leg 2 gets all of it.');
    expect(drawn()).toEqual(expect.arrayContaining(['leg 2: 0.83 V', '1 ↔ 2: 2.5 kΩ', '2 ↔ 3: 7.5 kΩ', 'leg 1 · 0 V', 'leg 3 · 3.3 V']));
    expect(picture()).toHaveAccessibleName(/turned 25 % of the way, leg 2 gets 0\.83 V of 3\.3 V; 2\.5 kΩ between legs 1 and 2, 7\.5 kΩ between legs 2 and 3/);
  });

  it('all the way back leg 2 gets 0 V, all the way 3.3 V', () => {
    const { thumb, picture, drawn } = setup();
    slideTo(thumb, 0);
    expect(drawn()).toEqual(expect.arrayContaining(['leg 2: 0 V', '1 ↔ 2: 0 kΩ', '2 ↔ 3: 10 kΩ']));
    expect(says()).toMatch(/none of the push: 0 V of 3\.3 V/);
    expect(picture()).toHaveAccessibleName(/turned 0 % of the way, leg 2 gets 0 V of 3\.3 V/);
    slideTo(thumb, 100);
    expect(drawn()).toEqual(expect.arrayContaining(['leg 2: 3.3 V', '1 ↔ 2: 10 kΩ', '2 ↔ 3: 0 kΩ']));
    expect(says()).toMatch(/all of the push: 3\.3 V of 3\.3 V/);
    expect(picture()).toHaveAccessibleName(/turned 100 % of the way, leg 2 gets 3\.3 V of 3\.3 V/);
  });

  it('half way: 1.65 V, 5 kΩ each side', () => {
    const { thumb, picture, drawn } = setup();
    slideTo(thumb, 50);
    expect(drawn()).toEqual(expect.arrayContaining(['leg 2: 1.65 V', '1 ↔ 2: 5 kΩ', '2 ↔ 3: 5 kΩ']));
    expect(says()).toMatch(/Half way round.*half of the push: 1\.65 V of 3\.3 V/);
    expect(picture()).toHaveAccessibleName(/leg 2 gets 1\.65 V of 3\.3 V; 5 kΩ between legs 1 and 2, 5 kΩ between legs 2 and 3/);
  });

  it('anywhere else it says the share as it is, worked out as the simulator does', () => {
    const { thumb, drawn } = setup();
    slideTo(thumb, 40);
    const track = 10_000;                                  // the potentiometer's model: 10 kΩ
    const volts = (3.3 * (0.4 * track + WIPER_OHMS)) / (track + 2 * WIPER_OHMS);
    expect(volts.toFixed(2)).toBe('1.32');
    expect(drawn()).toEqual(expect.arrayContaining(['leg 2: 1.32 V', '1 ↔ 2: 4 kΩ', '2 ↔ 3: 6 kΩ']));
    expect(says()).toMatch(/40 % of the way round.*40 % of the push: 1\.32 V of 3\.3 V/);
  });
});

describe('every picture', () => {
  it('is known by its name: the first pages\' three, and one for each of the other basic parts (M8.2)', () => {
    expect(Object.keys(FIGURES).sort()).toEqual([
      'battery-inside', 'breadboard-circuit', 'breadboard-inside', 'button-inside', 'buzzer-inside', 'circuit-loop', 'digital-analog', 'ldr-inside',
      'led-connect', 'led-inside', 'pot-inside', 'pwm-dimming', 'resistor-inside', 'rgb-inside', 'series-parallel', 'switch-inside', 'water-loop',
    ]);   // M8.3: and the six big ideas'
  });

  it.each(Object.keys(FIGURES))('%s draws, and says what it shows', (name) => {
    const { container } = show(name);
    const pictures = container.querySelectorAll('svg.lfig');
    expect(pictures.length).toBeGreaterThan(0);
    for (const svg of pictures) {
      expect(svg).toHaveAttribute('role', 'img');
      expect(svg.getAttribute('aria-label')).toMatch(/\S/);
      expect(svg).toHaveAttribute('viewBox');
      expect(svg).not.toHaveAttribute('width');            // it fills its box: no fixed size
    }
    expect(container.innerHTML).not.toMatch(/NaN|undefined/);
  });

  it('how to connect an LED: the battery, through a 220 Ω resistor, to the long leg', () => {
    show('led-connect');
    expect(screen.getByRole('img')).toHaveAccessibleName(/6 V battery pack's \+, through a 220 Ω resistor, to the LED's long leg; its short leg goes back to the battery's −/);
    expect(screen.getByText('220 Ω')).toBeInTheDocument();
    expect(screen.getByText('6 V')).toBeInTheDocument();
  });
});
