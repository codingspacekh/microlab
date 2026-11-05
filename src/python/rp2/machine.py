# The Pico W's `machine` module (M2.3: Pin). Behaviour, names, repr and error texts follow MicroPython v1.29.0's
# ports/rp2/machine_pin.c and boards/RPI_PICO_W/pins.csv; the pin hardware is src/sim/pins.ts via _ream.
import _ream

# boards/RPI_PICO_W/pins.csv: the board's names, then the chip's (GPIO0..29, and EXT_GPIO0..2 on the Wi-Fi chip)
_BOARD = {}
for _n in list(range(23)) + [26, 27, 28]:
    _BOARD['GP%d' % _n] = _n
_EXT = {'LED': 'EXT_GPIO0', 'WL_GPIO0': 'EXT_GPIO0', 'WL_GPIO1': 'EXT_GPIO1', 'WL_GPIO2': 'EXT_GPIO2'}
_GPIO_COUNT = 30   # NUM_BANK0_GPIOS on the RP2040
_ALT_NULL = 31     # GPIO_FUNC_NULL: the function of every pin after reset


def _int(x):
    # mp_obj_get_int's errors
    if isinstance(x, int):
        return int(x)
    raise TypeError("can't convert %s to int" % type(x).__name__)


def _find(id):
    """(key for the pin hardware, CPU name, is it on the Wi-Fi chip) — machine_pin_find()."""
    if isinstance(id, Pin):
        return id._key, id._name, id._ext
    if isinstance(id, str):
        if id in _BOARD:
            n = _BOARD[id]
            return str(n), 'GPIO%d' % n, False
        if id in _EXT:
            return 'LED' if _EXT[id] == 'EXT_GPIO0' else _EXT[id], _EXT[id], True
        if id.startswith('GPIO') and id[4:].isdigit() and int(id[4:]) < _GPIO_COUNT and id == 'GPIO%d' % int(id[4:]):
            return id[4:], id, False
        if id in ('EXT_GPIO0', 'EXT_GPIO1', 'EXT_GPIO2'):
            return 'LED' if id == 'EXT_GPIO0' else id, id, True
        raise ValueError('unknown named pin "%s"' % id)
    if isinstance(id, int) and 0 <= id < _GPIO_COUNT:
        return str(id), 'GPIO%d' % id, False
    raise ValueError('invalid pin')


class _IRQ:
    """mp_irq_type: what Pin.irq() returns."""

    def __init__(self):
        self._trigger = 0

    def flags(self):
        return 0

    def trigger(self, new=None):
        old = self._trigger
        if new is not None:
            self._trigger = new
        return old


class Pin:
    IN = 0
    OUT = 1
    OPEN_DRAIN = 2
    ALT = 3
    PULL_UP = 1
    PULL_DOWN = 2
    IRQ_RISING = 8
    IRQ_FALLING = 4
    ALT_SPI = 1
    ALT_UART = 2
    ALT_I2C = 3
    ALT_PWM = 4
    ALT_SIO = 5
    ALT_PIO0 = 6
    ALT_PIO1 = 7
    ALT_GPCK = 8
    ALT_USB = 9

    _all = {}

    def __new__(cls, id, *args, **kwargs):
        # one object per pin, like the firmware's machine_pin_obj_table
        key, name, ext = _find(id)
        p = Pin._all.get(key)
        if p is None:
            p = object.__new__(cls)
            p._key, p._name, p._ext = key, name, ext
            p._alt = _ALT_NULL
            p._irq = None
            Pin._all[key] = p
        return p

    def __init__(self, id, *args, **kwargs):
        if args or kwargs:   # a mode or anything else given: configure (mp_pin_make_new)
            self.init(*args, **kwargs)

    def init(self, mode=None, pull=None, *, value=None, alt=ALT_SIO):
        if self._ext and pull is not None:
            raise ValueError('pulls are not supported for external pins')
        if self._ext and alt != Pin.ALT_SIO:
            raise ValueError('alternate functions are not supported for external pins')
        v = -1 if value is None else (1 if value else 0)
        if mode is not None:
            mode = _int(mode)
            if self._ext:
                if mode not in (Pin.IN, Pin.OUT):
                    raise ValueError('only Pin.OUT and Pin.IN are supported for this pin')
                _ream.pin_config(self._key, 'out' if mode == Pin.OUT else 'in', '', v)
            elif mode == Pin.IN:
                self._alt = Pin.ALT_SIO
                _ream.pin_config(self._key, 'in', '', -1)
            elif mode == Pin.OUT:
                self._alt = Pin.ALT_SIO
                _ream.pin_config(self._key, 'out', '', v)
            elif mode == Pin.OPEN_DRAIN:
                self._alt = Pin.ALT_SIO
                _ream.pin_config(self._key, 'od', '', 1 if v == -1 else v)
            else:
                self._alt = _int(alt)
                _ream.pin_config(self._key, 'alt', '', -1)
        if not self._ext:
            # pulls are set every time: None means no pull
            p = 0 if pull is None else _int(pull)
            up, down = p & Pin.PULL_UP, p & Pin.PULL_DOWN
            _ream.pin_config(self._key, '', 'both' if up and down else 'up' if up else 'down' if down else 'none', -1)

    def value(self, *x):
        if len(x) > 1:
            raise TypeError('function takes at most 2 positional arguments')
        if not x:
            return int(_ream.pin_level(self._key))
        _ream.pin_write(self._key, 1 if x[0] else 0)

    def __call__(self, *x):
        return self.value(*x)

    def on(self):
        _ream.pin_write(self._key, 1)

    def off(self):
        _ream.pin_write(self._key, 0)

    high = on
    low = off

    def toggle(self):
        _ream.pin_toggle(self._key)

    def irq(self, handler=None, trigger=IRQ_FALLING | IRQ_RISING, hard=False):
        if self._ext:
            raise ValueError('expecting a regular GPIO Pin')
        if self._irq is None:
            self._irq = _IRQ()
        self._irq._trigger = trigger
        _ream.pin_irq(self._key, bool(trigger & Pin.IRQ_RISING), bool(trigger & Pin.IRQ_FALLING), handler, self)
        return self._irq

    def __repr__(self):
        mode, pull, _ = str(_ream.pin_state(self._key)).split()
        if self._ext:
            return 'Pin(%s, mode=%s)' % (self._name, 'OUT' if mode == 'out' else 'IN')
        if mode == 'reset' or mode == 'alt':
            text = 'Pin(%s, mode=ALT' % self._name
        else:
            text = 'Pin(%s, mode=%s' % (self._name, {'in': 'IN', 'out': 'OUT', 'od': 'OPEN_DRAIN'}[mode])
        if pull == 'up':
            text += ', pull=PULL_UP'
        elif pull == 'down':
            text += ', pull=PULL_DOWN'
        elif pull == 'both':
            text += ', pull=PULL_UP|PULL_DOWN'
        if mode == 'reset' or mode == 'alt':
            text += ', alt=%d' % self._alt
        return text + ')'
