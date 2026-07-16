#!/bin/bash

source venv/bin/activate

echo "🎧 STEP 1 — slicing"
python tools/slicer.py

echo "🎚 STEP 2 — BPM normalize"
python tools/bpm_normalize.py

echo "🧩 STEP 3 — stem separation"
python tools/demucs.py

echo "✅ DONE"


