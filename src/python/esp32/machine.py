# The ESP32's `machine` module (M2.5): Pin, ADC, PWM, DAC, TouchPad, Timer. Behaviour, repr and error texts
# follow MicroPython v1.29.0's ports/esp32 (machine_pin.c, machine_adc.c + adc.c, machine_pwm.c, machine_dac.c,
# machine_touchpad.c, machine_timer.c). The hardware is src/sim/pins.ts and timers.ts via _ream.
import _ream
import time as _time

_time.start_date(0, 2000)   # the RTC starts at 2000-01-01 00:00:00, and this port counts from 2000

# machine_pin.h, CONFIG_IDF_TARGET_ESP32: the GPIOs that exist (20 is enabled; 24 and 28-31 are not)
_GPIOS = set(range(24)) | {25, 26, 27} | set(range(32, 40))
_FIRST_INPUT_ONLY = 34   # GPIO_FIRST_NON_OUTPUT


def _int(x):
    if isinstance(x, int):
        return int(x)
    raise TypeError("can't convert %s to int" % type(x).__name__)


def freq(*hz):
    if hz:
        raise ValueError('cannot change frequency in the simulation')
    return 160000000   # ESP32_GENERIC's default CPU clock


class _IRQ:
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
    IN = 1            # GPIO_MODE_INPUT
    OUT = 3           # GPIO_MODE_INPUT_OUTPUT
    OPEN_DRAIN = 7    # GPIO_MODE_INPUT_OUTPUT_OD
    PULL_UP = 2
    PULL_DOWN = 1
    IRQ_RISING = 1    # GPIO_INTR_POSEDGE
    IRQ_FALLING = 2   # GPIO_INTR_NEGEDGE
    WAKE_LOW = 4
    WAKE_HIGH = 5
    DRIVE_0 = 0
    DRIVE_1 = 1
    DRIVE_2 = 2
    DRIVE_3 = 3

    _all = {}

    def __new__(cls, id, *args, **kwargs):
        if isinstance(id, Pin):
            return id
        if not (isinstance(id, int) and id in _GPIOS):   # no board names on ESP32_GENERIC
            raise ValueError('invalid pin')
        p = Pin._all.get(id)
        if p is None:
            p = object.__new__(cls)
            p._n, p._key, p._drive, p._irq, p._pwm = id, str(id), 2, None, False
            Pin._all[id] = p
        return p

    def __init__(self, id, *args, **kwargs):
        if args or kwargs:
            self.init(*args, **kwargs)

    def init(self, mode=None, pull=-1, *, value=None, drive=None, hold=None):
        if value is not None:   # before mode and pull, as the firmware does
            _ream.pin_write(self._key, 1 if value else 0)
        if drive is not None:
            d = _int(drive)
            if 0 <= d < 4 and self._n < _FIRST_INPUT_ONLY:
                self._drive = d
        if mode is not None:
            m = _int(mode)
            if self._n >= _FIRST_INPUT_ONLY and m & 2:
                raise ValueError('pin can only be input')
            self._pwm = False
            _ream.pin_config(self._key, 'od' if m & 4 else 'out' if m & 2 else 'in', '', -1)
        if pull != -1:
            p = 0 if pull is None else _int(pull)
            if self._n >= _FIRST_INPUT_ONLY:
                p = 0   # GPIO 34-39 have no pull resistors
            up, down = p & Pin.PULL_UP, p & Pin.PULL_DOWN
            _ream.pin_config(self._key, '', 'both' if up and down else 'up' if up else 'down' if down else 'none', -1)

    def value(self, *x):
        if not x:
            return int(_ream.pin_level(self._key))
        _ream.pin_write(self._key, 1 if x[0] else 0)

    def __call__(self, *x):
        return self.value(*x)

    def on(self):
        _ream.pin_write(self._key, 1)

    def off(self):
        _ream.pin_write(self._key, 0)

    def toggle(self):
        _ream.pin_toggle(self._key)

    def irq(self, handler=None, trigger=IRQ_RISING | IRQ_FALLING, wake=None):
        if self._irq is None:
            self._irq = _IRQ()
        self._irq._trigger = trigger
        _ream.pin_irq(self._key, bool(trigger & Pin.IRQ_RISING), bool(trigger & Pin.IRQ_FALLING), handler, self)
        return self._irq

    def __repr__(self):
        mode, pull, _ = str(_ream.pin_state(self._key)).split()
        # gpio_get_io_config: output-enable is checked first, so an open-drain pin prints as Pin.OUT
        text = 'Pin(%d, mode=Pin.%s' % (self._n, 'OUT' if mode in ('out', 'od') or self._pwm else 'IN')
        if pull in ('up', 'both'):
            text += ', pull=Pin.PULL_UP'
        elif pull == 'down':
            text += ', pull=Pin.PULL_DOWN'
        if self._drive != 2:
            text += ', drive=Pin.DRIVE_%d' % self._drive
        return text + ')'


