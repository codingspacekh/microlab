# Pin reprs (nothing wired)
def t(label, f):
    try:
        print(label, repr(f()))
    except Exception as e:
        print(label, type(e).__name__ + ':', e)
from machine import Pin
t('reset 4', lambda: Pin(4))
t('reset 15', lambda: Pin(15))
t('out', lambda: Pin(2, Pin.OUT))
t('in up', lambda: Pin(4, Pin.IN, Pin.PULL_UP))
t('in down', lambda: Pin(13, Pin.IN, Pin.PULL_DOWN))
t('od', lambda: Pin(14, Pin.OPEN_DRAIN))
t('34 up', lambda: Pin(34, Pin.IN, Pin.PULL_UP))
t('drive', lambda: Pin(16, Pin.OUT, drive=Pin.DRIVE_0))
