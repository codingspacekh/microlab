# ticks arithmetic, the clock after a hard reset, machine.freq
def t(label, f):
    try:
        print(label, repr(f()))
    except Exception as e:
        print(label, type(e).__name__ + ':', e)
import time, machine
t('add', lambda: (time.ticks_add(0, -1), time.ticks_diff(time.ticks_add(0, -1), 0)))
t('overflow', lambda: time.ticks_add(0, 2**29))
t('year', lambda: time.localtime()[:3])
t('freq', lambda: machine.freq())
t('time', lambda: time)
