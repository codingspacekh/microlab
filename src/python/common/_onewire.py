# _onewire (M6.5b): the C module under onewire.py on the boards (drivers/onewire), its bit timing answered by the sim:
# the bus and the devices on the pin's net (src/lib/circuit/onewire.ts). crc8 is Dallas / Maxim's.
import _ream


def reset(pin):
    return bool(_ream.ow_reset(pin._key))


def readbit(pin):
    return int(_ream.ow_bit(pin._key, -1))


def writebit(pin, value):
    _ream.ow_bit(pin._key, 1 if value else 0)


def readbyte(pin):
    return int(_ream.ow_byte(pin._key, -1))


def writebyte(pin, value):
    _ream.ow_byte(pin._key, int(value) & 0xFF)


def crc8(data):
    crc = 0
    for b in data:
        for _ in range(8):
            mix = (crc ^ b) & 1
            crc >>= 1
            if mix:
                crc ^= 0x8C
            b >>= 1
    return crc
