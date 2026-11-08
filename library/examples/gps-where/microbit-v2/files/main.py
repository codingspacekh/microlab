from microbit import *
from micropyGPS import MicropyGPS

my_gps = MicropyGPS(location_formatting='dd')
# the GPS's TX on P0 (print() would go out of P1 now: the display says it)
uart.init(baudrate=9600, tx=pin1, rx=pin0)

while True:
    while uart.any():
        for c in uart.read():
            if my_gps.update(chr(c)) == 'GPGGA':
                display.scroll(str(my_gps.satellites_in_use), wait=False)
    sleep(100)
