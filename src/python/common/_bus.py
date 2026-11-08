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

    _pol = _pha = 0
    _lsb = False
    _spi_baud = 1000000

    def _xfer(self, data, kind):
        # M7 slice 5: its mode (polarity, phase), bit order and speed go with the bytes: a part reads them by its own
        mode = (self._pol & 1) << 1 | (self._pha & 1)
        return bytes.fromhex(str(_ream.spi_xfer(self._sck, self._mosi, self._miso, _hex(data), kind, mode, 1 if self._lsb else 0, self._spi_baud)))

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
    """The stream methods every machine.UART has (M7 slice 5: ports/rp2/machine_uart.c, extmod/machine_uart.c): bytes
    go out of TX as the line carries them (start, data, parity, stop bits at the baud rate) and arrive in the receive
    buffer byte by byte; read() waits `timeout` ms for a first byte, `timeout_char` ms for each next one. A board
    subclass sets _tx, _rx (pin keys), _baud, _bits, _parity, _stop, _rxbuf, _txbuf, _timeout, _timeout_char, then
    calls _start()."""
    _h = 0

    def _start(self):
        if self._h:
            _ream.uart_close(self._h)
        parity = -1 if self._parity is None else int(self._parity)
        self._h = int(_ream.uart_open(self._tx, self._rx, self._baud, self._bits, parity, self._stop, self._rxbuf))
        for k in (self._tx, self._rx):
            if k:
                _ream.pin_config(k, 'alt', '', -1)

    def _frame_us(self):
        return (1 + self._bits + (0 if self._parity is None else 1) + self._stop) * 1000000 // self._baud

    def write(self, buf):
        data = buf.encode() if isinstance(buf, str) else bytes(buf)
        wait = int(_ream.uart_write(self._h, self._tx, self._rx, self._baud, _hex(data)))
        # what doesn't fit in the transmit buffer waits for room (mp_machine_uart_write)
        over = wait - self._txbuf * self._frame_us()
        if over > 0:
            _ream.sleep_us(over)
        return len(data)

    def _ms(self):
        return int(_ream.ticks_us()) // 1000

    def _read(self, size, timeout=None):
        # mp_machine_uart_read: the first byte within `timeout`, each next within `timeout_char`
        out = bytearray()
        timeout = self._timeout if timeout is None else timeout
        start = self._ms()
        while len(out) < size:
            if int(_ream.uart_any(self._h)):
                out += bytes.fromhex(str(_ream.uart_take(self._h, size - len(out))))
                start = self._ms()
                timeout = self._timeout_char
                continue
            elapsed = self._ms() - start
            if elapsed > timeout:
                break
            left = (timeout - elapsed + 1) * 1000 - int(_ream.ticks_us()) % 1000
            nxt = int(_ream.uart_next(self._h))
            _ream.sleep_us(max(1, min(left, nxt + 1) if nxt >= 0 else left))
        return bytes(out)

    def read(self, nbytes=None):
        if nbytes is None:   # mp_stream_readall: until a read finds nothing in time
            out = bytearray()
            while True:
                chunk = self._read(256)
                if not chunk:
                    break
                out += chunk
            return bytes(out) if out else None
        data = self._read(nbytes)
        return data if data else None

    def readline(self):
        # mp_stream_unbuffered_readline: a byte at a time, each with the full timeout
        out = bytearray()
        while True:
            b = self._read(1)
            if not b:
                break
            out += b
            if b == b'\n':
                break
        return bytes(out) if out else None

    def readinto(self, buf, nbytes=None):
        data = self._read(len(buf) if nbytes is None else min(nbytes, len(buf)))
        if not data:
            return None
        for i, b in enumerate(data):
            buf[i] = b
        return len(data)

    def any(self):
        return int(_ream.uart_any(self._h))

    def flush(self):
        _ream.sleep_us(int(_ream.uart_busy(self._h)))

    def txdone(self):
        return int(_ream.uart_busy(self._h)) == 0

    def sendbreak(self):
        _ream.uart_write(self._h, self._tx, self._rx, self._baud, '')

    def deinit(self):
        if self._h:
            _ream.uart_close(self._h)
        self._h = 0


def time_pulse_us(key, level, timeout_us=1000000):
    return int(_ream.pulse_us(key, 1 if level else 0, timeout_us))


def bitstream(key, encoding, timing, buf):
    if encoding != 0:
        raise ValueError('invalid encoding')
    _ream.bitstream(key, ','.join(str(int(t)) for t in timing), _hex(buf))
