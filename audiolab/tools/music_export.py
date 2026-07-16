"""
music_export.py — Utilities for converting AudioLab analysis output
into MUSIC-compatible import formats.

Not called directly — used by analyze_audio.py and potentially future tools.
"""

import json
import csv
import pathlib
from typing import Optional


MUSIC_CSV_COLUMNS = [
    "trackId",
    "filePath",
    "filename",
    "title",
    "artist",
    "durationSeconds",
    "bpm",
    "key",
    "camelotKey",
    "energy",
    "sampleRate",
    "channels",
    "beatsDetected",
    "analysisSource",
    "analyzedAt",
]


def results_to_music_csv(results: list, output_path: str | pathlib.Path):
    """Write analysis results as a MUSIC-compatible CSV import file."""
    output_path = pathlib.Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=MUSIC_CSV_COLUMNS, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(results)


def results_to_music_json(results: list, output_path: str | pathlib.Path):
    """Write analysis results as a MUSIC-compatible JSON import file."""
    output_path = pathlib.Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2, ensure_ascii=False)


def load_analysis_json(path: str | pathlib.Path) -> list:
    """Load a previously written analysis JSON file."""
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def filter_successful(results: list) -> list:
    """Return only results without errors."""
    return [r for r in results if not r.get("error")]


def summary_stats(results: list) -> dict:
    """Return summary statistics for a batch of analysis results."""
    ok = filter_successful(results)
    if not ok:
        return {"total": len(results), "ok": 0, "errors": len(results)}

    bpms = [r["bpm"] for r in ok if r.get("bpm")]
    energies = [r["energy"] for r in ok if r.get("energy") is not None]
    durations = [r["durationSeconds"] for r in ok if r.get("durationSeconds")]

    return {
        "total": len(results),
        "ok": len(ok),
        "errors": len(results) - len(ok),
        "bpm_coverage": f"{len(bpms)}/{len(ok)}",
        "energy_coverage": f"{len(energies)}/{len(ok)}",
        "duration_coverage": f"{len(durations)}/{len(ok)}",
        "avg_bpm": round(sum(bpms) / len(bpms), 1) if bpms else None,
        "avg_energy": round(sum(energies) / len(energies), 3) if energies else None,
        "total_duration_min": round(sum(durations) / 60, 1) if durations else None,
    }
