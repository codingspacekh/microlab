---
id: ldr
kind: part
part: ldr
title: Light sensor (LDR)
tag: Basics · sensor
card: Lets more current through the more light falls on it.
uses: street lamps that switch on at dusk | a night light
---
**A resistor that changes with the light.** The brighter the light on it, the more [current] it lets through. LDR means *light-dependent resistor*.

## Look inside
figure: ldr-inside

## The idea
Light is energy. When it falls on the track it **knocks tiny charges loose**, and loose charges are what current is made of. More light, more loose charges, less [resistance].

On its own an LDR only changes how hard it resists. Put a fixed resistor after it and the [voltage] between the two moves up and down with the light — a [voltage divider]. That moving voltage is what a circuit can read.

## Its numbers
| In the dark | up to {ldr.dark.M} MΩ | a million ohms |
| In dim light | about {ldr.k:10} kΩ | 10 lux: a room at dusk |
| In a bright room | about {ldr.k:100} kΩ | 100 lux; in sunlight, under 1 kΩ |
| Legs | two | either way round |
| Speed | slow | it takes a moment to follow a sudden change |

## Connect it
Battery + → LDR → {ldr.partner.k} kΩ resistor → battery −. Read the voltage at the point between them.

= {ldr.battery} V battery, nearly dark: {ldr.volts:1} V
= {ldr.battery} V battery, a bright room: {ldr.volts:100} V

## Mistakes
- **No resistor after it** Then the point you read is joined straight to the battery: it never changes.
- **The resistor far too small or too big** The voltage hardly moves. {ldr.partner.k} kΩ suits room light.
