#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
mode="${1:-volume}"
if [[ $# -gt 0 ]]; then shift; fi
case "$mode" in
  volume) python3 normalize_audio.py; exit ;;
  lessons) python3 normalize_audio.py; .audio-venv/bin/python generate-curriculum-audio.py ;;
  all) .audio-venv/bin/python generate-audio.py; .audio-venv/bin/python generate-curriculum-audio.py ;;
  natural) ;;
  *) echo "Usage: bash build.sh {volume|lessons|natural|all}" >&2; exit 2 ;;
esac
python_bin="${AUDIO_PYTHON:-python3.12}"
if [[ ! -x .audio-neural/venv/bin/python ]]; then
  "$python_bin" -m venv .audio-neural/venv
fi
.audio-neural/venv/bin/python -m pip install --disable-pip-version-check 'kokoro-onnx==0.6.1' 'soundfile==0.13.1'
fetch_model() {
  local name="$1" checksum="$2"
  if [[ ! -f ".audio-neural/$name" ]]; then
    curl --fail --location --silent --show-error --continue-at - --retry 2 --max-time 1200 "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.1/$name" -o ".audio-neural/$name.tmp"
    echo "$checksum  .audio-neural/$name.tmp" | shasum -a 256 -c -
    mv ".audio-neural/$name.tmp" ".audio-neural/$name"
  fi
  echo "$checksum  .audio-neural/$name" | shasum -a 256 -c -
}
fetch_model kokoro-v1.0.onnx beb0d1848dee9a49da392cc3df26958d46cfa35d321edf434f52949153f0df3a
fetch_model voices-v1.0.bin bca610b8308e8d99f32e6fe4197e7ec01679264efed0cac9140fe9c29f1fbf7d
.audio-neural/venv/bin/python generate-natural-audio.py "$@"
