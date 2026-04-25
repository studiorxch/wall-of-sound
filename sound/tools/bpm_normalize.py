#!/usr/bin/env python3
"""
0425_BPMNormalize_124_v1.0.0.py

Normalize audio to target BPM (124) with:
- tempo ratio analysis
- classification (CLEAN / FLEX / AMBIGUOUS)
- optional Finder labeling (only flags issues)
- safe file output (no overwrite)

Assumptions:
- macOS environment (Finder labels via xattr)
- librosa for BPM detection
"""

from pathlib import Path
import subprocess
from typing import Tuple

import librosa
import soundfile as sf
import numpy as np

# =========================
# CONFIG
# =========================

TARGET_BPM = 124.0

# classification thresholds
AMBIGUOUS_THRESHOLD = 1.25
FLEX_UPPER = 1.05
FLEX_LOWER = 0.95

# Finder label indices (macOS)
LABEL_RED = 2
LABEL_YELLOW = 4

OUTPUT_SUFFIX = "_bpm124"
SR = 22050


# =========================
# FINDER LABEL
# =========================

def set_finder_label(path: Path, label_index: int) -> None:
    """
    Apply Finder label using macOS xattr.
    Only used for problematic files (RED / YELLOW).
    """
    try:
        subprocess.run(
            ["xattr", "-w", "com.apple.FinderInfo", str(label_index), str(path)],
            check=False
        )
    except Exception:
        pass  # labeling is non-critical


# =========================
# BPM DETECTION
# =========================

def detect_bpm(path: Path) -> Tuple[float, np.ndarray]:
    """
    Load audio and estimate BPM.
    """
    y, sr = librosa.load(path, sr=SR, mono=True)
    tempo, _ = librosa.beat.beat_track(y=y, sr=sr)
    return tempo, y


# =========================
# TIME STRETCH
# =========================

def normalize_bpm(y: np.ndarray, original_bpm: float) -> Tuple[np.ndarray, float]:
    """
    Time-stretch audio to match TARGET_BPM.
    """
    if original_bpm <= 0:
        raise ValueError("Invalid BPM detected")

    ratio = TARGET_BPM / original_bpm

    y_stretched = librosa.effects.time_stretch(y, rate=ratio)

    return y_stretched, ratio


# =========================
# CLASSIFICATION
# =========================

def classify_ratio(ratio: float) -> str:
    if ratio > AMBIGUOUS_THRESHOLD:
        return "AMBIGUOUS"
    elif ratio > FLEX_UPPER or ratio < FLEX_LOWER:
        return "FLEX"
    else:
        return "CLEAN"


# =========================
# PROCESS FILE
# =========================

def process_file(input_path: Path, output_dir: Path) -> None:

    print(f"\n🎧 Processing: {input_path.name}")

    bpm, y = detect_bpm(input_path)

    print(f"Detected BPM: {bpm:.2f}")

    y_out, ratio = normalize_bpm(y, bpm)

    status = classify_ratio(ratio)

    output_path = output_dir / f"{input_path.stem}{OUTPUT_SUFFIX}.wav"

    sf.write(output_path, y_out, SR)

    print(f"Ratio: {ratio:.3f}")
    print(f"Status: {status}")
    print(f"Output → {output_path}")

    # =========================
    # LABELING (ONLY ISSUES)
    # =========================

    if status == "AMBIGUOUS":
        set_finder_label(output_path, LABEL_RED)
        print("🚨 Marked RED")
    elif status == "FLEX":
        set_finder_label(output_path, LABEL_YELLOW)
        print("⚠️ Marked YELLOW")
    # CLEAN → no label


# =========================
# RUN
# =========================

def run():

    input_dir = Path("./sound/raw")
    output_dir = Path("./sound/normalized")

    output_dir.mkdir(parents=True, exist_ok=True)

    files = list(input_dir.glob("*.wav"))

    if not files:
        print("❌ No .wav files found")
        return

    for f in files:
        try:
            process_file(f, output_dir)
        except Exception as e:
            print(f"❌ Failed: {f.name} → {e}")


if __name__ == "__main__":
    run()