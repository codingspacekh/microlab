# The micro:bit V2's `microbit` module (M2.6). Behaviour and error texts follow micropython-microbit-v2 v2.1.2:
# src/codal_port/modmicrobit.c, microbit_pin.c, microbit_pinmode.c, microbit_button.c and
# src/codal_app/microbithal.cpp. The pin hardware is src/sim/pins.ts through _ream.
import _ream
import utime as _utime
import _image

Image = _image.MicroBitImage

# --- pins and their modes (microbit_pinmode.c) ------------------------------------------------------------------
# Every pin is in one mode at a time. Using a pin for something else first releases its mode; the display,
# button and I²C modes can't be released that way: "Pin 3 in display mode".
_HELD = ('display', 'button', 'i2c', 'spi')
_modes = {}
_audio = {'playing': lambda: False}   # set by the music module (audio_music_release)


def _pin_error(pin):
    raise ValueError('Pin %d in %s mode' % (pin._number, pin._mode()))


def _acquire(pin, new):
    current = pin._mode()
    if current == 'button' and new == 'read_digital':
        return False
    if current != new:
        if current in _HELD or (current == 'music' and _audio['playing']()):
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


# pin0 says 'write_digital' from power-on on a real micro:bit V2 (v2.1.2+0697c6d), though microbit_pin.c gives it
# MODE_UNUSED: something at start-up claims it (probed after a cold start, golden 01_pins, 2026-11-06). Only the
# mode is copied; how the pin drives at power-on is still to measure with an LED wired to it (docs/acceptance/M2.md).
pin0 = MicroBitTouchPin(0, '0', 'write_digital')
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
    _tone(_spk['hz'], _spk['vol'], _spk['wave'])   # the mixer's volume: what plays now changes with it


# --- the speaker and the audio pin (M7 slice 4: microbit_speaker.c, microbit_pinaudio.c, microbithal_audio.cpp) ----
# music and audio play through one mixer: to the speaker (unless it is off) and to one routed pin — pin0 by default,
# none when the program says pin=None. What the speaker plays is the sound at set_volume's share.
_spk = {'on': True, 'hz': 0, 'vol': 1.0, 'wave': 'square'}
_routed = [None]


def _tone(hz, vol=1.0, wave='square'):
    _spk['hz'], _spk['vol'], _spk['wave'] = hz, vol, wave
    _ream.sound(hz if _spk['on'] else 0, vol * _volume[0] / 255, wave)


def _audio_select(pin, mode):
    # microbit_pin_audio_select: None routes to no pin; the speaker's own pin is not allowed
    if pin is None:
        chosen = None
    elif pin is pin_speaker:
        raise ValueError('pin_speaker not allowed')
    elif isinstance(pin, MicroBitDigitalPin):
        chosen = pin
    else:
        raise TypeError('expecting a pin')
    if chosen is not _routed[0]:
        old = _routed[0]
        if old is not None:   # microbit_obj_pin_free
            _ream.pwm_out(old._key, 0, -1.0)
            _modes[old._number] = 'unused'
        _routed[0] = chosen
        if chosen is not None:
            _acquire(chosen, mode)
    elif chosen is not None:
        _modes[chosen._number] = mode
    return chosen


class MicroBitSpeaker:
    def __repr__(self):
        return '<MicroBitSpeaker>'

    def on(self):
        _spk['on'] = True
        _tone(_spk['hz'], _spk['vol'], _spk['wave'])

    def off(self):
        _spk['on'] = False
        _tone(_spk['hz'], _spk['vol'], _spk['wave'])


speaker = MicroBitSpeaker()


class MicroBitSound:
    # microbit_sound.c: the built-in sounds, played by name (CODAL's sound expressions)
    def __init__(self, name):
        self._name = name

    def __repr__(self):
        return "Sound('%s')" % self._name


for _n in ('giggle', 'happy', 'hello', 'mysterious', 'sad', 'slide', 'soaring', 'spring', 'twinkle', 'yawn'):
    setattr(MicroBitSound, _n.upper(), MicroBitSound(_n))
