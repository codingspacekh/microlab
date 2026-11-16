---
id: dht
kind: part
part: dht
title: DHT11 / DHT22
tag: Sensors · weather
card: Measures warmth and dampness, and sends them as numbers.
uses: a weather station | a greenhouse | a room's thermostat
---
**Two sensors and a tiny chip in one case**: one feels how warm the air is, the other how damp. The chip sends both as numbers down a single wire. How damp the air is, is called its [humidity].

## Look inside
figure: dht-inside

## The idea
**A chip measures, then sends numbers.** The other sensors give a [voltage] you have to read. This one does the reading itself and sends the answer as a row of pulses: a short [pulse] for a 0, a long one for a 1 — forty of them, a [digital] message. The last eight make a number to check the others by.

## Its numbers
| DHT11 (blue) | {dht.tmin:DHT11} to {dht.tmax:DHT11} °C | dampness {dht.hmin:DHT11} to {dht.hmax:DHT11} %; whole numbers only |
| DHT22 (white) | {dht.tmin:DHT22} to {dht.tmax:DHT22} °C | dampness {dht.hmin:DHT22} to {dht.hmax:DHT22} %; to a tenth |
| How often | once every second or two | it needs a rest between readings |
| Power | 3.3 V or 5 V | at least {dht.volts} V |

## Its legs and how to connect it
| VCC | power | to + (3.3 V or 5 V) |
| DATA | the numbers | one wire, to what reads them — a board's [pin] |
| GND | [ground] | to − |

## Mistakes
- **Asking too often** Ask again within a second and it has nothing new: the reading fails.
- **VCC and GND swapped** It gets hot and may break: check before the power goes on.
- **A long, loose DATA wire** The pulses get muddled and the check number does not fit: the reading is thrown away.
- **On 5 V with a 3.3 V board** DATA is pulled up to the power's volts, so it reaches 5 V — more than a 3.3 V board's pin should take. Power it from 3.3 V.
