#!/usr/bin/env python3
"""
0424_AUDIO_JUG_SLICER_v1.4.0

Adds:
- Zero-crossing alignment (critical for playback smoothness)
- Break detection
- Transition hinting
"""

import json
from pathlib import Path
from typing import List, Dict

import numpy as np
import librosa
import soundfile as sf

# =========================
# CONFIG
# =========================

BASE_DIR = Path("./data")

GENRE = "house_124"

INPUT_DIR = BASE_DIR / "sources" / GENRE
OUTPUT_DIR = BASE_DIR / "slices" / GENRE
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

BPM = 124
BARS_PER_SLICE = 8
SR = 22050

VALID_EXTENSIONS = {".wav", ".mp3", ".flac", ".aif", ".aiff", ".m4a"}

ZERO_CROSS_WINDOW = 2048  # 🔥 search window

# =========================
# TIMING
# =========================

SECONDS_PER_BEAT = 60 / BPM
SECONDS_PER_BAR = SECONDS_PER_BEAT * 4
SLICE_DURATION = SECONDS_PER_BAR * BARS_PER_SLICE

# =========================
# HELPERS
# =========================

def is_valid_audio(file: Path) -> bool:
    return file.suffix.lower() in VALID_EXTENSIONS and not file.name.startswith(".")


def analyze_energy(y_slice: np.ndarray) -> float:
    rms = np.sqrt(np.mean(y_slice**2))
    return float(min(rms * 10, 1.0))


def detect_break(y_slice: np.ndarray) -> bool:
    energy = analyze_energy(y_slice)
    return energy < 0.25  # 🔥 low energy = break candidate


def classify_groove(energy: float) -> str:
    if energy > 0.6:
        return "steady"
    elif energy > 0.3:
        return "swing"
    return "loose"


def classify_section(idx: int, total: int) -> str:
    ratio = idx / max(total, 1)

    if ratio < 0.2:
        return "intro"
    elif ratio < 0.4:
        return "build"
    elif ratio < 0.7:
        return "peak"
    elif ratio < 0.9:
        return "release"
    return "outro"

# =========================
# 🔥 ZERO-CROSS ALIGNMENT
# =========================

def find_nearest_zero_crossing(y, target_sample):
    start = max(0, target_sample - ZERO_CROSS_WINDOW)
    end = min(len(y), target_sample + ZERO_CROSS_WINDOW)

    segment = y[start:end]

    zero_crossings = np.where(np.diff(np.sign(segment)))[0]

    if len(zero_crossings) == 0:
        return target_sample

    closest = zero_crossings[np.argmin(np.abs(zero_crossings - (target_sample - start)))]

    return start + closest

# =========================
# CORE SLICER
# =========================

def slice_track(file_path: Path) -> List[Dict]:
    y, sr = librosa.load(file_path, sr=SR, mono=True)
    duration = librosa.get_duration(y=y, sr=sr)

    track_id = file_path.stem
    track_dir = OUTPUT_DIR / track_id
    track_dir.mkdir(exist_ok=True)

    slices = []
    total_slices = int(np.ceil(duration / SLICE_DURATION))

    start = 0.0
    idx = 0

    while start < duration:
        end = min(start + SLICE_DURATION, duration)

        start_sample = int(start * sr)
        end_sample = int(end * sr)

        # 🔥 ZERO-CROSS FIX
        start_sample = find_nearest_zero_crossing(y, start_sample)
        end_sample = find_nearest_zero_crossing(y, end_sample)

        y_slice = y[start_sample:end_sample]
        actual_duration = (end_sample - start_sample) / sr

        if actual_duration < SLICE_DURATION * 0.9:
            break

        slice_name = f"{track_id}_slice_{idx:03}.wav"
        slice_path = track_dir / slice_name

        sf.write(slice_path, y_slice, sr)

        energy = analyze_energy(y_slice)
        groove = classify_groove(energy)
        section = classify_section(idx, total_slices)
        is_break = detect_break(y_slice)

        slices.append({
            "id": f"{track_id}_slice_{idx:03}",
            "track_id": track_id,
            "file": str(slice_path.relative_to(BASE_DIR)),

            "start": round(start, 2),
            "end": round(end, 2),
            "duration": round(actual_duration, 2),

            "energy": round(energy, 3),
            "groove": groove,
            "section": section,
            "key": None,

            "phrase_index": idx,

            # 🔥 NEW
            "is_break": is_break,
            "can_follow": idx + 1,

            "role": None,
            "behavior": "loop",
            "stem": "full",

            "auto_flag": None
        })

        start = end
        idx += 1

    return slices

# =========================
# MAIN
# =========================

def main():
    all_slices: List[Dict] = []

    for file in INPUT_DIR.iterdir():
        if not is_valid_audio(file):
            continue

        print(f"Processing: {file.name}")

        try:
            slices = slice_track(file)
            all_slices.extend(slices)
        except Exception as e:
            print(f"⚠️ Skipping {file.name} → {e}")

    output_path = BASE_DIR / "analysis" / f"{GENRE}_metadata.json"
    output_path.parent.mkdir(exist_ok=True)

    with open(output_path, "w") as f:
        json.dump(all_slices, f, indent=2)

    print(f"\n✅ Metadata saved → {output_path}")
    print(f"🎧 Total slices: {len(all_slices)}")

if __name__ == "__main__":
    main()