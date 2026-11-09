"""MicroLab's help while typing Python 3 (M12 slice 5b, F-97): Jedi, in a process of its own kept ready by the main
process — never the student's program's. It answers, one JSON line each:

  {"id", "complete": {"code", "line", "column", "path"}}  -> {"id", "completions": [{"name", "type", "doc", "call"?}]}
  {"id", "signature": {"code", "line", "column", "path"}} -> {"id", "signature": {"name", "params", "active", "doc"} | null}

line is 1-based, column 0-based (Jedi's). Jedi and parso come from --tools; MicroLab's libraries (--libs) are on the
path it reads, so what is installed there completes too. Python's own modules are those of the Python this runs on.
"""
import json
import os
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


def script(req):
    path = req.get("path") or None
    folder = os.path.dirname(path) if path and os.path.isabs(path) else os.getcwd()
    project = jedi.Project(path=folder, added_sys_path=[_libs] if _libs else [], smart_sys_path=False)
    return jedi.Script(req.get("code", ""), path=path if path and os.path.isabs(path) else None, project=project,
                       environment=jedi.InterpreterEnvironment())


def complete(req):
    out = []
    for i, c in enumerate(script(req).complete(req["line"], req["column"])):
        if c.name.startswith("__") or (c.name.startswith("_") and not c.complete.startswith("_") and req.get("prefix", "") == ""):
            continue
        item = {"name": c.name, "type": KINDS.get(c.type, "variable")}
        if len(out) < DOCS:
            sig = ""
            if c.type in ("function", "class"):
                sigs = c.get_signatures()
                if sigs:
                    sig = sigs[0].to_string()
                    params = [p for p in sigs[0].params if p.name not in ("self", "cls")]
                    item["call"] = "args" if params else "empty"
            doc = short(c.docstring(raw=True)) if c.type != "keyword" else ""
            item["doc"] = (sig + "\n" + doc) if sig else doc
        elif c.type == "function":
            item["call"] = "args"
        out.append(item)
    return out


def signature(req):
    sigs = script(req).get_signatures(req["line"], req["column"])
    if not sigs:
        return None
    s = sigs[0]
    params = [p.to_string() for p in s.params if p.name not in ("self", "cls")]
    active = s.index if s.index is not None else -1
    if s.params and s.params[0].name in ("self", "cls") and active > 0:
        active -= 1
    return {"name": s.name, "params": params, "active": active, "doc": short(s.docstring(raw=True))}


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
