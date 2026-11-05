# The micro:bit's Image (microbit_image.c, drv_image.c, micropython-microbit-v2 v2.1.2), with the firmware's
# quirks kept: any character up to '9' parses as a digit ('c' >= '0' in image_from_parsed_str is always true),
# and `image * n` dims only the first `width` rows (microbit_image_dim loops y over the width).
import _data

_FONT = _data.FONT
_MAX = 9


def _int(x):
    if isinstance(x, (int, bool)):
        return int(x)
    raise TypeError("can't convert %s to int" % type(x).__name__)


def glyph(c):
    """The font's 5x5 glyph for a character ('?' for one it lacks), as 25 brightnesses."""
    n = ord(c) - 32
    if not 0 <= n < 95:
        n = ord('?') - 32
    px = bytearray(25)
    for y in range(5):
        row = _FONT[n * 5 + y]
        for x in range(5):
            px[y * 5 + x] = ((row >> (4 - x)) & 1) * _MAX
    return px


class MicroBitImage:
    def __init__(self, *args):
        n = len(args)
        if n > 3:
            raise TypeError('function expected at most 3 arguments, got %d' % n)
        self._fixed = False
        if n == 0:
            self._w, self._h, self._px = 5, 5, bytearray(25)
        elif n == 1:
            s = args[0]
            if not isinstance(s, str):
                raise TypeError('Image(s) takes a string')
            if len(s) == 1:
                self._w, self._h, self._px = 5, 5, glyph(s)
            else:
                self._parse(s)
        else:
            w, h = _int(args[0]), _int(args[1])
            self._w, self._h = w, h
            if n == 2:
                self._px = bytearray(max(0, w * h))
            else:
                buf = memoryview(args[2])   # TypeError for anything without the buffer protocol
                if w < 0 or h < 0 or w * h != len(buf):
                    raise ValueError('image data is incorrect size')
                self._px = bytearray(min(b, _MAX) for b in buf)

    def _parse(self, s):
        w = h = line = 0
        for c in s:
            if c in '\n:':
                w, line, h = max(line, w), 0, h + 1
            elif c <= '9':   # spaces and digits (and, as in the firmware, anything else up to '9')
                line += 1
            else:
                raise ValueError('unexpected character in Image definition')
        if line:
            h, w = h + 1, max(line, w)
        self._w, self._h, self._px = w, h, bytearray(w * h)
        x = y = 0
        for c in s:
            if c in '\n:':
                y, x = y + 1, 0
            else:
                if c != ' ' and x < w and y < h:
                    self._px[y * w + x] = (ord(c) - 48) & 15
                x += 1

    @classmethod
    def _built_in(cls, pixels):
        img = cls()
        img._px = bytearray(int(p) for p in pixels)
        img._fixed = True
        return img

    # --- reading ---
    def width(self):
        return self._w

    def height(self):
        return self._h

    def _at(self, x, y):
        return self._px[y * self._w + x]

    def get_pixel(self, x, y):
        x, y = _int(x), _int(y)
        if x < 0 or y < 0:
            raise ValueError('index cannot be negative')
        if x < self._w and y < self._h:
            return self._at(x, y)
        raise ValueError('index too large')

    def __repr__(self):
        return 'Image(' + "'" + ''.join(self._row(y) + ':' for y in range(self._h)) + "')"

    def __str__(self):
        rows = ["'%s:'" % self._row(y) for y in range(self._h)]
        return 'Image(\n    ' + '\n    '.join(rows) + '\n)'

    def _row(self, y):
        return ''.join('0123456789'[self._at(x, y)] for x in range(self._w))

    # --- changing (built-in images can't be changed) ---
    def _mutable(self):
        if self._fixed:
            raise TypeError('image cannot be modified (try copying first)')

    def set_pixel(self, x, y, value):
        self._mutable()
        x, y = _int(x), _int(y)
        if x < 0 or y < 0:
            raise ValueError('index cannot be negative')
        value = _int(value)
        if value < 0 or value > _MAX:
            raise ValueError('brightness out of bounds')
        if x < self._w and y < self._h:
            self._px[y * self._w + x] = value
            return
        raise ValueError('index too large')

    def fill(self, value):
        self._mutable()
        value = _int(value)
        if value < 0 or value > _MAX:
            raise ValueError('brightness out of bounds')
        for i in range(len(self._px)):
            self._px[i] = value

    def blit(self, src, x, y, w, h, *dest):
        self._mutable()
        if not isinstance(src, MicroBitImage):
            raise TypeError('expecting an image')
        if len(dest) == 1:
            raise TypeError('must specify both offsets')
        x, y, w, h = _int(x), _int(y), _int(w), _int(h)
        if w < 0 or h < 0:
            raise ValueError('size cannot be negative')
        xd, yd = (_int(dest[0]), _int(dest[1])) if dest else (0, 0)
        _blit(src, self, x, y, w, h, xd, yd)

    # --- new images ---
    def _new(self, w, h):
        img = MicroBitImage(w, h)
        return img

    def copy(self):
        img = self._new(self._w, self._h)
        img._px[:] = self._px
        return img

    def invert(self):
        img = self._new(self._w, self._h)
        for i, p in enumerate(self._px):
            img._px[i] = _MAX - p
        return img

    def crop(self, x, y, w, h):
        x, y, w, h = _int(x), _int(y), max(0, _int(w)), max(0, _int(h))
        img = self._new(w, h)
        _blit(self, img, x, y, w, h, 0, 0)
        return img

    def _shift(self, x, y):
        img = self._new(self._w, self._h)
        _blit(self, img, x, y, self._w, self._h, 0, 0)
        return img

    def shift_left(self, n):
        return self._shift(_int(n), 0)

    def shift_right(self, n):
        return self._shift(-_int(n), 0)

    def shift_up(self, n):
        return self._shift(0, _int(n))

    def shift_down(self, n):
        return self._shift(0, -_int(n))

    def _dim(self, f):
        if f < 0:
            raise ValueError('brightness multiplier must not be negative')
        img = self._new(self._w, self._h)
        for x in range(self._w):
            for y in range(self._w):   # sic: microbit_image_dim loops y over the width
                if y < self._h:
                    # dividing by 0 multiplies by infinity: every pixel ends up at 9 in the firmware's C
                    v = _MAX if f == float('inf') else min(int(self._at(x, y) * f + 0.5), _MAX)
                    img._px[y * self._w + x] = v
        return img

    def __mul__(self, f):
        return self._dim(float(f))

    def __truediv__(self, f):
        f = float(f)
        return self._dim(1.0 / f if f else float('inf'))

    def _sum(self, other, add):
        if not isinstance(other, MicroBitImage):
            return NotImplemented
        if other._w != self._w or other._h != self._h:
            raise ValueError('images must be the same size')
        img = self._new(self._w, self._h)
        for i in range(len(self._px)):
            v = self._px[i] + other._px[i] if add else self._px[i] - other._px[i]
            img._px[i] = min(v, _MAX) if add else max(0, v)
        return img

    def __add__(self, other):
        return self._sum(other, True)

    def __sub__(self, other):
        return self._sum(other, False)