Sound = MicroBitSound


def scale(value, from_, to):
    from_min, from_max = float(from_[0]), float(from_[1])
    to_min, to_max = float(to[0]), float(to[1])
    v = (float(value) - from_min) / (from_max - from_min) * (to_max - to_min) + to_min
    if isinstance(to[0], float) or isinstance(to[1], float):
        return v
    return int(round(v))


# --- the display (microbit_display.c, drv_display.c) ------------------------------------------------------------
_TICK_MS = 6          # MILLISECONDS_PER_MACRO_TICK: animations move on in 6 ms steps
_DISPLAY_TIMER = 9000
_DISPLAY_PINS = (pin3, pin4, pin6, pin7, pin10)


class _StopIteration:
    pass


_STOP = _StopIteration()


class MicroBitDisplay:
    def __init__(self):
        self._px = bytearray(25)
        self._on = True
        self._iter = None
        self._clear = False
        self._period_us = 0
        self._error = None

    def __repr__(self):
        return '<MicroBitDisplay>'

    # what the LEDs show, for the window (and the trace)
    def _push(self):
        _ream.display_frame(''.join('0123456789'[p] for p in self._px) if self._on else '0' * 25)

    def _show_image(self, img):
        w, h = min(img._w, 5), min(img._h, 5)
        for y in range(5):
            for x in range(5):
                self._px[y * 5 + x] = img._at(x, y) if x < w and y < h else 0
        self._push()

    # --- animations: one frame per delay, the delay counted in 6 ms ticks ---
    def _stop(self):
        self._iter = None
        _ream.timer_stop(_DISPLAY_TIMER)

    def _draw(self, obj):
        if obj is _STOP:
            if self._clear:
                self._show_image(Image())
                self._clear = False
            else:
                self._stop()
        elif isinstance(obj, Image):
            self._show_image(obj)
        elif isinstance(obj, str):
            if len(obj) == 1:
                self._show_image(Image(obj))
            else:
                self._stop()
        else:
            self._error = TypeError('not an image')
            self._stop()

    def _next(self):
        try:
            return next(self._iter)
        except StopIteration:
            return _STOP

    def _animate(self, iterable, delay, clear, wait):
        self._stop()
        self._error = None
        self._iter = iter(iterable)
        self._clear = clear
        ticks = (delay + _TICK_MS - 1) // _TICK_MS if delay > 0 else 1
        self._period_us = ticks * _TICK_MS * 1000
        self._draw(self._next())
        self._raise()
        if self._iter is not None:
            _ream.timer_start(_DISPLAY_TIMER, self._period_us, True, _display_tick, self)
        if wait:
            # Not `while self._iter is not None:` — a while loop tests its condition before the backward jump
            # where scheduled callbacks (the frame tick) run, so it would sleep one frame too long. The
            # unconditional jump of `while True` runs the tick first, then the test sees it.
            while True:
                if self._iter is None:
                    break
                _ream.sleep_us(self._period_us)   # returns when the frame's timer is due
            self._raise()

    def _raise(self):
        if self._error is not None:
            e, self._error = self._error, None
            raise e

    # --- the API ---
    def show(self, image, delay=400, *, clear=False, wait=True, loop=False):
        self._stop()
        if isinstance(image, (int, float)) and not isinstance(image, bool):
            image = str(image)
        if isinstance(image, str):
            if len(image) == 0:
                return
            if len(image) == 1 and not clear and not loop:
                self._show_image(Image(image))
                return
        elif isinstance(image, Image):
            if not clear and not loop:
                self._show_image(image)
                return
            image = (image,)
        self._animate(_repeat(image) if loop else image, _int(delay), clear, wait)

    def scroll(self, text, delay=150, *, wait=True, monospace=False, loop=False):
        if isinstance(text, (int, float)) and not isinstance(text, bool):
            text = str(text)
        if not isinstance(text, str):
            raise TypeError("can't convert '%s' object to str implicitly" % type(text).__name__)
        self._animate(_scrolling(text, monospace, loop), _int(delay), False, wait)

    def clear(self):
        self._stop()
        self._show_image(Image())

    def _index(self, x, y):
        x, y = _int(x), _int(y)
        if not (0 <= x < 5 and 0 <= y < 5):
            raise ValueError('index out of bounds')
        return y * 5 + x

    def set_pixel(self, x, y, value):
        i = self._index(x, y)
        value = _int(value)
        if value < 0 or value > 9:
            raise ValueError('brightness out of bounds')
        self._px[i] = value
        self._push()

    def get_pixel(self, x, y):
        return self._px[self._index(x, y)]

    def on(self):
        for p in _DISPLAY_PINS:
            _acquire(p, 'display')
        self._on = True
        self._push()

    def off(self):
        self._on = False
        for p in _DISPLAY_PINS:
            _modes[p._number] = 'unused'
        self._push()

    def is_on(self):
        return self._on

    def read_light_level(self):
        return int(_ream.light())



