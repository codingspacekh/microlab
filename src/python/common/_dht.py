# The dht module (M6.4): micropython/drivers/dht/dht.py (MIT licence, Damien P. George), its classes as they are;
# dht_readinto, C in the firmware (drivers/dht/dht.c), is answered by the sim: the 5 bytes of the DHT on the pin, or
# OSError 110 (ETIMEDOUT) when none answers. It takes as long as the C does: 250 ms high, the 18 ms start, the bits.
import _ream

_ETIMEDOUT = 110


def dht_readinto(pin, buf):
    r = _ream.dht_read(pin._key)
    if isinstance(r, int):
        raise OSError(_ETIMEDOUT)
    data = bytes.fromhex(str(r))
    for i in range(5):
        buf[i] = data[i]


class DHTBase:
    def __init__(self, pin):
        self.pin = pin
        self.buf = bytearray(5)

    def measure(self):
        buf = self.buf
        dht_readinto(self.pin, buf)
        if (buf[0] + buf[1] + buf[2] + buf[3]) & 0xFF != buf[4]:
            raise Exception("checksum error")


class DHT11(DHTBase):
    def humidity(self):
        return self.buf[0]

    def temperature(self):
        return self.buf[2]


class DHT22(DHTBase):
    def humidity(self):
        return (self.buf[0] << 8 | self.buf[1]) * 0.1

    def temperature(self):
        t = ((self.buf[2] & 0x7F) << 8 | self.buf[3]) * 0.1
        if self.buf[2] & 0x80:
            t = -t
        return t
