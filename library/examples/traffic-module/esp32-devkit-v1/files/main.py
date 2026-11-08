from machine import Pin
import time

# the module's R, Y and G, each LED with its resistor on the board
red, yellow, green = Pin(25, Pin.OUT), Pin(26, Pin.OUT), Pin(27, Pin.OUT)
while True:
    for light, seconds in ((red, 1), (green, 1), (yellow, 0.5)):
        light.on()
        time.sleep(seconds)
        light.off()
