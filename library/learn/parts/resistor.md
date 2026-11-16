---
id: resistor
kind: part
part: resistor
title: Resistor
tag: Basics · control
card: Holds the current back. Its stripes tell you how much.
uses: in front of nearly every LED | anywhere a current must be kept small
---
A part that **holds the current back**. It has no top or bottom: it works the same both ways round.

## Look inside
figure: resistor-inside

## The idea
A resistor is a **narrow place in the path**. The same push ([voltage]) gets less flow ([current]) through a narrower place. Twice the [resistance], half the current: that is [Ohm's law], current = voltage ÷ resistance.

9 V across 470 Ω gives 9 ÷ 470 = 0.019 A — 19 mA.

## Its numbers
| Resistance | in ohms (Ω) | 1 000 Ω is 1 kΩ |
| Its stripes | two digits, then the zeros | red-red-brown is 2, 2, one zero: 220 Ω; brown-black-orange is 1, 0, three zeros: 10 kΩ. The gold stripe goes on the right |
| Heat it can take | ¼ watt | plenty for LEDs and sensors |
| Legs | two | either way round |

## Connect it
In the loop, one after the other with the part it protects: battery + → resistor → LED → battery −.

It does not matter whether it comes before the LED or after it — the same current flows all round a loop.

## Mistakes
- ! **Too small a value** 22 Ω instead of 220 Ω lets ten times the current through: the LED burns out.
- **Reading the stripes backwards** Start from the end away from the gold stripe.
- **Beside the LED, not in line with it** A resistor next to the LED, joined at both ends, protects nothing.
