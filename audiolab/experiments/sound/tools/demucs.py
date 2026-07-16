#!/usr/bin/env python3
"""
0423_AUDIO_DemucsSeparator_v1.1.0

- Takes sliced audio from data/slices/
- Runs Demucs separation
- Outputs stems to data/stems/_temp/htdemucs/
- One folder per slice:
    slice_000/
      drums.wav
      bass.wav
      other.wav
      vocals.wav
"""

import subprocess
from pathlib import Path
import shutil

# =========================
# CONFIG
# =========================

BASE_DIR = Path("./data")

INPUT_DIR = BASE_DIR / "slices"
OUTPUT_DIR = BASE_DIR / "stems"
TEMP_DIR = OUTPUT_DIR / "_temp"

MODEL = "htdemucs"

TEMP_DIR.mkdir(parents=True, exist_ok=True)

# =========================
# RUN DEMUCS
# =========================

def run_demucs(file_path: Path):
    cmd = [
        "demucs",
        "-n", MODEL,
        "--float32",
        "-o", str(TEMP_DIR),
        str(file_path)
    ]

    try:
        subprocess.run(cmd, check=True)
        print(f"[OK] {file_path.name}")
        return True
    except subprocess.CalledProcessError:
        print(f"[FAIL] {file_path.name}")
        return False

# =========================
# MOVE OUTPUT
# =========================

def move_outputs(file_path: Path):
    slice_name = file_path.stem  # JUG-..._slice_002

    # demucs output path
    demucs_dir = TEMP_DIR / MODEL / slice_name

    if not demucs_dir.exists():
        print(f"[WARN] Missing output for {slice_name}")
        return

    # target: normalize to slice_XXX
    try:
        slice_index = slice_name.split("_slice_")[1]
    except IndexError:
        print(f"[WARN] Bad slice format: {slice_name}")
        return

    target_dir = TEMP_DIR / MODEL / f"slice_{slice_index}"
    target_dir.mkdir(parents=True, exist_ok=True)

    for stem_file in demucs_dir.glob("*.wav"):
        target_file = target_dir / stem_file.name

        # overwrite safely
        shutil.copy2(stem_file, target_file)

    # optional cleanup (comment out if you want to keep raw demucs folders)
    shutil.rmtree(demucs_dir, ignore_errors=True)

# =========================
# PROCESS ALL
# =========================

def process_all():
    slice_files = list(INPUT_DIR.glob("**/*.wav"))

    print(f"[INFO] Found {len(slice_files)} slices")

    for file_path in slice_files:
        if run_demucs(file_path):
            move_outputs(file_path)

# =========================
# MAIN
# =========================

if __name__ == "__main__":
    process_all()