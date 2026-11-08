import { addBreadboard } from '@lib/editor';
import { newProject as bareProject, type ProjectDoc } from '@lib/project';

/** A new project with one half breadboard, as new projects had before M6.8 (where the first breadboard still goes):
 *  the editor's tests build on it. */
export function newProject(board: Parameters<typeof bareProject>[0]): ProjectDoc {
  const d = bareProject(board);
  return { ...d, project: addBreadboard(d.project, 'half').project };
}
