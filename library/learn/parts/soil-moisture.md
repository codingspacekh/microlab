---
id: soil-moisture
kind: part
part: soil-moisture
title: Soil moisture
tag: Sensors · water
card: Tells damp soil from dry.
uses: a plant pot that asks for water | a garden that waters itself
---
**A blade you push into the soil that tells how wet it is.** Its metal is sealed inside the blade, so nothing rusts.

## Look inside
figure: soil-inside

## The idea
**Water changes what the blade feels.** Inside the blade are two strips of metal, side by side, that never touch. They can hold a little electric charge between them — and they hold more when there is water close by. A chip at the top keeps filling and emptying them, and turns how much they hold into a [voltage]: the wetter the soil, the **lower** the voltage.

## Its numbers
| In dry soil | about {soil.dry} V | its highest answer |
| In water | about {soil.wet} V | its lowest: wetter means lower |
| In between | any level | an [analog] [signal] |
| Power | 3.3 V or 5 V | at least {soil.volts} V |

## Its legs and how to connect it
| AOUT | the answer | to what reads the voltage — a board's analog [pin], or the multimeter |
| VCC | power | to + (3.3 V or 5 V) |
| GND | [ground] | to − |

## Mistakes
- **Pushed in too deep** Soil over the line on the blade reaches the chip and its legs: they must stay dry.
- **Reading it upside down** A high voltage means *dry*, not wet.
- **Trusting the numbers of another pot** Every soil is different: see what yours gives dry and wet, then choose where "thirsty" starts.
