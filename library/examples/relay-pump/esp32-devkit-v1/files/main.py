from machine import Pin
import time

relay = Pin(27, Pin.OUT)   # the relay module's S; its COM and NO switch the pump on its own batteries
while True:
    relay.on()    # COM to NO: the pump runs
    time.sleep(1)
    relay.off()
    time.sleep(1)
