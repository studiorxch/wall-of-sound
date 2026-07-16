#!/usr/bin/env python3
"""
analyze_audio.py — AudioLab core analyzer for MUSIC metadata export.

Usage (via bin/analyze_external.sh — preferred):
    ./audiolab/bin/analyze_external.sh /path/to/folder
    ./audiolab/bin/analyze_external.sh file1.flac file2.mp3

Direct usage:
    python audiolab/tools/analyze_audio.py file1.flac file2.mp3
    python audiolab/tools/analyze_audio.py /path/to/folder
"""

import sys
import os
import json
import csv
import pathlib
import time
import warnings
import re
import hashlib
from typing import Optional

import numpy as np
import librosa
import soundfile as sf

from manifest_input import parse_manifest_csv, write_skipped_csv, SkippedRow

warnings.filterwarnings("ignore", category=DeprecationWarning)
warnings.filterwarnings("ignore", category=UserWarning)

# ── Constants ────────────────────────────────────────────────────────────────

ANALYSIS_VERSION = "audiolab-0.1.0"

SUPPORTED_EXTENSIONS = {".wav", ".flac", ".mp3", ".aiff", ".aif", ".m4a", ".ogg"}

KEYS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

# Camelot wheel: key → (major code, minor code)
# major = B (outer), minor = A (inner)
CAMELOT_MAJOR = {
    "B":  "1B", "F#": "2B", "C#": "3B", "G#": "4B",
    "D#": "5B", "A#": "6B", "F":  "7B", "C":  "8B",
    "G":  "9B", "D": "10B", "A": "11B", "E": "12B",
}
CAMELOT_MINOR = {
    "G#": "1A", "D#": "2A", "A#": "3A", "F":  "4A",
    "C":  "5A", "G":  "6A", "D":  "7A", "A":  "8A",
    "E":  "9A", "B": "10A", "F#": "11A", "C#": "12A",
}

# ── Helpers ───────────────────────────────────────────────────────────────────

def to_scalar(x) -> float:
    return float(np.asarray(x).flat[0])


def fmt_duration(seconds: float) -> str:
    m = int(seconds // 60)
    s = int(seconds % 60)
    return f"{m}:{s:02d}"


def make_track_id(file_path: str) -> str:
    p = pathlib.Path(file_path)
    return "external:" + re.sub(r"[^a-z0-9]+", "-", p.stem.lower()).strip("-")


def parse_title_artist(filename: str):
    """Best-effort parse of 'Artist - Title' or 'NN. Artist - Title' from filename."""
    stem = pathlib.Path(filename).stem
    # Strip leading track number
    stem = re.sub(r"^\d+[\.\s]+", "", stem)
    if " - " in stem:
        parts = stem.split(" - ", 1)
        return parts[0].strip(), parts[1].strip()
    return "", stem.strip()


# ── Analysis ──────────────────────────────────────────────────────────────────

def analyze_duration(path: str, y=None, sr: int = None):
    """Returns (duration_seconds, sample_rate, channels) using soundfile first."""
    duration = channels = None
    try:
        with sf.SoundFile(path) as f:
            sr_sf = f.samplerate
            channels = f.channels
            duration = len(f) / sr_sf
            if sr is None:
                sr = sr_sf
    except Exception:
        pass

    if duration is None and y is not None and sr is not None:
        duration = librosa.get_duration(y=y, sr=sr)

    return duration, sr, channels


def estimate_key_and_camelot(y, sr):
    """Chroma-based key detection with Camelot mapping attempt."""
    chroma = librosa.feature.chroma_stft(y=y, sr=sr)
    chroma_mean = chroma.mean(axis=1)
    key_idx = int(np.argmax(chroma_mean))
    key = KEYS[key_idx]

    # Rough mode detection: compare harmonic profile to major vs minor templates
    major_template = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
    minor_template = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])

    def corr(template, root_idx):
        rolled = np.roll(template, root_idx)
        norm_c = chroma_mean / (chroma_mean.sum() + 1e-8)
        norm_t = rolled / (rolled.sum() + 1e-8)
        return float(np.dot(norm_c, norm_t))

    major_score = corr(major_template, key_idx)
    minor_score = corr(minor_template, key_idx)

    if major_score > minor_score * 1.05:
        mode = "major"
        camelot = CAMELOT_MAJOR.get(key)
    elif minor_score > major_score * 1.05:
        mode = "minor"
        camelot = CAMELOT_MINOR.get(key)
    else:
        mode = "unknown"
        camelot = None

    return key, camelot, mode


