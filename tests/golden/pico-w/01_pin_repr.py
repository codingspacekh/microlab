# Pin reprs after reset and in each mode (nothing wired)
def t(label, f):
    try:
        print(label, repr(f()))
    except Exception as e:
        print(label, type(e).__name__ + ':', e)
from machine import Pin
t('reset', lambda: Pin(15))
t('reset value', lambda: Pin(15).value())
t('out', lambda: Pin(15, Pin.OUT))
t('in up', lambda: Pin(14, Pin.IN, Pin.PULL_UP))
t('in down', lambda: Pin(13, Pin.IN, Pin.PULL_DOWN))
t('in', lambda: Pin(12, Pin.IN))
t('od', lambda: Pin(11, Pin.OPEN_DRAIN, Pin.PULL_UP))
t('same', lambda: Pin(15) is Pin('GP15'))
t('irq', lambda: Pin(14).irq(lambda p: None))
