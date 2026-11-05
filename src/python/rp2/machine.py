# The Pico W's `machine` module (M2.3: Pin). Behaviour, names, repr and error texts follow MicroPython v1.29.0's
# ports/rp2/machine_pin.c and boards/RPI_PICO_W/pins.csv; the pin hardware is src/sim/pins.ts via _ream.
import _ream
import time as _time

_time.start_date(1609459200)   # 2021-01-01 00:00:00: ports/rp2/main.c sets the RTC to it at reset

# boards/RPI_PICO_W/pins.csv: the board's names, then the chip's (GPIO0..29, and EXT_GPIO0..2 on the Wi-Fi chip)
_BOARD = {}
for _n in list(range(23)) + [26, 27, 28]:
    _BOARD['GP%d' % _n] = _n
_EXT = {'LED': 'EXT_GPIO0', 'WL_GPIO0': 'EXT_GPIO0', 'WL_GPIO1': 'EXT_GPIO1', 'WL_GPIO2': 'EXT_GPIO2'}
_GPIO_COUNT = 30   # NUM_BANK0_GPIOS on the RP2040
_ALT_NULL = 31     # GPIO_FUNC_NULL: the function of every pin after reset


def _int(x):
    # mp_obj_get_int's errors
    if isinstance(x, (int, bool)):   # MicroPython's bool isn't an int subclass for isinstance
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


# --- machine.freq, ADC, PWM, Timer (M2.4) ----------------------------------------------------------------------

_SYS_HZ = 125000000   # clk_sys: the RP2040's default 125 MHz


def freq(*hz):
    if hz:
        raise ValueError('cannot change frequency in the simulation')   # not on the boards; set_sys_clock_khz
    return _SYS_HZ


class ADC:
    """machine_adc.c: channels 0-3 are GP26-29, 4 is the temperature sensor; read_u16 scales 12 bits to 16."""
    CORE_TEMP = 4

    def __init__(self, source):
        channel = -1
        if isinstance(source, int) and not isinstance(source, bool) and 0 <= source < 5:
            channel = source
        pin = None
        if channel == -1:
            pin = Pin(source)
            if pin._ext or not (26 <= int(pin._key) < 30):
                raise ValueError("Pin doesn't have ADC capabilities")
            channel = int(pin._key) - 26
            # adc_gpio_init: no digital function, no pulls
            pin._alt = _ALT_NULL
            _ream.pin_config(pin._key, 'alt', 'none', -1)
        self._channel = channel

    def __repr__(self):
        return '<ADC channel=%d>' % self._channel

    def read_u16(self):
        if self._channel == 4:
            # RP2040 datasheet §4.9.5: V = 0.706 - (T - 27) * 0.001721
            volts = 0.706 - (float(_ream.temperature()) - 27) * 0.001721
        elif self._channel == 3:
            volts = 4.7 / 3   # VSYS / 3 (GP29 is not on the Pico W's header); about 4.7 V on USB
        else:
            volts = float(_ream.adc_volts(str(26 + self._channel)))
        raw = int(volts / 3.3 * 4095 + 0.5)
        raw = 0 if raw < 0 else 4095 if raw > 4095 else raw
        return raw << 4 | raw >> 8


# machine_pwm.c: 8 slices of two channels; GPIO n is slice (n >> 1) & 7, channel n & 1. A slice's frequency is
# shared by both its channels. The register maths below is the firmware's, so freq() and duty_u16() read back
# exactly what a Pico gives.
_TOP_MAX = 65534


def _slice_hz(offset, div16):
    return (16 * _SYS_HZ + offset) // div16


