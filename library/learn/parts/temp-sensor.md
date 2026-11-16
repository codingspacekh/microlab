---
id: temp-sensor
kind: part
part: temp-sensor
title: Temperature
tag: Sensors · heat
card: A chip whose voltage follows the heat.
uses: a thermometer | a fan that starts when it gets hot | a fish tank's alarm
---
**A little black chip that turns warmth into voltage.** The warmer it is, the more volts come out of its middle leg. Two kinds look the same: the TMP36 and the LM35.

## Look inside
figure: temp-inside

## The idea
**Its voltage climbs in even steps with the heat**: {temp.mv} thousandths of a volt for every degree. So a [voltage] read from it is a temperature — an [analog] [signal]. The TMP36 starts half a volt up, so that it can still say something below freezing.

## Its numbers
| Each degree | {temp.mv} mV | a hundredth of a volt |
| TMP36 | {temp.min:TMP36} to {temp.max:TMP36} °C | starts {temp.offset:TMP36} V up: {temp.out:TMP36,22} V at 22 °C; power from {temp.supply:TMP36} V |
| LM35 | {temp.min:LM35} to {temp.max:LM35} °C | starts at 0 V: {temp.out:LM35,22} V at 22 °C; power from {temp.supply:LM35} V |
| Back to degrees | volts × 100 | for the TMP36, take the {temp.offset:TMP36} V away first |

## Its legs and how to connect it
| +Vs | power | to + (3.3 V or 5 V for the TMP36; 5 V for the LM35) |
| Vout | the answer | the middle leg, to what reads the voltage — a board's analog [pin], or the multimeter |
| GND | [ground] | to − |

## Mistakes
- ! **The wrong way round** With + and − swapped it gets very hot, fast: it can burn a finger and break. The flat face shows which leg is which.
- **Reading it as on or off** Its answer is a level, not a 0 or a 1: it needs an analog reading.
- **Forgetting the TMP36's half volt** Then every temperature comes out 50 degrees too high.
