#!/bin/zsh
# run_audio_analyzer.sh — robust version (no errexit)

VENV_DIR="$HOME/Library/Application Support/AudioAnalyzer/venv"
SCRIPT="$HOME/Scripts/audio/analyze/analyze_audio.py"
OUT_TXT="$HOME/Desktop/Track Analysis.txt"
LOG_DIR="$HOME/Library/Logs"
LOG_FILE="$LOG_DIR/AudioAnalyzer.log"
TMPFILE="$HOME/Library/Application Support/AudioAnalyzer/last_results.txt"

mkdir -p "$(dirname "$VENV_DIR")" "$LOG_DIR" "$(dirname "$TMPFILE")"

# Optional: turn on tracing while we debug. Comment out later.
# set -x

# Keep site-packages clean
export PYTHONNOUSERSITE=1

# Ensure Python 3 exists
if ! /usr/bin/env python3 -V >/dev/null 2>&1; then
  echo "Python 3 not found. Install Xcode CLTs or Python 3." | tee "$OUT_TXT"
  exit 1
fi

# Create venv and install deps if needed
if [ ! -d "$VENV_DIR" ]; then
  /usr/bin/env python3 -m venv "$VENV_DIR"
  "$VENV_DIR/bin/python" -m pip install --upgrade pip setuptools wheel >>"$LOG_FILE" 2>&1
  # Pinning versions helps avoid build issues. Adjust if you like.
  "$VENV_DIR/bin/pip" install \
    "numpy==1.26.4" "scipy==1.11.4" "soundfile==0.12.1" \
    "audioread==3.0.1" "librosa==0.10.2.post1" >>"$LOG_FILE" 2>&1
fi

# Run analyzer and CAPTURE STDERR; DO NOT exit on failure
RESULTS="$("$VENV_DIR/bin/python" "$SCRIPT" "$@" 2>&1)"
PYEXIT=$?

# Always write outputs (even on error)
printf "%s\n" "$RESULTS" > "$OUT_TXT"
printf "%s\n" "$RESULTS" > "$TMPFILE"
printf "%s" "$RESULTS" | pbcopy

# Also log the run
{
  echo "========== $(date) =========="
  echo "Inputs:"
  for f in "$@"; do echo "  - $f"; done
  echo
  echo "$RESULTS"
  echo "Exit code: $PYEXIT"
  echo
} >>"$LOG_FILE"

# Optional dialogs (skip if you just want silent runs)
if command -v osascript >/dev/null 2>&1; then
  if [ $PYEXIT -ne 0 ]; then
    osascript -e 'display notification "Analyzer failed. Details saved to Desktop." with title "Analyze Audio → BPM/Key"'
  else
    osascript -e 'display notification "Analysis complete. Results copied to clipboard." with title "Analyze Audio → BPM/Key"'
  fi
  osascript -e 'tell application "System Events" to display dialog (do shell script "cat " & quoted form of "'"$TMPFILE"'") buttons {"OK"} default button "OK" with title "Track Analysis"'
fi

# Print results to STDOUT so Automator can use Option B if desired
echo "$RESULTS"
