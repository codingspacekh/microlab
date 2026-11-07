from microbit import *

# HC-SR501 on the GPIO board's 5V: 1 while it sees motion, and 3 s after
while True:
    pin0.write_digital(pin1.read_digital())
    sleep(10)
