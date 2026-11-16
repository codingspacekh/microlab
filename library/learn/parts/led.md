---
id: led
kind: part
part: led
title: LED
tag: Basics · light
card: A tiny light that lets current go one way only.
uses: a power light | traffic lights | torches | screens are millions of them
left: 2
---
A tiny light. It glows when a small [current] flows through it — but only one way round. LED means **light-emitting diode**.

## Look inside
figure: led-inside

## The idea
An LED is a **one-way door** for current. Push from the long leg and the door opens — the chip lights. Push from the short leg and it stays shut: no current, no light. The door needs a small push to open: about **{led.vf} volts** for a red LED. Its colour comes from what the chip is made of, not from the plastic.

## Its numbers
| Push it needs | ≈ {led.vf} V | red, yellow, green: about {led.vf} V; blue and white: about {led.vf:blue} V |
| Best current | {led.dim}–{led.rated} mA | bright, and it lasts for years |
| Most it can take | {led.max} mA | more, and the chip burns out |
| Size | 5 mm | the round top, across |
| Legs | long +, short − | and the flat edge is on the − side |

## Connect it
Always with a **resistor** in the loop: it holds the current back to a safe size. Battery + → resistor → long leg; short leg → battery −.

figure: led-connect

**Which resistor?** Take the LED's {led.vf} V from the battery's volts, then divide by the current you want ({led.best.A} A):

= 3 V battery: {led.resistor:3} Ω
= 5 V supply: {led.resistor:5} Ω
= 6 V (4×AA): {led.resistor:6} Ω
= 9 V battery: {led.resistor:9} Ω

> A bigger resistor is safe — the LED is just dimmer. Never smaller than the table says.

## Mistakes
- ! **No resistor** Far too much current: it flashes bright and burns out. MicroLab burns it too, and says why.
- **The wrong way round** The one-way door stays shut: it stays dark. Nothing breaks — turn it round.
- **Both legs in one column** The breadboard joins them, so the current goes round the LED, not through it.
