from machine import Pin
import time

buzzer = Pin(15, Pin.OUT)   # an active buzzer: on is a beep
while True:
    buzzer.on()
    time.sleep(0.25)
    buzzer.off()
    time.sleep(0.25)
