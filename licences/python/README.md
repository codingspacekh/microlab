# The bundled Python's licences

The licence texts of CPython 3.13.18 and of every library it is built with, as python-build-standalone 20261026
ships them in its *full* builds (`python/licenses/`, the same for macOS x86_64 and Windows x86_64; the
`install_only` builds MicroLab ships leave them out). Taken once from
`cpython-3.13.18+20261026-x86_64-apple-darwin-pgo+lto-full.tar.zst` (SHA-256 `3b07eb16…28feb`) and
`cpython-3.13.18+20261026-x86_64-pc-windows-msvc-pgo-full.tar.zst` (SHA-256 `cc35b06b…f3157`), checked against the
release's SHA256SUMS. Licences used (PYTHON.json): Python-2.0 and CNRI-Python (CPython); 0BSD, Apache-2.0,
BSD-2-Clause, BSD-3-Clause, MIT, TCL, X11, Zlib, bzip2-1.0.6 (its libraries). `npm run licences` puts them in
THIRD_PARTY_LICENSES.txt. A new Python release: take them again.
