#!/bin/zsh
# 0722C_MUSIC_Production_Stem_Export — repo-owned Demucs environment setup.
# Creates/verifies a DEDICATED venv (never the shell's active Python),
# installs pinned deps from the committed lock file, verifies ffmpeg, runs
# a lightweight engine check, warms the htdemucs model cache, and prints
# resolved versions + cache state.
#
# Usage:
#   /Users/studio/Projects/wall-of-sound/music/tools/stem-separator/setup.sh

set -euo pipefail

TOOL_DIR="$(cd "$(dirname "${0}")" && pwd)"
VENV_DIR="$TOOL_DIR/.venv"
REQUIREMENTS="$TOOL_DIR/requirements.lock.txt"
MODEL_CACHE_DIR="$TOOL_DIR/model-cache"

echo "== 0722C stem-separator setup =="
echo "Tool dir: $TOOL_DIR"

if [[ ! -d "$VENV_DIR" ]]; then
  echo "Creating venv at $VENV_DIR (python3.11)..."
  python3.11 -m venv "$VENV_DIR"
else
  echo "Reusing existing venv at $VENV_DIR"
fi

PYTHON="$VENV_DIR/bin/python"
"$PYTHON" -m pip install --quiet --upgrade pip
echo "Installing pinned dependencies from $REQUIREMENTS..."
"$PYTHON" -m pip install --quiet -r "$REQUIREMENTS"

echo ""
echo "== Verifying ffmpeg =="
if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "ERROR: ffmpeg not found on PATH. Install it (e.g. 'brew install ffmpeg') and re-run this script." >&2
  exit 1
fi
FFMPEG_VERSION="$(ffmpeg -version | head -n1)"
echo "$FFMPEG_VERSION"

echo ""
echo "== Lightweight engine check =="
"$PYTHON" -c "
import torch, torchaudio, demucs
print('python  :', __import__('sys').version.split()[0])
print('torch   :', torch.__version__)
print('torchaudio:', torchaudio.__version__)
print('demucs  :', demucs.__version__)
print('mps     :', torch.backends.mps.is_available())
"

echo ""
echo "== Warming htdemucs model cache =="
mkdir -p "$MODEL_CACHE_DIR"
TORCH_HOME="$MODEL_CACHE_DIR" HF_HOME="$MODEL_CACHE_DIR" "$PYTHON" -c "
from demucs.pretrained import get_model
get_model('htdemucs')
print('htdemucs model ready.')
"

CACHE_STATE="empty"
if [[ -n "$(ls -A "$MODEL_CACHE_DIR" 2>/dev/null)" ]]; then
  CACHE_STATE="populated"
fi

echo ""
echo "== Summary =="
echo "python executable : $PYTHON"
echo "model             : htdemucs"
echo "ffmpeg            : $FFMPEG_VERSION"
echo "model cache       : $CACHE_STATE ($MODEL_CACHE_DIR)"
echo "Setup complete."
