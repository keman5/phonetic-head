#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
if command -v go >/dev/null 2>&1; then go clean -cache; fi
rm -rf .artifacts ../.artifacts
if ! python3 ../refine_surface.py --check; then
  "${BLENDER_BIN:-/Applications/Blender.app/Contents/MacOS/Blender}" --background --python-exit-code 1 --python ../refine_surface.py
fi
python3 ../refine_surface.py --check
node build-classroom-models.mjs
