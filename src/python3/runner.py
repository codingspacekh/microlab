"""MicroLab's Python 3 runner (M12, requirements Rev 10, architecture §2.11).

MicroLab starts this script with its bundled CPython and keeps it ready. It speaks JSON lines: on stdout it tells the
window what the program prints, when it asks for input(), how it ended and when the shell waits for a line; on stdin
it gets the file to run, the lines typed, and Ctrl+C. The student's program runs in this process's main thread, so
turtle and tkinter work as they do with IDLE; a reader thread takes what the window sends, so Ctrl+C is heard even
while the program is busy or waits for input().

Window → runner:  {"run": {"code", "file", "cwd"}} · {"line": text} · {"interrupt": true}
Runner → window:  {"ready": version} · {"out": text} · {"err": text} · {"input": true} · {"prompt": ">>> " | "... "}
                  {"window": true} (a tkinter or turtle window opened)
                  {"ended": "done" | "error" | "stopped", "error"?: {type, message, file, line}} · {"replError": {...}}
"""
import _thread
import builtins
import codeop
import io
import json
import linecache
import os
import queue
import sys
import threading
import traceback

_wire = sys.stdout            # the JSON channel; the program's prints are wrapped onto it
_window = sys.stdin           # what the window sends (sys.stdin becomes the program's, below)
_wire_lock = threading.Lock()
_inbox = queue.Queue()
_RUNNER = os.path.abspath(__file__)


def send(msg):
    with _wire_lock:
        _wire.write(json.dumps(msg, ensure_ascii=False) + "\n")
        _wire.flush()


class _Stream(io.TextIOBase):
    """sys.stdout / sys.stderr for the program: each write goes to the window as {"out"} or {"err"}."""

    def __init__(self, kind):
        self.kind = kind

    def writable(self):
        return True

    def write(self, text):
        if not isinstance(text, str):
            raise TypeError(f"write() argument must be str, not {type(text).__name__}")
        if text:
            send({self.kind: text})
        return len(text)

    def isatty(self):
        return False

    @property
    def encoding(self):
        return "utf-8"


def _reader():
    """Everything the window sends: Ctrl+C at once (KeyboardInterrupt in the program), the rest in order."""
    for raw in _window.buffer:
        try:
            msg = json.loads(raw.decode("utf-8"))
        except ValueError:
            continue
        if msg.get("interrupt"):
            _thread.interrupt_main()
        else:
            _inbox.put(msg)
    _inbox.put(None)   # the window has gone: end


def _next():
    """The next message, waiting so that Ctrl+C can interrupt; tkinter and turtle windows go on being drawn (as
    Python's own shell does while it waits for a line)."""
    while True:
        try:
            return _inbox.get(timeout=0.03)
        except queue.Empty:
            tk = sys.modules.get("tkinter")
            root = getattr(tk, "_default_root", None) if tk else None
            if root is not None:
                try:
                    root.update()
                except Exception:   # the window was closed
                    pass


# MICROLAB_HIDDEN (the app's tests): a tkinter or turtle window is made but never shown, and never takes focus
_HIDDEN = os.environ.get("MICROLAB_HIDDEN") == "1"


def _watch_tk():
    """Once tkinter is imported, each window it makes tells the window, and comes to the front — a window from
    another process can open behind MicroLab, where the student wouldn't see it (F-93, screen 31c)."""
    tk = sys.modules.get("tkinter")
    if tk is None or getattr(tk, "_microlab", False) or not hasattr(tk, "Tk"):
        return
    tk._microlab = True
    made = tk.Tk.__init__

    def init(self, *args, **kwargs):
        made(self, *args, **kwargs)
        try:
            if _HIDDEN:
                self.withdraw()
            else:
                self.lift()
                self.attributes("-topmost", True)
                self.after(400, lambda: self.attributes("-topmost", False))
                self.focus_force()
        except Exception:
            pass
        send({"window": True})

    tk.Tk.__init__ = init


_import = builtins.__import__


def _importing(name, *args, **kwargs):
    module = _import(name, *args, **kwargs)
    if "tkinter" in sys.modules:
        _watch_tk()
    return module


def _window_closed(exc):
    """The turtle window was closed while the program drew (closed by the student, or by turtle.bye()): turtle raises
    turtle.Terminator, or tkinter's "invalid command name" for its gone canvas. The program ends quietly, as when the
    window is closed at the end."""
    if type(exc).__name__ == "Terminator" and type(exc).__module__ == "turtle":
        return True
    if type(exc).__name__ != "TclError" or not str(exc).startswith(("invalid command name", "can't invoke")):
        return False
    return any(os.path.basename(f.filename) == "turtle.py" for f in traceback.extract_tb(exc.__traceback__))


def _input(prompt=""):
    if prompt:
        sys.stdout.write(str(prompt))
    send({"input": True})
    msg = _next()
    if msg is None:
        raise EOFError
    return msg.get("line", "")


