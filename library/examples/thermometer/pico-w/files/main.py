from machine import Pin, ADC
import time

fan = Pin(15, Pin.OUT)
sensor = ADC(26)
while True:
    c = (sensor.read_u16() * 3.3 / 65535 - 0.5) * 100   # TMP36: 0.5 V + 10 mV per °C
    print('Temperature:', round(c), 'C')
    fan.value(c > 25)
    time.sleep(0.5)