def estimate_energy(y, sr, tempo: float) -> float:
    """Energy estimate combining RMS, onset strength, spectral centroid, tempo."""
    # RMS loudness
    rms = float(np.sqrt(np.mean(y ** 2)))
    rms_norm = min(rms / 0.15, 1.0)

    # Onset strength
    onset_env = librosa.onset.onset_strength(y=y, sr=sr)
    onset_mean = float(np.mean(onset_env))
    onset_norm = min(onset_mean / 6.0, 1.0)

    # Spectral centroid (brightness)
    centroid = librosa.feature.spectral_centroid(y=y, sr=sr)
    centroid_mean = float(np.mean(centroid))
    centroid_norm = min(centroid_mean / 4000.0, 1.0)

    # Tempo normalization (60–200 BPM → 0–1)
    tempo_norm = max(0.0, min((tempo - 60.0) / 140.0, 1.0))

    energy = 0.35 * rms_norm + 0.30 * onset_norm + 0.20 * centroid_norm + 0.15 * tempo_norm
    return round(min(max(energy, 0.0), 1.0), 3)


# ── Per-file analysis ─────────────────────────────────────────────────────────

def analyze_file(path: str, *, track_id: str = None, title: str = None, artist: str = None) -> dict:
    p = pathlib.Path(path).resolve()
    filename = p.name
    artist_guess, title_guess = parse_title_artist(filename)

    # Manifest values take priority over filename-parsed guesses
    resolved_track_id = track_id if track_id else make_track_id(str(p))
    resolved_title  = title  if title  else title_guess
    resolved_artist = artist if artist else artist_guess

    result = {
        "trackId": resolved_track_id,
        "filePath": str(p),
        "filename": filename,
        "title": resolved_title,
        "artist": resolved_artist,
        "durationSeconds": None,
        "durationDisplay": None,
        "bpm": None,
        "key": None,
        "camelotKey": None,
        "camelotConfidence": None,
        "energy": None,
        "energySource": "analyzed_estimate",
        "sampleRate": None,
        "channels": None,
        "beatsDetected": None,
        "analysisSource": "librosa",
        "analysisVersion": ANALYSIS_VERSION,
        "analyzedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "metadataSource": "analyzed",
        "error": None,
    }

    try:
        # Load audio (mono for analysis)
        y, sr = librosa.load(str(p), sr=None, mono=True)

        duration, sr_real, channels = analyze_duration(str(p), y=y, sr=sr)
        if duration is None:
            duration = librosa.get_duration(y=y, sr=sr)
        if channels is None:
            channels = 1

        result["durationSeconds"] = round(duration, 3)
        result["durationDisplay"] = fmt_duration(duration)
        result["sampleRate"] = sr_real or sr
        result["channels"] = channels

        # BPM
        tempo, beat_frames = librosa.beat.beat_track(y=y, sr=sr)
        bpm = round(to_scalar(tempo), 1)
        result["bpm"] = bpm
        result["beatsDetected"] = int(len(beat_frames))

        # Key + Camelot
        key, camelot, mode = estimate_key_and_camelot(y, sr)
        result["key"] = key
        result["camelotKey"] = camelot
        result["camelotConfidence"] = "low" if camelot is None else ("medium" if mode == "unknown" else "estimated")

        # Energy
        result["energy"] = estimate_energy(y, sr, bpm)

    except Exception as e:
        result["error"] = str(e)

    return result


# ── Output writers ────────────────────────────────────────────────────────────

CSV_COLUMNS = [
    "trackId", "filePath", "filename", "title", "artist",
    "durationSeconds", "bpm", "key", "camelotKey", "energy",
    "sampleRate", "channels", "beatsDetected",
    "analysisSource", "analyzedAt",
]


def build_summary(results: list, input_roots: list, total_found: int, unsupported_count: int, elapsed: float) -> dict:
    ok = [r for r in results if not r.get("error")]
    err = [r for r in results if r.get("error")]
    bpms = [r["bpm"] for r in ok if r.get("bpm")]
    durations = [r["durationSeconds"] for r in ok if r.get("durationSeconds")]
    missing_artist = sum(1 for r in ok if not r.get("artist"))
    missing_title  = sum(1 for r in ok if not r.get("title"))
    low_camelot    = sum(1 for r in ok if r.get("camelotConfidence") == "low")
    return {
        "analysisVersion": ANALYSIS_VERSION,
        "analyzedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "inputRoots": input_roots,
        "totalFilesFound": total_found,
        "unsupportedFiles": unsupported_count,
        "analyzedFiles": len(ok),
        "errorFiles": len(err),
        "skippedFiles": 0,
        "elapsedSeconds": round(elapsed, 2),
        "durationSecondsTotal": round(sum(durations), 1) if durations else 0,
        "avgBpm": round(sum(bpms) / len(bpms), 1) if bpms else None,
        "missingArtistCount": missing_artist,
        "missingTitleCount": missing_title,
        "lowCamelotConfidenceCount": low_camelot,
    }


