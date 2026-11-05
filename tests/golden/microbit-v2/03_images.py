# Built-in images, Image operations and errors
def t(label, f):
    try:
        print(label, repr(f()))
    except Exception as e:
        print(label, type(e).__name__ + ':', e)
from microbit import Image
t('heart', lambda: Image.HEART)
print(str(Image.HEART))
t('clocks', lambda: len(Image.ALL_CLOCKS))
t('dim', lambda: Image.HEART * 0.5)
t('div', lambda: Image.HEART / 3)
t('add', lambda: Image('90:00') + Image('05:00'))
t('sub', lambda: Image('90:00') - Image('55:00'))
t('shift', lambda: Image('12:34').shift_left(1))
t('crop', lambda: Image('12:34').crop(1, 0, 1, 2))
t('invert', lambda: Image('09:90').invert())
t('buffer', lambda: Image(2, 1, bytearray([4, 12])))
t('bad char', lambda: Image('12a'))
t('size', lambda: Image(2, 2, bytearray(3)))
t('too large', lambda: Image.HEART.get_pixel(5, 0))
t('negative', lambda: Image.HEART.get_pixel(-1, 0))
t('immutable', lambda: Image.HEART.set_pixel(0, 0, 5))
t('not str', lambda: Image(5))
t('sizes', lambda: Image.HEART + Image(2, 2))
