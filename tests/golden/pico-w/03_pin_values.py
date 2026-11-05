# Output read-back, toggle, value before OUT, open drain released onto a pull-up
def t(label, f):
    try:
        print(label, repr(f()))
    except Exception as e:
        print(label, type(e).__name__ + ':', e)
from machine import Pin
p = Pin(15, Pin.OUT)
t('out', lambda: p.value())
p.on()
t('on', lambda: p.value())
p.toggle()
t('toggle', lambda: p.value())
q = Pin(16, Pin.IN, Pin.PULL_DOWN)
q.value(1)
t('in after value(1)', lambda: q.value())
q.init(Pin.OUT)
t('then OUT', lambda: q.value())
o = Pin(17, Pin.OPEN_DRAIN, Pin.PULL_UP, value=0)
t('od 0', lambda: o.value())
o.value(1)
t('od 1', lambda: o.value())
