#!/usr/bin/env python3
"""
0425_BPMNormalize_124_v1.1.0

Adds:
- raw_bpm vs resolved_bpm
- CSV export
- JSON export (for engine)
- safe + deterministic BPM resolution

Environment:
- macOS
- librosa
- soundfile
"""

from pathlib import Path
import subprocess
import csv
import json
from typing import Tuple, Dict, List

import librosa
import soundfile as sf
import numpy as np


# =========================
# CONFIG
# =========================

TARGET_BPM = 124.0

AMBIGUOUS_THRESHOLD = 1.25
FLEX_UPPER = 1.05
FLEX_LOWER = 0.95

OUTPUT_SUFFIX = "_bpm124"
SR = 22050

# paths
INPUT_DIR = Path("./data/sources/house")
OUTPUT_DIR = Path("./data/sources/house_124")
ANALYSIS_DIR = Path("./data/analysis")

CSV_PATH = ANALYSIS_DIR / "bpm_analysis.csv"
JSON_PATH = ANALYSIS_DIR / "bpm_analysis.json"


# =========================
# HELPERS
# =========================

def detect_bpm(path: Path) -> Tuple[float, np.ndarray]:
    y, sr = librosa.load(path, sr=SR, mono=True)
    tempo, _ = librosa.beat.beat_track(y=y, sr=sr)
    return float(tempo), y


def resolve_bpm(raw_bpm: float) -> float:
    """
    Resolve BPM ambiguity (half/double time)
    """
    candidates = [
        raw_bpm,
        raw_bpm * 2,
        raw_bpm / 2,
        raw_bpm * 4,
        raw_bpm / 4
    ]

    return min(candidates, key=lambda x: abs(x - TARGET_BPM))


def normalize_audio(y: np.ndarray, resolved_bpm: float) -> Tuple[np.ndarray, float]:
    ratio = TARGET_BPM / resolved_bpm
    y_out = librosa.effects.time_stretch(y, rate=ratio)
    return y_out, ratio


def classify_ratio(ratio: float) -> str:
    if ratio > AMBIGUOUS_THRESHOLD:
        return "AMBIGUOUS"
    elif ratio > FLEX_UPPER or ratio < FLEX_LOWER:
        return "FLEX"
    return "CLEAN"


# =========================
# PROCESS
# =========================

def process_file(path: Path) -> Dict:

    raw_bpm, y = detect_bpm(path)
    resolved_bpm = resolve_bpm(raw_bpm)

    y_out, ratio = normalize_audio(y, resolved_bpm)

    status = classify_ratio(ratio)

    output_path = OUTPUT_DIR / f"{path.stem}{OUTPUT_SUFFIX}.wav"
    sf.write(output_path, y_out, SR)

    print(f"\n🎧 {path.name}")
    print(f"raw: {raw_bpm:.2f} | resolved: {resolved_bpm:.2f}")
    print(f"ratio: {ratio:.3f} | {status}")

    return {
        "file": str(output_path),
        "source": str(path),
        "raw_bpm": round(raw_bpm, 3),
        "resolved_bpm": round(resolved_bpm, 3),
        "target_bpm": TARGET_BPM,
        "ratio": round(ratio, 4),
        "status": status
    }


# =========================
# RUN
# =========================

def run():

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    ANALYSIS_DIR.mkdir(parents=True, exist_ok=True)

    files = list(INPUT_DIR.glob("*.wav"))

    if not files:
        print("❌ No files found")
        return

    results: List[Dict] = []

    for f in files:
        try:
            results.append(process_file(f))
        except Exception as e:
            print(f"❌ Failed: {f.name} → {e}")

    # =========================
    # CSV
    # =========================

    with open(CSV_PATH, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=results[0].keys())
        writer.writeheader()
        writer.writerows(results)

    # =========================
    # JSON (engine-ready)
    # =========================

    with open(JSON_PATH, "w") as f:
        json.dump(results, f, indent=2)

    print(f"\n📊 CSV → {CSV_PATH}")
    print(f"🧠 JSON → {JSON_PATH}")


if __name__ == "__main__":
    run()