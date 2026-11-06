/**
 * The boards MicroLab knows: one per folder in library/boards (a unit test keeps the two the same). A project for any
 * other board is refused when it is opened (F-02).
 */
export const BOARD_IDS = ['microbit-v2', 'pico-w', 'esp32-devkit-v1', 'esp32-devkit-v1-ext'] as const;
export type BoardId = (typeof BOARD_IDS)[number];

/** The boards a new project starts from (F-01, screen 01), in the start screen's order. The ESP32 with the
 *  extension board is a choice made in the workspace (M5), not a fourth card. */
export const NEW_PROJECT_BOARDS = ['microbit-v2', 'pico-w', 'esp32-devkit-v1'] as const satisfies readonly BoardId[];
export type NewProjectBoard = (typeof NEW_PROJECT_BOARDS)[number];

export function isBoardId(id: string): id is BoardId {
  return (BOARD_IDS as readonly string[]).includes(id);
}