# --- ADC ---------------------------------------------------------------------------------------------------------
# madc_obj: GPIO -> (block, channel)
_ADC_PINS = {36: (1, 0), 37: (1, 1), 38: (1, 2), 39: (1, 3), 32: (1, 4), 33: (1, 5), 34: (1, 6), 35: (1, 7),
             4: (2, 0), 0: (2, 1), 2: (2, 2), 15: (2, 3), 13: (2, 4), 12: (2, 5), 14: (2, 6), 27: (2, 7), 25: (2, 8), 26: (2, 9)}
# Full scale per attenuation (0, 2.5, 6, 11 dB): Espressif's recommended ranges, the 11 dB end where a DevKit's
# reading reaches 4095 — an estimate to confirm on a real board (docs/acceptance/M2.md).
_FULL_SCALE = (0.95, 1.25, 1.75, 3.1)
_width = {1: 12, 2: 12}   # per ADC block
_adcs = {}


class ADC:
    ATTN_0DB = 0
    ATTN_2_5DB = 1
    ATTN_6DB = 2
    ATTN_11DB = 3
    WIDTH_9BIT = 9
    WIDTH_10BIT = 10
    WIDTH_11BIT = 11
    WIDTH_12BIT = 12

    def __new__(cls, pin, *args, **kwargs):
        p = Pin(pin)
        if p._n not in _ADC_PINS:
            raise ValueError('invalid pin')
        self = _adcs.get(p._n)
        if self is None:
            self = object.__new__(cls)
            self._pin = p
            self._block, self._channel = _ADC_PINS[p._n]
            self._atten = 3
            _adcs[p._n] = self
        return self

    def __init__(self, pin, *, atten=-1):
        self.init(atten=atten)

    def init(self, *, atten=-1):
        self._set_atten(3 if atten == -1 else atten)   # no atten given: 11 dB again
        _width[self._block] = 12                       # and the block's width back to 12 bits

    def _set_atten(self, a):
        a = _int(a)
        if a < 0 or a > 3:
            raise ValueError('invalid attenuation')
        self._atten = a

    def atten(self, a):
        self._set_atten(a)

    def width(self, w):
        w = _int(w)
        if w < 9 or w > 12:
            raise ValueError('invalid bit-width')
        _width[self._block] = w

    def _raw12(self):
        fs = _FULL_SCALE[self._atten]
        v = float(_ream.adc_volts(self._pin._key))
        v = 0.0 if v < 0 else fs if v > fs else v
        return int(v / fs * 4095 + 0.5)

    def read(self):
        return self._raw12() >> (12 - _width[self._block])

    def read_u16(self):
        bits = _width[self._block]
        raw = self.read()
        return raw << (16 - bits) | raw >> (2 * bits - 16)

    def read_uv(self):
        raw = self.read() << (12 - _width[self._block])
        return int(raw / 4095 * _FULL_SCALE[self._atten] * 1000000 + 0.5)

    def __repr__(self):
        return 'ADC(Pin(%d), atten=%d)' % (self._pin._n, self._atten)


# --- PWM (LEDC) --------------------------------------------------------------------------------------------------
_APB_HZ = 80000000
_REF_HZ = 1000000
_TIMER_BITS = 20   # SOC_LEDC_TIMER_BIT_WIDTH on the ESP32
_DUTY_10, _DUTY_16, _DUTY_NS = 10, 16, -1


