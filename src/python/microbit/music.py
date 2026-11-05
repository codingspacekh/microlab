# The micro:bit's music module (M2.6c): modmusic.c and modmusictunes.c of micropython-microbit-v2 v2.1.2. Notes
# change on the board's 6 ms system tick; each note is cut 10 ms short so notes are heard apart (ARTICULATION_MS).
import _ream
import utime as _utime
import microbit as _mb
import _data

_TICK_US = 6000
_MUSIC_TIMER = 9001
_ARTICULATION_MS = 10
_DEFAULT_BPM, _DEFAULT_TICKS, _DEFAULT_OCTAVE, _DEFAULT_DURATION = 120, 4, 4, 4
# periods of the octave from middle C, in µs: A, B, C, D, E, F, G; and the sharps
_PERIODS = (2273, 2025, 3822, 3405, 3034, 2863, 2551)
_SHARPS = (2145, 0, 3608, 3214, 0, 2703, 2408)

_IDLE, _NEXT, _ARTICULATE = 0, 1, 2


class _Music:
    def __init__(self):
        self.bpm, self.ticks = _DEFAULT_BPM, _DEFAULT_TICKS
        self.octave, self.duration = _DEFAULT_OCTAVE, _DEFAULT_DURATION
        self.state = _IDLE
        self.loop = False
        self.wait_ms = 0
        self.notes = ()
        self.index = 0
        self.amp = False
        self.period_us = 0
        self.pin = None


_m = _Music()
_mb._audio['playing'] = lambda: _m.state != _IDLE

for _name, _notes in _data.TUNES.items():
    globals()[_name] = _notes


def _output():
    hz = 1000000 / _m.period_us if _m.amp and _m.period_us else 0
    _ream.sound(hz)
    if _m.pin is not None:
        _ream.pwm_out(_m.pin._key, hz, 0.5 if hz else -1.0)


def _amplitude(on):
    _m.amp = on
    _output()


def _period(us):
    if us <= 0:
        return -1
    _m.period_us = us
    _output()
    return 0


def _select(pin):
    # microbit_pin_audio_select: the default is pin 0 (with the speaker)
    pin = _mb.pin0 if pin is None else pin
    _mb._acquire(pin, 'music')
    _m.pin = pin


def _start_timer():
    now = int(_ream.now_us())
    first = (now // _TICK_US + 1) * _TICK_US   # the next tick of the board's 6 ms system timer
    _ream.timer_start(_MUSIC_TIMER, _TICK_US, True, _tick, _m, first)


def _start_note(note):
    # the firmware turns the output on, then sets the pitch; here both are reported as one change
    _m.amp = True
    index = (ord(note[0]) & 0x1f) - 1
    ms_per_tick = (60000 // _m.bpm) // _m.ticks
    octave = 0
    sharp = False
    pos = 1
    if pos < len(note) and note[pos] in '#b':
        if note[pos] == 'b':
            index = 6 if index == 0 else index - 1
            if index == 1:   # the unusual edge case of Cb
                octave -= 1
        sharp = True
        pos += 1
    if pos < len(note) and note[pos] != ':':
        _m.octave = ord(note[pos]) & 0xf
        pos += 1
    octave += _m.octave
    if pos < len(note) and note[pos] == ':':
        pos += 1
        if pos < len(note):
            _m.duration = ord(note[pos]) & 0xf
            pos += 1
            if pos < len(note):
                _m.duration = _m.duration * 10 + (ord(note[pos]) & 0xf)
    octave -= 4
    if 0 <= index < 10:
        base = (_SHARPS if sharp else _PERIODS)[index] if index < 7 else 0
        us = base >> octave if octave >= 0 else base << -octave
        if us > 0:
            _m.period_us = us
    else:
        _m.amp = False   # 'r': a rest
    _output()
    gap = ms_per_tick * _m.duration - _ARTICULATION_MS
    return gap if gap >= _ARTICULATION_MS else _ARTICULATION_MS


def _tick(m):
    # microbit_music_tick, on every 6 ms tick while something plays
    if m.state == _IDLE:
        _ream.timer_stop(_MUSIC_TIMER)
        return
    now = _utime.ticks_ms()
    if now < m.wait_ms:
        return
    if m.state == _ARTICULATE:
        _amplitude(False)
        m.wait_ms = now + _ARTICULATION_MS
        m.state = _NEXT
    elif m.state == _NEXT:
        if m.index >= len(m.notes):
            if m.loop:
                m.index = 0
            else:
                m.state = _IDLE
                _ream.timer_stop(_MUSIC_TIMER)
                return
        note = m.notes[m.index]
        if not isinstance(note, (str, bytes)):
            print('TypeError: expecting a str for note')
            m.state = _IDLE
            _ream.timer_stop(_MUSIC_TIMER)
            return
        if isinstance(note, bytes):
            note = note.decode()
        m.wait_ms = now + _start_note(note)
        m.index += 1
        m.state = _ARTICULATE


def _wait():
    try:
        while True:   # `while True` so the tick (a scheduled callback) runs before the test (M2.md, finding 18)
            if _m.state == _IDLE:
                break
            _ream.sleep_us(_TICK_US)
    except BaseException:
        _m.state = _IDLE
        _amplitude(False)
        raise


def play(music, pin=None, wait=True, loop=False):
    _m.octave, _m.duration = _DEFAULT_OCTAVE, _DEFAULT_DURATION
    if isinstance(music, (str, bytes)):
        notes = (music,)
    elif isinstance(music, (list, tuple)):
        notes = tuple(music)
    else:
        raise TypeError("object '%s' isn't a tuple or list" % type(music).__name__)
    _m.state = _IDLE
    _select(pin)
    _m.wait_ms = _utime.ticks_ms()
    _m.loop = bool(loop)
    _m.notes, _m.index = notes, 0
    _m.state = _NEXT
    _start_timer()
    if wait:
        _wait()


def pitch(frequency, duration=-1, pin=None, wait=True):
    frequency = int(frequency)
    duration = int(duration)
    _m.state = _IDLE
    _select(pin)
    _amplitude(True)
    if frequency != 0 and _period(1000000 // frequency if frequency > 0 else 0) == -1:
        raise ValueError('invalid pitch')
    if duration >= 0:
        _m.wait_ms = _utime.ticks_ms() + duration
        _m.loop = False
        _m.notes, _m.index = (), 0
        _m.state = _ARTICULATE
        _start_timer()
        if wait:
            _wait()


def stop(pin=None):
    _select(pin)
    _m.state = _IDLE
    _amplitude(False)


def set_tempo(*, ticks=0, bpm=0):
    if ticks:
        _m.ticks = int(ticks)
    if bpm:
        _m.bpm = int(bpm)


def get_tempo():
    return (_m.bpm, _m.ticks)


def reset():
    _m.bpm, _m.ticks = _DEFAULT_BPM, _DEFAULT_TICKS
    _m.octave, _m.duration = _DEFAULT_OCTAVE, _DEFAULT_DURATION
