# Timer: repr, errors, a periodic count
def t(label, f):
    try:
        print(label, repr(f()))
    except Exception as e:
        print(label, type(e).__name__ + ':', e)
from machine import Timer
import time
n = [0]
def tick(tm):
    n[0] += 1
tm = Timer(mode=Timer.PERIODIC, period=250, callback=tick)
time.sleep(1.1)
tm.deinit()
t('count', lambda: n[0])
t('repr', lambda: tm)
t('one shot', lambda: Timer(mode=Timer.ONE_SHOT, period=100, callback=print))
t('0', lambda: Timer(0))
