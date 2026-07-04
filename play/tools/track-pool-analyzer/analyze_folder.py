#!/usr/bin/env python3
"""
0618B_PLAY_TrackPoolAnalyzer_v1.0.0
Scans a folder of audio files and exports a Flow Curve Builder-compatible CSV.
"""

import argparse
import csv
import os
import sys
import warnings
from pathlib import Path

warnings.filterwarnings("ignore")

SUPPORTED_EXTENSIONS = {".mp3", ".wav", ".aiff", ".aif", ".flac", ".m4a", ".ogg"}

ANALYSIS_VERSION = "0618B_v1.0.0"

CSV_HEADER = [
    "title", "artist", "bpm", "camelotKey", "durationSeconds", "energy", "filePath",
    "actual_bpm", "bpm_confidence", "actual_key", "key_confidence", "camelot",
    "tempo_family", "energy_score", "energy_level", "rms_mean", "rms_peak",
    "dynamic_range", "onset_density", "transient_density", "spectral_centroid",
    "spectral_rolloff", "zero_crossing_rate", "brightness", "density",
    "sample_rate", "channels", "beats_detected", "analysis_version",
]

# ── Camelot mapping ─────────────────────────────────────────────────────────

CAMELOT_MAP = {
    "a minor": "8A",  "e minor": "9A",  "b minor": "10A",
    "f# minor": "11A", "f♯ minor": "11A", "gb minor": "11A",
    "c# minor": "12A", "c♯ minor": "12A", "db minor": "12A",
    "g# minor": "1A",  "g♯ minor": "1A",  "ab minor": "1A",
    "d# minor": "2A",  "d♯ minor": "2A",  "eb minor": "2A",
    "a# minor": "3A",  "a♯ minor": "3A",  "bb minor": "3A",
    "f minor": "4A",
    "c minor": "5A",
    "g minor": "6A",
    "d minor": "7A",
    "c major": "8B",
    "g major": "9B",
    "d major": "10B",
    "a major": "11B",
    "e major": "12B",
    "b major": "1B",
    "f# major": "2B",  "f♯ major": "2B",  "gb major": "2B",
    "c# major": "3B",  "c♯ major": "3B",  "db major": "3B",
    "g# major": "4B",  "g♯ major": "4B",  "ab major": "4B",
    "d# major": "5B",  "d♯ major": "5B",  "eb major": "5B",
    "a# major": "6B",  "a♯ major": "6B",  "bb major": "6B",
    "f major": "7B",
}

PITCH_CLASSES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]


def pitch_class_to_key_string(pitch_idx: int, is_major: bool) -> str:
    name = PITCH_CLASSES[pitch_idx % 12]
    mode = "major" if is_major else "minor"
    return f"{name} {mode}"


def key_string_to_camelot(key_str: str) -> str:
    normalized = key_str.lower().strip()
    return CAMELOT_MAP.get(normalized, "")


# ── Metadata extraction ──────────────────────────────────────────────────────

def extract_tags(filepath: Path, artist_fallback: str):
    """Return (title, artist) from embedded tags or filename."""
    title = ""
    artist = ""

    try:
        from mutagen import File as MutagenFile
        f = MutagenFile(str(filepath), easy=True)
        if f:
            title = str(f.get("title", [""])[0]).strip()
            artist = str(f.get("artist", [""])[0]).strip()
    except Exception:
        pass

    if not title or not artist:
        stem = filepath.stem
        if " - " in stem:
            parts = stem.split(" - ", 1)
            if not artist:
                artist = parts[0].strip()
            if not title:
                title = parts[1].strip()
        else:
            if not title:
                title = stem

    if not artist:
        artist = artist_fallback

    return title, artist


def extract_file_info(filepath: Path):
    """Return (duration_seconds, sample_rate, channels) using soundfile then librosa."""
    try:
        import soundfile as sf
        info = sf.info(str(filepath))
        return info.duration, info.samplerate, info.channels
    except Exception:
        pass

    try:
        import librosa
        dur = librosa.get_duration(path=str(filepath))
        return dur, None, None
    except Exception:
        return None, None, None


# ── BPM detection ────────────────────────────────────────────────────────────

BPM_MIN = 70
BPM_MAX = 150


def normalize_bpm(bpm: float) -> tuple[float, str]:
    """Return (corrected_bpm, note) with half/double-time cleanup."""
    if bpm < BPM_MIN:
        doubled = bpm * 2
        if BPM_MIN <= doubled <= BPM_MAX:
            return doubled, "doubled"
        # Try again
        if doubled < BPM_MIN:
            return bpm * 4, "quadrupled"
    if bpm > BPM_MAX:
        halved = bpm / 2
        if BPM_MIN <= halved <= BPM_MAX:
            return halved, "halved"
    return bpm, "original"


