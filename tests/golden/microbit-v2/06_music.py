# music: tempo and timings (rounded)
def t(label, f):
    try:
        print(label, repr(f()))
    except Exception as e:
        print(label, type(e).__name__ + ':', e)
from microbit import *
import music
t('tempo', lambda: music.get_tempo())
t0 = running_time()
music.play(music.BA_DING)
t('ba ding', lambda: (running_time() - t0) // 10)
t0 = running_time()
music.pitch(440, 100)
t('pitch', lambda: (running_time() - t0) // 10)
music.set_tempo(bpm=240)
t0 = running_time()
music.play(['a5:2', 'a'])
t('two notes', lambda: (running_time() - t0) // 10)
music.reset()
t('reset', lambda: music.get_tempo())
music.play(['c', 5, 'd'])
t('invalid pitch', lambda: music.pitch(2000000))
