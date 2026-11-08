from machine import Pin
import time

red, green, blue = Pin(15, Pin.OUT), Pin(14, Pin.OUT), Pin(13, Pin.OUT)
while True:
    for colour in (red, green, blue):
        colour.on()
        time.sleep(0.5)
        colour.off()
