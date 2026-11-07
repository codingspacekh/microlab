from microbit import *

while True:
    c = (pin2.read_analog() * 3.3 / 1023 - 0.5) * 100   # TMP36: 0.5 V + 10 mV per °C
    print('Temperature:', round(c), 'C')
    pin0.write_digital(c > 25)
    sleep(500)
