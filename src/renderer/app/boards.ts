import type { BoardId, NewProjectBoard } from '@lib/boards';
import esp32Ext from '../../../library/boards/esp32-devkit-v1-ext/board.json';
import esp32 from '../../../library/boards/esp32-devkit-v1/board.json';
import microbit from '../../../library/boards/microbit-v2/board.json';
import pico from '../../../library/boards/pico-w/board.json';
import esp32ExtArt from '../../../library/boards/esp32-devkit-v1-ext/art.svg?url';
import esp32Art from '../../../library/boards/esp32-devkit-v1/art.svg?url';
import microbitArt from '../../../library/boards/microbit-v2/art.svg?url';
import picoArt from '../../../library/boards/pico-w/art.svg?url';

/** Each board's full name (top bar, F-01), from its board.json. */
export const BOARD_NAMES: Record<BoardId, string> = {
  'microbit-v2': microbit.name,
  'pico-w': pico.name,
  'esp32-devkit-v1': esp32.name,
  'esp32-devkit-v1-ext': esp32Ext.name,
};

/** Each board's picture (library/boards/<id>/art.svg), drawn on the canvas where the project's view puts it. */
export const BOARD_ART: Record<BoardId, string> = {
  'microbit-v2': microbitArt,
  'pico-w': picoArt,
  'esp32-devkit-v1': esp32Art,
  'esp32-devkit-v1-ext': esp32ExtArt,
};

/** The start screen's board cards (screen 01). */
export interface BoardCard {
  id: NewProjectBoard;
  title: string;
  /** In the button: "New Pico W project". */
  short: string;
  about: string;
  /** The first line of its programs. */
  imports: string;
  art: string;
}

export const BOARD_CARDS: BoardCard[] = [
  { id: 'microbit-v2', title: 'BBC micro:bit V2', short: 'micro:bit', about: '5×5 display, buttons, speaker, motion sensor, radio', imports: 'from microbit import *', art: microbitArt },
  { id: 'pico-w', title: 'Raspberry Pi Pico W', short: 'Pico W', about: '26 GP pins, 3 analog inputs, Wi-Fi', imports: 'from machine import Pin', art: picoArt },
  { id: 'esp32-devkit-v1', title: 'ESP32 DevKit V1', short: 'ESP32', about: '30 pins, touch pins, Wi-Fi and Bluetooth', imports: 'from machine import Pin', art: esp32Art },
];