def tempo_family(bpm: float) -> str:
    if bpm < 80:
        return "slow"
    if bpm <= 105:
        return "low_mid"
    if bpm <= 124:
        return "mid"
    if bpm <= 140:
        return "dance"
    return "fast"


def detect_bpm(y, sr) -> tuple[float, float, int, float]:
    """Returns (bpm, bpm_confidence, beats_detected, raw_bpm)."""
    import librosa
    import numpy as np

    tempo, beat_frames = librosa.beat.beat_track(y=y, sr=sr)
    raw_bpm = float(np.atleast_1d(tempo)[0])
    beats_detected = len(beat_frames)

    corrected_bpm, _ = normalize_bpm(raw_bpm)

    # Confidence: ratio of detected beats to expected beats
    duration_min = len(y) / sr / 60
    expected_beats = corrected_bpm * duration_min
    bpm_confidence = min(1.0, beats_detected / max(1, expected_beats)) if expected_beats > 0 else 0.0
    bpm_confidence = round(float(bpm_confidence), 3)

    return round(corrected_bpm, 2), bpm_confidence, beats_detected, raw_bpm


# ── Key detection ─────────────────────────────────────────────────────────────

def detect_key(y, sr) -> tuple[str, str, float]:
    """Returns (actual_key, camelot, key_confidence)."""
    import librosa
    import numpy as np

    chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
    chroma_mean = chroma.mean(axis=1)

    # Krumhansl-Schmuckler key profiles
    major_profile = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
    minor_profile = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])

    def correlate_profile(chroma_vals, profile):
        scores = []
        for shift in range(12):
            shifted = np.roll(profile, shift)
            corr = np.corrcoef(chroma_vals, shifted)[0, 1]
            scores.append(float(corr) if not np.isnan(corr) else 0.0)
        return scores

    major_scores = correlate_profile(chroma_mean, major_profile)
    minor_scores = correlate_profile(chroma_mean, minor_profile)

    best_major_idx = int(np.argmax(major_scores))
    best_minor_idx = int(np.argmax(minor_scores))
    best_major_score = major_scores[best_major_idx]
    best_minor_score = minor_scores[best_minor_idx]

    if best_major_score >= best_minor_score:
        pitch_idx = best_major_idx
        is_major = True
        best_score = best_major_score
        all_scores = major_scores
    else:
        pitch_idx = best_minor_idx
        is_major = False
        best_score = best_minor_score
        all_scores = minor_scores

    sorted_scores = sorted(all_scores, reverse=True)
    second_best = sorted_scores[1] if len(sorted_scores) > 1 else 0.0
    confidence = round(float(best_score - second_best), 3)
    confidence = max(0.0, min(1.0, confidence))

    actual_key = pitch_class_to_key_string(pitch_idx, is_major)
    camelot = key_string_to_camelot(actual_key)

    return actual_key, camelot, confidence


# ── Energy engine ─────────────────────────────────────────────────────────────

def compute_energy_metrics(y, sr, bpm: float, all_bpms_context=None):
    """Returns a dict of all energy-related fields."""
    import librosa
    import numpy as np

    # RMS
    rms = librosa.feature.rms(y=y)[0]
    rms_mean = float(np.mean(rms))
    rms_peak = float(np.max(rms))
    dynamic_range = float(rms_peak - np.min(rms[rms > 0])) if np.any(rms > 0) else 0.0

    # Onsets
    onset_frames = librosa.onset.onset_detect(y=y, sr=sr)
    duration_min = len(y) / sr / 60.0
    onset_density = float(len(onset_frames) / max(duration_min, 0.01))

    # Transient density (onset strength mean)
    onset_env = librosa.onset.onset_strength(y=y, sr=sr)
    transient_density = float(np.mean(onset_env))

    # Spectral
    spec_centroid = librosa.feature.spectral_centroid(y=y, sr=sr)[0]
    spectral_centroid = float(np.mean(spec_centroid))

    spec_rolloff = librosa.feature.spectral_rolloff(y=y, sr=sr, roll_percent=0.85)[0]
    spectral_rolloff = float(np.mean(spec_rolloff))

    zcr = librosa.feature.zero_crossing_rate(y)[0]
    zero_crossing_rate = float(np.mean(zcr))

    # Normalized derived
    brightness = min(1.0, spectral_centroid / (sr / 2.0))
    density = min(1.0, onset_density / 300.0)  # 300 onsets/min as ceiling

    return {
        "rms_mean": round(rms_mean, 6),
        "rms_peak": round(rms_peak, 6),
        "dynamic_range": round(dynamic_range, 6),
        "onset_density": round(onset_density, 3),
        "transient_density": round(transient_density, 6),
        "spectral_centroid": round(spectral_centroid, 3),
        "spectral_rolloff": round(spectral_rolloff, 3),
        "zero_crossing_rate": round(zero_crossing_rate, 6),
        "brightness": round(brightness, 4),
        "density": round(density, 4),
    }


