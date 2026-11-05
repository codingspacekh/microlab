# Pin types, modes and the board's own pins (nothing wired)
def t(label, f):
    try:
        print(label, repr(f()))
    except Exception as e:
        print(label, type(e).__name__ + ':', e)
from microbit import *
t('types', lambda: (pin0, pin3, pin5, pin_logo, pin_speaker))
t('display mode', lambda: pin3.read_analog())
t('button mode', lambda: pin5.write_digital(1))
t('i2c mode', lambda: pin19.write_digital(1))
t('modes', lambda: (pin0.get_mode(), pin3.get_mode(), pin5.get_mode(), pin19.get_mode()))
t('button read', lambda: pin5.read_digital())
pin8.read_digital()
t('pull', lambda: (pin8.get_pull(), pin8.PULL_UP, pin8.PULL_DOWN, pin8.NO_PULL))
t('value 2', lambda: pin0.write_digital(2))
t('analog 1024', lambda: pin0.write_analog(1024))
pin0.write_analog(511)
t('period', lambda: pin0.get_analog_period_microseconds())
