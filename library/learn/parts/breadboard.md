---
id: breadboard
kind: part
part: breadboard
title: Breadboard
tag: Basics · building
card: Joins parts without solder: which holes are connected inside.
uses: on every maker's desk | trying a circuit before it is made for good
---
A board full of holes that **joins parts without solder**. Push a leg in and a metal clip under the hole grips it.

## Look inside
figure: breadboard-inside

## The idea
Holes in the same strip are **the same point** of the circuit, as if the legs in them were twisted together. So to join two parts, put one leg of each in the same column. To keep two legs apart, put them in different columns.

## Its numbers
| Holes in a strip | {breadboard.strip} | room for five legs at one point |
| The gap in the middle | cuts each column in two | just wide enough for a chip or a button to sit across it, legs on each side |
| Rails | two on each long edge | marked + (red) and − (blue), all the way along |
| Sizes | mini, half, full | more columns, the same idea |

## Connect it
Battery + to the red rail, battery − to the blue rail. Now every part can reach + and − with one short wire.

A part goes **across** columns: one leg in one column, the other leg in another.

## Mistakes
- **Both legs in one column** The strip joins the two legs, so the [current] goes round the part, not through it. MicroLab says the part is skipped.
- ! **A wire from the + rail to the − rail** Nothing holds the current back: a [short circuit]. Every path from + to − must go through a part.
- **Forgetting the gap** A wire in the top half does not reach the bottom half of the same column.
