# The micro:bit's speech module (1.0.1; its real voice 1.0.2): modspeech.c of micropython-microbit-v2 v2.1.2 — say,
# pronounce, sing and translate, with the firmware's options and errors. The voice is the firmware's own: SAM
# (Software Automatic Mouth, 1982), ported from its lib/sam (src/sim/sam) — the bridge turns words into phonemes and
# phonemes into samples, the window plays them, and the program waits here for as long as they last.
# On the routed pin (pin 0 unless told) a buzzer hears the voice's pitch, not its words: the simulator's pins carry
# a pitch, not samples.
import _ream
import microbit as _mb

_PITCH_HZ = 15300      # pitch 115 is a C (133 Hz), 58 the C above — the docs' table for sing()


def _text(x):
    if not isinstance(x, str):
        raise TypeError("can't convert '%s' object to str implicitly" % type(x).__name__)
    return x


def _int(x):
    if isinstance(x, bool) or not isinstance(x, int):
        raise TypeError("can't convert %s to int" % type(x).__name__)
    return x


def _answer(r):
    r = str(r)
    if r.startswith('err:'):
        raise ValueError(r[4:])
    return r[3:]


def translate(words):
    _text(words)
    if len(words) > 80:
        raise ValueError('text too long')
    return _answer(_ream.speech_translate(words))


def _articulate(phonemes, sing, pitch, speed, mouth, throat, debug, mode, volume, pin):
    # articulate(): the options, the pin, then SAM
    pitch, speed, mouth, throat = _int(pitch) & 0xff, _int(speed) & 0xff, _int(mouth) & 0xff, _int(throat) & 0xff
    mode, volume = _int(mode), _int(volume)
    _text(phonemes)
    pin = _mb._audio_select(pin, 'audio_play')
    loud = _mb._volume[0] / 255 if _mb._spk['on'] else 0
    us = int(_answer(_ream.speech(phonemes, pitch, speed, mouth, throat, bool(sing), mode, volume, loud)))
    if us <= 0:
        return
    hz = _PITCH_HZ / max(1, pitch)
    try:
        _mb._tone(hz, 1.0, 'speech')
        if pin is not None:
            _ream.pwm_out(pin._key, hz, 0.5)
        # in short waits, so Stop and Ctrl+C are heard while it speaks
        while us > 0:
            step = us if us < 20000 else 20000
            _ream.sleep_us(step)
            us -= step
    except BaseException:
        _ream.speech_stop()
        raise
    finally:
        _mb._tone(0, 0, 'square')
        if pin is not None:
            _ream.pwm_out(pin._key, 0, -1.0)


def say(words, *, pitch=64, speed=72, mouth=128, throat=128, debug=False, mode=1, volume=4, pin=_mb.pin0):
    _articulate(translate(words), False, pitch, speed, mouth, throat, debug, mode, volume, pin)


def pronounce(phonemes, *, pitch=64, speed=72, mouth=128, throat=128, debug=False, mode=1, volume=4, pin=_mb.pin0):
    _articulate(phonemes, False, pitch, speed, mouth, throat, debug, mode, volume, pin)


def sing(phonemes, *, pitch=64, speed=72, mouth=128, throat=128, debug=False, mode=1, volume=4, pin=_mb.pin0):
    _articulate(phonemes, True, pitch, speed, mouth, throat, debug, mode, volume, pin)