def build_manifest_summary(
    results: list,
    skipped: list,
    manifest_path: str,
    manifest_rows: int,
    elapsed: float,
) -> dict:
    ok  = [r for r in results if not r.get("error")]
    err = [r for r in results if r.get("error")]
    bpms = [r["bpm"] for r in ok if r.get("bpm")]
    durations = [r["durationSeconds"] for r in ok if r.get("durationSeconds")]
    missing_file_path = sum(1 for s in skipped if s.reason == "missing_file_path")
    file_not_found    = sum(1 for s in skipped if s.reason == "file_not_found")
    unsupported       = sum(1 for s in skipped if s.reason == "unsupported_extension")
    duplicates        = sum(1 for s in skipped if s.reason == "duplicate_file_path")
    analysis_errors   = sum(1 for s in skipped if s.reason == "analysis_error")
    low_camelot = sum(1 for r in ok if r.get("camelotConfidence") == "low")
    missing_artist = sum(1 for r in ok if not r.get("artist"))
    return {
        "mode": "manifest",
        "analysisVersion": ANALYSIS_VERSION,
        "analyzedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "manifestPath": manifest_path,
        "manifestRows": manifest_rows,
        "analyzedFiles": len(ok),
        "errorFiles": len(err),
        "skippedRows": len(skipped),
        "missingFilePathRows": missing_file_path,
        "fileNotFoundRows": file_not_found,
        "unsupportedRows": unsupported,
        "duplicateRows": duplicates,
        "analysisErrorRows": analysis_errors,
        "elapsedSeconds": round(elapsed, 2),
        "durationSecondsTotal": round(sum(durations), 1) if durations else 0,
        "avgBpm": round(sum(bpms) / len(bpms), 1) if bpms else None,
        "missingArtistCount": missing_artist,
        "lowCamelotConfidenceCount": low_camelot,
    }


def write_json(results: list, path: pathlib.Path, summary: dict | None = None):
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {"summary": summary, "tracks": results} if summary is not None else results
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, ensure_ascii=False)


def write_csv(results: list, path: pathlib.Path):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=CSV_COLUMNS, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(results)


def write_report(results: list, path: pathlib.Path, elapsed: float, summary: dict | None = None):
    path.parent.mkdir(parents=True, exist_ok=True)
    ok = [r for r in results if not r.get("error")]
    err = [r for r in results if r.get("error")]
    bpms = [r["bpm"] for r in ok if r.get("bpm")]
    durations = [r["durationSeconds"] for r in ok if r.get("durationSeconds")]

    lines = [
        f"# AudioLab Analysis Report",
        f"",
        f"**Version:** {ANALYSIS_VERSION}  ",
        f"**Date:** {time.strftime('%Y-%m-%d %H:%M:%S')}  ",
        f"**Elapsed:** {elapsed:.1f}s  ",
        f"",
        f"## Batch Summary",
        f"",
        f"| Field | Value |",
        f"|---|---|",
        f"| Total files found | {summary['totalFilesFound'] if summary else len(results)} |",
        f"| Analyzed | {len(ok)} |",
        f"| Errors | {len(err)} |",
        f"| Unsupported | {summary['unsupportedFiles'] if summary else '—'} |",
        f"| Avg BPM | {round(sum(bpms)/len(bpms),1) if bpms else '—'} |",
        f"| Total duration | {round(sum(durations)/60,1) if durations else 0} min |",
        f"| Missing artist | {sum(1 for r in ok if not r.get('artist'))} |",
        f"| Missing title | {sum(1 for r in ok if not r.get('title'))} |",
        f"| Low Camelot confidence | {sum(1 for r in ok if r.get('camelotConfidence') == 'low')} |",
        f"",
        f"---",
        f"",
        f"## Results",
        f"",
    ]

    for r in ok:
        lines += [
            f"### {r['filename']}",
            f"",
            f"| Field | Value |",
            f"|---|---|",
            f"| Duration | {r['durationDisplay']} ({r['durationSeconds']}s) |",
            f"| BPM | {r['bpm']} |",
            f"| Key | {r['key']} |",
            f"| Camelot | {r['camelotKey'] or '—'} ({r['camelotConfidence']}) |",
            f"| Energy | {r['energy']} |",
            f"| Sample Rate | {r['sampleRate']} Hz |",
            f"| Channels | {r['channels']} |",
            f"| Beats Detected | {r['beatsDetected']} |",
            f"| Track ID | `{r['trackId']}` |",
            f"| File Path | `{r['filePath']}` |",
            f"",
        ]

    if err:
        lines += ["## Errors", ""]
        for r in err:
            lines += [f"- **{r['filename']}**: {r['error']}"]
        lines.append("")

    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))


