# The Pico W LED (on the Wi-Fi chip)
def t(label, f):
    try:
        print(label, repr(f()))
    except Exception as e:
        print(label, type(e).__name__ + ':', e)
from machine import Pin
led = Pin('LED', Pin.OUT)
t('repr', lambda: led)
led.on()
t('on', lambda: led.value())
t('pull', lambda: Pin('LED', Pin.IN, Pin.PULL_UP))
t('od', lambda: Pin('LED', Pin.OPEN_DRAIN))
t('irq', lambda: Pin('LED', Pin.OUT).irq(print))
