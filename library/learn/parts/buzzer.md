---
id: buzzer
kind: part
part: buzzer
title: Buzzer
tag: Basics · sound
card: A thin disc that shakes the air: that's the sound.
uses: an alarm clock | a microwave's beep | a smoke alarm
---
**A thin disc that shakes the air — that is the sound.** An *active* buzzer hums by itself; a *passive* one must be pushed for every shake.

## Look inside
figure: buzzer-inside

## The idea
**Sound is air shaking.** How many times a second it shakes is the [frequency], in [hertz] (Hz): 440 Hz is the note A. A buzzer turns an electric push into a push on the air.

## Its numbers
| Active | one note, about {buzzer.hz} Hz | it needs at least {buzzer.volts} V; it takes a few mA |
| Passive | any note you push it at | the pushes must swing by at least {buzzer.swing} V |
| Legs | two | the + is marked on top, and its leg is the longer one |

## Connect it
Active: battery + → buzzer +; buzzer − → battery −. Put a push button in the loop and it is a doorbell.

Passive: the same two legs, but to something that switches on and off quickly — steady volts will not do.

## Mistakes
- **A passive buzzer on steady volts** One small click as it bends, then silence.
- **An active buzzer the wrong way round** Its little circuit will not start: silence. Turn it round.
- **Expecting a tune from an active one** It knows one note only.
