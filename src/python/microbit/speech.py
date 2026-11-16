# The micro:bit's speech module (1.0.1 — the class after v1.0): modspeech.c of micropython-microbit-v2 v2.1.2 —
# say, pronounce, sing and translate, with the firmware's options and errors, so a program that speaks runs here as
# on the board: it waits while it speaks, and the speaker and the routed pin (pin 0 unless told) sound.
#
# The voice is a stand-in. The firmware's is SAM (Software Automatic Mouth, 1982), whose source has no licence to
# copy it under — so here each letter or phoneme is a short buzz at the voice's pitch, a word a burst of them, a
# space a silence: a student hears that it speaks, when, how fast and how high, not the words. For the same reason
# translate() — SAM's pronunciation rules — is only on the real micro:bit. How long a letter lasts and the pitch's
# frequency are estimates (docs/acceptance/1.0.1.md).
import _ream
import microbit as _mb

_LETTER_US = 80000     # one letter or phoneme at speed 72
_GAP_US = 80000        # between words
_PAUSE_US = 300000     # at , . ? ! ; :
_PITCH_HZ = 15300      # pitch 115 is a C (133 Hz), 58 the C above — the docs' table for sing()
_VOWELS = {'A': 1.0, 'E': 1.12, 'I': 1.26, 'O': 0.89, 'U': 0.84, 'Y': 1.19}
_HISS = 'SFHXZC'


def _text(x):
    if not isinstance(x, str):
        raise TypeError("can't convert '%s' object to str implicitly" % type(x).__name__)
    return x


def _int(x):
    if isinstance(x, bool) or not isinstance(x, int):
        raise TypeError("can't convert %s to int" % type(x).__name__)
    return x


def _speak(text, pitch, speed, pin, sing=False):
    # the same order as articulate(): the options, then the pin, then the words
    pitch, speed = max(1, _int(pitch) & 0xff), max(1, _int(speed) & 0xff)
    pin = _mb._audio_select(pin, 'audio_play')
    for ch in text:
        if 'a' <= ch <= 'z':
            raise ValueError('Phoneme not understood')

    def out(hz, vol=1.0, wave='sawtooth'):
        _mb._tone(hz, vol, wave)
        if pin is not None:
            _ream.pwm_out(pin._key, hz, 0.5 if hz and vol > 0 else -1.0)

    unit = speed / 72
    hz = _PITCH_HZ / pitch
    try:
        i, n = 0, len(text)
        while i < n:
            ch = text[i]
            i += 1
            if ch == '#' and sing:
                # sing(): #115 sets the note of what follows
                j = i
                while j < n and text[j].isdigit():
                    j += 1
                if j > i:
                    hz = _PITCH_HZ / max(1, int(text[i:j]) & 0xff)
                i = j
            elif ch.isalpha():
                if sing:
                    out(hz)
                elif ch in _VOWELS:
                    out(hz * _VOWELS[ch])
                elif ch in _HISS:
                    out(hz * 2, 0.5, 'noise')
                else:
                    out(hz * 0.94, 0.8)
                _ream.sleep_us(int(_LETTER_US * unit))
            elif ch == ' ':
                out(0, 0)
                _ream.sleep_us(int(_GAP_US * unit))
            elif ch in ',.?!;:':
                out(0, 0)
                _ream.sleep_us(int(_PAUSE_US * unit))
            # stress marks (1–8), / * ' - and the rest change how SAM says it, not how long: nothing to hear here
    finally:
        out(0, 0, 'square')


def translate(words):
    _text(words)
    if len(words) > 80:
        raise ValueError('text too long')
    raise NotImplementedError("speech.translate() works only on the real micro:bit: the simulator doesn't have its pronunciation rules")


def say(words, *, pitch=64, speed=72, mouth=128, throat=128, debug=False, mode=1, volume=4, pin=_mb.pin0):
    _text(words)
    if len(words) > 80:
        raise ValueError('text too long')
    _speak(words.upper(), pitch, speed, pin)


def pronounce(phonemes, *, pitch=64, speed=72, mouth=128, throat=128, debug=False, mode=1, volume=4, pin=_mb.pin0):
    _speak(_text(phonemes), pitch, speed, pin)


def sing(phonemes, *, pitch=64, speed=72, mouth=128, throat=128, debug=False, mode=1, volume=4, pin=_mb.pin0):
    _speak(_text(phonemes), pitch, speed, pin, True)
