from machine import UART, Pin
from micropyGPS import MicropyGPS
import time

gps = UART(2, baudrate=9600)   # RX2 = GPIO 16, TX2 = 17
my_gps = MicropyGPS(location_formatting='dd')

while True:
    while gps.any():
        for c in gps.read():
            if my_gps.update(chr(c)) == 'GPGGA':   # a GGA sentence read: where, how many satellites
                lat, ns = my_gps.latitude
                lon, ew = my_gps.longitude
                print('%.4f %s, %.4f %s, %d satellites' % (lat, ns, lon, ew, my_gps.satellites_in_use))
    time.sleep_ms(100)
