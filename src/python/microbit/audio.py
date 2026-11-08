# The micro:bit V2's audio module (M7 slice 4): modaudio.c, microbit_soundeffect.c and microbit_sound.c of
# micropython-microbit-v2 v2.1.2. A built-in Sound or a SoundEffect is a sound expression, synthesized as CODAL does
# (src/sim/soundfx.ts) and stepped on the run's clock; AudioFrames play at 7812 samples a second, 32 a frame — heard
# as the pitch and loudness of each frame. It plays to the speaker and the routed pin, as music does.
import _ream
import microbit as _mb

_AUDIO_TIMER = 9002
_FRAME_US = 4096   # 32 samples at 7812 Hz
_RATE = 7812


class _Player:
    def __init__(self):
        self.steps = None    # an expression's steps: [(µs, Hz, volume, wave)]
        self.i = 0
        self.t0 = 0
        self.frames = None   # an iterator of AudioFrames
        self.pin = None
        self.last = 128
        self.error = None    # what a frame fetched on the timer raised: raised where the program waits


_p = _Player()


def _out(hz, vol, wave):
    _mb._tone(hz, vol, wave)
    if _p.pin is not None:
        _ream.pwm_out(_p.pin._key, hz, 0.5 if hz and vol > 0 else -1.0)


def _halt():
    _ream.timer_stop(_AUDIO_TIMER)
    if _p.steps is not None or _p.frames is not None:
        _p.steps = _p.frames = None
        _out(0, 0, 'square')


def _step(p):
    # each change of the expression at its time
    steps = p.steps
    if steps is None:
        return
    now = int(_ream.now_us())
    while p.i < len(steps) and p.t0 + steps[p.i][0] <= now:
        _, hz, vol, wave = steps[p.i]
        _out(hz, vol, wave)
        p.i += 1
    if p.i >= len(steps):
        p.steps = None
        return
    _ream.timer_start(_AUDIO_TIMER, 0, False, _step, p, p.t0 + steps[p.i][0])


def _frame(p):
    # audio_data_fetcher: the next frame from the source, every 32 samples
    if p.frames is None:
        return
    try:
        f = next(p.frames)
    except StopIteration:
        _halt()
        return
    if not isinstance(f, AudioFrame):
        _halt()
        p.error = TypeError('not an AudioFrame')   # mp_sched_exception: raised in the program
        return
    # heard as its pitch (how often it crosses the middle) and its loudness
    d = f._d
    crossings = 0
    prev = p.last
    for v in d:
        if (v >= 128) != (prev >= 128):
            crossings += 1
        prev = v
    p.last = prev
    loud = max(abs(v - 128) for v in d) / 128
    hz = crossings * _RATE / 64 if loud else 0
    _out(hz, min(loud, 1.0), 'square')


def _wait(busy):
    try:
        while True:   # `while True` so the timer (a scheduled callback) runs before the test
            if _p.error is not None:
                e, _p.error = _p.error, None
                raise e
            if not busy():
                break
            _ream.sleep_us(1000)
    except BaseException:
        _halt()
        raise


def play(source, wait=True, pin=_mb.pin0, return_pin=None):
    if return_pin is not None:
        raise ValueError('return_pin not supported')
    _halt()
    _p.error = None
    _p.pin = _mb._audio_select(pin, 'audio_play')
    expr = None
    if isinstance(source, _mb.MicroBitSound):
        expr = source._name
    elif isinstance(source, SoundEffect):
        expr = source._expr()
    elif isinstance(source, (tuple, list)) and len(source) and isinstance(source[0], SoundEffect):
        expr = ','.join(x._expr() for x in source)
    if expr is not None:
        data = str(_ream.sound_steps(expr))
        if data:
            steps = []
            for item in data.split(';'):
                us, hz, vol, wave = item.split(',')
                steps.append((int(us), float(hz), float(vol), wave))
            _p.steps, _p.i, _p.t0 = steps, 0, int(_ream.now_us())
            _step(_p)
            if wait:
                _wait(lambda: _p.steps is not None)
        return
    _p.frames = iter(source)
    _p.last = 128
    _ream.timer_start(_AUDIO_TIMER, _FRAME_US, True, _frame, _p)
    _frame(_p)
    if _p.error is not None:
        e, _p.error = _p.error, None
        raise e
    if wait:
        _wait(lambda: _p.frames is not None)


def is_playing():
    return _p.steps is not None or _p.frames is not None


def stop():
    _halt()


# --- SoundEffect (microbit_soundeffect.c): its parameters kept as the 72 digits of a sound expression --------------
_OFFSETS = {
    'freq_start': (5, 4), 'freq_end': (18, 4), 'duration': (9, 4), 'vol_start': (1, 4), 'vol_end': (26, 4),
    'waveform': (0, 1), 'fx': (34, 2), 'shape': (13, 2),
}
_WAVEFORMS = ('WAVEFORM_SINE', 'WAVEFORM_SAWTOOTH', 'WAVEFORM_TRIANGLE', 'WAVEFORM_SQUARE', 'WAVEFORM_NOISE')
_FXS = ('FX_NONE', 'FX_VIBRATO', 'FX_TREMOLO', 'FX_WARBLE')


def _int(x):
    if isinstance(x, (int, bool)):
        return int(x)
    raise TypeError("can't convert %s to int" % type(x).__name__)


