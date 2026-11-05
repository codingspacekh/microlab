# os, utime, i2c, scale and the rest
def t(label, f):
    try:
        print(label, repr(f()))
    except Exception as e:
        print(label, type(e).__name__ + ':', e)
from microbit import *
import os, time
t('uname', lambda: os.uname())
t('mkdir', lambda: hasattr(os, 'mkdir'))
t('append', lambda: open('log.txt', 'a'))
t('utime', lambda: (time, hasattr(time, 'time')))
t('scan', lambda: i2c.scan())
t('write', lambda: i2c.write(0x3C, b'\x00'))
t('scale', lambda: (scale(512, from_=(0, 1023), to=(0, 255)), scale(0.5, from_=(0, 1), to=(0.0, 10.0))))
t('temp type', lambda: type(temperature()))
t('buttons', lambda: (button_a.is_pressed(), button_b.was_pressed(), button_a.get_presses()))
t('objects', lambda: (button_a, display, accelerometer, i2c))