def write_manifest_report(
    results: list,
    skipped: list,
    path: pathlib.Path,
    elapsed: float,
    summary: dict,
):
    path.parent.mkdir(parents=True, exist_ok=True)
    ok  = [r for r in results if not r.get("error")]
    err = [r for r in results if r.get("error")]

    lines = [
        f"# AudioLab Manifest Analysis Report",
        f"",
        f"**Version:** {ANALYSIS_VERSION}  ",
        f"**Date:** {time.strftime('%Y-%m-%d %H:%M:%S')}  ",
        f"**Elapsed:** {elapsed:.1f}s  ",
        f"**Manifest:** `{summary['manifestPath']}`  ",
        f"",
        f"## Manifest Summary",
        f"",
        f"| Field | Value |",
        f"|---|---|",
        f"| Manifest rows | {summary['manifestRows']} |",
        f"| Analyzed | {summary['analyzedFiles']} |",
        f"| Errors | {summary['errorFiles']} |",
        f"| Skipped total | {summary['skippedRows']} |",
        f"| — missing filePath | {summary['missingFilePathRows']} |",
        f"| — file not found | {summary['fileNotFoundRows']} |",
        f"| — unsupported ext | {summary['unsupportedRows']} |",
        f"| — duplicate path | {summary['duplicateRows']} |",
        f"| Avg BPM | {summary['avgBpm'] or '—'} |",
        f"| Total duration | {round(summary['durationSecondsTotal']/60, 1)} min |",
        f"| Missing artist | {summary['missingArtistCount']} |",
        f"| Low Camelot conf | {summary['lowCamelotConfidenceCount']} |",
        f"",
        f"## Next Step",
        f"",
        f"Import `audiolab/output/analysis-csv/latest.csv` in MUSIC → External → Coverage → Import AudioLab CSV.",
        f"",
        f"---",
        f"",
        f"## Results",
        f"",
    ]

    for r in ok:
        requested = ", ".join(r.get("requestedMissingFields") or []) or "—"
        lines += [
            f"### {r['filename']}",
            f"",
            f"| Field | Value |",
            f"|---|---|",
            f"| Track ID | `{r['trackId']}` |",
            f"| Requested for | {requested} |",
            f"| Duration | {r['durationDisplay']} ({r['durationSeconds']}s) |",
            f"| BPM | {r['bpm']} |",
            f"| Key | {r['key']} |",
            f"| Camelot | {r['camelotKey'] or '—'} ({r['camelotConfidence']}) |",
            f"| Energy | {r['energy']} |",
            f"| File Path | `{r['filePath']}` |",
            f"",
        ]

    if err:
        lines += ["## Errors", ""]
        for r in err:
            lines += [f"- **{r['filename']}**: {r['error']}"]
        lines.append("")

    if skipped:
        lines += ["## Skipped Rows", ""]
        for s in skipped:
            lines += [f"- `{s.trackId or s.filePath or s.filename}` — {s.reason}"]
        lines.append("")

    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))


# ── CLI ───────────────────────────────────────────────────────────────────────

def collect_files(args: list) -> tuple[list, list, int]:
    """Returns (supported_files, input_roots, unsupported_count)."""
    files = []
    roots = []
    unsupported = 0
    for arg in args:
        p = pathlib.Path(arg)
        if p.is_file():
            if p.suffix.lower() in SUPPORTED_EXTENSIONS:
                files.append(str(p))
            else:
                unsupported += 1
        elif p.is_dir():
            roots.append(str(p))
            for f in sorted(p.rglob("*")):
                if f.is_file():
                    if f.suffix.lower() in SUPPORTED_EXTENSIONS:
                        files.append(str(f))
                    else:
                        unsupported += 1
    if not roots:
        roots = list({str(pathlib.Path(f).parent) for f in files})
    return files, roots, unsupported


