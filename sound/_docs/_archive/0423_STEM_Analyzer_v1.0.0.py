#!/usr/bin/env python3
"""
0423_STEM_Analyzer_v1.0.0

StudioRich Loop Analyzer
- Scans loop directory
- Extracts audio features
- Outputs JSON metadata per file

Dependencies:
pip install librosa numpy soundfile tqdm
"""

import json
from pathlib import Path
import numpy as np
import librosa
from tqdm import tqdm

# =========================
# CONFIG
# =========================

INPUT_DIR = Path("/Users/studio/loops")  # <-- change if needed
OUTPUT_JSON = Path("/Users/studio/loops/metadata.json")

TARGET_SR = 22050


# =========================
# FEATURE EXTRACTION
# =========================

def analyze_audio(file_path: Path) -> dict:
    try:
        y, sr = librosa.load(file_path, sr=TARGET_SR, mono=True)

        duration = librosa.get_duration(y=y, sr=sr)

        # RMS (loudness)
        rms = np.mean(librosa.feature.rms(y=y))

        # Onset detection
        onset_frames = librosa.onset.onset_detect(y=y, sr=sr)
        onset_density = len(onset_frames) / duration if duration > 0 else 0

        # Spectral centroid (brightness)
        centroid = np.mean(librosa.feature.spectral_centroid(y=y, sr=sr))

        # Zero crossing rate (texture/noise)
        zcr = np.mean(librosa.feature.zero_crossing_rate(y))

        # Harmonic vs percussive
        y_harm, y_perc = librosa.effects.hpss(y)
        harm_energy = np.sum(np.abs(y_harm))
        perc_energy = np.sum(np.abs(y_perc))

        harmony_ratio = (
            harm_energy / (harm_energy + perc_energy)
            if (harm_energy + perc_energy) > 0 else 0
        )

        # Normalize features
        rms_n = np.clip(rms * 10, 0, 1)
        onset_n = np.clip(onset_density / 10, 0, 1)
        centroid_n = np.clip(centroid / 5000, 0, 1)

        # ENERGY CALCULATION
        energy = np.clip(
            (rms_n * 0.5) +
            (onset_n * 0.3) +
            (centroid_n * 0.2),
            0, 1
        )

        return {
            "duration": round(duration, 2),
            "loudness": round(float(rms), 5),
            "onset_density": round(float(onset_density), 3),
            "brightness": round(float(centroid_n), 3),
            "texture": round(float(zcr), 3),
            "harmony_ratio": round(float(harmony_ratio), 3),
            "energy": round(float(energy), 3)
        }

    except Exception as e:
        print(f"[ERROR] {file_path.name}: {e}")
        return None


# =========================
# MAIN PROCESS
# =========================

def process_all():
    supported_ext = [".wav", ".mp3", ".flac", ".aiff", ".m4a"]

    files = [
        f for f in INPUT_DIR.iterdir()
        if f.suffix.lower() in supported_ext
    ]

    if not files:
        print("[INFO] No audio files found.")
        return

    print(f"[INFO] Processing {len(files)} files...\n")

    results = []

    for file_path in tqdm(files):
        data = analyze_audio(file_path)

        if data:
            entry = {
                "id": file_path.stem,
                "file": str(file_path.name),

                # placeholders
                "section": None,
                "behavior": "loop",
                "genre": [],

                # features
                **data
            }

            results.append(entry)

    # save JSON
    with open(OUTPUT_JSON, "w") as f:
        json.dump(results, f, indent=2)

    print(f"\n✅ Metadata saved → {OUTPUT_JSON}")


# =========================
# ENTRY
# =========================

if __name__ == "__main__":
    process_all()