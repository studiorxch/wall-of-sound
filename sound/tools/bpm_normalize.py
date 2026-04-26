#!/usr/bin/env python3
"""
0425_BPMNormalize_124_v1.2.0

✔ BPM computed once per track (grouped slices)
✔ Stable librosa BPM extraction
✔ CSV + JSON export
✔ Consistent normalization across slices

Assumptions:
- Files follow naming: JUG-YYYYMMDD-XX-A.wav
- A/B/C are slices of same track
"""

from pathlib import Path
import csv
import json
from typing import Dict, List, Tuple

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

INPUT_DIR = Path("./data/sources/house")
OUTPUT_DIR = Path("./data/sources/house_124")
ANALYSIS_DIR = Path("./data/analysis")

CSV_PATH = ANALYSIS_DIR / "bpm_analysis.csv"
JSON_PATH = ANALYSIS_DIR / "bpm_analysis.json"


# =========================
# BPM DETECTION (SAFE)
# =========================

def detect_bpm(path: Path) -> float:
    try:
        y, sr = librosa.load(path, sr=SR, mono=True)
    except Exception:
        y, sr = sf.read(path)
        if len(y.shape) > 1:
            y = np.mean(y, axis=1)
        if sr != SR:
            y = librosa.resample(y, orig_sr=sr, target_sr=SR)
            sr = SR

    tempo, _ = librosa.beat.beat_track(y=y, sr=sr)

    # ensure scalar
    if isinstance(tempo, np.ndarray):
        if tempo.size == 0:
            raise ValueError("Empty tempo result")
        tempo = float(tempo.flatten()[0])
    else:
        tempo = float(tempo)

    return tempo


# =========================
# GROUP BY TRACK
# =========================

def group_by_track(files: List[Path]) -> Dict[str, List[Path]]:
    groups: Dict[str, List[Path]] = {}

    for f in files:
        # JUG-20260424-08-A → JUG-20260424-08
        parts = f.stem.split("-")
        track_id = "-".join(parts[:3])

        groups.setdefault(track_id, []).append(f)

    return groups


# =========================
# BPM RESOLUTION
# =========================

def resolve_bpm(raw_bpm: float) -> float:
    if raw_bpm <= 0:
        raise ValueError("Invalid BPM")

    bpm = raw_bpm

    while bpm < 80:
        bpm *= 2

    while bpm > 160:
        bpm /= 2

    return bpm


# =========================
# NORMALIZATION
# =========================

def normalize_audio(y: np.ndarray, bpm: float) -> Tuple[np.ndarray, float]:
    ratio = TARGET_BPM / bpm
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

def process_slice(path: Path, resolved_bpm: float) -> Dict:

    y, sr = librosa.load(path, sr=SR, mono=True)

    y_out, ratio = normalize_audio(y, resolved_bpm)
    status = classify_ratio(ratio)

    output_path = OUTPUT_DIR / f"{path.stem}{OUTPUT_SUFFIX}.wav"
    sf.write(output_path, y_out, SR)

    print(f"   ↳ {path.name}")
    print(f"     ratio: {ratio:.3f} | {status}")

    duration = get_duration(output_path)

    return {
        "file": str(output_path),
        "source": str(path),
        "resolved_bpm": round(resolved_bpm, 3),
        "target_bpm": TARGET_BPM,
        "ratio": round(ratio, 4),
        "status": status,
        "duration": duration
    }

# =========================
# BUILD TRACK METADATA
# =========================

def build_track_metadata(results):
    from pathlib import Path

    tracks = {}

    for r in results:
        stem = Path(r["source"]).stem
        parts = stem.split("-")

        # JUG-20260424-08-A → JUG-20260424-08
        track_id = "-".join(parts[:3])

        if track_id not in tracks:
            tracks[track_id] = {
                "id": track_id,
                "bpm": r["target_bpm"],
                "slices": []
            }

        label = parts[-1]  # A, B, etc.

        tracks[track_id]["slices"].append({
            "label": label,
            "file": r["file"],
            "status": r["status"]
        })

    # sort slices per track
    for t in tracks.values():
        t["slices"] = sorted(t["slices"], key=lambda x: x["label"])

    return {
        "tracks": list(tracks.values())
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

    groups = group_by_track(files)

    results: List[Dict] = []

    for track_id, group_files in groups.items():

        print(f"\n🎼 TRACK: {track_id}")

        try:
            raw_bpm = detect_bpm(group_files[0])
            resolved_bpm = resolve_bpm(raw_bpm)

            print(f"   BPM: {raw_bpm:.2f} → {resolved_bpm:.2f}")

            for f in group_files:
                results.append(process_slice(f, resolved_bpm))

        except Exception as e:
            print(f"❌ Failed track {track_id} → {e}")

    if not results:
        print("❌ No successful results")
        return

    # =========================
    # CSV
    # =========================

    with open(CSV_PATH, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=results[0].keys())
        writer.writeheader()
        writer.writerows(results)

    # =========================
    # JSON (FIXED HERE)
    # =========================

    metadata = build_track_metadata(results)

    with open(JSON_PATH, "w") as f:
        json.dump(metadata, f, indent=2)

    print(f"\n📊 CSV → {CSV_PATH}")
    print(f"🧠 JSON → {JSON_PATH}")

# =========================
# HELPER FUNCTIONS
# =========================

def get_duration(path: Path) -> float:
    """
    Fast duration extraction without decoding full audio
    """
    import soundfile as sf

    info = sf.info(path)
    return round(info.frames / info.samplerate, 4)


if __name__ == "__main__":
    run()