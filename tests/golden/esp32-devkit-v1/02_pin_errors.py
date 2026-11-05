# Pin errors and constants; pull kept unless given
def t(label, f):
    try:
        print(label, repr(f()))
    except Exception as e:
        print(label, type(e).__name__ + ':', e)
from machine import Pin
for n in (24, 30, 40, 'D2'):
    t('pin %r' % (n,), lambda: Pin(n))
t('34 out', lambda: Pin(34, Pin.OUT))
t('constants', lambda: (Pin.IN, Pin.OUT, Pin.OPEN_DRAIN, Pin.PULL_UP, Pin.PULL_DOWN, Pin.IRQ_RISING, Pin.IRQ_FALLING))
t('methods', lambda: (hasattr(Pin, 'high'), hasattr(Pin, 'on'), hasattr(Pin, 'toggle')))
p = Pin(4, Pin.IN, Pin.PULL_UP)
p.init(Pin.IN)
t('pull kept', lambda: p)
p.init(pull=None)
t('pull removed', lambda: p)
