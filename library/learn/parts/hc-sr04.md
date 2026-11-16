---
id: hc-sr04
kind: part
part: hc-sr04
title: Ultrasonic HC-SR04
tag: Sensors · distance
card: Sound takes time: it times an echo to tell how far.
uses: a car's parking beeper | a robot that stops before the wall | a tap that runs when a hand comes near
---
**It measures how far away something is — with sound.** It sends a click too high to hear and times the echo, the way a bat does. Sound that high is called [ultrasound].

## Look inside
figure: sonar-inside

## The idea
**Sound takes time to travel.** It goes about 340 metres in a second, so a click to a wall and back takes a little while — longer the farther the wall is. Time the echo, and you know the distance: each centimetre costs {sonar.us} millionths of a second, there and back.

## Its numbers
| How far it sees | {sonar.min} cm to {sonar.max} cm | nearer or farther, it cannot tell |
| The echo's time | {sonar.us} µs for each cm | the way there and the way back together; 100 cm takes {sonar.ms:100} ms |
| What it sees best | flat, hard things facing it | a wall, a box, a hand; soft or slanted things send the sound elsewhere |
| Power | 5 V | at least {sonar.volts} V — less, and it does not answer |

## Its legs and how to connect it
| VCC | power | to + (5 V) |
| Trig | "go" | a short [pulse] here sends the click |
| Echo | the answer | stays high for as long as the echo took; a [signal] to time |
| GND | [ground] | to − |

## Mistakes
- **Too little power** On 3.3 V it stays silent: it needs 5 V.
- **Something soft or slanted** A curtain or a tilted board sends no echo back: it looks as if nothing is there.
- **Too near** Closer than {sonar.min} cm the echo comes back before it is ready to listen.
- **Trig and Echo swapped** It never hears "go", so it never answers.
- ! **Echo straight to a 3.3 V board** Echo gives the full 5 V, too much for a board that works at 3.3 V: its pin is damaged. Two resistors — a [voltage divider] — bring Echo down first. MicroLab stops and says so.
