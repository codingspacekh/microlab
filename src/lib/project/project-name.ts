/**
 * A project's name (M12 Rev 11, F-100, screen 31e): asked when a project is made — the folder's name for a Python
 * project, the .mlab file's for a board's. Letters (any language), digits, spaces, - and _; checked as it is typed
 * and again by the main process.
 */
export const PROJECT_NAME_MAX = 60;

export function projectNameProblem(name: string): string | null {
  if (!name.trim()) return 'Give the project a name.';
  if (name !== name.trim()) return 'A project\'s name doesn\'t start or end with a space.';
  if (name.length > PROJECT_NAME_MAX) return `A project's name is ${PROJECT_NAME_MAX} letters at most.`;
  const bad = /[^\p{L}\p{N} _-]/u.exec(name);
  if (bad) return `A project's name has letters, digits, spaces, - and _ only: not “${bad[0]}”.`;
  return null;
}