def ws2812_write(pin, buf):
    # modmicrobit.c's microbit_ws2812_write (the neopixel module's write()): the bytes out on the pin at 800 kHz,
    # microbithal.cpp's neopixel_send
    if not isinstance(pin, MicroBitDigitalPin):
        raise TypeError('expecting a pin')
    data = bytes(buf)
    _ream.pwm_out(pin._key, 0, -1.0)
    _ream.pin_config(pin._key, 'out', '', 0)
    _ream.bitstream(pin._key, '400,850,800,450', data.hex())

def _display_tick(d):
    if d._iter is not None:
        d._draw(d._next())


def _repeat(iterable):
    while True:
        empty = True
        for item in iterable:
            empty = False
            yield item
        if empty:
            return


def _scrolling(text, monospace, loop):
    """scrolling_string_image_iterable (microbit_image.c): one column per frame; each letter as wide as its
    pixels (columns 2-4) plus a gap, or 5 columns with monospace; then blank columns until the display is clear."""
    img = Image()
    px = img._px

    def font_col(c, x):
        g = _image.glyph(c)
        return [g[y * 5 + x] for y in range(5)]

    def non_blank(c, x):
        return any(font_col(c, x))

    def rightmost(c):
        return 4 if non_blank(c, 4) else 3 if non_blank(c, 3) else 2

    while True:
        i, offset = 0, 0
        if text:
            right = text[0]
            limit = 5 if monospace else rightmost(right) + 1
        else:
            right, limit = ' ', 5
        while not (i >= len(text) and offset == 5):
            for y in range(5):
                for x in range(4):
                    px[y * 5 + x] = px[y * 5 + x + 1]
                px[y * 5 + 4] = 0
            if offset < limit:
                col = font_col(right, offset)
                for y in range(5):
                    px[y * 5 + 4] = col[y]
            elif offset == limit:
                i += 1
                if i >= len(text):
                    right, limit, offset = ' ', 5, 0
                else:
                    right = text[i]
                    if monospace:
                        offset, limit = -1, 5
                    else:
                        offset, limit = -(1 if non_blank(right, 0) else 0), rightmost(right) + 1
            offset += 1
            yield img
        if not loop:
            return
        img.fill(0)


display = MicroBitDisplay()


# --- the accelerometer (microbit_accelerometer.c); gestures as CODAL reports them (src/sim/motion.ts) ---------
_GESTURE_NAMES = ('', 'up', 'down', 'left', 'right', 'face up', 'face down', 'freefall', '3g', '6g', '8g', 'shake', '2g')


