---
id: potentiometer
kind: part
part: potentiometer
title: Potentiometer
tag: Basics · input
card: A knob that slides along a track: any voltage in between.
uses: volume knobs | dimmers | a joystick (two of them)
---
A knob that gives you **any voltage in between**: turn it one way for less, the other way for more. People call it a *pot*.

## Look inside
figure: pot-inside

## The idea
The track is one long resistor. The wiper splits it into two parts, and the push ([voltage]) splits the same way: the closer the wiper is to leg 3, the more volts it picks up. This is called a **[voltage divider]**.

## Its numbers
| Whole track | {pot.track.k} kΩ | between legs 1 and 3, whatever the knob says |
| Turns | about 300° | not quite a full circle; it stops at each end |
| Most current | a few mA | it measures; it isn't for driving a motor or a lamp |

## Its legs and how to connect it
| Leg 1 | one end | to − ([GND = ground]) |
| Leg 2 | the wiper | to what reads the voltage — a board's analog pin, or the multimeter |
| Leg 3 | other end | to + ({supply.low} V); swap 1 and 3 and the knob works backwards |

## Mistakes
- **The wiper to + or −** Turned to the end, the knob joins + straight to −: a [short circuit].
- **Only two legs used** It works as a variable resistor — fine, but no voltage in between to read.
