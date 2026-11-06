# Display timing (rounded) and pixels
def t(label, f):
    try:
        print(label, repr(f()))
    except Exception as e:
        print(label, type(e).__name__ + ':', e)
from microbit import *
t0 = running_time()
display.show('Hi')
t('show Hi', lambda: (running_time() - t0) // 10)
t0 = running_time()
display.scroll('I')
t('scroll I', lambda: (running_time() - t0) // 10)
t0 = running_time()
display.show(Image.ALL_CLOCKS, delay=100)
t('clocks', lambda: (running_time() - t0) // 10)
display.show(Image.HEART)
t('pixels', lambda: (display.get_pixel(1, 0), display.get_pixel(0, 0)))
t('bounds', lambda: display.set_pixel(5, 0, 9))
t('brightness', lambda: display.set_pixel(0, 0, 10))
display.off()
t('off', lambda: (display.is_on(), pin3.get_mode()))
display.on()
t('on', lambda: pin3.get_mode())
