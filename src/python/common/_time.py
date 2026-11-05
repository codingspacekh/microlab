# The board's `time` (and `utime`), on the run's Clock (M2.2, F-39): src/sim/clock.ts through the _ream bridge.
# The firmware's own time.sleep busy-waits on the laptop's clock (M0 spike), so it is replaced, not wrapped.
import _ream
import utime as _builtin   # only for ticks_add / ticks_diff: pure arithmetic, with the boards' 2**30 period

_MASK = (1 << 30) - 1

ticks_add = _builtin.ticks_add
ticks_diff = _builtin.ticks_diff

# Still the laptop's date: each board's own start date (2021-01-01 on a Pico W, 2000-01-01 on an ESP32) comes
# with its board module (M2.4, M2.5).
time = _builtin.time
time_ns = _builtin.time_ns
localtime = _builtin.localtime
gmtime = _builtin.gmtime
mktime = _builtin.mktime


def ticks_us():
    return int(_ream.ticks_us()) & _MASK


def ticks_ms():
    return (int(_ream.ticks_us()) // 1000) & _MASK


def ticks_cpu():
    return ticks_us()


def _int(n):
    if isinstance(n, float):
        raise TypeError("can't convert float to int")
    return n


def sleep_us(us):
    us = _int(us)
    if us > 0:
        _ream.sleep_us(us)


def sleep_ms(ms):
    ms = _int(ms)
    if ms > 0:
        _ream.sleep_us(ms * 1000)


def sleep(seconds):
    if seconds > 0:
        _ream.sleep_us(int(seconds * 1000000))
