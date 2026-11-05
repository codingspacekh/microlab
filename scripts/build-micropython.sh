#!/bin/sh
# Builds MicroLab's MicroPython for WebAssembly (docs/acceptance/M0.md, Decision; vendor/micropython/README.md).
# Needs git and a running Docker (Docker Desktop or Colima). Writes vendor/micropython/micropython.{mjs,wasm}.
# Only needed when the pinned MicroPython version or the variant changes — the built files are kept in the repo.
set -eu

MP_TAG=v1.29.0
EMSDK_IMAGE=emscripten/emsdk:6.0.13

ROOT=$(cd "$(dirname "$0")/.." && pwd)
VENDOR="$ROOT/vendor/micropython"
VARIANT=${VARIANT:-microlab}       # a folder in vendor/micropython/variant/
OUT=${OUT:-$VENDOR}                # where the built files go
WORK="$ROOT/.cache/micropython-$MP_TAG"

if [ ! -d "$WORK/.git" ]; then
  git clone --quiet --depth 1 --branch "$MP_TAG" https://github.com/micropython/micropython.git "$WORK"
fi
cd "$WORK"
git checkout --quiet -- .
git clean -fdxq ports/webassembly mpy-cross
git apply "$VENDOR/microlab.patch"
# The frozen manifest tooling needs micropython-lib, even for the asyncio-only manifest.
git submodule update --quiet --init --depth 1 lib/micropython-lib

docker run --rm \
  -v "$WORK":/src -v "$VENDOR/variant":/variant:ro -w /src \
  -e VARIANT="$VARIANT" "$EMSDK_IMAGE" \
  sh -c 'make -C mpy-cross -j4 && make -C ports/webassembly VARIANT_DIR=/variant/$VARIANT -j4'

mkdir -p "$OUT"
cp "ports/webassembly/build-$VARIANT/micropython.mjs" "ports/webassembly/build-$VARIANT/micropython.wasm" "$OUT/"
echo "Built MicroPython $MP_TAG ($EMSDK_IMAGE, variant $VARIANT) → $OUT"
ls -l "$OUT/micropython.mjs" "$OUT/micropython.wasm"
