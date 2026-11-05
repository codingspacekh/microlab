# The board's `time` (and `utime`), on the run's Clock (M2.2, F-39): src/sim/clock.ts through the _ream bridge.
# The firmware's own time.sleep busy-waits on the laptop's clock (M0 spike), so it is replaced, not wrapped.
import _ream
import utime as _builtin   # only for ticks_add / ticks_diff: pure arithmetic, with the boards' 2**30 period

_MASK = (1 << 30) - 1

ticks_add = _builtin.ticks_add
ticks_diff = _builtin.ticks_diff

# The date: the board's clock is set to its start date at reset (no RTC battery), then counts the run's time.
# Each board module calls start_date() (Pico W: 2021-01-01, ports/rp2/main.c). Seconds since 1970.
_start = 0
mktime = _builtin.mktime


def start_date(seconds):
    global _start
    _start = seconds


def time():
    return _start + int(_ream.ticks_us()) // 1000000


def time_ns():
    return (_start * 1000000 + int(_ream.ticks_us())) * 1000


def gmtime(secs=None):
    return _builtin.gmtime(time() if secs is None else secs)


localtime = gmtime


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


def _sleep(us):
    # _ream.sleep_us returns early, with the time left, when a pin IRQ is due: its handler runs here (at the
    # loop's backward jump, as micropython.schedule does on a board), then the sleep carries on.
    while us > 0:
        us = int(_ream.sleep_us(us))


def sleep_us(us):
    _sleep(_int(us))


def sleep_ms(ms):
    _sleep(_int(ms) * 1000)


def sleep(seconds):
    _sleep(int(seconds * 1000000))
