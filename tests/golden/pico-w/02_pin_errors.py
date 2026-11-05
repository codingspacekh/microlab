# Pin errors and constants
def t(label, f):
    try:
        print(label, repr(f()))
    except Exception as e:
        print(label, type(e).__name__ + ':', e)
from machine import Pin
t('30', lambda: Pin(30))
t('GP23', lambda: Pin('GP23'))
t('GPIO23', lambda: Pin('GPIO23'))
t('mode str', lambda: Pin(15, 'out'))
t('constants', lambda: (Pin.IN, Pin.OUT, Pin.OPEN_DRAIN, Pin.ALT, Pin.PULL_UP, Pin.PULL_DOWN, Pin.IRQ_RISING, Pin.IRQ_FALLING))
