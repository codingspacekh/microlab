from microbit import *

# its heater needs 5 V; gas: AO over 2 V
while True:
    pin0.write_digital(pin2.read_analog() > 620)
    sleep(10)
