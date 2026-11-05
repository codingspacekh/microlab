# DAC and TouchPad
def t(label, f):
    try:
        print(label, repr(f()))
    except Exception as e:
        print(label, type(e).__name__ + ':', e)
from machine import DAC, TouchPad, Pin
d = DAC(Pin(25))
d.write(128)
t('dac', lambda: d)
t('dac 4', lambda: DAC(Pin(4)))
t('dac 256', lambda: d.write(256))
tp = TouchPad(Pin(4))
t('touch untouched', lambda: tp.read() > 300)
t('touch 5', lambda: TouchPad(Pin(5)))