def load_existing_paths(latest_json: pathlib.Path) -> set:
    """Load file paths already present in latest.json for skip-existing mode."""
    if not latest_json.exists():
        return set()
    try:
        with open(latest_json, encoding="utf-8") as f:
            data = json.load(f)
        tracks = data.get("tracks", data) if isinstance(data, dict) else data
        return {r.get("filePath") for r in tracks if r.get("filePath") and not r.get("error")}
    except Exception:
        return set()


def _run_manifest_mode(manifest_path: str, out_dir_override: str | None, force: bool, missing_only: bool):
    """Analyze tracks listed in a MUSIC-exported CSV manifest."""
    print(f"AudioLab {ANALYSIS_VERSION} — manifest mode")
    print(f"  Manifest: {manifest_path}")

    try:
        manifest_rows, skipped_rows = parse_manifest_csv(manifest_path)
    except FileNotFoundError as e:
        print(f"Error: {e}")
        sys.exit(1)

    manifest_total = len(manifest_rows) + len(skipped_rows)
    print(f"  Rows read: {manifest_total}  →  {len(manifest_rows)} to analyze, {len(skipped_rows)} skipped")

    if not manifest_rows:
        print("Nothing to analyze.")
        if skipped_rows:
            print("Skipped reasons:")
            from collections import Counter
            for reason, count in Counter(s.reason for s in skipped_rows).items():
                print(f"  {reason}: {count}")
        sys.exit(0)

    repo_root = pathlib.Path(__file__).resolve().parent.parent
    out_base = pathlib.Path(out_dir_override) if out_dir_override else repo_root / "output"
    ts = time.strftime("%Y%m%d_%H%M%S")

    json_path   = out_base / "analysis-json" / f"music_manifest_analysis_{ts}.json"
    csv_path    = out_base / "analysis-csv"  / f"music_manifest_analysis_{ts}.csv"
    rpt_path    = out_base / "reports"       / f"music_manifest_analysis_report_{ts}.md"
    skip_path   = out_base / "reports"       / f"music_manifest_skipped_{ts}.csv"
    latest_json = out_base / "analysis-json" / "latest.json"
    latest_csv  = out_base / "analysis-csv"  / "latest.csv"
    latest_rpt  = out_base / "reports"       / "latest.md"

    # Analyze
    t0 = time.time()
    results = []
    for idx, row in enumerate(manifest_rows, 1):
        print(f"  [{idx}/{len(manifest_rows)}] {row.filename}", flush=True)
        r = analyze_file(
            row.filePath,
            track_id=row.trackId or None,
            title=row.title or None,
            artist=row.artist or None,
        )
        # Attach manifest context for report
        if row.missingFields:
            r["requestedMissingFields"] = row.missingFields
        if row.crateIds:
            r["crateIds"] = row.crateIds
        if r.get("error"):
            skipped_rows.append(SkippedRow(
                trackId=row.trackId,
                title=row.title,
                artist=row.artist,
                filePath=row.filePath,
                filename=row.filename,
                reason="analysis_error",
            ))
        results.append(r)
    elapsed = time.time() - t0

    summary = build_manifest_summary(results, skipped_rows, manifest_path, manifest_total, elapsed)

    # Write outputs
    write_json(results, json_path, summary)
    write_json(results, latest_json, summary)
    write_csv(results, csv_path)
    write_csv(results, latest_csv)
    write_manifest_report(results, skipped_rows, rpt_path, elapsed, summary)
    write_manifest_report(results, skipped_rows, latest_rpt, elapsed, summary)
    if skipped_rows:
        write_skipped_csv(skipped_rows, skip_path)

    ok  = [r for r in results if not r.get("error")]
    err = [r for r in results if r.get("error")]

    print()
    print(f"Done in {elapsed:.1f}s — {len(ok)} analyzed, {len(err)} errors, {len(skipped_rows)} skipped")
    print()
    print(f"  JSON:   {json_path}")
    print(f"  CSV:    {csv_path}")
    print(f"  Report: {rpt_path}")
    if skipped_rows:
        print(f"  Skipped: {skip_path}")
    print()
    print(f"  Latest aliases written:")
    print(f"    {latest_json}")
    print(f"    {latest_csv}")
    print(f"    {latest_rpt}")
    print()
    print(f"  Import latest.csv in MUSIC → External → Coverage → Import AudioLab CSV")
    if err:
        print()
        print("Errors:")
        for r in err:
            print(f"  ✗ {r['filename']}: {r['error']}")
    sys.exit(0 if not err else 1)


