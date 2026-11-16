---
id: button
kind: part
part: button
title: Push button
tag: Basics · input
card: Two metal contacts that touch while you press.
uses: a doorbell | a keyboard key | a game controller
---
**Two pieces of metal that touch while you press.** Let go, and a spring pulls them apart.

## Look inside
figure: button-inside

## The idea
A circuit is a loop, and [current] only flows round a loop with no gap. A button is **a gap you can close with a finger**.

## Its numbers
| Legs | four, in two pairs | the two legs of a pair are joined inside, always |
| Pressing | joins the pairs | one pair to the other pair |
| Size | 12 mm across | it sits across the gap in the middle of the breadboard |
| Current | far more than an LED needs | it only opens and closes the loop |

## Connect it
In the loop, anywhere: battery + → button → resistor → LED → battery −.

Use one leg from each pair: two legs side by side, on the same side of the gap — or two legs on a diagonal. The two legs facing each other across the gap are one pair: they are always joined.

## Mistakes
- **Two legs of the same pair** They are already joined, so the LED is on all the time and pressing changes nothing.
- **Turned a quarter turn** Then the joined pairs lie the other way: try the diagonal legs — they always work.
- **Left out of the loop** A button beside the loop, not in it, switches nothing.
