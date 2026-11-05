# The accelerometer lying flat, face up, untouched
def t(label, f):
    try:
        print(label, repr(f()))
    except Exception as e:
        print(label, type(e).__name__ + ':', e)
from microbit import *
sleep(500)
x, y, z = accelerometer.get_values()
t('flat', lambda: (abs(x) < 200, abs(y) < 200, z < -800))
t('gesture', lambda: accelerometer.current_gesture())
t('gestures', lambda: accelerometer.get_gestures())
t('invalid', lambda: accelerometer.is_gesture('wobble'))
