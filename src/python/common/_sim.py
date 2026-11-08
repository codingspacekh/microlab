# Runs the project like a board after reset: boot.py, then main.py, in the REPL's namespace (M2.1).
# setup() is called while the sim's own folder is still reachable; afterwards only the project is: the
# project's folder becomes "/" and the sim's modules are dropped from sys.modules.
import sys
import io
import vfs
import uos
import _os   # now, while the sim's folder is on the path
import _ream
import _time


def setup(project, hidden, board, help_text=''):
    # the board's modules under the board's names ("import time" finds sys.modules before the firmware's)
    _time.__name__ = 'time'
    del _time.__file__   # print(time) reads <module 'time'>, as on the boards
    for name, module in (('os', _os.os), ('uos', _os.os), ('time', _time), ('utime', _time)):
        sys.modules[name] = module
    import builtins
    builtins.open = _os.open
    builtins.input = _input   # M9: from the console, as a board's serial console gives it
    if help_text:
        _help.append((builtins.help, help_text))
        builtins.help = _board_help
    # the board's modules (machine, ...): imported now, while the sim's folder is reachable; they read as
    # built in (no __file__), as the firmware's do
    for name in board:
        module = __import__(name)
        try:
            del module.__file__
        except (AttributeError, KeyError):
            pass
    if '_board' in sys.modules:   # the board's own changes (the micro:bit's flat os, its utime)
        sys.modules['_board'].setup()
    sys.path.remove('/_sim')
    vfs.umount('/')
    vfs.mount(vfs.VfsPosix(project), '/')
    uos.chdir('/')
    for name in hidden + board + ['_ream']:   # the bridge too: only the board's modules hold it
        if name.startswith('_'):
            sys.modules.pop(name, None)


last = ''
_g = {}
_help = []


def _line():
    # waits for a line typed in the console; timers and pin IRQs go on meanwhile, as on a board
    while True:
        s = _ream.stdin_line()
        if s is not None:
            return s
        _time._sleep(10000)


def _input(prompt=''):
    if prompt:
        print(prompt, end='')
    s = _line()
    _ream.echo(s + '\n')   # the board echoes what is typed
    return s


def _board_help(*obj):
    if obj:
        return _help[0][0](*obj)
    print(_help[0][1], end='')


def run(names, g):
    """Runs the files that exist, in order, printing tracebacks as the board does (without the sim's own
    frames). Leaves in `last`: 'done', 'stopped' or 'error', a newline, then the first error's traceback."""
    global last, _g
    g.pop('__sim', None)
    _g = g
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
            if isinstance(e, KeyboardInterrupt) and _ream.quiet_stop():
                kind = 'stopped'   # a fault stopped the run: the sim reports it, not a traceback
                break
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


def repl():
    """The REPL after the program (F-23, screen 29c), in its names: >>> and ... as MicroPython's friendly REPL
    (shared/runtime/pyexec.c, py/repl.c); a line runs as 'single', so an expression's value is printed. Ctrl+C at
    the prompt starts the line again; Stop ends the session."""
    lines = []
    while True:
        try:
            print('... ' if lines else '>>> ', end='')
            line = _line()
        except KeyboardInterrupt:
            if _ream.session_over():
                return
            print()
            lines = []
            continue
        _ream.echo(line + '\n')
        lines.append(line)
        src = '\n'.join(lines)
        if _more(src):
            continue
        lines = []
        if not src.strip():
            continue
        try:
            exec(compile(src, '<stdin>', 'single'), _g)
        except SystemExit:
            pass
        except BaseException as e:
            if isinstance(e, KeyboardInterrupt) and _ream.session_over():
                return
            buf = io.StringIO()
            sys.print_exception(e, buf)
            text = '\n'.join(l for l in buf.getvalue().split('\n') if not l.startswith('  File "/_sim/'))
            print(text, end='')
            _ream.repl_error(text)


_COMPOUND = ('if', 'while', 'for', 'try', 'with', 'def', 'class', 'async')


def _more(src):
    # py/repl.c mp_repl_continue_with_input: open brackets or triple quotes, a backslash at the end, or a compound
    # statement whose last line isn't empty
    if not src:
        return False
    compound = src[0] == '@' or any(src.startswith(k) and (len(src) == len(k) or not (src[len(k)].isalpha() or src[len(k)].isdigit() or src[len(k)] == '_')) for k in _COMPOUND)
    depth = 0
    quote = ''
    i = 0
    n = len(src)
    while i < n:
        c = src[i]
        if c in '\'"':
            if (not quote or quote == c * 3) and src[i:i + 3] == c * 3:
                quote = '' if quote else c * 3
                i += 2
            elif not quote or quote == c:
                quote = '' if quote else c
        elif c == '\\' and i + 1 < n and src[i + 1] in '\'"\\':
            if quote:
                i += 1
        elif not quote:
            if c in '([{':
                depth += 1
            elif c in ')]}':
                depth -= 1
        i += 1
    if len(quote) == 3:
        return True
    if depth > 0 and not quote:
        return True
    if src[-1] == '\\':
        return True
    return compound and src[-1] != '\n'
