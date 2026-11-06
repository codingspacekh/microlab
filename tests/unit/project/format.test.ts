import { strToU8, unzipSync, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { MlabError, newProject, readMlab, writeMlab, type ProjectDoc } from '@lib/project';

/** M4.2 (F-02, architecture §2.7): a .mlab is a zip of project.json and the files/ tree. */
const doc = (): ProjectDoc => {
  const d = newProject('pico-w');
  return {
    project: { ...d.project, title: 'Night light', parts: [{ id: 'r1', type: 'resistor', props: { ohms: 220 }, legs: { a: 'bb1.a5', b: 'bb1.a8' } }] },
    files: { ...d.files, 'lib/ssd1306.py': '# driver\n', 'www/index.html': '<h1>°C</h1>\n', 'data.bin': new Uint8Array([0, 255, 7]) },
  };
};

const zip = (entries: Record<string, string>) => zipSync(Object.fromEntries(Object.entries(entries).map(([k, v]) => [k, strToU8(v)])));
const project = JSON.stringify(newProject('pico-w').project);

describe('M4.2 F-02 the .mlab file', () => {
  it('holds project.json and the files under files/', () => {
    const names = Object.keys(unzipSync(writeMlab(doc()))).sort();
    expect(names).toEqual(['files/data.bin', 'files/lib/ssd1306.py', 'files/main.py', 'files/www/index.html', 'project.json']);
  });

  it('reads back what was written: the project, text files as text, other files as bytes', () => {
    expect(readMlab(writeMlab(doc()))).toEqual(doc());
  });

  it('ignores what is not the project (a Mac\'s __MACOSX folder, a folder entry)', () => {
    const d = readMlab(zip({ 'project.json': project, 'files/main.py': 'x = 1\n', '__MACOSX/._main.py': '?', 'files/lib/': '' }));
    expect(Object.keys(d.files)).toEqual(['main.py']);
  });

  it.each([
    ['not a zip', new TextEncoder().encode('hello'), /isn't a MicroLab project/],
    ['no project.json', zip({ 'files/main.py': '' }), /has no project\.json/],
    ['project.json is not JSON', zip({ 'project.json': '{ nope' }), /project\.json can't be read/],
    ['made by a newer MicroLab', zip({ 'project.json': JSON.stringify({ format: 2, board: 'pico-w' }) }), /newer version of MicroLab/],
    ['a bad project.json, saying where', zip({ 'project.json': JSON.stringify({ format: 1, board: 'pico-w', breadboards: 'x', parts: [], wires: [] }) }), /breadboards/],
    ['a board this MicroLab does not know', zip({ 'project.json': project.replace('pico-w', 'arduino-uno') }), /board "arduino-uno", which isn.t one MicroLab knows/],
    ['a file outside the project', zip({ 'project.json': project, 'files/../evil.py': '' }), /unsafe file name/],
    ['an absolute file name', zip({ 'project.json': project, 'files//etc/x': '' }), /unsafe file name/],
  ])('refuses %s, with a message a student can read', (_name, bytes, message) => {
    expect(() => readMlab(bytes)).toThrow(MlabError);
    expect(() => readMlab(bytes)).toThrow(message);
  });

  it('refuses to write an unsafe file name', () => {
    expect(() => writeMlab({ ...doc(), files: { '../x.py': '' } })).toThrow(/unsafe file name/);
  });
});
