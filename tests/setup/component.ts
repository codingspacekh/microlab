import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => cleanup());

// CodeMirror measures text with Range rectangles, which jsdom doesn't draw: give it empty ones.
const empty = () => ({ x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, toJSON: () => ({}) });
Range.prototype.getBoundingClientRect = empty as never;
Range.prototype.getClientRects = (() => Object.assign([], { item: () => null })) as never;
