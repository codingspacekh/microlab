import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/**
 * Two project rules on top of the recommended ones:
 *  - boundary: src/lib is pure — no Electron, Node built-ins, React or the DOM (architecture §2.2, Q14);
 *  - controls: no native <select> or date / time / colour / range / number inputs outside
 *    src/renderer/ui — only our own controls reach the screen (N-14).
 */
const nodeBuiltins = ['fs', 'path', 'os', 'child_process', 'crypto', 'url', 'worker_threads', 'stream', 'events', 'util'];

export const boundary = {
  'no-restricted-imports': ['error', {
    paths: [
      { name: 'electron', message: 'src/lib is pure: no Electron (architecture §2.2).' },
      { name: 'react', message: 'src/lib is pure: no React (architecture §2.2).' },
      { name: 'react-dom', message: 'src/lib is pure: no React (architecture §2.2).' },
      ...nodeBuiltins.map((name) => ({ name, message: 'src/lib is pure: no Node built-ins (architecture §2.2).' })),
    ],
    patterns: [{ group: ['node:*', 'electron/*', 'react-dom/*'], message: 'src/lib is pure (architecture §2.2).' }],
  }],
  'no-restricted-globals': ['error',
    { name: 'window', message: 'src/lib is pure: no DOM.' },
    { name: 'document', message: 'src/lib is pure: no DOM.' },
    { name: 'process', message: 'src/lib is pure: no Node.' },
  ],
};

export const controls = {
  'no-restricted-syntax': ['error',
    { selector: "JSXOpeningElement[name.name='select']", message: 'Use Select from src/renderer/ui — never a native <select> (N-14).' },
    {
      selector: "JSXOpeningElement[name.name='input'] > JSXAttribute[name.name='type'][value.value=/^(date|time|datetime-local|month|week|color|range|number)$/]",
      message: 'Use the control from src/renderer/ui — never a native date, time, colour, range or number input (N-14).',
    },
  ],
};

export default tseslint.config(
  { ignores: ['out/**', 'dist/**', 'coverage/**', 'design/**', 'node_modules/**', 'test-results/**', 'spikes/**', 'vendor/**', '.cache/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx,mts}'],
    languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
  },
  // Build and maintenance scripts run in Node.
  { files: ['scripts/**/*.mjs'], languageOptions: { globals: { console: 'readonly', process: 'readonly' } } },
  { files: ['src/lib/**/*.{ts,tsx}'], rules: boundary },
  { files: ['src/renderer/**/*.tsx'], ignores: ['src/renderer/ui/**'], rules: controls },
);
