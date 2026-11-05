# The micro:bit's utime (modutime.c): sleep, sleep_ms, sleep_us, ticks_ms, ticks_us, ticks_add, ticks_diff —
# no date (no time(), localtime()) and no ticks_cpu.
import _time

sleep = _time.sleep
sleep_ms = _time.sleep_ms
sleep_us = _time.sleep_us
ticks_ms = _time.ticks_ms
ticks_us = _time.ticks_us
ticks_add = _time.ticks_add
ticks_diff = _time.ticks_diff