def main():
    args = sys.argv[1:]

    # Parse flags
    out_dir_override = None
    skip_existing = False
    force = False
    manifest_path = None
    missing_only = False
    clean_args = []
    i = 0
    while i < len(args):
        if args[i] == "--output-dir" and i + 1 < len(args):
            out_dir_override = args[i + 1]
            i += 2
        elif args[i] == "--manifest" and i + 1 < len(args):
            manifest_path = args[i + 1]
            i += 2
        elif args[i] in ("--skip-existing",):
            skip_existing = True
            i += 1
        elif args[i] in ("--force", "--all"):
            force = True
            i += 1
        elif args[i] == "--missing-only":
            missing_only = True
            i += 1
        else:
            clean_args.append(args[i])
            i += 1

    # ── Manifest mode ──────────────────────────────────────────────────────────
    if manifest_path:
        _run_manifest_mode(manifest_path, out_dir_override, force, missing_only)
        return

    # ── Folder/file mode ───────────────────────────────────────────────────────
    files, input_roots, unsupported_count = collect_files(clean_args)
    if not files:
        print("Usage:")
        print("  analyze_audio.py [--output-dir DIR] [--skip-existing] [--force] <file_or_folder...>")
        print("  analyze_audio.py --manifest /path/to/missing.csv [--force] [--missing-only]")
        print(f"Supported: {', '.join(sorted(SUPPORTED_EXTENSIONS))}")
        sys.exit(1)

    # Determine output directory
    repo_root = pathlib.Path(__file__).resolve().parent.parent
    out_base = pathlib.Path(out_dir_override) if out_dir_override else repo_root / "output"

    latest_json = out_base / "analysis-json" / "latest.json"
    latest_csv  = out_base / "analysis-csv"  / "latest.csv"
    latest_rpt  = out_base / "reports"       / "latest.md"

    # Skip-existing mode: filter files already in latest output
    skipped_paths: set = set()
    if skip_existing and not force:
        skipped_paths = load_existing_paths(latest_json)
        before = len(files)
        files = [f for f in files if str(pathlib.Path(f).resolve()) not in skipped_paths]
        skipped_count = before - len(files)
        if skipped_count:
            print(f"  (skipping {skipped_count} files already in latest output — use --force to reanalyze)")

    total_found = len(files) + len(skipped_paths)
    print(f"AudioLab {ANALYSIS_VERSION} — analyzing {len(files)} file(s)...")

    ts = time.strftime("%Y%m%d_%H%M%S")
    json_path = out_base / "analysis-json" / f"music_analysis_{ts}.json"
    csv_path  = out_base / "analysis-csv"  / f"music_analysis_{ts}.csv"
    rpt_path  = out_base / "reports"       / f"music_analysis_report_{ts}.md"

    # Analyze
    t0 = time.time()
    results = []
    for idx, f in enumerate(files, 1):
        print(f"  [{idx}/{len(files)}] {pathlib.Path(f).name}", flush=True)
        results.append(analyze_file(f))
    elapsed = time.time() - t0

    summary = build_summary(results, input_roots, total_found + unsupported_count, unsupported_count, elapsed)
    if skip_existing and not force:
        summary["skippedFiles"] = len(skipped_paths)

    # Write outputs
    write_json(results, json_path, summary)
    write_json(results, latest_json, summary)
    write_csv(results, csv_path)
    write_csv(results, latest_csv)
    write_report(results, rpt_path, elapsed, summary)
    write_report(results, latest_rpt, elapsed, summary)

    ok = [r for r in results if not r.get("error")]
    err = [r for r in results if r.get("error")]

    print()
    print(f"Done in {elapsed:.1f}s — {len(ok)} analyzed, {len(err)} errors")
    if summary.get("skippedFiles"):
        print(f"  ({summary['skippedFiles']} skipped — already in latest)")
    print()
    print(f"  JSON:   {json_path}")
    print(f"  CSV:    {csv_path}")
    print(f"  Report: {rpt_path}")
    print()
    print(f"  Latest aliases written:")
    print(f"    {latest_json}")
    print(f"    {latest_csv}")
    print(f"    {latest_rpt}")

    if err:
        print()
        print("Errors:")
        for r in err:
            print(f"  ✗ {r['filename']}: {r['error']}")

    sys.exit(0 if not err else 1)


if __name__ == "__main__":
    main()
