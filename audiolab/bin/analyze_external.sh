#!/usr/bin/env zsh
# analyze_external.sh — AudioLab external track analyzer
#
# Folder/file mode:
#   ./audiolab/bin/analyze_external.sh /path/to/audio/folder
#   ./audiolab/bin/analyze_external.sh file1.flac file2.mp3
#   ./audiolab/bin/analyze_external.sh /path/to/folder --skip-existing
#
# Manifest mode (MUSIC-exported CSV):
#   ./audiolab/bin/analyze_external.sh --manifest /path/to/music_external_missing.csv
#   ./audiolab/bin/analyze_external.sh --manifest /path/to/music_external_manifest.csv --missing-only
#   ./audiolab/bin/analyze_external.sh --manifest /path/to/manifest.csv --force
#
# Output is written to audiolab/output/ (JSON, CSV, report).
# Import latest.csv into MUSIC via External → Coverage → Import AudioLab CSV.

set -euo pipefail

SCRIPT_DIR="${0:A:h}"
AUDIOLAB_DIR="${SCRIPT_DIR:h}"
REPO_ROOT="${AUDIOLAB_DIR:h}"
VENV_DIR="$AUDIOLAB_DIR/.venv"
ANALYZER="$AUDIOLAB_DIR/tools/analyze_audio.py"
REQUIREMENTS="$AUDIOLAB_DIR/requirements.txt"

if [[ $# -eq 0 ]]; then
  echo "Usage:"
  echo "  analyze_external.sh <folder_or_files...>              # folder/file mode"
  echo "  analyze_external.sh --manifest /path/to/missing.csv  # manifest mode"
  echo ""
  echo "Examples:"
  echo "  ./audiolab/bin/analyze_external.sh /Volumes/Music/External"
  echo "  ./audiolab/bin/analyze_external.sh track1.flac track2.mp3"
  echo "  ./audiolab/bin/analyze_external.sh --manifest ~/Downloads/music_external_missing.csv"
  exit 1
fi

# ── Venv setup ────────────────────────────────────────────────────────────────

if [[ ! -d "$VENV_DIR" ]]; then
  echo "Creating Python venv at $VENV_DIR..."
  python3 -m venv "$VENV_DIR"
fi

# Check if requirements are installed
if [[ ! -f "$VENV_DIR/.installed" ]] || ! diff -q "$REQUIREMENTS" "$VENV_DIR/.installed" >/dev/null 2>&1; then
  echo "Installing dependencies..."
  "$VENV_DIR/bin/pip" install --quiet --upgrade pip
  "$VENV_DIR/bin/pip" install --quiet -r "$REQUIREMENTS"
  cp "$REQUIREMENTS" "$VENV_DIR/.installed"
  echo "Dependencies ready."
fi

# ── Run analyzer ──────────────────────────────────────────────────────────────

echo ""
exec "$VENV_DIR/bin/python" "$ANALYZER" "$@"