def compute_energy_score(metrics: dict, bpm: float, batch_stats: dict) -> tuple[float, int, float]:
    """Returns (energy_score 0-100, energy_level 1-5, energy 0.0-1.0)."""
    def norm(val, lo, hi):
        if hi == lo:
            return 0.5
        return max(0.0, min(1.0, (val - lo) / (hi - lo)))

    n_rms = norm(metrics["rms_mean"], batch_stats.get("rms_min", 0), batch_stats.get("rms_max", 1))
    n_rms_peak = norm(metrics["rms_peak"], batch_stats.get("rms_peak_min", 0), batch_stats.get("rms_peak_max", 1))
    n_onset = norm(metrics["onset_density"], batch_stats.get("onset_min", 0), batch_stats.get("onset_max", 300))
    n_transient = norm(metrics["transient_density"], batch_stats.get("transient_min", 0), batch_stats.get("transient_max", 1))
    n_bpm = norm(bpm, 70, 150)
    n_brightness = metrics["brightness"]
    n_density = metrics["density"]

    score = (
        n_rms * 25 +
        n_rms_peak * 15 +
        n_onset * 15 +
        n_transient * 15 +
        n_bpm * 10 +
        n_brightness * 10 +
        n_density * 10
    )
    score = max(0.0, min(100.0, score))

    if score <= 20:
        level = 1
    elif score <= 40:
        level = 2
    elif score <= 60:
        level = 3
    elif score <= 80:
        level = 4
    else:
        level = 5

    return round(score, 2), level, round(score / 100.0, 4)


# ── File scanning ─────────────────────────────────────────────────────────────

def find_audio_files(root: Path, recursive: bool) -> list[Path]:
    if recursive:
        files = [p for p in root.rglob("*") if p.suffix.lower() in SUPPORTED_EXTENSIONS]
    else:
        files = [p for p in root.iterdir() if p.is_file() and p.suffix.lower() in SUPPORTED_EXTENSIONS]
    return sorted(files)


# ── Per-file analysis ─────────────────────────────────────────────────────────

