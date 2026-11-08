# The board's `os` and `open`, over the sim's file system (M2.1, F-21).
# MicroPython's VfsPosix passes on the WebAssembly C library's errno numbers (ENOENT is 44 there); the boards
# use the usual ones (ENOENT is 2), and students see them: "OSError: [Errno 2] ENOENT". So every file call
# goes through here and gets the board's number. Frames in this file are hidden from tracebacks (src/sim/run.ts).
import uos as _os
import builtins as _builtins

_real_open = _builtins.open

# Emscripten errno -> MicroPython (the boards')
_ERRNO = {44: 2, 20: 17, 54: 20, 31: 21, 55: 39, 2: 13, 28: 22, 8: 9, 29: 5, 51: 28, 63: 1}


def _board(e):
    return OSError(_ERRNO.get(e.errno, e.errno))


def open(*args, **kwargs):
    try:
        return _real_open(*args, **kwargs)
    except OSError as e:
        raise _board(e)


def _wrap(fn):
    def call(*args):
        try:
            return fn(*args)
        except OSError as e:
            raise _board(e)
    return call


class _Os:
    """Stands in for the `os` module (a module object can't be made here); `print(os)` reads as the board's."""

    def __repr__(self):
        return "<module 'os'>"

    def __getattr__(self, name):
        return getattr(_os, name)


os = _Os()
for _name in ('listdir', 'ilistdir', 'mkdir', 'rmdir', 'remove', 'unlink', 'rename', 'stat', 'statvfs', 'chdir', 'getcwd'):
    setattr(os, _name, _wrap(getattr(_os, _name)))
os.__name__ = 'os'


class uname_result:
    """os.uname()'s answer: five fields, by name or by place (uname()[0] is the sysname)."""

    def __init__(self, values):
        self.sysname, self.nodename, self.release, self.version, self.machine = values
        self._values = values

    def __getitem__(self, i):
        return self._values[i]

    def __len__(self):
        return 5

    def __repr__(self):
        return "(sysname='%s', nodename='%s', release='%s', version='%s', machine='%s')" % self._values


def set_uname(values):
    """The board's os.uname() (M7: drivers that ask which board they run on — the RC522's mfrc522.py)."""
    os.uname = lambda: uname_result(values)
