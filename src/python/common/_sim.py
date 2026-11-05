# Runs the project like a board after reset: boot.py, then main.py, in the REPL's namespace (M2.1).
# setup() is called while the sim's own folder is still reachable; afterwards only the project is: the
# project's folder becomes "/" and the sim's modules are dropped from sys.modules.
import sys
import io
import vfs
import uos
import _os   # now, while the sim's folder is on the path


def setup(project, hidden):
    sys.modules['os'] = _os.os
    sys.modules['uos'] = _os.os
    import builtins
    builtins.open = _os.open
    vfs.umount('/')
    vfs.mount(vfs.VfsPosix(project), '/')
    uos.chdir('/')
    for name in hidden:
        sys.modules.pop(name, None)


last = ''


def run(names, g):
    """Runs the files that exist, in order, printing tracebacks as the board does (without the sim's own
    frames). Leaves in `last`: 'done', 'stopped' or 'error', a newline, then the first error's traceback."""
    global last
    g.pop('__sim', None)
    kind, error = 'done', ''
    for name in names:
        try:
            src = _read(name)
        except OSError:
            continue
        try:
            exec(compile(src, name, 'exec'), g)
        except SystemExit:
            break
        except BaseException as e:
            buf = io.StringIO()
            sys.print_exception(e, buf)
            text = _tidy(buf.getvalue())
            print(text, end='')
            if isinstance(e, KeyboardInterrupt):
                kind = 'stopped'
                break
            # an error in boot.py is printed and main.py still runs, as on the boards
            kind, error = 'error', error or text
    last = kind + '\n' + error


def _read(name):
    with open(name) as f:
        return f.read()


def _tidy(text):
    return '\n'.join(line for line in text.split('\n') if not _hidden(line))


def _hidden(line):
    return line.startswith('  File "<stdin>"') or line.startswith('  File "/_sim/')
