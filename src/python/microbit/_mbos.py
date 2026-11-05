# The micro:bit's os (modos.c, microbitfs.c): a flat file system — listdir, ilistdir, remove, stat, size, uname;
# no folders, no chdir or getcwd.
import _os

listdir = _os.os.listdir
ilistdir = _os.os.ilistdir
remove = _os.os.remove
stat = _os.os.stat


def size(name):
    return stat(name)[6]


# os.uname() as micropython-microbit-v2 v2.1.2 gives it; the version line is to confirm on a real board
_UNAME = ('microbit', 'microbit', '2.1.2', 'micro:bit v2.1.2 on 2024-06-07; MicroPython v1.22.0 on 2024-06-07',
          'micro:bit with nRF52833')


class uname_result:
    def __init__(self, values):
        self.sysname, self.nodename, self.release, self.version, self.machine = values
        self._values = values

    def __getitem__(self, i):
        return self._values[i]

    def __len__(self):
        return 5

    def __repr__(self):
        return "(sysname='%s', nodename='%s', release='%s', version='%s', machine='%s')" % self._values


def uname():
    return uname_result(_UNAME)