class MicroBitAccelerometer:
    def __init__(self):
        self._state = 0      # one bit per gesture seen since was_gesture last asked
        self._list = []      # gestures since get_gestures last asked (at most 16)
        self._range = 2

    def __repr__(self):
        return '<MicroBitAccelerometer>'

    def _sync(self):
        # microbit_hal_gesture_callback, for each gesture CODAL reported since the last call
        for name in str(_ream.accel_events()).split(','):
            if not name:
                continue
            value = _GESTURE_NAMES.index(name)
            if 0 < value <= 12:
                self._state |= 1 << value
                if len(self._list) < 16:
                    self._list.append(value)

    def _gesture(self, name):
        if not isinstance(name, str) or name not in _GESTURE_NAMES:
            raise ValueError('invalid gesture')
        return _GESTURE_NAMES.index(name)

    def _values(self):
        return tuple(int(v) for v in str(_ream.accel_values()).split())

    def get_x(self):
        return self._values()[0]

    def get_y(self):
        return self._values()[1]

    def get_z(self):
        return self._values()[2]

    def get_values(self):
        return self._values()

    def get_strength(self):
        x, y, z = self._values()
        return int((x * x + y * y + z * z) ** 0.5)

    def current_gesture(self):
        self._sync()
        return str(_ream.accel_gesture())

    def is_gesture(self, name):
        g = self._gesture(name)
        self._sync()
        return str(_ream.accel_gesture()) == _GESTURE_NAMES[g]

    def was_gesture(self, name):
        g = self._gesture(name)
        self._sync()
        seen = bool(self._state & (1 << g))
        self._state &= ~(1 << g)
        self._list = []   # as the firmware: gesture_list_cur = 0
        return seen

    def get_gestures(self):
        self._sync()
        out = tuple(_GESTURE_NAMES[g] for g in self._list)
        self._list = []
        return out

    def set_range(self, g):
        self._range = _int(g)


accelerometer = MicroBitAccelerometer()


# --- microphone (M6.6; micropython-microbit-v2's microphone, SoundEvent) ----------------------------------------
class SoundEvent:
    def __init__(self, name):
        self._name = name

    def __repr__(self):
        return "SoundEvent('%s')" % self._name


SoundEvent.LOUD = SoundEvent('loud')
SoundEvent.QUIET = SoundEvent('quiet')


class MicroBitMicrophone:
    """The sound level 0–255 (the window's slider), and its events: loud when it rises past the loud threshold, quiet
    when it falls back under the quiet one. The default thresholds (150, 75) are our estimate of CODAL's, to confirm
    on a board; heard each time the program asks."""

    def __init__(self):
        self._loud, self._quiet = 150, 75
        self._is_loud = False
        self._current = None
        self._history = []

    def __repr__(self):
        return '<MicroBitMicrophone>'

    def _hear(self, level):
        event = None
        if not self._is_loud and level >= self._loud:
            self._is_loud, event = True, SoundEvent.LOUD
        elif self._is_loud and level <= self._quiet:
            self._is_loud, event = False, SoundEvent.QUIET
        if event:
            self._current = event
            if len(self._history) < 16:
                self._history.append(event)

    def sound_level(self):
        level = int(_ream.sound_level())
        self._hear(level)
        return level

    def current_event(self):
        self.sound_level()
        return self._current

    def is_event(self, event):
        self.sound_level()
        return self._current is event

    def was_event(self, event):
        self.sound_level()
        heard = event in self._history
        self._history = []
        return heard

    def get_events(self):
        self.sound_level()
        events = tuple(self._history)
        self._history = []
        return events

    def set_threshold(self, event, value):
        if event is SoundEvent.LOUD:
            self._loud = _int(value)
        elif event is SoundEvent.QUIET:
            self._quiet = _int(value)
        else:
            raise ValueError('invalid sound event')


microphone = MicroBitMicrophone()


# --- i2c on P19 / P20 (microbit_i2c.c): a NACK is ENODEV --------------------------------------------------------
import _bus


class MicroBitI2C:
    def __init__(self):
        self._sda, self._scl = '20', '19'
        self._freq = 100000

    def __repr__(self):
        return '<MicroBitI2C>'

    def init(self, freq=100000, sda=None, scl=None):
        self._freq = _int(freq)
        if sda is not None:
            self._sda = sda._key
        if scl is not None:
            self._scl = scl._key

    def scan(self):
        found = str(_ream.i2c_scan(self._sda, self._scl))
        return [int(a, 16) for a in found.split(',') if a]

    def read(self, addr, n, repeat=False):
        r = _ream.i2c_read(self._sda, self._scl, _int(addr), _int(n))
        if isinstance(r, int):
            raise OSError(_bus._ENODEV)
        return bytes.fromhex(str(r))

    def write(self, addr, buf, repeat=False):
        if int(_ream.i2c_write(self._sda, self._scl, _int(addr), bytes(buf).hex())) < 0:
            raise OSError(_bus._ENODEV)


