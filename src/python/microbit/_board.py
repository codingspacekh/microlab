# The micro:bit's own modules in place of MicroPython's (called by _sim.setup before the program starts).
import sys
import builtins
import _os
import _mbos
import _utime


def _open(name, mode='r', *args, **kwargs):
    # microbitfs.c: only r / w and b / t
    for c in mode:
        if c not in 'rwbt':
            raise ValueError('illegal mode')
    return _os.open(name, mode, *args, **kwargs)


def setup():
    _mbos.__name__ = 'os'        # (_sim.setup has already taken __file__ off every board module)
    _utime.__name__ = 'utime'
    sys.modules['os'] = sys.modules['uos'] = _mbos
    sys.modules['time'] = sys.modules['utime'] = _utime
    builtins.open = _open