class _Stdin(io.TextIOBase):
    """sys.stdin for the program: a line is what the window sends, as input() takes it."""

    def readable(self):
        return True

    def readline(self, size=-1):
        send({"input": True})
        msg = _next()
        return "" if msg is None else msg.get("line", "") + "\n"

    def read(self, size=-1):
        return self.readline()


def _where(exc, file):
    """The error's type, message, and the line in the student's file (or <stdin>) where it happened."""
    # the message as CPython prints it, with its hints ("Did you mean: 'print'?")
    last = list(traceback.TracebackException.from_exception(exc).format_exception_only())[-1].strip()
    message = last.split(": ", 1)[1] if ": " in last else str(exc)
    info = {"type": type(exc).__name__, "message": message, "file": file, "line": None}
    if isinstance(exc, SyntaxError):
        info["message"] = exc.msg
        info["line"] = exc.lineno
        if exc.filename:
            info["file"] = exc.filename
        return info
    for frame in traceback.extract_tb(exc.__traceback__):
        if frame.filename == file:
            info["line"] = frame.lineno
    if info["line"] is None:   # in a library or a module of its own: its last frame outside the runner
        frames = [f for f in traceback.extract_tb(exc.__traceback__) if os.path.abspath(f.filename) != _RUNNER]
        if frames:
            info["file"], info["line"] = frames[-1].filename, frames[-1].lineno
    return info


def _print_error(exc):
    """The traceback as CPython prints it, without the runner's own frames."""
    tb = exc.__traceback__
    while tb is not None and os.path.abspath(tb.tb_frame.f_code.co_filename) == _RUNNER:
        tb = tb.tb_next
    sys.stderr.write("".join(traceback.format_exception(type(exc), exc, tb)))


def run(code, file, cwd):
    """The file as __main__, in its folder; how it ended. Returns its names, for the shell."""
    if cwd:
        os.chdir(cwd)
        sys.path.insert(0, cwd)
    sys.argv = [file]
    names = {"__name__": "__main__", "__file__": file, "__builtins__": builtins}
    # the editor's text is the file's (it may not be saved): tracebacks show its lines, as for a file on disk
    linecache.cache[file] = (len(code), None, code.splitlines(True), file)
    try:
        exec(compile(code, file, "exec"), names)
        send({"ended": "done"})
    except SystemExit as e:
        if e.code not in (None, 0) and not isinstance(e.code, int):
            sys.stderr.write(f"{e.code}\n")
        send({"ended": "done"})
    except KeyboardInterrupt as e:
        _print_error(e)
        send({"ended": "stopped"})
    except BaseException as e:
        if _window_closed(e):
            send({"ended": "done"})
        else:
            _print_error(e)
            send({"ended": "error", "error": _where(e, file)})
    return names


def shell(names):
    """>>> in the program's names, as Python's own shell: a line runs as 'single' (an expression shows its repr); a
    block waits for its empty line; Ctrl+C stops a line that runs on, or the line being typed."""
    lines = []
    while True:
        send({"prompt": "... " if lines else ">>> "})
        try:
            msg = _next()
        except KeyboardInterrupt:
            lines = []
            sys.stderr.write("KeyboardInterrupt\n")
            continue
        if msg is None:
            return
        lines.append(msg.get("line", ""))
        try:
            code = codeop.compile_command("\n".join(lines), "<stdin>", "single")
        except (SyntaxError, OverflowError, ValueError) as e:
            lines = []
            sys.stderr.write("".join(traceback.format_exception_only(type(e), e)))
            send({"replError": _where(e, "<stdin>")})
            continue
        if code is None:
            continue
        lines = []
        try:
            exec(code, names)
        except SystemExit:
            return
        except BaseException as e:
            _print_error(e)
            if not isinstance(e, KeyboardInterrupt):
                send({"replError": _where(e, "<stdin>")})


def main():
    # started with -I (isolated: no PYTHON* settings, no user site, not this folder on the path); MicroLab's folder for
    # installed libraries comes as --libs, before the standard library
    if "--libs" in sys.argv:
        libs = sys.argv[sys.argv.index("--libs") + 1]
        os.makedirs(libs, exist_ok=True)
        sys.path.insert(0, libs)
    sys.stdout = _Stream("out")
    sys.stderr = _Stream("err")
    sys.stdin = _Stdin()
    builtins.input = _input
    builtins.__import__ = _importing
    threading.Thread(target=_reader, daemon=True).start()
    send({"ready": sys.version.split()[0]})
    try:
        msg = _next()
    except KeyboardInterrupt:
        return
    if not msg or "run" not in msg:
        return
    r = msg["run"]
    names = run(r.get("code", ""), r.get("file", "<untitled>"), r.get("cwd"))
    shell(names)


if __name__ == "__main__":
    main()
