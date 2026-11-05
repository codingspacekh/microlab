# The font: every printable character as an Image
def t(label, f):
    try:
        print(label, repr(f()))
    except Exception as e:
        print(label, type(e).__name__ + ':', e)
from microbit import Image
for c in range(32, 127):
    print(c, repr(Image(chr(c))))