def _resolution(freq):
    src = _REF_HZ if freq < 10 else _APB_HZ   # EMPIRIC_FREQ: below 10 Hz the 1 MHz REF_TICK
    div = (src + freq // 2) // freq
    res = 0
    while (1 << (res + 1)) <= div:
        res += 1
    res = min(res, _TIMER_BITS, 16)
    if res >= _TIMER_BITS:
        res -= 1
    return src, res


class PWM:
    def __init__(self, pin, freq=-1, *, duty=-1, duty_u16=-1, duty_ns=-1, invert=False, lightsleep=False):
        self._pin = Pin(pin)
        self._active = False
        self._freq = -1
        self._scale = 0
        self._ui = 0
        self._invert = False
        self.init(freq, duty=duty, duty_u16=duty_u16, duty_ns=duty_ns, invert=invert, lightsleep=lightsleep)

    def init(self, freq=-1, *, duty=-1, duty_u16=-1, duty_ns=-1, invert=None, lightsleep=False):
        freq = _int(freq)
        if freq != -1:
            self._check_freq(freq)
        if duty_u16 >= 0:
            self._check_u16(_int(duty_u16))
        elif duty_ns >= 0:
            self._check_ns(_int(duty_ns), freq if freq != -1 else (self._freq if self._freq > 0 else 5000))
        elif duty >= 0:
            self._check_u10(_int(duty))
        elif self._scale == 0:
            self._scale, self._ui = _DUTY_16, 32768
        if invert is not None:
            self._invert = bool(invert)
        if freq == -1:
            freq = self._freq if self._freq > 0 else 5000
        self._freq = freq
        self._active = True
        self._pin._pwm = True
        _ream.pin_config(self._pin._key, 'alt', '', -1)
        self._apply()

    def _check_freq(self, freq):
        if freq <= 0 or freq > 40000000:
            raise ValueError('frequency must be from 1Hz to 40MHz')

    def _check_u16(self, d):
        if d < 0 or d > 65535:
            raise ValueError('duty_u16 must be from 0 to 65536')
        self._scale, self._ui = _DUTY_16, 65536 if d == 65535 else d

    def _check_u10(self, d):
        if d < 0 or d > 1023:
            raise ValueError('duty must be from 0 to 1023')
        self._scale, self._ui = _DUTY_10, 1024 if d == 1023 else d

    def _check_ns(self, ns, freq):
        top = self._duty_to_ns(65536, freq)
        if ns < 0 or ns > top:
            raise ValueError('duty_ns must be from 0 to %d ns' % top)
        self._scale, self._ui = _DUTY_NS, ns

    @staticmethod
    def _duty_to_ns(duty, freq):
        return (duty * 1000000000 + freq * 65536 // 2) // (freq * 65536)

    @staticmethod
    def _ns_to_duty(ns, freq):
        return (ns * freq * 65536 + 500000000) // 1000000000

    def _apply(self):
        src, self._res = _resolution(self._freq)
        if self._scale == _DUTY_16:
            d16 = self._ui
        elif self._scale == _DUTY_10:
            d16 = self._ui << 6
        else:
            d16 = self._ns_to_duty(self._ui, self._freq)
        self._channel_duty = d16 >> (16 - self._res)
        # ledc_set_freq / ledc_get_freq: the divider is an integer in 1/256ths, so the real frequency can differ
        div = (src << 8) // self._freq // (1 << self._res)
        self._real_freq = (src << 8) // (1 << self._res) // div if div else self._freq
        out = self._channel_duty / (1 << self._res)
        if self._invert:
            out = 1.0 - out
        _ream.pwm_out(self._pin._key, self._real_freq, min(1.0, out))

    def _check_active(self):
        if not self._active:
            raise RuntimeError('PWM is inactive')

    def _get_u16(self):
        d = self._channel_duty << (16 - self._res)
        return 65535 if d == 65536 else d

    def freq(self, *f):
        self._check_active()
        if not f:
            return self._real_freq
        freq = _int(f[0])
        self._check_freq(freq)
        self._freq = freq
        self._apply()

    def duty(self, *d):
        self._check_active()
        if not d:
            return self._get_u16() >> 6
        self._check_u10(_int(d[0]))
        self._apply()

    def duty_u16(self, *d):
        self._check_active()
        if not d:
            return self._get_u16()
        self._check_u16(_int(d[0]))
        self._apply()

    def duty_ns(self, *d):
        self._check_active()
        if not d:
            return self._duty_to_ns(self._get_u16(), self._real_freq)
        self._check_ns(_int(d[0]), self._freq)
        self._apply()

    def deinit(self):
        if self._active:
            _ream.pwm_out(self._pin._key, self._real_freq, -1.0)
        self._active = False
        self._scale = 0
        self._pin._pwm = False

    def __repr__(self):
        text = 'PWM(Pin(%d)' % self._pin._n
        if self._active:
            text += ', freq=%d' % self._real_freq
            if self._scale == _DUTY_10:
                text += ', duty=%d' % (self._get_u16() >> 6)
            elif self._scale == _DUTY_NS:
                text += ', duty_ns=%d' % self._duty_to_ns(self._get_u16(), self._real_freq)
            else:
                text += ', duty_u16=%d' % self._get_u16()
            if self._invert:
                text += ', invert=True'
        return text + ')'


# --- DAC, TouchPad -----------------------------------------------------------------------------------------------
class DAC:
    def __init__(self, pin, *args):
        self._pin = Pin(pin)
        if self._pin._n not in (25, 26):
            raise ValueError('invalid Pin for DAC')
        _ream.pin_config(self._pin._key, 'alt', 'none', -1)

    def write(self, value):
        value = _int(value)
        if value < 0 or value > 255:
            raise ValueError('value out of range')
        _ream.dac_out(self._pin._key, value * 3.3 / 255)

    def __repr__(self):
        return 'DAC(Pin(%d))' % self._pin._n


_TOUCH_PINS = (4, 0, 2, 15, 13, 12, 14, 27, 33, 32)   # T0..T9


class TouchPad:
    """read() drops when a finger is on the pin (the ESP32 counts charge cycles): about 600 untouched, 90
    touched here; real values depend on the wire — an estimate (docs/acceptance/M2.md)."""

    def __init__(self, pin):
        self._pin = Pin(pin)
        if self._pin._n not in _TOUCH_PINS:
            raise ValueError('invalid pin for touchpad')
        self._threshold = 0

    def read(self):
        return 90 if _ream.touched(self._pin._key) else 600

    def config(self, value):
        self._threshold = _int(value)


# --- Timer -------------------------------------------------------------------------------------------------------
_hardware_timers = {}
_timer_ids = [100]


class Timer:
    ONE_SHOT = 0
    PERIODIC = 1

    def __new__(cls, id=-1, *args, **kwargs):
        id = _int(id)
        if id >= 4:
            raise ValueError("Timer(%d) doesn't exist, there are only 4 hardware timers" % id)
        if id >= 0 and id in _hardware_timers:
            return _hardware_timers[id]
        self = object.__new__(cls)
        self._id = id
        _timer_ids[0] += 1
        self._key = _timer_ids[0]
        self._repeat = True
        self._period_us = 0
        if id >= 0:
            _hardware_timers[id] = self
        return self

    def __init__(self, id=-1, **kwargs):
        if kwargs:
            self.init(**kwargs)

    def init(self, *, mode=PERIODIC, callback=None, period=0xffffffff, tick_hz=1000, freq=None, hard=False):
        _ream.timer_stop(self._key)
        if hard:
            raise ValueError('hard Timers are not implemented')
        if freq is not None:
            self._period_us = int(1000000 / freq)
        else:
            self._period_us = period * 1000000 // tick_hz
        self._repeat = bool(mode)
        _ream.timer_start(self._key, max(1, self._period_us), self._repeat, callback, self)

    def deinit(self):
        _ream.timer_stop(self._key)

    def __repr__(self):
        # as machine_timer_print prints it: `self->repeat ? ONE_SHOT : PERIODIC` (the names are swapped)
        return 'Timer(%d, mode=%s, period=%d)' % (self._id, 'ONE_SHOT' if self._repeat else 'PERIODIC', self._period_us // 1000)
