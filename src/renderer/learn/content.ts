import { loadLearn } from '@lib/learn';

/** Learn's pages and glossary, as written in library/learn — read once, with the app. */
const RAW = import.meta.glob<string>('../../../library/learn/**/*.md', { query: '?raw', import: 'default', eager: true });

export const LEARN = loadLearn(RAW);
