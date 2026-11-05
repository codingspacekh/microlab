# The micro:bit V2's `microbit` module (M2.6). Behaviour and error texts follow micropython-microbit-v2 v2.1.2:
# src/codal_port/modmicrobit.c, microbit_pin.c, microbit_pinmode.c, microbit_button.c and
# src/codal_app/microbithal.cpp. The pin hardware is src/sim/pins.ts through _ream.
import _ream
import utime as _utime

# --- pins and their modes (microbit_pinmode.c) ------------------------------------------------------------------
# Every pin is in one mode at a time. Using a pin for something else first releases its mode; the display,
# button and I²C modes can't be released that way: "Pin 3 in display mode".
_HELD = ('display', 'button', 'i2c', 'spi')
_modes = {}


def _pin_error(pin):
    raise ValueError('Pin %d in %s mode' % (pin._number, pin._mode()))


def _acquire(pin, new):
    current = pin._mode()
    if current == 'button' and new == 'read_digital':
        return False
    if current != new:
        if current in _HELD:
            _pin_error(pin)
        _modes[pin._number] = new
        return True
    return False


def _int(x):
    if isinstance(x, (int, bool)):   # MicroPython's bool isn't an int subclass for isinstance
        return int(x)
    if isinstance(x, float):
        raise TypeError("can't convert float to int")
    raise TypeError("can't convert %s to int" % type(x).__name__)


