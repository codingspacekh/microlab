from microbit import *

# an active buzzer on pin 0: 1 is a beep
while True:
    pin0.write_digital(1)
    sleep(250)
    pin0.write_digital(0)
    sleep(250)
