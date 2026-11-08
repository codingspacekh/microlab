import { parseBoard, type BoardData, type BoardId } from '../boards';
import { microbitAlone, type Project } from '../project';
import esp32ExtArt from '../../../library/boards/esp32-devkit-v1-ext/art.json';
import esp32ExtJson from '../../../library/boards/esp32-devkit-v1-ext/board.json';
import esp32Art from '../../../library/boards/esp32-devkit-v1/art.json';
import esp32Json from '../../../library/boards/esp32-devkit-v1/board.json';
import microbitAloneArt from '../../../library/boards/microbit-v2/alone.json';
import microbitArt from '../../../library/boards/microbit-v2/art.json';
import microbitJson from '../../../library/boards/microbit-v2/board.json';
import picoArt from '../../../library/boards/pico-w/art.json';
import picoJson from '../../../library/boards/pico-w/board.json';
import buttonArt from '../../../library/parts/button/art.json';
import potArt from '../../../library/parts/potentiometer/art.json';
import switchArt from '../../../library/parts/slide-switch/art.json';

/**
 * The library's data the editor needs (architecture §2.7): each board's pins and the picture's size and pin places
 * (art.json, written by `npm run art` from the approved drawings), and the fixed footprints of parts.
 */
export interface Art {
  width: number;
  height: number;
  pitch: number;
  /** Board pins by their `number` in board.json → [x, y] on the picture. */
  pins: Record<string, [number, number]>;
  /** The board's own LEDs by builtIn id ('LED'), where they light (M4.5). */
  leds?: Record<string, [number, number]>;
  /** The micro:bit's 25 display pixels, row by row. */
  display?: [number, number][];
  /** The micro:bit GPIO board's own micro-USB socket, its left end (M6.1): the plug goes here. */
  usb?: { socket: [number, number] };
}

export interface PartArt {
  width: number;
  height: number;
  legs: Record<string, [number, number]>;
}

const ARTS: Record<BoardId, Art> = {
  'microbit-v2': microbitArt as unknown as Art,
  'pico-w': picoArt as unknown as Art,
  'esp32-devkit-v1': esp32Art as unknown as Art,
  'esp32-devkit-v1-ext': esp32ExtArt as unknown as Art,
};

const JSONS: Record<BoardId, unknown> = {
  'microbit-v2': microbitJson,
  'pico-w': picoJson,
  'esp32-devkit-v1': esp32Json,
  'esp32-devkit-v1-ext': esp32ExtJson,
};

const parsed = new Map<BoardId, BoardData>();

export function boardArt(id: BoardId): Art {
  return ARTS[id];
}

/** The micro:bit alone (M6.9, screen 24): its five rings are its only pins. */
export const MICROBIT_ALONE_ART = microbitAloneArt as unknown as Art;

/** What is printed on each ring, by the pin it is (the GPIO board's header names them P0, P1, P2, 3.3V, GND). */
export const RING_LABELS: Record<string, string> = { P0: '0', P1: '1', P2: '2', '3.3V': '3V', GND: 'GND' };

/** The project's board as it is drawn: the micro:bit alone or in its GPIO board, any other board as it is. */
export function artOf(project: Pick<Project, 'board' | 'gpioBoard'>): Art {
  return microbitAlone(project) ? MICROBIT_ALONE_ART : ARTS[project.board as BoardId];
}

/** board.json, checked once. */
export function boardData(id: BoardId): BoardData {
  let b = parsed.get(id);
  if (!b) parsed.set(id, (b = parseBoard(JSONS[id])));
  return b;
}

export const PART_ART: Record<'button' | 'potentiometer' | 'slide-switch', PartArt> = {
  button: buttonArt as unknown as PartArt,
  potentiometer: potArt as unknown as PartArt,
  'slide-switch': switchArt as unknown as PartArt,
};