class MicroBitSoundEffect:
    WAVEFORM_SINE = 0
    WAVEFORM_SAWTOOTH = 1
    WAVEFORM_TRIANGLE = 2
    WAVEFORM_SQUARE = 3
    WAVEFORM_NOISE = 4
    SHAPE_LINEAR = 1
    SHAPE_CURVE = 2
    SHAPE_LOG = 18
    FX_NONE = 0
    FX_TREMOLO = 2
    FX_VIBRATO = 1
    FX_WARBLE = 3

    def __init__(self, freq_start=500, freq_end=2500, duration=500, vol_start=255, vol_end=0, waveform=3, fx=0, shape=18):
        self._e = bytearray(b'0' * 72)
        self._put(30, 4, 128)   # the shape's steps
        self._put(36, 4, 1)     # the effect's parameter
        self._put(40, 4, 24)    # the effect's steps
        for name, v in (('freq_start', freq_start), ('freq_end', freq_end), ('duration', duration), ('vol_start', vol_start),
                        ('vol_end', vol_end), ('waveform', waveform), ('fx', fx), ('shape', shape)):
            self._set(name, v)

    def _put(self, offset, length, value):
        # sound_expr_encode: volumes 0–255 kept as 0–1023; each field its digits
        if offset in (1, 26):
            if value < 0 or value > 255:
                raise ValueError('maximum value is 255')
            value = (value * 1023 + 127) // 255
        if value < 0 or value >= 10 ** length:
            raise ValueError('maximum value is %s' % ('9' * min(length, 4)))
        for i in range(length - 1, -1, -1):
            self._e[offset + i] = 48 + value % 10
            value //= 10

    def _get(self, name):
        offset, length = _OFFSETS[name]
        v = int(bytes(self._e[offset:offset + length]))
        return (v * 255 + 511) // 1023 if offset in (1, 26) else v

    def _set(self, name, value):
        offset, length = _OFFSETS[name]
        self._put(offset, length, _int(value))

    def _expr(self):
        return bytes(self._e).decode()

    def copy(self):
        c = SoundEffect()
        c._e = bytearray(self._e)
        return c

    @staticmethod
    def _from_string(s):
        c = SoundEffect()
        c._e = bytearray(b'0' * 72)
        data = str(s).encode()[:72]
        c._e[0:len(data)] = data
        return c

    def __str__(self):
        g = self._get
        shape = g('shape')
        shape = {1: 'SHAPE_LINEAR', 2: 'SHAPE_CURVE', 18: 'SHAPE_LOG'}.get(shape, str(shape))
        wf = g('waveform')
        fx = g('fx')
        return ('SoundEffect(freq_start=%d, freq_end=%d, duration=%d, vol_start=%d, vol_end=%d, waveform=%s, fx=%s, shape=%s)'
                % (g('freq_start'), g('freq_end'), g('duration'), g('vol_start'), g('vol_end'),
                   _WAVEFORMS[wf] if wf < 5 else wf, _FXS[fx] if fx < 4 else fx, shape))

    def __repr__(self):
        g = self._get
        return 'SoundEffect(%d, %d, %d, %d, %d, %d, %d, %d)' % tuple(g(n) for n in ('freq_start', 'freq_end', 'duration', 'vol_start', 'vol_end', 'waveform', 'fx', 'shape'))


def _attribute(name):
    return property(lambda self: self._get(name), lambda self, v: self._set(name, v))


for _name in _OFFSETS:
    setattr(MicroBitSoundEffect, _name, _attribute(_name))

# the module has SoundEffect (its type's name is MicroBitSoundEffect, as the firmware's)
SoundEffect = MicroBitSoundEffect
del MicroBitSoundEffect


# --- AudioFrame (modaudio.c): 32 samples, 0–255, 128 the middle --------------------------------------------------
def _clamp(v):
    return 0 if v < 0 else 255 if v > 255 else v


class AudioFrame:
    def __init__(self):
        self._d = bytearray(b'\x80' * 32)

    def __len__(self):
        return 32

    def _index(self, i):
        i = _int(i)
        if i < 0 or i >= 32:
            raise ValueError('index out of bounds')
        return i

    def __getitem__(self, i):
        return self._d[self._index(i)]

    def __setitem__(self, i, v):
        i = self._index(i)
        v = _int(v)
        if v < 0 or v > 255:
            raise ValueError('value out of range')
        self._d[i] = v

    def __delitem__(self, i):
        raise TypeError('cannot delete elements of AudioFrame')

    def copyfrom(self, other):
        data = other._d if isinstance(other, AudioFrame) else bytes(other)
        n = min(len(data), 32)
        self._d[0:n] = data[0:n]

    def _add(self, other, sign):
        if not isinstance(other, AudioFrame):
            raise TypeError("unsupported types for +: 'AudioFrame', '%s'" % type(other).__name__)
        for i in range(32):
            self._d[i] = _clamp(self._d[i] + sign * (other._d[i] - 128))
        return self

    def _copy(self):
        c = AudioFrame()
        c._d[:] = self._d
        return c

    def _mul(self, f):
        scaled = int(float(f) * 32768)   # float_to_fixed(f, 15)
        for i in range(32):
            self._d[i] = _clamp((((self._d[i] - 128) * scaled) >> 15) + 128)
        return self

    def __add__(self, other):
        return self._copy()._add(other, 1)

    def __iadd__(self, other):
        return self._add(other, 1)

    def __sub__(self, other):
        return self._copy()._add(other, -1)

    def __isub__(self, other):
        return self._add(other, -1)

    def __mul__(self, f):
        return self._copy()._mul(f)

    def __imul__(self, f):
        return self._mul(f)
