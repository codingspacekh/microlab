# ADC reprs and errors; the temperature sensor and VSYS in a sensible range
def t(label, f):
    try:
        print(label, repr(f()))
    except Exception as e:
        print(label, type(e).__name__ + ':', e)
from machine import ADC, Pin
t('reprs', lambda: (ADC(26), ADC(Pin(27)), ADC('GP28'), ADC(4)))
t('pin after', lambda: Pin(27))
t('5', lambda: ADC(5))
t('Pin 15', lambda: ADC(Pin(15)))
v = ADC(4).read_u16() * 3.3 / 65535
t('temp ok', lambda: 10 < 27 - (v - 0.706) / 0.001721 < 45)
t('vsys ok', lambda: 1.0 < ADC(3).read_u16() * 3.3 / 65535 < 2.0)
t('CORE_TEMP', lambda: ADC.CORE_TEMP)
