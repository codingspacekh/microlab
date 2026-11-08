# The micro:bit V2's `radio` module (M7, the teacher's request), as micropython-microbit-v2 v2.1.2's modradio.c:
# the micro:bit's own 2.4 GHz radio between micro:bits (not Bluetooth). on(), off(), config(), reset(); send() puts a
# string after the 3-byte header \x01\x00\x01, send_bytes() sends bytes as they are; receive(), receive_bytes(),
# receive_bytes_into(), receive_full() take the oldest waiting message, None when there is none. With one micro:bit
# in the sim, what it sends is shown in the window, and the window can send it a message as another micro:bit would.
import _ream

RATE_1MBIT = 0
RATE_2MBIT = 1

_DEFAULT = {'length': 32, 'queue': 3, 'channel': 7, 'power': 6, 'data_rate': RATE_1MBIT, 'address': 0x75626974, 'group': 0}
_RANGE = {'length': (1, 251), 'queue': (1, 254), 'channel': (0, 83), 'power': (0, 7), 'data_rate': (0, 1),
          'address': (0, 0xFFFFFFFF), 'group': (0, 255)}
_cfg = dict(_DEFAULT)
_state = {'on': False}


def _tell():
    _ream.radio_config(_cfg['channel'], _cfg['group'], _cfg['queue'], _cfg['length'])


def config(**kwargs):
    for name, value in kwargs.items():
        if name not in _RANGE:
            raise TypeError("unexpected keyword argument '%s'" % name)
        lo, hi = _RANGE[name]
        if not lo <= value <= hi:
            raise ValueError("value out of range for argument '%s'" % name)
        _cfg[name] = value
    _tell()


def reset():
    _cfg.clear()
    _cfg.update(_DEFAULT)
    _tell()


def on():
    _state['on'] = True
    _tell()
    _ream.radio_on(1)


def off():
    _state['on'] = False
    _ream.radio_on(0)


def _enabled():
    if not _state['on']:
        raise ValueError('radio is not enabled')


def send_bytes(message):
    _enabled()
    _ream.radio_send(bytes(message)[:_cfg['length']].hex())


def send(message):
    send_bytes(b'\x01\x00\x01' + str(message).encode())


def receive_full():
    _enabled()
    got = str(_ream.radio_receive())
    if not got:
        return None
    data, rssi, at = got.split(' ')
    return (bytes.fromhex(data), int(rssi), int(at))


def receive_bytes():
    full = receive_full()
    return full[0] if full else None


def receive_bytes_into(buffer):
    data = receive_bytes()
    if data is None:
        return None
    n = min(len(data), len(buffer))
    for i in range(n):
        buffer[i] = data[i]
    return n


def receive():
    data = receive_bytes()
    if data is None:
        return None
    if len(data) < 3 or data[:3] != b'\x01\x00\x01':
        raise ValueError('received packet is not a string')
    return data[3:].decode()
