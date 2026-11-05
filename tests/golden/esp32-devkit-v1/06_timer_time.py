# Timer repr (the firmware swaps the mode names), errors; the clock from 2000
def t(label, f):
    try:
        print(label, repr(f()))
    except Exception as e:
        print(label, type(e).__name__ + ':', e)
from machine import Timer
import time, machine
n = [0]
def tick(tm):
    n[0] += 1
tm = Timer(0)
tm.init(period=100, mode=Timer.PERIODIC, callback=tick)
time.sleep(0.55)
tm.deinit()
t('count', lambda: n[0])
t('repr', lambda: tm)
t('4', lambda: Timer(4))
t('hard', lambda: Timer(1).init(period=10, callback=print, hard=True))
t('year', lambda: time.localtime()[:3])
t('mktime', lambda: time.mktime((2000, 1, 2, 0, 0, 0, 0, 0)))
t('freq', lambda: machine.freq())