i2c = MicroBitI2C()


# --- spi on P13 / P15 / P14 by default (microbit_spi.c, M7 slice 2) ----------------------------------------------
class MicroBitSPI:
    def __init__(self):
        self._sck, self._mosi, self._miso = '13', '15', '14'
        self._baud = 1000000

    def __repr__(self):
        return '<MicroBitSPI>'

    def init(self, baudrate=1000000, bits=8, mode=0, sclk=None, mosi=None, miso=None):
        self._baud = _int(baudrate)
        if sclk is not None:
            self._sck = sclk._key
        if mosi is not None:
            self._mosi = mosi._key
        if miso is not None:
            self._miso = miso._key

    def _xfer(self, data, kind):
        return bytes.fromhex(str(_ream.spi_xfer(self._sck, self._mosi, self._miso, bytes(data).hex(), kind)))

    def write(self, buf):
        self._xfer(buf, 'write')

    def read(self, nbytes, out=0):
        return self._xfer(bytes([out]) * _int(nbytes), 'read')

    def write_readinto(self, out, in_):
        data = self._xfer(out, 'transfer')
        for i in range(len(in_)):
            in_[i] = data[i]


spi = MicroBitSPI()


# --- uart (M7 slice 5: microbit_uart.c): the micro:bit's one UART is its console's (USB); init() with pins moves it —
# and print() with it, mp_hal_stdout — to them. any() is True or False; read() doesn't wait for a first byte, then
# reads on while bytes come within a character's time (13 bits).
import _bus


class _UARTPort(_bus.UARTBus):
    def __init__(self, tx, rx, baudrate, bits, parity, stop, timeout_char):
        self._tx, self._rx = tx, rx
        self._baud, self._bits, self._parity, self._stop = baudrate, bits, parity, stop
        self._rxbuf = self._txbuf = 64
        self._timeout, self._timeout_char = -1, timeout_char
        self._start()


class MicroBitUART:
    ODD = 1
    EVEN = 0

    def __init__(self):
        self._port = None

    def init(self, baudrate=9600, bits=8, parity=None, stop=1, *, pins=None, tx=None, rx=None):
        if pins is not None:
            tx, rx = pins
        for pin in (tx, rx):
            if pin is not None and not isinstance(pin, MicroBitDigitalPin):
                raise TypeError('expecting a pin')
        baudrate = _int(baudrate)
        if self._port is not None:
            self._port.deinit()
            self._port = None
        _ream.console_uart(0)
        if tx is not None or rx is not None:
            self._port = _UARTPort(tx._key if tx is not None else '', rx._key if rx is not None else '', baudrate, _int(bits),
                                   None if parity is None else _int(parity), _int(stop), 13000 // baudrate + 1)
            if tx is not None:   # the console's output goes out of TX now
                _ream.console_uart(self._port._h)

    def any(self):
        return self._port is not None and self._port.any() > 0

    def read(self, nbytes=None):
        return None if self._port is None else self._port.read(nbytes)

    def readline(self):
        return None if self._port is None else self._port.readline()

    def readinto(self, buf, nbytes=None):
        return None if self._port is None else self._port.readinto(buf, nbytes)

    def write(self, buf):
        data = buf.encode() if isinstance(buf, str) else bytes(buf)
        if self._port is not None and self._port._tx:
            self._port.write(data)
        else:
            print(data.decode(), end='')
        return len(data)


uart = MicroBitUART()


# the audio module is the microbit module's too (modmicrobit.c: microbit.audio), M7 slice 4
import audio  # noqa: E402
