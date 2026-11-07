from machine import Pin
import time

led = Pin(15, Pin.OUT)
pir = Pin(14, Pin.IN)   # HC-SR501 on 5 V: 1 while it sees motion, and 3 s after
while True:
    led.value(pir.value())
    time.sleep_ms(10)
