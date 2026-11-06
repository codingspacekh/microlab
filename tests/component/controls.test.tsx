import { fireEvent, render, screen } from '@testing-library/react';
import { useState, type ComponentType, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  Checkbox, Chips, RadioGroup, Segmented, Select, Slider, Stepper, Swatches, Switch, TextArea, TextField,
} from '../../src/renderer/ui';

/**
 * M4.1b the form-control kit (screen 12b, N-14): every control is ours, in every state, and works from the keyboard —
 * Tab reaches it, Space / Enter choose, arrows move in lists, sliders and segments.
 */

/** Renders a controlled control with its own state; `spy` sees every onChange. */
function controlled<V>(C: (props: never) => ReactNode, props: Record<string, unknown>, initial: V) {
  const spy = vi.fn();
  const Control = C as unknown as ComponentType<Record<string, unknown>>;
  function Host() {
    const [value, setValue] = useState<V>(initial);
    return <Control {...props} value={value} onChange={(v: V) => { spy(v); setValue(v); }} />;
  }
  render(<Host />);
  return spy;
}

const LED_COLOURS = [
  { value: 'red', label: 'Red', hint: '2.0 V', dot: '#e53935' },
  { value: 'yellow', label: 'Yellow', hint: '2.1 V', dot: '#f2b705' },
  { value: 'green', label: 'Green', hint: '2.2 V', dot: '#2fa253' },
  { value: 'blue', label: 'Blue', hint: '3.0 V', dot: '#2f6fd6', disabled: true },
  { value: 'white', label: 'White', hint: '3.0 V', dot: '#f4f5f7' },
];