def analyze_file(filepath: Path, artist_fallback: str) -> dict | None:
    """Analyze one audio file. Returns a result dict or None on failure."""
    import librosa

    # Tags
    title, artist = extract_tags(filepath, artist_fallback)

    # File info
    duration, sample_rate, channels = extract_file_info(filepath)
    if duration is None:
        raise ValueError("Could not read duration")

    # Load audio (mono, limited to first 90s for speed; full for short files)
    load_duration = min(duration, 90.0)
    y, sr = librosa.load(str(filepath), sr=None, mono=True, duration=load_duration)
    if sample_rate is None:
        sample_rate = sr
    if channels is None:
        channels = 1

    # BPM
    bpm, bpm_confidence, beats_detected, _ = detect_bpm(y, sr)

    # Key
    actual_key, camelot, key_confidence = detect_key(y, sr)

    # Energy metrics (will be normalized against batch later)
    metrics = compute_energy_metrics(y, sr, bpm)

    return {
        "title": title,
        "artist": artist,
        "duration": round(duration, 3),
        "sample_rate": sample_rate,
        "channels": channels,
        "filepath": str(filepath.resolve()),
        "bpm": bpm,
        "bpm_confidence": bpm_confidence,
        "beats_detected": beats_detected,
        "actual_key": actual_key,
        "camelot": camelot,
        "key_confidence": key_confidence,
        **metrics,
    }


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="0618B Track Pool Analyzer")
    parser.add_argument("--input", required=True, help="Path to audio folder")
    parser.add_argument("--output", default="real-track-pool.csv", help="Output CSV path")
    parser.add_argument("--recursive", default="true", help="Scan subfolders (true/false)")
    parser.add_argument("--artist-fallback", default="Unknown Artist")
    parser.add_argument("--analysis-version", default=ANALYSIS_VERSION)
    parser.add_argument("--overwrite", action="store_true")
    args = parser.parse_args()

    input_path = Path(args.input)
    output_path = Path(args.output)
    recursive = args.recursive.lower() != "false"

    if not input_path.exists() or not input_path.is_dir():
        print(f"ERROR: Input folder not found: {input_path}", file=sys.stderr)
        sys.exit(1)

    if output_path.exists() and not args.overwrite:
        print(f"ERROR: Output file exists: {output_path}. Use --overwrite to replace.", file=sys.stderr)
        sys.exit(1)

    print(f"\n0618B Track Pool Analyzer  ({args.analysis_version})")
    print(f"Scanning: {input_path}")
    print(f"Recursive: {recursive}\n")

    files = find_audio_files(input_path, recursive)
    print(f"Found {len(files)} audio file(s).\n")

    if not files:
        print("No supported audio files found.")
        sys.exit(0)

    # ── Pass 1: analyze each file ──────────────────────────────────────────
    raw_results = []
    failed = []

    try:
        from tqdm import tqdm
        iterator = tqdm(files, unit="track", ncols=72)
    except ImportError:
        iterator = files

    for filepath in iterator:
        try:
            result = analyze_file(filepath, args.artist_fallback)
            raw_results.append(result)
        except Exception as e:
            short = filepath.name
            print(f"\n  WARN: {short} — {e}")
            failed.append({"file": str(filepath), "error": str(e)})

    # ── Pass 2: compute batch normalization stats ──────────────────────────
    def batch_stat(key, fallback_lo=0.0, fallback_hi=1.0):
        vals = [r[key] for r in raw_results if key in r and r[key] is not None]
        if not vals:
            return fallback_lo, fallback_hi
        return min(vals), max(vals)

    batch_stats = {
        "rms_min":        batch_stat("rms_mean")[0],
        "rms_max":        batch_stat("rms_mean")[1],
        "rms_peak_min":   batch_stat("rms_peak")[0],
        "rms_peak_max":   batch_stat("rms_peak")[1],
        "onset_min":      batch_stat("onset_density")[0],
        "onset_max":      batch_stat("onset_density")[1],
        "transient_min":  batch_stat("transient_density")[0],
        "transient_max":  batch_stat("transient_density")[1],
    }

    # ── Pass 3: finalize and write CSV ─────────────────────────────────────
    rows_written = 0
    bpm_detected = 0
    key_detected = 0
    bpm_confidences = []
    key_confidences = []

    with open(output_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=CSV_HEADER)
        writer.writeheader()

        for r in raw_results:
            energy_score, energy_level, energy = compute_energy_score(r, r["bpm"], batch_stats)

            tf = tempo_family(r["bpm"])

            if r["bpm"] > 0:
                bpm_detected += 1
                bpm_confidences.append(r["bpm_confidence"])
            if r["camelot"]:
                key_detected += 1
                key_confidences.append(r["key_confidence"])

            row = {
                # Flow Curve Builder compat fields
                "title":           r["title"],
                "artist":          r["artist"],
                "bpm":             r["bpm"],
                "camelotKey":      r["camelot"],
                "durationSeconds": r["duration"],
                "energy":          energy,
                "filePath":        r["filepath"],
                # Analyzer fields
                "actual_bpm":          r["bpm"],
                "bpm_confidence":      r["bpm_confidence"],
                "actual_key":          r["actual_key"],
                "key_confidence":      r["key_confidence"],
                "camelot":             r["camelot"],
                "tempo_family":        tf,
                "energy_score":        energy_score,
                "energy_level":        energy_level,
                "rms_mean":            r["rms_mean"],
                "rms_peak":            r["rms_peak"],
                "dynamic_range":       r["dynamic_range"],
                "onset_density":       r["onset_density"],
                "transient_density":   r["transient_density"],
                "spectral_centroid":   r["spectral_centroid"],
                "spectral_rolloff":    r["spectral_rolloff"],
                "zero_crossing_rate":  r["zero_crossing_rate"],
                "brightness":          r["brightness"],
                "density":             r["density"],
                "sample_rate":         r["sample_rate"],
                "channels":            r["channels"],
                "beats_detected":      r["beats_detected"],
                "analysis_version":    args.analysis_version,
            }
            writer.writerow(row)
            rows_written += 1

    # ── Summary ───────────────────────────────────────────────────────────
    avg_bpm_conf = round(sum(bpm_confidences) / len(bpm_confidences), 3) if bpm_confidences else 0.0
    avg_key_conf = round(sum(key_confidences) / len(key_confidences), 3) if key_confidences else 0.0

    print(f"""
Track Pool Analyzer complete
  Total files scanned:    {len(files)}
  Valid audio files:      {len(raw_results)}
  Rows written:           {rows_written}
  Failed files:           {len(failed)}
  BPM detected:           {bpm_detected}
  Key detected:           {key_detected}
  Average BPM confidence: {avg_bpm_conf}
  Average key confidence: {avg_key_conf}
  Output CSV:             {output_path.resolve()}
""")

    if failed:
        print("Failed files:")
        for item in failed:
            print(f"  {item['file']}")
            print(f"    {item['error']}")


if __name__ == "__main__":
    main()