class MicroBitDigitalPin:
    PULL_UP = 0      # MICROBIT_HAL_PIN_PULL_UP
    PULL_DOWN = 1
    NO_PULL = 2

    def __init__(self, number, key, initial):
        self._number, self._key, self._initial = number, key, initial
        self._period_us = 20000
        self._pull = 0   # microbithal.cpp: pin_pull_state starts at 0 (PULL_UP), whatever the pin really has
        self._analog = 0

    def _mode(self):
        return _modes.get(self._number, self._initial)

    def __repr__(self):
        return '<%s>' % type(self).__name__

    def get_mode(self):
        return self._mode()

    def write_digital(self, value):
        v = _int(value)
        if v >> 1:
            raise ValueError('value must be 0 or 1')
        _acquire(self, 'write_digital')
        _ream.pwm_out(self._key, 0, -1.0)
        _ream.pin_config(self._key, 'out', '', v)
        _ream.pin_write(self._key, v)

    def read_digital(self):
        _acquire(self, 'read_digital')
        _ream.pwm_out(self._key, 0, -1.0)
        _ream.pin_config(self._key, 'in', '', -1)
        return int(_ream.pin_level(self._key))

    def set_pull(self, pull):
        pull = _int(pull)
        _acquire(self, 'read_digital')
        self._pull = pull
        _ream.pin_config(self._key, 'in', ('up', 'down', 'none')[pull] if 0 <= pull <= 2 else 'none', -1)

    def get_pull(self):
        if self._mode() not in ('read_digital', 'button'):
            _pin_error(self)
        return self._pull

    def write_analog(self, value):
        v = int(value + 0.5) if isinstance(value, float) else _int(value)
        if v < 0 or v > 1023:
            raise ValueError('value must be between 0 and 1023')
        _acquire(self, 'write_analog')
        self._analog = v
        _ream.pin_config(self._key, 'alt', '', -1)
        self._pwm()
        if v == 0:
            _acquire(self, 'unused')

    def _pwm(self):
        _ream.pwm_out(self._key, 1000000 // self._period_us, self._analog / 1023)

    def set_analog_period(self, period):
        self.set_analog_period_microseconds(_int(period) * 1000)

    def set_analog_period_microseconds(self, period):
        period = _int(period)
        if period <= 0:
            raise ValueError('invalid period')
        self._period_us = period
        if self._mode() == 'write_analog':
            self._pwm()

    def get_analog_period_microseconds(self):
        return self._period_us


class MicroBitAnalogDigitalPin(MicroBitDigitalPin):
    def read_analog(self):
        _acquire(self, 'unused')
        volts = float(_ream.adc_volts(self._key))
        v = int(volts / 3.3 * 1023 + 0.5)
        return 0 if v < 0 else 1023 if v > 1023 else v


class MicroBitTouchPin(MicroBitAnalogDigitalPin):
    RESISTIVE = 0
    CAPACITIVE = 1

    def is_touched(self):
        if self._mode() not in ('touch', 'button'):
            _acquire(self, 'touch')
        return bool(_ream.touched(self._key))

    def set_touch_mode(self, mode):
        if self._mode() not in ('touch', 'button'):
            _acquire(self, 'touch')
        self._touch_mode = _int(mode)


class MicroBitTouchOnlyPin:
    RESISTIVE = 0
    CAPACITIVE = 1

    def __init__(self, number, key, initial):
        self._number, self._key, self._initial = number, key, initial

    def _mode(self):
        return _modes.get(self._number, self._initial)

    def __repr__(self):
        return '<%s>' % type(self).__name__

    is_touched = MicroBitTouchPin.is_touched
    set_touch_mode = MicroBitTouchPin.set_touch_mode


pin0 = MicroBitTouchPin(0, '0', 'unused')
pin1 = MicroBitTouchPin(1, '1', 'unused')
pin2 = MicroBitTouchPin(2, '2', 'unused')
pin3 = MicroBitAnalogDigitalPin(3, '3', 'display')
pin4 = MicroBitAnalogDigitalPin(4, '4', 'display')
pin5 = MicroBitDigitalPin(5, '5', 'button')
pin6 = MicroBitDigitalPin(6, '6', 'display')
pin7 = MicroBitDigitalPin(7, '7', 'display')
pin8 = MicroBitDigitalPin(8, '8', 'unused')
pin9 = MicroBitDigitalPin(9, '9', 'unused')
pin10 = MicroBitAnalogDigitalPin(10, '10', 'display')
pin11 = MicroBitDigitalPin(11, '11', 'button')
pin12 = MicroBitDigitalPin(12, '12', 'unused')
pin13 = MicroBitDigitalPin(13, '13', 'unused')
pin14 = MicroBitDigitalPin(14, '14', 'unused')
pin15 = MicroBitDigitalPin(15, '15', 'unused')
pin16 = MicroBitDigitalPin(16, '16', 'unused')
pin19 = MicroBitDigitalPin(19, '19', 'i2c')
pin20 = MicroBitDigitalPin(20, '20', 'i2c')
pin_logo = MicroBitTouchOnlyPin(30, 'LOGO', 'unused')
pin_speaker = MicroBitDigitalPin(31, 'SPEAKER', 'unused')


# --- buttons (microbit_button.c, microbit_hal_button_state) -----------------------------------------------------
class MicroBitButton:
    def __init__(self, pin):
        self._key = pin._key
        self._state = 0   # bit 0: was pressed; the rest: presses (as the HAL keeps it)

    def __repr__(self):
        return '<MicroBitButton>'

    def _count(self):
        p = int(_ream.pin_falls(self._key))
        if p:
            self._state = (self._state + (p << 1)) | 1

    def is_pressed(self):
        return int(_ream.pin_level(self._key)) == 0

    def was_pressed(self):
        self._count()
        pressed = self._state & 1
        self._state &= ~1
        return bool(pressed)

    def get_presses(self):
        self._count()
        n = self._state >> 1
        self._state &= 1
        return n


button_a = MicroBitButton(pin5)
button_b = MicroBitButton(pin11)


# --- the rest of modmicrobit.c ----------------------------------------------------------------------------------
def sleep(ms):
    ms = int(ms)
    if ms > 0:
        _utime.sleep_ms(ms)


def running_time():
    return _utime.ticks_ms()


def temperature():
    return int(_ream.temperature())


_volume = [255]


def set_volume(v):
    v = _int(v)
    _volume[0] = 0 if v < 0 else 255 if v > 255 else v


def scale(value, from_, to):
    from_min, from_max = float(from_[0]), float(from_[1])
    to_min, to_max = float(to[0]), float(to[1])
    v = (float(value) - from_min) / (from_max - from_min) * (to_max - to_min) + to_min
    if isinstance(to[0], float) or isinstance(to[1], float):
        return v
    return int(round(v))
