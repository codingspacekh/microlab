import dht
import time
from machine import Pin

sensor = dht.DHT22(Pin(14))   # its DATA pin; the module has its pull-up
while True:
    sensor.measure()               # takes about 0.27 s
    print('%.1f C  %.1f %%' % (sensor.temperature(), sensor.humidity()))
    time.sleep(2)              # a DHT22 gives a new reading every 2 s
