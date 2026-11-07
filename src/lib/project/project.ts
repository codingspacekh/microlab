import { z } from 'zod';
import type { BoardData } from '../boards';
import type { CircuitSpec } from '../circuit';

/**
 * project.json (architecture §2.7): the board and the circuit. M3 reads examples kept as folders
 * (project.json + files/); the .mlab zip, view, notes and migrations come with M4 (format.ts, migrate.ts).
 */
const point = z.string().min(1);
const xy = z.object({ x: z.number(), y: z.number() });

export const projectSchema = z.object({
  format: z.literal(1),
  title: z.string().optional(),
  board: z.string(),
  breadboards: z.array(z.object({ id: z.string(), size: z.enum(['half', 'full']) })),
  parts: z.array(z.object({
    id: z.string(),
    type: z.string(),
    props: z.record(z.string(), z.union([z.number(), z.string(), z.boolean()])).optional(),
    legs: z.record(z.string(), point),
  })),
  wires: z.array(z.object({
    id: z.string(), a: point, b: point,
    /** Bend points, from a to b, in drawing units (M4.3b). */
    via: z.array(xy).optional(),
    /** Its colour (M4.3b); without it, black to ground, red to a supply, the others in turn. */
    color: z.string().optional(),
  })),
  /** Board pins pushed into breadboard holes (a board that straddles the channel). */
  plugs: z.record(z.string(), point).optional(),
  /** Supply jumpers (the ESP32 extension board's V): pin → volts. */
  jumpers: z.record(z.string(), z.number()).optional(),
  /** The micro:bit GPIO board's own micro-USB is plugged in (M6.1): its 5V pins give 5 V only then. Not set: plugged in. */
  usb: z.boolean().optional(),
  /** Where the board and each breadboard are on the canvas (M4.3), in drawing units (16 = 0.1 in); parts and wires
   *  are placed by their holes and pins. A project without it gets the default layout (lib/editor). */
  view: z.object({ board: xy, breadboards: z.record(z.string(), xy) }).optional(),
});

export type Project = z.infer<typeof projectSchema>;

/** Checks a project.json; throws with every problem and where it is. */
export function parseProject(json: unknown): Project {
  const r = projectSchema.safeParse(json);
  if (!r.success) {
    throw new Error(`project.json is not valid — ${r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
  }
  return r.data;
}

/** The project's circuit, on its board's data. */
export function toCircuit(project: Project, board: BoardData): CircuitSpec {
  if (board.id !== project.board) throw new Error(`the project is for ${project.board}, not ${board.id}`);
  return {
    board: {
      data: board,
      ...(project.plugs ? { plugs: project.plugs } : {}),
      ...(project.jumpers ? { jumpers: project.jumpers } : {}),
      ...(project.usb !== undefined ? { usb: project.usb } : {}),
    },
    breadboards: project.breadboards,
    parts: project.parts,
    wires: project.wires,
  };
}
