---
id: pir
kind: part
part: pir
title: PIR motion
tag: Sensors · movement
card: Sees warmth that moves, not light.
uses: lights that come on when you walk in | a burglar alarm | a door that opens by itself
---
**It notices when something warm moves.** Under its white dome is an eye for heat, not for light: it works in the dark, and a person walking past wakes it. The heat it sees is [infrared].

## Look inside
figure: pir-inside

## The idea
**It compares two halves.** The eye has two halves side by side. A warm room warms both the same: nothing happens. A person walking past is seen by one half first, then the other — for a moment the halves differ, and that difference is the alarm. That is why it sees movement, and not someone standing still.

## Its numbers
| Its answer | on or off | OUT goes to {pir.high} V when it sees movement: a [digital] [signal] |
| It stays on | about {pir.hold} seconds | after the last movement, so a light does not flicker |
| How far | a few metres | wider with the dome on: the dome is many little lenses |
| Power | 5 V | at least {pir.volts} V |

## Its legs and how to connect it
| VCC | power | to + (5 V) |
| OUT | the answer | high while it sees movement, to what reads it — a board's [pin], or a small light |
| GND | [ground] | to − |

## Mistakes
- **Too little power** On 3.3 V it never wakes: it needs 5 V.
- **Expecting it to see you standing still** It sees warmth that moves. Keep still and, after its {pir.hold} seconds, it switches off.
- **Just switched on** It needs up to a minute to get used to the room before it can be trusted.
- **Sun or a heater in its view** Warm air moving looks like a person to it.
