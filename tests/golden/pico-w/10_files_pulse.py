# File errors and time_pulse_us with nothing wired
def t(label, f):
    try:
        print(label, repr(f()))
    except Exception as e:
        print(label, type(e).__name__ + ':', e)
from machine import Pin, time_pulse_us
t('missing', lambda: open('no-such-file.txt'))
p = Pin(14, Pin.IN, Pin.PULL_UP)
t('pulse', lambda: (time_pulse_us(p, 0, 10000), time_pulse_us(p, 1, 10000)))
