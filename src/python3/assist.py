"""MicroLab's help while typing Python 3 (M12 slice 5b, F-97): Jedi, in a process of its own kept ready by the main
process — never the student's program's. It answers, one JSON line each:

  {"id", "complete": {"code", "line", "column", "path"}}  -> {"id", "completions": [{"name", "type", "doc", "call"?}]}
  {"id", "signature": {"code", "line", "column", "path"}} -> {"id", "signature": {"name", "params", "active", "doc"} | null}

line is 1-based, column 0-based (Jedi's). Jedi and parso come from --tools; MicroLab's libraries (--libs) are on the
path it reads, so what is installed there completes too. Python's own modules are those of the Python this runs on.
"""
import contextlib
import importlib
import io
import inspect
import json
import os
import re
import sys

_args = sys.argv[1:]
_tools = _args[_args.index("--tools") + 1] if "--tools" in _args else None
_libs = _args[_args.index("--libs") + 1] if "--libs" in _args else None
if _tools:
    sys.path.insert(0, _tools)

import jedi  # noqa: E402

KINDS = {"module": "namespace", "class": "class", "function": "function", "instance": "variable", "statement": "variable",
         "param": "variable", "keyword": "keyword", "property": "property", "path": "text"}
DOCS = 40          # the first names in the list carry their explanation; the rest only their kind
DOC_CHARS = 400


def short(text):
    """A docstring's first paragraph, without its signature line (shown apart)."""
    text = (text or "").strip()
    paras = [p.strip() for p in text.split("\n\n") if p.strip()]
    if len(paras) > 1 and "(" in paras[0].split("\n")[0] and paras[0].count("\n") == 0:
        paras = paras[1:]
    first = " ".join(paras[0].split()) if paras else ""
    return first[:DOC_CHARS] + ("…" if len(first) > DOC_CHARS else "")


def plain(param):
    """A parameter as students read it, without its type hint: 'x: tuple[float, float]' -> 'x', 'y: None=None' -> 'y=None'."""
    text = param.to_string()
    name = re.match(r"\s*(\*{0,2}\w*)", text).group(1)
    default = re.search(r"=\s*(.+)$", text)
    return name + ("=" + default.group(1).strip() if default and name and not name.startswith("*") else "")


def call(sig):
    """A call as students read it: name(a, b=1) — no type hints, no return type (typeshed's stubs have them)."""
    return f"{sig.name}({', '.join(plain(p) for p in sig.params if p.name not in ('self', 'cls'))})"


def explained(name):
    """What a name does: its docstring — from the module itself when Jedi read a stub (stubs have none)."""
    doc = name.docstring(raw=True)
    if not doc.strip():
        try:
            for real in name.goto(follow_imports=True, prefer_stubs=False):
                doc = real.docstring(raw=True)
                if doc.strip():
                    break
        except Exception:
            pass
    if not doc.strip():
        doc = from_python(name)
    return short(doc)


# Python's own modules whose import does something (opens a browser, prints): never imported for their explanations
_LOUD = {"antigravity", "this", "idlelib", "turtledemo", "tkinter.__main__", "__main__", "pydoc", "webbrowser"}


def from_python(name):
    """The docstring a name of one of Python's own modules really has, read from the module imported: some are made
    when the module runs (turtle's forward, goto… come from its classes), so neither the stub nor the code has it.
    Never an installed library's: its code is not run here."""
    module = name.module_name or ""
    top = module.split(".")[0]
    if not module or top not in getattr(sys, "stdlib_module_names", ()) or top in _LOUD or module in _LOUD:
        return ""
    full = name.full_name or ""
    if not full.startswith(module + "."):
        return ""
    try:
        with contextlib.redirect_stdout(io.StringIO()):   # what an import prints never reaches the window's channel
            obj = importlib.import_module(module)
        for part in full[len(module) + 1:].split("."):
            obj = getattr(obj, part)
        return inspect.getdoc(obj) or ""
    except Exception:
        return ""


def script(req):
    path = req.get("path") or None
    folder = os.path.dirname(path) if path and os.path.isabs(path) else os.getcwd()
    project = jedi.Project(path=folder, added_sys_path=[_libs] if _libs else [], smart_sys_path=False)
    return jedi.Script(req.get("code", ""), path=path if path and os.path.isabs(path) else None, project=project,
                       environment=jedi.InterpreterEnvironment())


ALIASES = 150      # names checked for being another name for a function (tkinter's pack = pack_configure)


def callable_of(c):
    """What a name calls: itself if a function or class; for an alias — tkinter's `pack = pack_configure`,
    `title = wm_title`, turtle's `fd = forward`, `done = mainloop` — the function it stands for; else None."""
    if c.type in ("function", "class"):
        return c
    if c.type != "statement":
        return None
    try:
        for d in c.infer():
            if d.type in ("function", "class"):
                return d
    except Exception:
        pass
    return None


def complete(req):
    lines = req.get("code", "").split("\n")
    here = lines[req["line"] - 1][:req["column"]] if 0 < req["line"] <= len(lines) else ""
    typed = re.search(r"\w*$", here).group(0)   # what is typed of the name, read from the code itself
    out = []
    for c in script(req).complete(req["line"], req["column"]):
        if c.name.startswith("_") and not typed.startswith("_"):   # a module's own names: only when _ is typed
            continue
        item = {"name": c.name, "type": KINDS.get(c.type, "variable")}
        target = callable_of(c) if len(out) < ALIASES else (c if c.type in ("function", "class") else None)
        if target is not None:
            item["type"] = KINDS[target.type]
        if len(out) < DOCS:
            sig = ""
            if target is not None:
                sigs = target.get_signatures()
                if sigs:
                    sig = f"{c.name}({call(sigs[0]).split('(', 1)[1]}"   # named as typed: pack(…), not pack_configure(…)
                    params = [p for p in sigs[0].params if p.name not in ("self", "cls")]
                    item["call"] = "args" if params else "empty"
                else:
                    item["call"] = "args"
            doc = explained(target or c) if c.type != "keyword" else ""
            item["doc"] = (sig + "\n" + doc) if sig else doc
        elif target is not None:
            item["call"] = "args"
        out.append(item)
    return out


def signature(req):
    sigs = script(req).get_signatures(req["line"], req["column"])
    if not sigs:
        return None
    s = sigs[0]
    params = [plain(p) for p in s.params if p.name not in ("self", "cls")]
    active = s.index if s.index is not None else -1
    if s.params and s.params[0].name in ("self", "cls") and active > 0:
        active -= 1
    return {"name": s.name, "params": params, "active": active, "doc": explained(s)}


def main():
    sys.stdout.write(json.dumps({"ready": True}) + "\n")
    sys.stdout.flush()
    for line in sys.stdin:
        try:
            req = json.loads(line)
        except ValueError:
            continue
        reply = {"id": req.get("id")}
        try:
            if "complete" in req:
                reply["completions"] = complete(req["complete"])
            elif "signature" in req:
                reply["signature"] = signature(req["signature"])
        except Exception as e:  # Jedi on code half typed: nothing to offer, never a crash
            reply["completions" if "complete" in req else "signature"] = [] if "complete" in req else None
            reply["problem"] = f"{type(e).__name__}: {e}"
        sys.stdout.write(json.dumps(reply) + "\n")
        sys.stdout.flush()


if __name__ == "__main__":
    main()
