# PWM: repr, freq and duty read back from the registers, shared slices, errors, the pin repr
def t(label, f):
    try:
        print(label, repr(f()))
    except Exception as e:
        print(label, type(e).__name__ + ':', e)
from machine import PWM, Pin
p = PWM(Pin(15), freq=1000, duty_u16=32768)
t('repr', lambda: p)
for f in (50, 123, 1000, 10000, 100000):
    p.freq(f)
    t('freq %d' % f, lambda: (p.freq(), p.duty_u16(), p.duty_ns()))
a = PWM(Pin(14), freq=50, duty_u16=16384)
p.freq(1000)
t('shared', lambda: (a.freq(), a.duty_u16()))
t('pin', lambda: Pin(15))
q = PWM(Pin(16))
q.duty_u16(1000)
t('no freq', lambda: (q.freq(), q.duty_u16()))
t('too small', lambda: PWM(Pin(17), freq=7))
q.init(invert=1)
t('invert', lambda: q)
