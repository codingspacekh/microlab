import { describe, expect, it } from 'vitest';
import {
  addPart, addWire, boardData, completeAt, duplicate, fitBox, moveParts, parseModule, pinCard, rotateParts, sceneOf, signatureAt,
} from '@lib/editor';
import { newProject } from '@lib/project';

/** M5.1–M5.5: the edges — what is not there, what can't be read, brackets and strings in the code. */
const empty = () => newProject('pico-w').project;

describe('M5 edges: the circuit', () => {
  it('a part that is not there (or has a leg off the canvas) is not moved, turned or copied', () => {
    const p = addPart(empty(), 'resistor', { a: 'bb1.a5', b: 'bb1.a8' }).project;
    expect(moveParts(p, ['r9'], { x: 16, y: 0 })).toBeUndefined();
    expect(moveParts(p, [], { x: 16, y: 0 })).toBeUndefined();
    expect(rotateParts(p, ['r9'])).toBeUndefined();
    expect(duplicate(p, { parts: ['r9'], wires: [] })).toBeUndefined();
    expect(duplicate(p, { parts: [], wires: [] })).toBeUndefined();
    const lost = { ...p, parts: [{ ...p.parts[0]!, legs: { a: 'bb1.a5', b: 'bb1.a99' } }] };
    expect(rotateParts(lost, ['r1'])).toBeUndefined();
  });

  it('a wire with an end that is not on the canvas is not copied; a copy of a wire without bends has none', () => {
    let p = addWire(empty(), 'bb1.a1', 'bb1.a9')!;
    const d = duplicate(p, { parts: [], wires: ['w1'] })!;
    expect(d.project.wires[1]).not.toHaveProperty('via');
    p = { ...p, wires: [{ id: 'w1', a: 'bb1.a1', b: 'bb1.z99' }] };
    expect(duplicate(p, { parts: [], wires: ['w1'] })).toBeUndefined();
  });

  it('a copy is named by its kind, after the highest number used', () => {
    let p = addPart(empty(), 'led', { a: 'bb1.a5', k: 'bb1.a7' }).project;
    p = { ...p, parts: [{ ...p.parts[0]!, id: 'led7' }] };
    expect(duplicate(p, { parts: ['led7'], wires: [] })!.parts).toEqual(['led8']);
  });

  it('the fit leaves out a breadboard with no place in the view', () => {
    const p = empty();
    const s = sceneOf(p);
    const without = { ...s, view: { ...s.view, breadboards: {} } };
    expect(fitBox(without).h).toBeLessThan(fitBox(s).h);
  });

  it('a control pin (the ESP32\'s EN) says what it is', () => {
    const c = pinCard(boardData('esp32-devkit-v1'), 'EN');
    expect(c.chips).toEqual([{ text: 'Control', kind: 'gpio' }]);
    expect(c.lines).toEqual(['Pull to GND to reset the board']);
    expect(pinCard(boardData('pico-w'), 'NOPE')).toEqual({ title: 'NOPE', detail: '', chips: [], lines: [] });
  });
});

describe('M5.5 edges: the catalogue', () => {
  it('a line it can\'t read, or a member before its class, is an error naming the line', () => {
    expect(() => parseModule('m', '', 'Pin(id) missing dash', 'pico')).toThrow(/can't read "Pin\(id\) missing dash"/);
    expect(() => parseModule('m', '', 'Pin.on() — on', 'pico')).toThrow(/Pin.on comes before Pin/);
  });

  it('an object of a class that is not there has no members; a subclass of one that is not there has only its own', () => {
    const m = parseModule('m', '', 'thing: Nowhere — a thing\n~Sub < Nowhere — a class\nSub.x() — x', 'pico');
    expect(m.members.get('thing')!.members.size).toBe(0);
    expect([...m.members.get('Sub')!.members.keys()]).toEqual(['x']);
  });
});

describe('M5.5 edges: the code', () => {
  it('imports of modules the board has not, and names it has not, are left out', () => {
    const alias = 'import nothing, machine as m\nm.P';
    expect(completeAt('pico-w', alias, alias.length)!.options.map((o) => o.label)).toEqual(['Pin', 'PWM']);
    expect(completeAt('pico-w', 'from nothing import x\nx.', 23)).toBeNull();
    expect(completeAt('pico-w', 'from nothing import ', 20)).toBeNull();
    expect(completeAt('pico-w', 'from machine import Nope, Pin as P\nP.O', 38)!.options.map((o) => o.label)).toEqual(['OUT', 'OPEN_DRAIN']);
  });

  it('from … import (a, b) in brackets; an object given a second name', () => {
    const code = 'from microbit import (display, Image)\nd = display\nd.sc';
    expect(completeAt('microbit-v2', code, code.length)!.options.map((o) => o.label)).toEqual(['scroll']);
    expect(completeAt('microbit-v2', 'import microbit\nmb = microbit\nmb.disp', 36)!.options.map((o) => o.label)).toEqual(['display']);
  });

  it('a variable is not offered as its own completion; an instance is not offered the class\'s classes', () => {
    expect(completeAt('pico-w', 'from machine import Pin\nPin', 27)).toBeNull();
    const code = 'from machine import Pin\nled = Pin(15)\nled.';
    expect(completeAt('pico-w', code, code.length)!.options.every((o) => o.kind !== 'class')).toBe(true);
  });

  it('the arguments: a quote escaped in a string, a comment, a bracket in a list, a call of something unknown', () => {
    const s1 = 'from microbit import *\ndisplay.scroll("it\\"s, ok", ';
    expect(signatureAt('microbit-v2', s1, s1.length)!.active).toBe(1);
    const s2 = 'from microbit import *\ndisplay.scroll("hi",  # a, b\n  ';
    expect(signatureAt('microbit-v2', s2, s2.length)!.active).toBe(1);
    expect(signatureAt('pico-w', 'x = [1, 2', 9)).toBeNull();
    expect(signatureAt('pico-w', 'print(1, ', 9)).toBeNull();
    expect(signatureAt('pico-w', '(1, ', 4)).toBeNull();
    expect(signatureAt('pico-w', 'from machine import Pin\nPin.OUT(', 32)).toBeNull();
  });
});
