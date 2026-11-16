---
id: rgb-led
kind: part
part: rgb-led
title: RGB LED
tag: Basics · light
card: Red, green and blue in one: mix them into any colour.
uses: every dot of a phone or TV screen | mood lamps | status lights
---
**Three LEDs — red, green and blue — in one clear case.** Mixed, they make any colour.

## Look inside
figure: rgb-inside

## The idea
Your eye has only three kinds of colour sensor — for red, green and blue. Any colour you see is a mix of those three, so **three lights are enough** to make nearly all of them. Inside, it is simply three LEDs sharing one leg.

## Its numbers
| Push each colour needs | red ≈ {rgb.vf:r} V | green and blue: about {rgb.vf:g} V — its green chip is a different kind from a single green LED's |
| Best current | {led.dim}–{led.rated} mA | for each colour; {led.max} mA at most |
| The shared leg | the longest | on a [common cathode] one it goes to −; on a [common anode] one, to + |
| Legs | four | red, shared, green, blue |

## Connect it
One resistor for **each** colour leg — three in all — and the shared leg to battery − (common cathode).

= 5 V, red: {rgb.resistor:5,r} Ω
= 5 V, green: {rgb.resistor:5,g} Ω
= 5 V, blue: {rgb.resistor:5,b} Ω

> On 3 V the green and blue chips barely open: they stay dim.

## Mistakes
- **One resistor on the shared leg** The three chips then share it, and the red one, which needs the least push, takes most of the current: green and blue barely light, and the colour is wrong.
- **The shared leg to the wrong side** Nothing lights. Common cathode goes to −, common anode to +.
- ! **No resistors** As with any LED: too much current, and the chip burns out.