describe('Select — never a native select', () => {
  const setup = (props: Partial<Parameters<typeof Select>[0]> = {}) => {
    const spy = controlled(Select, { label: 'LED colour', options: LED_COLOURS, ...props }, 'red');
    return { spy, box: screen.getByRole('combobox', { name: 'LED colour' }) };
  };
  const highlighted = (box: HTMLElement) => document.getElementById(box.getAttribute('aria-activedescendant') ?? '')?.textContent;

  it('shows its value; closed, there is no list', () => {
    const { box } = setup();
    expect(box).toHaveTextContent('Red');
    expect(box).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('opens with Enter, on the chosen option', () => {
    const { box } = setup();
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(box).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Red/ })).toHaveAttribute('aria-selected', 'true');
    expect(highlighted(box)).toMatch(/^Red/);
  });

  it('arrows move (skipping a disabled option), Enter chooses and closes', () => {
    const { box, spy } = setup();
    fireEvent.keyDown(box, { key: 'ArrowDown' });            // opens
    fireEvent.keyDown(box, { key: 'ArrowDown' });
    expect(highlighted(box)).toMatch(/^Yellow/);
    fireEvent.keyDown(box, { key: 'ArrowDown' });
    fireEvent.keyDown(box, { key: 'ArrowDown' });            // Blue is disabled
    expect(highlighted(box)).toMatch(/^White/);
    fireEvent.keyDown(box, { key: 'ArrowUp' });
    expect(highlighted(box)).toMatch(/^Green/);
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(spy).toHaveBeenCalledWith('green');
    expect(box).toHaveAttribute('aria-expanded', 'false');
    expect(box).toHaveTextContent('Green');
  });

  it('Home and End go to the first and last option', () => {
    const { box } = setup();
    fireEvent.keyDown(box, { key: 'Enter' });
    fireEvent.keyDown(box, { key: 'End' });
    expect(highlighted(box)).toMatch(/^White/);
    fireEvent.keyDown(box, { key: 'Home' });
    expect(highlighted(box)).toMatch(/^Red/);
  });

  it('Esc closes without changing it', () => {
    const { box, spy } = setup();
    fireEvent.keyDown(box, { key: 'Enter' });
    fireEvent.keyDown(box, { key: 'ArrowDown' });
    fireEvent.keyDown(box, { key: 'Escape' });
    expect(box).toHaveAttribute('aria-expanded', 'false');
    expect(spy).not.toHaveBeenCalled();
    expect(box).toHaveTextContent('Red');
  });

  it('typing a letter goes to the option that starts with it', () => {
    const { box } = setup();
    fireEvent.keyDown(box, { key: 'Enter' });
    fireEvent.keyDown(box, { key: 'g' });
    expect(highlighted(box)).toMatch(/^Green/);
  });

  it('a click opens it, a click on an option chooses it', () => {
    const { box, spy } = setup();
    fireEvent.click(box);
    fireEvent.click(screen.getByRole('option', { name: /Yellow/ }));
    expect(spy).toHaveBeenCalledWith('yellow');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('a click elsewhere closes it', () => {
    const { box } = setup();
    fireEvent.click(box);
    fireEvent.mouseDown(document.body);
    expect(box).toHaveAttribute('aria-expanded', 'false');
  });

  it('a disabled option can\'t be clicked', () => {
    const { box, spy } = setup();
    fireEvent.click(box);
    fireEvent.click(screen.getByRole('option', { name: /Blue/ }));
    expect(spy).not.toHaveBeenCalled();
  });

  it('disabled, it can\'t be opened', () => {
    const { box } = setup({ disabled: true });
    fireEvent.keyDown(box, { key: 'Enter' });
    fireEvent.click(box);
    expect(box).toHaveAttribute('aria-expanded', 'false');
    expect(box).toHaveAttribute('aria-disabled', 'true');
  });

  it('with no value it shows the placeholder; an error is said', () => {
    render(<Select label="Board" options={LED_COLOURS} value={undefined} placeholder="Choose…" error="Choose a board" onChange={() => {}} />);
    const box = screen.getByRole('combobox', { name: 'Board' });
    expect(box).toHaveTextContent('Choose…');
    expect(box).toHaveAttribute('aria-invalid', 'true');
    expect(box).toHaveAccessibleDescription('Choose a board');
  });
});

describe('Stepper — numbers, E12 or a plain step', () => {
  it('− / + step through the E12 values', () => {
    const spy = controlled(Stepper, { label: 'Resistance', series: 'e12' }, 220);
    const box = screen.getByRole('spinbutton', { name: 'Resistance' });
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    expect(spy).toHaveBeenLastCalledWith(270);
    expect(box).toHaveValue('270');
    fireEvent.click(screen.getByRole('button', { name: 'Less' }));
    fireEvent.click(screen.getByRole('button', { name: 'Less' }));
    expect(spy).toHaveBeenLastCalledWith(180);
  });

  it('arrow keys step too; across a decade 820 → 1k', () => {
    const spy = controlled(Stepper, { label: 'Resistance', series: 'e12' }, 820);
    const box = screen.getByRole('spinbutton', { name: 'Resistance' });
    fireEvent.keyDown(box, { key: 'ArrowUp' });
    expect(spy).toHaveBeenLastCalledWith(1000);
    expect(box).toHaveValue('1k');
    expect(box).toHaveAttribute('aria-valuenow', '1000');
  });

  it('typing a value and Enter sets it (4k7 is 4.7 kΩ); a wrong one goes back', () => {
    const spy = controlled(Stepper, { label: 'Resistance', series: 'e12' }, 220);
    const box = screen.getByRole('spinbutton', { name: 'Resistance' });
    fireEvent.change(box, { target: { value: '4k7' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(spy).toHaveBeenLastCalledWith(4700);
    expect(box).toHaveValue('4.7k');
    fireEvent.change(box, { target: { value: 'lots' } });
    fireEvent.blur(box);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(box).toHaveValue('4.7k');
  });

  it('a plain step stays within min and max; PageUp is ten steps', () => {
    const spy = controlled(Stepper, { label: 'Servo angle', step: 5, min: 0, max: 180, unit: '°' }, 170);
    const box = screen.getByRole('spinbutton', { name: 'Servo angle' });
    fireEvent.keyDown(box, { key: 'ArrowUp' });
    expect(spy).toHaveBeenLastCalledWith(175);
    fireEvent.keyDown(box, { key: 'PageUp' });
    expect(spy).toHaveBeenLastCalledWith(180);
    expect(screen.getByRole('button', { name: 'More' })).toBeDisabled();
    fireEvent.keyDown(box, { key: 'Home' });
    expect(spy).toHaveBeenLastCalledWith(0);
  });

  it('disabled, it can\'t be changed', () => {
    const spy = controlled(Stepper, { label: 'Resistance', series: 'e12', disabled: true }, 220);
    const box = screen.getByRole('spinbutton', { name: 'Resistance' });
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    fireEvent.keyDown(box, { key: 'ArrowUp' });
    expect(spy).not.toHaveBeenCalled();
    expect(box).toBeDisabled();
  });

  it('an error is shown and said', () => {
    render(<Stepper label="Servo angle" value={200} unit="°" error="An SG90 turns 0–180°." onChange={() => {}} />);
    const box = screen.getByRole('spinbutton', { name: 'Servo angle' });
    expect(box).toHaveAttribute('aria-invalid', 'true');
    expect(box).toHaveAccessibleDescription('An SG90 turns 0–180°.');
  });
});

describe('Chips — quick values', () => {
  it('a chip sets its value; the chosen one is pressed', () => {
    const spy = controlled(Chips, { label: 'Quick values', values: [100, 220, 330, 1000, 4700, 10_000] }, 220);
    expect(screen.getByRole('button', { name: '220' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: '1k' }));
    expect(spy).toHaveBeenCalledWith(1000);
    expect(screen.getByRole('button', { name: '1k' })).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('Checkbox', () => {
  it('a click or Space ticks and unticks it', () => {
    const spy = controlled(Checkbox, { label: 'Run it when copied', hint: 'and show the board\'s console here' }, false);
    const box = screen.getByRole('checkbox', { name: 'Run it when copied' });
    fireEvent.click(box);
    expect(box).toHaveAttribute('aria-checked', 'true');
    fireEvent.keyDown(box, { key: ' ' });
    expect(box).toHaveAttribute('aria-checked', 'false');
    expect(spy.mock.calls).toEqual([[true], [false]]);
  });

  it('clicking its words ticks it too', () => {
    const spy = controlled(Checkbox, { label: 'Sound' }, false);
    fireEvent.click(screen.getByText('Sound'));
    expect(spy).toHaveBeenCalledWith(true);
  });

  it('mixed (some of a folder) becomes ticked', () => {
    const spy = controlled(Checkbox, { label: 'lib/' }, 'mixed' as boolean | 'mixed');
    const box = screen.getByRole('checkbox', { name: 'lib/' });
    expect(box).toHaveAttribute('aria-checked', 'mixed');
    fireEvent.click(box);
    expect(spy).toHaveBeenCalledWith(true);
  });

  it('disabled, it can\'t be changed', () => {
    const spy = controlled(Checkbox, { label: 'Keep a copy', disabled: true }, true);
    const box = screen.getByRole('checkbox', { name: 'Keep a copy' });
    fireEvent.click(box);
    fireEvent.keyDown(box, { key: ' ' });
    expect(spy).not.toHaveBeenCalled();
    expect(box).toHaveAttribute('aria-disabled', 'true');
  });
});

const BREADBOARDS = [
  { value: 'half', label: 'Half breadboard', hint: '30 columns' },
  { value: 'full', label: 'Full breadboard', hint: '63 columns' },
  { value: 'none', label: 'No breadboard', hint: 'wires straight to the pins', disabled: true },
];

describe('RadioGroup — one of', () => {
  it('only the chosen radio is in the Tab order; arrows choose the next, skipping disabled ones and wrapping', () => {
    const spy = controlled(RadioGroup, { label: 'Breadboard', options: BREADBOARDS }, 'half');
    const half = screen.getByRole('radio', { name: /Half/ });
    const full = screen.getByRole('radio', { name: /Full/ });
    expect(screen.getByRole('radiogroup', { name: 'Breadboard' })).toBeInTheDocument();
    expect(half).toHaveAttribute('tabindex', '0');
    expect(full).toHaveAttribute('tabindex', '-1');
    fireEvent.keyDown(half, { key: 'ArrowDown' });
    expect(spy).toHaveBeenLastCalledWith('full');
    expect(full).toHaveAttribute('aria-checked', 'true');
    expect(full).toHaveFocus();
    fireEvent.keyDown(full, { key: 'ArrowDown' });         // "No breadboard" is disabled → wraps to Half
    expect(spy).toHaveBeenLastCalledWith('half');
  });

  it('a click chooses; a disabled radio can\'t be chosen', () => {
    const spy = controlled(RadioGroup, { label: 'Breadboard', options: BREADBOARDS }, 'half');
    fireEvent.click(screen.getByRole('radio', { name: /No breadboard/ }));
    expect(spy).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Full breadboard'));
    expect(spy).toHaveBeenCalledWith('full');
  });
});

describe('Switch', () => {
  it('a click, Space or Enter turns it on and off', () => {
    const spy = controlled(Switch, { label: 'Autosave' }, false);
    const sw = screen.getByRole('switch', { name: 'Autosave' });
    fireEvent.click(sw);
    expect(sw).toHaveAttribute('aria-checked', 'true');
    fireEvent.keyDown(sw, { key: 'Enter' });
    fireEvent.keyDown(sw, { key: ' ' });
    expect(spy.mock.calls).toEqual([[true], [false], [true]]);
  });

  it('disabled, it can\'t be changed', () => {
    const spy = controlled(Switch, { label: 'Wi-Fi pages', disabled: true }, false);
    fireEvent.click(screen.getByRole('switch', { name: 'Wi-Fi pages' }));
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('Slider — inputs while running', () => {
  const setup = (props: Partial<Parameters<typeof Slider>[0]> = {}) => {
    const spy = controlled(Slider, { label: 'Light', min: 0, max: 1000, step: 10, format: (v: number) => `${v} lx`, ...props }, 620);
    return { spy, thumb: screen.getByRole('slider', { name: 'Light' }) };
  };

  it('says its value and limits, as text too', () => {
    const { thumb } = setup();
    expect(thumb).toHaveAttribute('aria-valuenow', '620');
    expect(thumb).toHaveAttribute('aria-valuemin', '0');
    expect(thumb).toHaveAttribute('aria-valuemax', '1000');
    expect(thumb).toHaveAttribute('aria-valuetext', '620 lx');
    expect(screen.getByText('620 lx')).toBeInTheDocument();
  });

  it('arrows step, PageUp / PageDown ten steps, Home / End the ends', () => {
    const { thumb, spy } = setup();
    fireEvent.keyDown(thumb, { key: 'ArrowRight' });
    expect(spy).toHaveBeenLastCalledWith(630);
    fireEvent.keyDown(thumb, { key: 'ArrowDown' });
    expect(spy).toHaveBeenLastCalledWith(620);
    fireEvent.keyDown(thumb, { key: 'PageUp' });
    expect(spy).toHaveBeenLastCalledWith(720);
    fireEvent.keyDown(thumb, { key: 'End' });
    expect(spy).toHaveBeenLastCalledWith(1000);
    fireEvent.keyDown(thumb, { key: 'ArrowUp' });
    expect(spy).toHaveBeenCalledTimes(4);                  // already at its max
    fireEvent.keyDown(thumb, { key: 'Home' });
    expect(spy).toHaveBeenLastCalledWith(0);
  });

  it('dragging on the track sets the value under the mouse, on the step', () => {
    const { thumb, spy } = setup();
    const track = thumb.parentElement!;
    track.getBoundingClientRect = () => ({ left: 100, width: 200, right: 300, top: 0, bottom: 4, height: 4, x: 100, y: 0, toJSON: () => ({}) });
    fireEvent.mouseDown(track, { clientX: 150, button: 0 });
    expect(spy).toHaveBeenLastCalledWith(250);
    fireEvent.mouseMove(window, { clientX: 263 });
    expect(spy).toHaveBeenLastCalledWith(820);           // 815 → its step of 10
    fireEvent.mouseMove(window, { clientX: 999 });
    expect(spy).toHaveBeenLastCalledWith(1000);
    fireEvent.mouseUp(window);
    fireEvent.mouseMove(window, { clientX: 100 });
    expect(spy).toHaveBeenLastCalledWith(1000);
  });

  it('disabled, it can\'t be changed', () => {
    const { thumb, spy } = setup({ disabled: true });
    fireEvent.keyDown(thumb, { key: 'ArrowRight' });
    fireEvent.mouseDown(thumb.parentElement!, { clientX: 150, button: 0 });
    expect(spy).not.toHaveBeenCalled();
    expect(thumb).toHaveAttribute('aria-disabled', 'true');
  });
});

describe('Segmented — one of a few, side by side', () => {
  it('arrows move the choice; a click chooses', () => {
    const spy = controlled(Segmented, { label: 'Show examples for', options: [
      { value: 'all', label: 'All' }, { value: 'microbit', label: 'micro:bit' }, { value: 'pico', label: 'Pico W' }, { value: 'esp32', label: 'ESP32' },
    ] }, 'all');
    const all = screen.getByRole('radio', { name: 'All' });
    fireEvent.keyDown(all, { key: 'ArrowRight' });
    expect(spy).toHaveBeenLastCalledWith('microbit');
    expect(screen.getByRole('radio', { name: 'micro:bit' })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole('radio', { name: 'micro:bit' }), { key: 'ArrowLeft' });
    fireEvent.keyDown(screen.getByRole('radio', { name: 'All' }), { key: 'ArrowLeft' });    // wraps
    expect(spy).toHaveBeenLastCalledWith('esp32');
    fireEvent.click(screen.getByRole('radio', { name: 'Pico W' }));
    expect(spy).toHaveBeenLastCalledWith('pico');
  });
});

describe('Swatches — colour picker', () => {
  const COLOURS = [{ value: '#de3b3b', name: 'Red' }, { value: '#3a3d42', name: 'Black' }, { value: '#2fa253', name: 'Green' }];

  it('each colour has its name; arrows and clicks choose', () => {
    const spy = controlled(Swatches, { label: 'Wire colour', colours: COLOURS }, '#2fa253');
    const green = screen.getByRole('radio', { name: 'Green' });
    expect(green).toHaveAttribute('aria-checked', 'true');
    fireEvent.keyDown(green, { key: 'ArrowRight' });
    expect(spy).toHaveBeenLastCalledWith('#de3b3b');
    fireEvent.click(screen.getByRole('radio', { name: 'Black' }));
    expect(spy).toHaveBeenLastCalledWith('#3a3d42');
  });
});

describe('TextField and TextArea', () => {
  it('typing changes it; it has its label', () => {
    const spy = controlled(TextField, { label: 'Project name' }, 'Traffic');
    fireEvent.change(screen.getByRole('textbox', { name: 'Project name' }), { target: { value: 'Traffic lights' } });
    expect(spy).toHaveBeenCalledWith('Traffic lights');
  });

  it('a search field can be cleared with its × or Esc', () => {
    const spy = controlled(TextField, { label: 'Search', icon: 'search', clearable: true }, 'servo');
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(spy).toHaveBeenLastCalledWith('');
    expect(screen.queryByRole('button', { name: 'Clear' })).toBeNull();
    fireEvent.change(screen.getByRole('textbox', { name: 'Search' }), { target: { value: 'led' } });
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Search' }), { key: 'Escape' });
    expect(spy).toHaveBeenLastCalledWith('');
  });

  it('an error is shown and said; help is its description', () => {
    render(<TextField label="File" value="main.p y" error="A file name can't have spaces." onChange={() => {}} />);
    const box = screen.getByRole('textbox', { name: 'File' });
    expect(box).toHaveAttribute('aria-invalid', 'true');
    expect(box).toHaveAccessibleDescription("A file name can't have spaces.");
  });

  it('disabled, it can\'t be typed in', () => {
    render(<TextField label="File" value="main.py" disabled onChange={() => {}} />);
    expect(screen.getByRole('textbox', { name: 'File' })).toBeDisabled();
  });

  it('a text area for notes', () => {
    const spy = controlled(TextArea, { label: 'Notes' }, '');
    fireEvent.change(screen.getByRole('textbox', { name: 'Notes' }), { target: { value: 'Green LED first' } });
    expect(spy).toHaveBeenCalledWith('Green LED first');
  });
});
