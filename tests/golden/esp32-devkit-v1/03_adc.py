# ADC repr and errors (no readings: the pins float)
def t(label, f):
    try:
        print(label, repr(f()))
    except Exception as e:
        print(label, type(e).__name__ + ':', e)
from machine import ADC, Pin
a = ADC(Pin(34))
t('repr', lambda: a)
a.atten(ADC.ATTN_0DB)
t('atten', lambda: a)
t('no adc', lambda: ADC(Pin(5)))
t('bad atten', lambda: ADC(Pin(34), atten=9))
t('constants', lambda: (ADC.ATTN_0DB, ADC.ATTN_11DB, ADC.WIDTH_9BIT, ADC.WIDTH_12BIT))
