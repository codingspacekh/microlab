import { isBoardId, type BoardId } from '../boards';
import type { ProjectDoc } from './format';

/**
 * A new project (F-01): the chosen board with one half breadboard, nothing else placed, and a starter main.py that
 * runs as it is and shows something on the board itself — the display, or the board's own LED.
 */
const STARTERS: Record<BoardId, string> = {
  'microbit-v2': `from microbit import *

# Runs when you press Run. Change it, or start again!
while True:
    display.show(Image.HEART)
    sleep(500)
    display.clear()
    sleep(500)
`,
  'pico-w': `from machine import Pin
import time

# The Pico W's own LED. Change it, or start again!
led = Pin("LED", Pin.OUT)

while True:
    led.toggle()
    time.sleep(0.5)
`,
  'esp32-devkit-v1': esp32(),
  'esp32-devkit-v1-ext': esp32(),
};

function esp32() {
  return `from machine import Pin
import time

# The ESP32's own blue LED is on pin 2. Change it, or start again!
led = Pin(2, Pin.OUT)

while True:
    led.value(not led.value())
    time.sleep(0.5)
`;
}

export function newProject(board: BoardId): ProjectDoc {
  if (!isBoardId(board)) throw new Error(`there is no board "${String(board)}"`);
  return {
    project: { format: 1, title: 'Untitled project', board, breadboards: [{ id: 'bb1', size: 'half' }], parts: [], wires: [] },
    files: { 'main.py': STARTERS[board] },
  };
}