def _blit(src, dest, x, y, w, h, xdest, ydest):
    """image_blit (drv_image.c): copy src's (x, y, w, h) to dest at (xdest, ydest), clearing the rest of the
    destination rectangle."""
    if w < 0:
        w = 0
    if h < 0:
        h = 0
    ix0 = max(max(0, x), -xdest)
    iy0 = max(max(0, y), -ydest)
    ix1 = min(min(dest._w + x - xdest, src._w), x + w)
    iy1 = min(min(dest._h + y - ydest, src._h), y + h)
    cx0, cy0 = max(0, xdest), max(0, ydest)
    cx1, cy1 = min(dest._w, xdest + w), min(dest._h, ydest + h)

    def clear(x0, y0, x1, y1):
        for i in range(x0, x1):
            for j in range(y0, y1):
                dest._px[j * dest._w + i] = 0

    if ix0 >= ix1 or iy0 >= iy1:
        clear(cx0, cy0, cx1, cy1)
        return
    copied = [(i, j, src._at(i, j)) for i in range(ix0, ix1) for j in range(iy0, iy1)]
    for i, j, v in copied:
        dest._px[(j + ydest - y) * dest._w + (i + xdest - x)] = v
    ix0 += xdest - x
    iy0 += ydest - y
    ix1 += xdest - x
    iy1 += ydest - y
    clear(cx0, cy0, ix0, iy1)
    clear(cx0, iy1, ix1, cy1)
    clear(ix1, iy0, cx1, cy1)
    clear(ix0, cy0, cx1, iy0)


for _name, _pixels in _data.IMAGES.items():
    setattr(MicroBitImage, _name, MicroBitImage._built_in(_pixels))
MicroBitImage.ALL_CLOCKS = tuple(getattr(MicroBitImage, n) for n in _data.ALL_CLOCKS)
MicroBitImage.ALL_ARROWS = tuple(getattr(MicroBitImage, n) for n in _data.ALL_ARROWS)
