from microbit import *

# the L298N's IN1 and IN2 (its ENA jumper on: full speed); its 12V from the power supply's 5 V rails,
# its GND joined to the micro:bit's
while True:
    pin1.write_digital(1)   # forward
    sleep(1000)
    pin1.write_digital(0)
    pin2.write_digital(1)   # backward
    sleep(1000)
    pin2.write_digital(0)
    sleep(500)              # both low: a brake
