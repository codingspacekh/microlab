# rotary.py for the micro:bit (MicroLab): the calls of Mike Teachman's micropython-rotary — value(), set(), reset(),
# RANGE_UNBOUNDED / RANGE_WRAP / RANGE_BOUNDED — with its state table (MIT, Mike Teachman 2022). The micro:bit has
# no pin interrupts, so the pins are read each time value() or update() is called: call it often (every few ms).
# The state table: Copyright (c) 2022 Mike Teachman, MIT License (https://github.com/miketeachman/micropython-rotary).
# MIT License. Copyright (c) 2026 MicroLab. Permission is granted to use, copy, modify and share this file, with
# this notice, without warranty (the MIT licence, https://opensource.org/licenses/MIT).
_CW, _CCW = 0x10, 0x20
_TABLE = [   # next state for CLK/DT = 00, 01, 10, 11
    [0, 4, 1, 0], [2, 0, 1, 0], [2, 3, 1, 0], [2, 3, 0, 0 | _CW],
    [5, 4, 0, 0], [5, 4, 6, 0], [5, 0, 6, 0 | _CCW], [0, 0, 0, 0]]


class Rotary:
    RANGE_UNBOUNDED, RANGE_WRAP, RANGE_BOUNDED = 1, 2, 3

    def __init__(self, pin_clk, pin_dt, min_val=0, max_val=10, incr=1, reverse=False, range_mode=1, pull_up=False):
        self._clk, self._dt = pin_clk, pin_dt
        for p in (pin_clk, pin_dt):
            p.set_pull(p.PULL_UP if pull_up else p.NO_PULL)
        self._min, self._max, self._incr = min_val, max_val, incr
        self._reverse = -1 if reverse else 1
        self._mode = range_mode
        self._value = min_val
        self._state = 0

    def update(self):
        self._state = _TABLE[self._state & 7][self._clk.read_digital() << 1 | self._dt.read_digital()]
        d = self._state & 0x30
        if not d:
            return
        v = self._value + (self._incr if d == _CW else -self._incr) * self._reverse
        if self._mode == self.RANGE_WRAP:
            span = self._max - self._min + 1
            v = self._min + (v - self._min) % span
        elif self._mode == self.RANGE_BOUNDED:
            v = min(self._max, max(self._min, v))
        self._value = v

    def value(self):
        self.update()
        return self._value

    def set(self, value=None, min_val=None, max_val=None, incr=None, reverse=None, range_mode=None):
        if value is not None:
            self._value = value
        if min_val is not None:
            self._min = min_val
        if max_val is not None:
            self._max = max_val
        if incr is not None:
            self._incr = incr
        if reverse is not None:
            self._reverse = -1 if reverse else 1
        if range_mode is not None:
            self._mode = range_mode
        self._state = 0

    def reset(self):
        self._value = 0
