---
id: battery
kind: part
part: battery
title: Battery pack
tag: Basics · power
card: Where the push comes from: volts, and how long it lasts.
uses: torches | remote controls | toys | anything not plugged into the wall
---
**Where the push comes from.** A battery pushes [current] round the loop until its chemicals are used up.

## Look inside
figure: battery-inside

## The idea
A battery is **a pump, not a tank** of current. It pushes the same charges round and round the loop. [Voltage] is how hard it pushes. Cells in a row push together, so their volts add.

## Its numbers
| One AA cell | {battery.cell.volts} V | 2 × AA: {battery.volts:2xAA} V; 4 × AA: {battery.volts:4xAA} V |
| 9 V battery | {battery.volts:9V} V | six small cells in one case |
| How long an AA lasts | about {battery.mah:2xAA} mAh | it could light one LED at {led.best} mA for about {battery.hours:2xAA,15} hours |
| How long a 9 V lasts | about {battery.mah:9V} mAh | much less |
| Wires | red is +, black is − | |

## Connect it
Red to the breadboard's + rail, black to the − rail.

Choose the pack by what the circuit needs: an LED with its resistor is happy on any of them — with the right resistor for those volts.

## Mistakes
- ! **+ joined straight to −** A [short circuit]: a huge current, the wire and the battery get hot, and the battery is soon flat. MicroLab stops and shows where.
- ! **Too many volts for the part** 9 V into something made for 3 V breaks it.
- **One cell in backwards** Its push works against the others: the pack gives far less.
