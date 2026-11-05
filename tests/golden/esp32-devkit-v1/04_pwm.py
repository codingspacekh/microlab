# PWM (LEDC): defaults, read-back, the real frequency, errors
def t(label, f):
    try:
        print(label, repr(f()))
    except Exception as e:
        print(label, type(e).__name__ + ':', e)
from machine import PWM, Pin
p = PWM(Pin(15))
t('default', lambda: (p, p.freq(), p.duty(), p.duty_u16()))
p.duty(256)
t('duty 256', lambda: (p, p.duty_u16()))
p.duty_u16(1001)
t('u16 1001', lambda: p.duty_u16())
for f in (1, 50, 1234, 40000):
    p.freq(f)
    t('freq %d' % f, lambda: (p.freq(), p.duty_u16()))
t('duty 1024', lambda: PWM(Pin(16), duty=1024))
t('freq 0', lambda: PWM(Pin(17), freq=0))
p.deinit()
t('inactive', lambda: p.freq())
