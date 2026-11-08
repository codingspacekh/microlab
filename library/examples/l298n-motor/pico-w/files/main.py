from machine import Pin
import time

# the L298N's IN1 and IN2 (its ENA jumper on: full speed); its 12V from the power supply's 5 V rails,
# its GND joined to the board's
in1 = Pin(17, Pin.OUT, value=0)
in2 = Pin(16, Pin.OUT, value=0)
while True:
    in1.on()          # forward
    time.sleep(1)
    in1.off()
    in2.on()          # backward
    time.sleep(1)
    in2.off()
    time.sleep(0.5)   # both low: a brake