def _slice_hz_round(div16):
    return _slice_hz(div16 // 2, div16)


def _slice_hz_ceil(div16):
    return _slice_hz(div16 - 1, div16)


class _Slice:
    def __init__(self):
        self.div16 = 16       # reset values: DIV = 1.0, TOP = 0xffff
        self.top = 0xffff
        self.freq_set = False
        self.enabled = False
        self.cc = [0, 0]


_slices = [_Slice() for _ in range(8)]
_pwms = {}

_NOT_SET, _U16, _NS = 0, 1, 2


class PWM:
    def __new__(cls, pin, *args, **kwargs):
        p = Pin(pin)
        if p._ext:
            raise ValueError('invalid pin')
        gpio = int(p._key)
        key = ((gpio >> 1) & 7, gpio & 1)
        self = _pwms.get(key)
        if self is None:
            self = object.__new__(cls)
            self._slice, self._channel = key
            self._duty = 0
            self._pins = []
            _pwms[key] = self
        if p not in self._pins:
            self._pins.append(p)
        self._invert = 0
        self._duty_type = _NOT_SET
        return self

    def __init__(self, pin, freq=-1, *, duty_u16=-1, duty_ns=-1, invert=-1):
        self.init(freq, duty_u16=duty_u16, duty_ns=duty_ns, invert=invert)
        p = Pin(pin)
        p._alt = Pin.ALT_PWM
        _ream.pin_config(p._key, 'alt', '', -1)
        self._output()

    def init(self, freq=-1, *, duty_u16=-1, duty_ns=-1, invert=-1):
        self._defer = True
        if freq != -1:
            self._freq_set(_int(freq))
        if duty_u16 != -1:
            self._u16_set(_int(duty_u16))
        if duty_ns != -1:
            self._ns_set(_int(duty_ns))
        if invert != -1:
            self._invert = 1 if invert else 0
        self._defer = False
        self._start()

    def __repr__(self):
        return '<PWM slice=%d channel=%d invert=%d>' % (self._slice, self._channel, self._invert)

    def deinit(self):
        _slices[self._slice].enabled = False
        self._outputs()

    def freq(self, *hz):
        s = _slices[self._slice]
        if hz:
            self._freq_set(_int(hz[0]))
            return None
        if not s.freq_set:
            return 0
        return _slice_hz_round(s.div16 * (s.top + 1))

    def duty_u16(self, *d):
        s = _slices[self._slice]
        if d:
            self._u16_set(_int(d[0]))
            return None
        if self._duty_type == _NOT_SET or not s.freq_set:
            return 0
        return (s.cc[self._channel] * 65535 + (s.top + 1) // 2) // (s.top + 1)

    def duty_ns(self, *d):
        s = _slices[self._slice]
        if d:
            self._ns_set(_int(d[0]))
            return None
        if self._duty_type == _NOT_SET or not s.freq_set:
            return 0
        hz = _slice_hz_round(s.div16)
        return (s.cc[self._channel] * 1000000000 + hz // 2) // hz

    # the firmware's register writes
    def _freq_set(self, freq):
        s = _slices[self._slice]
        if (_SYS_HZ + freq // 2) // freq < _TOP_MAX:
            div16 = 16
            top = (_SYS_HZ + freq // 2) // freq - 1
        else:
            div16 = _slice_hz_ceil(_TOP_MAX * freq)
            top = _slice_hz_round(div16 * freq) - 1
        if div16 < 16:
            raise ValueError('freq too large')
        elif div16 >= 256 * 16:
            raise ValueError('freq too small')
        s.div16, s.top, s.freq_set = div16, top & 0xffffffff, True
        for other in (self, _pwms.get((self._slice, 1 - self._channel))):
            if other is None:
                continue
            if other._duty_type == _U16:
                other._u16_set(other._duty)
            elif other._duty_type == _NS:
                other._ns_set(other._duty)
        self._outputs()

    def _u16_set(self, duty):
        s = _slices[self._slice]
        if duty > 65535:
            duty = 65535
        s.cc[self._channel] = ((duty * (s.top + 1) + 65535 // 2) // 65535) & 0xffff
        self._duty, self._duty_type = duty, _U16
        self._start()

    def _ns_set(self, duty):
        s = _slices[self._slice]
        hz = _slice_hz_round(s.div16)
        cc = (duty * hz + 500000000) // 1000000000
        if cc > s.top + 1:
            cc = s.top + 1
        s.cc[self._channel] = cc & 0xffff
        self._duty, self._duty_type = duty, _NS
        self._start()

    def _start(self):
        s = _slices[self._slice]
        if not getattr(self, '_defer', False) and s.freq_set and self._duty_type != _NOT_SET:
            s.enabled = True
        self._outputs()

    def _outputs(self):
        for other in (self, _pwms.get((self._slice, 1 - self._channel))):
            if other is not None:
                other._output()

    def _output(self):
        s = _slices[self._slice]
        on = s.enabled and s.freq_set
        hz = _slice_hz_round(s.div16 * (s.top + 1)) if s.freq_set else 0
        duty = min(1.0, s.cc[self._channel] / (s.top + 1)) if on else 0.0
        if on and self._invert:
            duty = 1.0 - duty
        for p in self._pins:
            if p._alt == Pin.ALT_PWM:
                _ream.pwm_out(p._key, hz, duty if on else -1.0)


_timer_ids = [0]


class Timer:
    """machine_timer.c: the soft timer only (id -1); callbacks are scheduled, like soft pin IRQs."""
    ONE_SHOT = 0
    PERIODIC = 1

    def __init__(self, id=-1, **kwargs):
        if _int(id) != -1:
            raise ValueError("Timer doesn't exist")
        _timer_ids[0] += 1
        self._id = _timer_ids[0]
        self._mode = Timer.PERIODIC
        self._delta = 0
        if kwargs:
            self.init(**kwargs)

    def init(self, *, mode=PERIODIC, callback=None, period=0xffffffff, tick_hz=1000, freq=None, hard=False):
        _ream.timer_stop(self._id)
        self._mode = mode
        if freq is not None:
            self._delta = int(1000000.0 / freq)
        else:
            self._delta = period * 1000000 // tick_hz
        if self._delta < 1:
            self._delta = 1
        _ream.timer_start(self._id, self._delta, mode != Timer.ONE_SHOT, callback, self)

    def deinit(self):
        _ream.timer_stop(self._id)

    def __repr__(self):
        return 'Timer(mode=%s, tick_hz=1000000, period=%d)' % ('ONE_SHOT' if self._mode == Timer.ONE_SHOT else 'PERIODIC', self._delta)
