#!/usr/bin/env python3
"""MUSIC External File Analysis Pipeline.

Analyzes audio files for the External library and writes BPM, key, energy,
duration, suggested mood, and mechanism fields back to the index JSON.

Usage:
  python3 tools/music_analyze_external_library.py --dry-run
  python3 tools/music_analyze_external_library.py --limit 5 --write
  python3 tools/music_analyze_external_library.py --write
  python3 tools/music_analyze_external_library.py --force --write
  python3 tools/music_analyze_external_library.py --selected <id1> <id2> --write
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import warnings
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

# Suppress librosa verbosity
warnings.filterwarnings("ignore", category=UserWarning)
os.environ.setdefault("NUMBA_CACHE_DIR", "/tmp/numba_cache")

REPO_ROOT = Path("/Users/studio/Projects/wall-of-sound")
EXTERNAL_LIBRARY_FILE = REPO_ROOT / "library" / "music" / "external" / "library.index.json"
CACHE_FILE = REPO_ROOT / "music" / "cache" / "audio-analysis" / "external-analysis-cache.json"
REPORT_FILE = REPO_ROOT / "music" / "reports" / "MUSIC_external_file_analysis_report.md"
ANALYSIS_VERSION = "music-analysis-v1.0.0"

PROTECTED_FIELDS = {"title", "artist", "filePath", "fileName", "sourceUrl", "mood", "rating", "notes", "manualTags",
                    "trackId", "sourceOwner", "sourceLibrary", "status", "originalTitle", "originalArtist",
                    "artistRepairSource", "artistRepairConfidence", "titleRepairSource", "titleRepairConfidence",
                    "trackNumber"}

# Camelot wheel: (major, minor) note names indexed 1–12
_CAMELOT: dict[tuple[int, bool], str] = {
    (0, False): "8B", (0, True): "5A",
    (1, False): "3B", (1, True): "12A",
    (2, False): "10B", (2, True): "7A",
    (3, False): "5B", (3, True): "2A",
    (4, False): "12B", (4, True): "9A",
    (5, False): "7B", (5, True): "4A",
    (6, False): "2B", (6, True): "11A",
    (7, False): "9B", (7, True): "6A",
    (8, False): "4B", (8, True): "1A",
    (9, False): "11B", (9, True): "8A",
    (10, False): "6B", (10, True): "3A",
    (11, False): "1B", (11, True): "10A",
}
_NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]


# ---------------------------------------------------------------------------
# Analysis result
# ---------------------------------------------------------------------------

@dataclass
class AudioAnalysis:
    track_id: str
    source_path: str
    status: str  # analyzed | partial | failed | skipped
    error: str = ""

    duration_sec: float | None = None
    sample_rate: int | None = None
    channels: int | None = None

    bpm: float | None = None
    bpm_confidence: float | None = None
    bpm_alternates: list[float] = field(default_factory=list)

    key: str | None = None          # e.g. "C#"
    key_mode: str | None = None     # "major" | "minor"
    key_camelot: str | None = None  # e.g. "8A"
    key_confidence: float | None = None

    energy: float | None = None         # 0–1 normalised RMS
    loudness_lufs: float | None = None  # approx LUFS
    spectral_centroid: float | None = None
    spectral_rolloff: float | None = None
    zero_crossing_rate: float | None = None
    dynamic_range_db: float | None = None

    suggested_mood: list[str] = field(default_factory=list)
    suggested_mood_source: str = "audio-analysis"
    mechanism: list[str] = field(default_factory=list)

    analyzed_at: str = ""
    analysis_version: str = ANALYSIS_VERSION


# ---------------------------------------------------------------------------
# Cache
# ---------------------------------------------------------------------------

def load_cache(path: Path) -> dict:
    if path.exists():
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {}


def cache_key(source_path: str) -> dict:
    p = Path(source_path)
    if not p.exists():
        return {}
    stat = p.stat()
    return {
        "sourcePath": source_path,
        "fileSizeBytes": stat.st_size,
        "mtimeMs": int(stat.st_mtime * 1000),
        "analysisVersion": ANALYSIS_VERSION,
    }


def cache_matches(ck: dict, stored: dict) -> bool:
    if not ck or not stored:
        return False
    return (
        ck["fileSizeBytes"] == stored.get("fileSizeBytes")
        and ck["mtimeMs"] == stored.get("mtimeMs")
        and ck["analysisVersion"] == stored.get("analysisVersion")
    )


def save_cache(path: Path, cache: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(cache, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


# ---------------------------------------------------------------------------
# Audio feature extraction
# ---------------------------------------------------------------------------

def analyze_file(track_id: str, source_path: str) -> AudioAnalysis:
    result = AudioAnalysis(track_id=track_id, source_path=source_path, status="pending",
                           analyzed_at=datetime.now(timezone.utc).isoformat(timespec="seconds"))
    p = Path(source_path)
    if not p.exists():
        result.status = "failed"
        result.error = "file not found"
        return result

    try:
        import librosa
        import numpy as np

        # Load mono for analysis (full file for duration, truncate for heavy analysis)
        y_full, sr = librosa.load(source_path, sr=None, mono=True)
        duration = len(y_full) / sr
        result.duration_sec = round(duration, 2)
        result.sample_rate = sr

        # Check channel count via soundfile (doesn't resample)
        try:
            import soundfile as sf
            info = sf.info(source_path)
            result.channels = info.channels
        except Exception:
            result.channels = 1

        # Use up to 90s for heavy analysis to keep it fast
        analysis_frames = min(len(y_full), int(sr * 90))
        y = y_full[:analysis_frames]

        # BPM
        tempo, beats = librosa.beat.beat_track(y=y, sr=sr)
        raw_bpm = float(tempo[0]) if hasattr(tempo, '__len__') else float(tempo)
        bpm_conf = min(len(beats) / max(1, duration / 2), 1.0)  # rough confidence from beat density
        bpm_conf = round(min(bpm_conf, 0.95), 3)

        alternates: list[float] = []
        bpm = raw_bpm
        if bpm < 60:
            alternates.append(round(bpm * 2, 2))
            bpm = round(bpm * 2, 2)
        elif bpm > 180:
            alternates.append(round(bpm / 2, 2))
            bpm = round(bpm / 2, 2)
        alternates.append(round(raw_bpm * 2, 2))
        alternates.append(round(raw_bpm / 2, 2))
        alternates = sorted(set(round(a, 2) for a in alternates if a != bpm))[:3]

        result.bpm = round(bpm, 2)
        result.bpm_confidence = bpm_conf
        result.bpm_alternates = alternates

        # Key
        chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
        chroma_mean = chroma.mean(axis=1)
        key_idx = int(np.argmax(chroma_mean))
        # Compare major vs minor profile
        major_profile = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
        minor_profile = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])

        def profile_score(chroma_vec: np.ndarray, profile: np.ndarray, root: int) -> float:
            shifted = np.roll(profile, root)
            norm_c = chroma_vec / (np.linalg.norm(chroma_vec) + 1e-8)
            norm_p = shifted / (np.linalg.norm(shifted) + 1e-8)
            return float(np.dot(norm_c, norm_p))

        best_score = -1.0
        best_root = 0
        best_minor = False
        for root in range(12):
            for is_minor, prof in [(False, major_profile), (True, minor_profile)]:
                score = profile_score(chroma_mean, prof, root)
                if score > best_score:
                    best_score = score
                    best_root = root
                    best_minor = is_minor

        key_conf = round(min((best_score + 1) / 2, 0.95), 3)
        result.key = _NOTE_NAMES[best_root]
        result.key_mode = "minor" if best_minor else "major"
        result.key_camelot = _CAMELOT.get((best_root, best_minor))
        result.key_confidence = key_conf

        # RMS energy
        rms = librosa.feature.rms(y=y)[0]
        rms_mean = float(np.mean(rms))
        rms_max = float(np.max(rms)) if np.max(rms) > 0 else 1.0
        result.energy = round(float(rms_mean / rms_max), 4)

        # Loudness approx (RMS → LUFS approximation)
        rms_global = float(np.sqrt(np.mean(y_full ** 2)))
        result.loudness_lufs = round(20 * np.log10(rms_global + 1e-10), 1)

        # Spectral features (on short window for speed)
        y_short = y_full[:min(len(y_full), int(sr * 30))]
        sc = librosa.feature.spectral_centroid(y=y_short, sr=sr)[0]
        result.spectral_centroid = round(float(np.mean(sc)), 1)

        sr_feat = librosa.feature.spectral_rolloff(y=y_short, sr=sr, roll_percent=0.85)[0]
        result.spectral_rolloff = round(float(np.mean(sr_feat)), 1)

        zcr = librosa.feature.zero_crossing_rate(y_short)[0]
        result.zero_crossing_rate = round(float(np.mean(zcr)), 5)

        # Dynamic range
        percentile_high = float(np.percentile(np.abs(y_full), 99))
        percentile_low = float(np.percentile(np.abs(y_full[y_full != 0]), 10)) if any(y_full != 0) else 1e-10
        result.dynamic_range_db = round(20 * np.log10((percentile_high + 1e-10) / (percentile_low + 1e-10)), 1)

        # Mood and mechanism inference
        result.suggested_mood = _infer_mood(result)
        result.mechanism = _infer_mechanism(result)

        # Determine status
        required = [result.duration_sec, result.bpm, result.energy]
        result.status = "analyzed" if all(v is not None for v in required) else "partial"
        if result.bpm_confidence is not None and result.bpm_confidence < 0.4:
            result.status = "partial"

    except Exception as e:
        result.status = "failed"
        result.error = str(e)[:200]

    return result


# ---------------------------------------------------------------------------
# Inference rules
# ---------------------------------------------------------------------------

def _infer_mood(a: AudioAnalysis) -> list[str]:
    moods: list[str] = []
    sc = a.spectral_centroid or 0
    energy = a.energy or 0
    zcr = a.zero_crossing_rate or 0
    dr = a.dynamic_range_db or 0

    if energy < 0.25:
        moods.append("restrained")
    elif energy > 0.65:
        moods.append("intense")

    if sc < 1500:
        moods.append("dark")
    elif sc > 4000:
        moods.append("bright")

    if zcr < 0.03:
        moods.append("smooth")
    elif zcr > 0.12:
        moods.append("abrasive")

    minor_mode = a.key_mode == "minor"
    if minor_mode and energy < 0.35:
        moods.append("melancholic")
    elif not minor_mode and energy > 0.4:
        moods.append("warm")

    if dr is not None and dr < 8:
        moods.append("hypnotic")

    # Derive nocturnal / late-night
    if "dark" in moods and "restrained" in moods:
        moods.append("nocturnal")

    return moods[:4]


def _infer_mechanism(a: AudioAnalysis) -> list[str]:
    mechanisms: list[str] = []
    sc = a.spectral_centroid or 0
    energy = a.energy or 0
    zcr = a.zero_crossing_rate or 0
    dr = a.dynamic_range_db or 0
    bpm = a.bpm or 0

    # Sub-pressure: low centroid + restrained energy
    if sc < 1200 and energy < 0.4:
        mechanisms.append("sub-pressure")

    # Repetition-grid: stable tempo, low dynamic variance
    if a.bpm_confidence is not None and a.bpm_confidence > 0.6 and dr is not None and dr < 10:
        mechanisms.append("repetition-grid")

    # Negative-space: sparse transients, low ZCR
    if zcr < 0.025 and energy < 0.3:
        mechanisms.append("negative-space")

    # Field-texture: high noise floor (wide dynamic, low ZCR)
    if zcr < 0.04 and sc < 2000 and dr is not None and dr > 15:
        mechanisms.append("field-texture")

    # Low-contrast-groove: restrained energy + stable pulse
    if energy < 0.35 and a.bpm_confidence is not None and a.bpm_confidence > 0.5:
        mechanisms.append("low-contrast-groove")

    # Filter-motion: mid centroid fluctuation
    if 1500 < sc < 3500 and energy < 0.5:
        mechanisms.append("filter-motion")

    # Dub-space: slow BPM + low centroid
    if bpm < 95 and sc < 2500:
        mechanisms.append("dub-space")

    # Machine-swing: medium BPM + moderate ZCR
    if 100 < bpm < 140 and 0.04 < zcr < 0.10:
        mechanisms.append("machine-swing")

    # Micro-loop: tight BPM confidence + very low dynamic range
    if a.bpm_confidence is not None and a.bpm_confidence > 0.7 and dr is not None and dr < 6:
        mechanisms.append("micro-loop")

    return mechanisms[:4]


# ---------------------------------------------------------------------------
# Record patching
# ---------------------------------------------------------------------------

def patch_record(record: dict, analysis: AudioAnalysis, *, force: bool) -> bool:
    """Write analysis fields into record. Returns True if anything changed."""
    changed = False

    def set_field(key: str, value: Any) -> None:
        nonlocal changed
        if key in PROTECTED_FIELDS:
            return
        if value is None:
            return
        # Don't overwrite unless force or current value is placeholder
        current = record.get(key)
        if not force and current is not None and current != "" and current != 0 and current != [] and current != "1A":
            return
        if record.get(key) != value:
            record[key] = value
            changed = True

    if analysis.status == "failed":
        set_field("analysisStatus", "failed")
        set_field("analysisError", analysis.error)
        return changed

    set_field("durationSeconds", analysis.duration_sec)
    set_field("bpm", analysis.bpm)
    set_field("bpmConfidence", analysis.bpm_confidence)
    set_field("bpmAlternates", analysis.bpm_alternates)

    # Key: only write if confidence is acceptable; clear placeholder "1A"
    if analysis.key_confidence is not None and analysis.key_confidence >= 0.45:
        set_field("camelotKey", analysis.key_camelot)
        set_field("keyNote", analysis.key)
        set_field("keyMode", analysis.key_mode)
        set_field("keyConfidence", analysis.key_confidence)
    elif record.get("camelotKey") == "1A":
        # Clear the placeholder — show nothing rather than a fake value
        record["camelotKey"] = None
        changed = True

    set_field("energy", analysis.energy)
    set_field("loudnessLufs", analysis.loudness_lufs)
    set_field("spectralCentroid", analysis.spectral_centroid)
    set_field("spectralRolloff", analysis.spectral_rolloff)
    set_field("zeroCrossingRate", analysis.zero_crossing_rate)
    set_field("dynamicRangeDb", analysis.dynamic_range_db)

    if analysis.suggested_mood:
        set_field("suggestedMood", analysis.suggested_mood)
        set_field("suggestedMoodSource", analysis.suggested_mood_source)

    if analysis.mechanism:
        set_field("mechanism", analysis.mechanism)

    # Analysis provenance fields always update (never user-confirmed values)
    for k, v in [
        ("analysisStatus", analysis.status),
        ("analysisVersion", analysis.analysis_version),
        ("analysisSource", "local-audio-analysis"),
        ("analyzedAt", analysis.analyzed_at),
    ]:
        if record.get(k) != v:
            record[k] = v
            changed = True

    # Clear any error from a previous failed run
    if "analysisError" in record and analysis.status != "failed":
        del record["analysisError"]
        changed = True

    return changed


# ---------------------------------------------------------------------------
# Report
# ---------------------------------------------------------------------------

def count_field(records: list[dict], field_name: str) -> int:
    def filled(v: Any) -> bool:
        if v is None or v == "" or v == [] or v == 0 or v == "1A":
            return False
        return True
    return sum(1 for r in records if filled(r.get(field_name)))


def write_report(
    records: list[dict],
    analyses: list[AudioAnalysis],
    before_counts: dict[str, int],
    write_mode: bool,
) -> None:
    now = datetime.now().isoformat(timespec="seconds")
    by_status: dict[str, list[AudioAnalysis]] = {}
    for a in analyses:
        by_status.setdefault(a.status, []).append(a)

    n_already = sum(1 for r in records if r.get("analysisStatus") == "analyzed" and r not in
                    [a.track_id for a in analyses])

    REPORT_FILE.parent.mkdir(parents=True, exist_ok=True)
    lines = [
        "# MUSIC External File Analysis Report",
        "",
        f"Generated: {now}",
        f"Mode: {'WRITE' if write_mode else 'DRY-RUN'}",
        f"Analysis version: {ANALYSIS_VERSION}",
        "",
        "## Summary",
        "",
        f"- External records discovered: {len(records)}",
        f"- Source files found: {sum(1 for r in records if Path(str(r.get('filePath') or '')).exists())}",
        f"- Already analyzed (cached): {sum(1 for a in analyses if a.status == 'skipped')}",
        f"- Newly analyzed: {sum(1 for a in analyses if a.status in ('analyzed', 'partial'))}",
        f"- Partial: {len(by_status.get('partial', []))}",
        f"- Failed: {len(by_status.get('failed', []))}",
        f"- Skipped: {len(by_status.get('skipped', []))}",
        "",
        "## Field Coverage",
        "",
        "| Field | Before | After |",
        "|---|---:|---:|",
    ]

    field_map = [
        ("durationSeconds", "durationSeconds"),
        ("bpm", "bpm"),
        ("camelotKey", "camelotKey"),
        ("energy", "energy"),
        ("suggestedMood", "suggestedMood"),
        ("mechanism", "mechanism"),
    ]
    for label, fname in field_map:
        before = before_counts.get(fname, 0)
        after = count_field(records, fname)
        lines.append(f"| `{label}` | {before} | {after} |")

    failed = by_status.get("failed", [])
    if failed:
        lines.extend(["", "## Failed Records", ""])
        for a in failed:
            lines.append(f"- `{Path(a.source_path).name}`: {a.error}")
    else:
        lines.extend(["", "## Failed Records", "", "None."])

    # Review needed: low confidence
    review = [a for a in analyses if a.bpm_confidence is not None and a.bpm_confidence < 0.5
              and a.status != "failed"]
    if review:
        lines.extend(["", "## Review Needed", "",
                      "| Row | Title | Reason |",
                      "|---|---|---|"])
        id_to_rec = {r.get("trackId"): r for r in records}
        for a in review:
            rec = id_to_rec.get(a.track_id, {})
            title = rec.get("title", "?")
            artist = rec.get("artist", "?")
            lines.append(f"| — | {artist} — {title} | low BPM confidence ({a.bpm_confidence:.2f}) |")

    REPORT_FILE.write_text("\n".join(lines) + "\n", encoding="utf-8")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description="MUSIC External File Analysis Pipeline.")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--write", action="store_true")
    parser.add_argument("--force", action="store_true", help="Re-analyze even if cached")
    parser.add_argument("--limit", type=int, default=0, help="Max tracks to analyze this run")
    parser.add_argument("--selected", nargs="+", metavar="ID", help="Analyze specific track IDs only")
    args = parser.parse_args()

    if args.dry_run == args.write:
        raise SystemExit("Choose exactly one of --dry-run or --write.")

    # Load library
    records: list[dict] = json.loads(EXTERNAL_LIBRARY_FILE.read_text(encoding="utf-8"))
    print(f"External records: {len(records)}")

    # Load cache
    cache = load_cache(CACHE_FILE)

    # Snapshot field coverage before
    before_counts = {fname: count_field(records, fname) for _, fname in [
        ("durationSeconds", "durationSeconds"), ("bpm", "bpm"), ("camelotKey", "camelotKey"),
        ("energy", "energy"), ("suggestedMood", "suggestedMood"), ("mechanism", "mechanism"),
    ]}

    # Determine which records to analyze
    selected_ids = set(args.selected) if args.selected else None
    to_analyze: list[dict] = []
    skipped_cached = 0

    for rec in records:
        tid = str(rec.get("trackId") or "")
        if selected_ids and tid not in selected_ids:
            continue
        fp = str(rec.get("filePath") or "")
        if not fp or not Path(fp).exists():
            continue
        # Skip if already analyzed and cache matches (unless --force)
        if not args.force and rec.get("analysisStatus") == "analyzed":
            ck = cache_key(fp)
            stored = cache.get(fp, {})
            if cache_matches(ck, stored):
                skipped_cached += 1
                continue
        to_analyze.append(rec)

    if args.limit:
        to_analyze = to_analyze[:args.limit]

    total_files = sum(1 for r in records if Path(str(r.get("filePath") or "")).exists())
    print(f"Source files found: {total_files}")
    print(f"Already analyzed (cached): {skipped_cached}")
    print(f"To analyze this run: {len(to_analyze)}")

    if args.dry_run:
        missing = [r for r in records if not Path(str(r.get("filePath") or "")).exists()]
        if missing:
            print(f"Missing files: {len(missing)}")
            for r in missing[:5]:
                print(f"  {r.get('title')} — {r.get('filePath')}")
        analyses = [AudioAnalysis(track_id=str(r.get("trackId") or ""), source_path=str(r.get("filePath") or ""),
                                  status="skipped") for r in to_analyze]
        write_report(records, analyses, before_counts, write_mode=False)
        print(f"\nDry-run complete. Report: {REPORT_FILE}")
        return

    # Write mode — analyze
    analyses: list[AudioAnalysis] = []
    id_to_rec = {str(r.get("trackId") or ""): r for r in records}

    for i, rec in enumerate(to_analyze, 1):
        fp = str(rec.get("filePath") or "")
        tid = str(rec.get("trackId") or "")
        title = rec.get("title", "?")
        print(f"  [{i}/{len(to_analyze)}] {title[:50]}…", end=" ", flush=True)

        a = analyze_file(tid, fp)
        analyses.append(a)

        if a.status == "failed":
            print(f"FAILED: {a.error}")
        else:
            print(f"{a.status} — {a.duration_sec:.1f}s, {a.bpm} BPM, {a.key_camelot}, energy={a.energy}")

        patch_record(rec, a, force=args.force)

        # Update cache
        if a.status in ("analyzed", "partial"):
            ck = cache_key(fp)
            if ck:
                cache[fp] = {**ck, "result": {
                    "status": a.status,
                    "bpm": a.bpm,
                    "key_camelot": a.key_camelot,
                    "energy": a.energy,
                    "duration_sec": a.duration_sec,
                }}

    # Write updated library
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup = EXTERNAL_LIBRARY_FILE.with_suffix(f".json.bak_{stamp}")
    shutil.copy2(EXTERNAL_LIBRARY_FILE, backup)
    EXTERNAL_LIBRARY_FILE.write_text(json.dumps(records, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    save_cache(CACHE_FILE, cache)
    write_report(records, analyses, before_counts, write_mode=True)

    n_analyzed = sum(1 for a in analyses if a.status in ("analyzed", "partial"))
    n_failed = sum(1 for a in analyses if a.status == "failed")
    print(f"\nAnalyzed: {n_analyzed}  Failed: {n_failed}  Skipped: {skipped_cached}")
    print(f"Report: {REPORT_FILE}")
    print(f"Cache: {CACHE_FILE}")


if __name__ == "__main__":
    main()
