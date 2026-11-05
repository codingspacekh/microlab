# Bus classes shared by the board modules (M2.7): I2C (extmod/machine_i2c.c), SPI, UART, on the _ream bridge's
# transaction-level calls. Each board sets its pins, its defaults and the errno a NACK gives (rp2's hardware I2C
# reports EIO; SoftI2C, the ESP32 and the micro:bit ENODEV).
import _ream

_ENODEV, _EIO = 19, 5


def _hex(buf):
    return bytes(buf).hex()


class I2CBus:
    """The methods every machine.I2C has. A board subclass sets _sda, _scl (pin keys) and _nack (errno)."""
    _nack = _ENODEV

    def _write(self, addr, buf, stop=True):
        n = int(_ream.i2c_write(self._sda, self._scl, addr, _hex(buf)))
        if n < 0:
            raise OSError(self._nack)
        return n

    def _read(self, addr, n):
        r = _ream.i2c_read(self._sda, self._scl, addr, n)
        if isinstance(r, int):
            raise OSError(self._nack)
        return bytes.fromhex(str(r))

    def scan(self):
        found = str(_ream.i2c_scan(self._sda, self._scl))
        return [int(a, 16) for a in found.split(',') if a]

    def writeto(self, addr, buf, stop=True):
        return self._write(addr, buf, stop)

    def writevto(self, addr, vector, stop=True):
        data = b''.join(bytes(b) for b in vector)
        return self._write(addr, data, stop)

    def readfrom(self, addr, nbytes, stop=True):
        return self._read(addr, nbytes)

    def readfrom_into(self, addr, buf, stop=True):
        data = self._read(addr, len(buf))
        for i in range(len(buf)):
            buf[i] = data[i]

    def _mem_addr(self, memaddr, addrsize):
        return bytes((memaddr >> (8 * i)) & 0xff for i in reversed(range(addrsize // 8)))

    def readfrom_mem(self, addr, memaddr, nbytes, *, addrsize=8):
        self._write(addr, self._mem_addr(memaddr, addrsize), False)
        return self._read(addr, nbytes)

    def readfrom_mem_into(self, addr, memaddr, buf, *, addrsize=8):
        data = self.readfrom_mem(addr, memaddr, len(buf), addrsize=addrsize)
        for i in range(len(buf)):
            buf[i] = data[i]

    def writeto_mem(self, addr, memaddr, buf, *, addrsize=8):
        self._write(addr, self._mem_addr(memaddr, addrsize) + bytes(buf))


class SPIBus:
    """read / readinto / write / write_readinto. A board subclass sets _sck, _mosi, _miso (pin keys, '' for none)."""

    def _xfer(self, data, kind):
        return bytes.fromhex(str(_ream.spi_xfer(self._sck, self._mosi, self._miso, _hex(data), kind)))

    def write(self, buf):
        self._xfer(buf, 'write')

    def read(self, nbytes, write=0x00):
        return self._xfer(bytes([write]) * nbytes, 'read')

    def readinto(self, buf, write=0x00):
        data = self._xfer(bytes([write]) * len(buf), 'read')
        for i in range(len(buf)):
            buf[i] = data[i]

    def write_readinto(self, write_buf, read_buf):
        data = self._xfer(write_buf, 'transfer')
        for i in range(len(read_buf)):
            read_buf[i] = data[i]

    def deinit(self):
        pass


class UARTBus:
    """write / read / readline / readinto / any. Nothing arrives until M3 wires a part to RX."""

    def write(self, buf):
        data = buf.encode() if isinstance(buf, str) else bytes(buf)
        _ream.uart_write(self._tx, self._rx, self._baud, _hex(data))
        return len(data)

    def _take(self, n=-1):
        data = bytes.fromhex(str(_ream.uart_read(self._rx, n)))
        return data or None

    def read(self, nbytes=-1):
        return self._take(nbytes)

    def readline(self):
        return self._take()

    def readinto(self, buf, nbytes=-1):
        data = self._take(len(buf) if nbytes < 0 else nbytes)
        if data is None:
            return None
        for i, b in enumerate(data):
            buf[i] = b
        return len(data)

    def any(self):
        return 0

    def flush(self):
        pass

    def txdone(self):
        return True

    def deinit(self):
        pass


def time_pulse_us(key, level, timeout_us=1000000):
    return int(_ream.pulse_us(key, 1 if level else 0, timeout_us))


def bitstream(key, encoding, timing, buf):
    if encoding != 0:
        raise ValueError('invalid encoding')
    _ream.bitstream(key, ','.join(str(int(t)) for t in timing), _hex(buf))
