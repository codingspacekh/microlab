from machine import Pin
import time

led = Pin(15, Pin.OUT)
line = Pin(4, Pin.IN)   # 0 over white, 1 over the black line
while True:
    led.value(line.value())
    time.sleep_ms(10)
