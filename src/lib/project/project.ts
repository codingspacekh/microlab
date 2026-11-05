import { z } from 'zod';
import type { BoardData } from '../boards';
import type { CircuitSpec } from '../circuit';

/**
 * project.json (architecture §2.7): the board and the circuit. M3 reads examples kept as folders
 * (project.json + files/); the .mlab zip, view, notes and migrations come with M4 (format.ts, migrate.ts).
 */
const point = z.string().min(1);

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
  wires: z.array(z.object({ id: z.string(), a: point, b: point })),
  /** Board pins pushed into breadboard holes (a board that straddles the channel). */
  plugs: z.record(z.string(), point).optional(),
  /** Supply jumpers (the ESP32 extension board's V): pin → volts. */
  jumpers: z.record(z.string(), z.number()).optional(),
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
    board: { data: board, ...(project.plugs ? { plugs: project.plugs } : {}), ...(project.jumpers ? { jumpers: project.jumpers } : {}) },
    breadboards: project.breadboards,
    parts: project.parts,
    wires: project.wires,
  };
}
