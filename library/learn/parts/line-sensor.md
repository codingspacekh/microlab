---
id: line-sensor
kind: part
part: line-sensor
title: Line sensor (IR)
tag: Sensors · light
card: A light and an eye side by side.
uses: a robot that follows a line | counting things on a belt | the edge of a table
---
**A tiny lamp and a tiny eye, side by side, looking down.** The lamp shines light you cannot see — [infrared] — and the eye watches for it bouncing back.

## Look inside
figure: line-inside

## The idea
**White throws light back; black swallows it.** Over a white floor the lamp's light bounces up into the eye. Over a black line almost none comes back. A small chip turns "much light" or "little light" into one of two levels — a [digital] [signal].

## Its numbers
| Over white | OUT is low | 0 V: the light comes back, and the little lamp on the board is on |
| Over black | OUT is high | the light is swallowed |
| How near | a few millimetres to 1 cm | from the floor: farther, and too little comes back |
| Power | 3.3 V or 5 V | at least {line.volts} V |

## Its legs and how to connect it
| OUT | the answer | low over white, high over black, to what reads it — a board's [pin] |
| GND | [ground] | to − |
| VCC | power | to + (3.3 V or 5 V) |

## Mistakes
- **Held too high** Far from the floor nothing bounces back: everything looks black.
- **Expecting high over white** It is the other way round: white is low.
- **A shiny black floor** Shine throws light back like white does. A dull black line works best.
- **Bright sunlight** The sun is full of infrared: it blinds the eye.
