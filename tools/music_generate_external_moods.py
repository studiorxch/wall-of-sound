#!/usr/bin/env python3
"""MUSIC External Mechanical Mood Generation — v1.0.0

Generates suggestedMood, mechanism, and grouping for External library tracks
using a deterministic rule system based on energy, BPM, duration, and artist context.

Usage:
  python3 tools/music_generate_external_moods.py --dry-run
  python3 tools/music_generate_external_moods.py --write
"""
from __future__ import annotations

import argparse
import json
import re
import shutil
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

REPO_ROOT = Path("/Users/studio/Projects/wall-of-sound")
EXTERNAL_DATA_SOURCE = REPO_ROOT / "library" / "music" / "external" / "library.index.json"
REPORT_FILE = REPO_ROOT / "music" / "reports" / "MUSIC_external_mood_generation_report.md"

MOOD_ANALYSIS_VERSION = "external-mechanical-mood-v1.0.0"
MOOD_ANALYSIS_SOURCE = "audio-analysis-plus-context"

PROTECTED_FIELDS = {
    "title", "artist", "sourcePath", "sourceUrl", "audioUrl", "src", "url",
    "mood", "rating", "notes", "manualTags",
    "trackId", "fileName", "filePath", "sourceOwner", "sourceLibrary",
    "originalTitle", "originalArtist",
}

# ---------------------------------------------------------------------------
# Controlled vocabularies (spec §Controlled Vocabulary)
# ---------------------------------------------------------------------------

MOOD_VOCAB = {
    "nocturnal", "warm", "cold", "hypnotic", "deep", "submerged", "restrained",
    "dusky", "late-night", "minimal", "soft", "tense", "open", "shadowed",
    "intimate", "detached", "drifting", "meditative", "urban", "afterhours",
}

MECHANISM_VOCAB = {
    "rolling", "gliding", "shuffling", "pulsing", "drifting", "looping",
    "stuttering", "swinging", "stepping", "hovering", "click-texture",
    "micro-grid", "machine-loop", "dub-chamber", "signal-repeat",
    "pressure-cycle", "percussion-skeleton", "low-end-carrier",
    "background-engine", "modular-pulse", "locked-groove", "soft-pulse",
    "dry-groove", "elastic-groove", "slow-pulse",
}

GROUPING_VOCAB = {
    "microhouse drift", "minimal pressure", "dub infrastructure",
    "afterhours pulse", "soft machine funk", "deep loop system",
    "percussion grid", "submerged rhythm", "late-night transit",
    "background engine",
}

# ---------------------------------------------------------------------------
# Artist bias groups (spec §Artist / Title Context Rules)
# ---------------------------------------------------------------------------

ARTIST_BIASES: list[tuple[set[str], dict[str, list[str]]]] = [
    (
        {"basic channel", "maurizio", "pole", "rhythm & sound", "melchior productions"},
        {
            "suggestedMood": ["submerged", "deep", "restrained"],
            "mechanism": ["dub-chamber", "signal-repeat", "low-end-carrier"],
            "grouping": ["dub infrastructure"],
        },
    ),
    (
        {"ricardo villalobos", "rhadoo", "petre inspirescu", "luciano", "quenum",
         "dewalta", "maayan nidam", "kassem mosse"},
        {
            "suggestedMood": ["hypnotic", "minimal", "late-night"],
            "mechanism": ["rolling", "micro-grid", "locked-groove"],
            "grouping": ["minimal pressure"],
        },
    ),
    (
        {"akufen", "herbert", "matthew herbert", "thomas brinkmann", "jan jelinek"},
        {
            "suggestedMood": ["detached", "minimal", "intimate"],
            "mechanism": ["click-texture", "micro-grid", "stuttering"],
            "grouping": ["microhouse drift"],
        },
    ),
    (
        {"superpitcher", "isolée", "dj koze", "soulphiction", "christopher rau",
         "moomin", "booka shade"},
        {
            "suggestedMood": ["warm", "open", "afterhours"],
            "mechanism": ["elastic-groove", "shuffling", "soft-pulse"],
            "grouping": ["soft machine funk"],
        },
    ),
    (
        {"dettinger", "the field", "lawrence", "efdemin", "losoul", "lowtec"},
        {
            "suggestedMood": ["drifting", "meditative", "shadowed"],
            "mechanism": ["background-engine", "looping", "gliding"],
            "grouping": ["background engine"],
        },
    ),
]

# ---------------------------------------------------------------------------
# Data layer
# ---------------------------------------------------------------------------


def locate_external_data_source() -> Path:
    if EXTERNAL_DATA_SOURCE.exists():
        return EXTERNAL_DATA_SOURCE
    raise FileNotFoundError(
        f"External data source not found: {EXTERNAL_DATA_SOURCE}\n"
        "Run the external library cleanup pass first."
    )


def load_external_records(path: Path) -> list[dict]:
    data = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(data, list):
        return data
    raise ValueError(f"Unexpected format in {path}: expected a JSON array")


def create_backup(path: Path) -> Path:
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup = path.with_suffix(path.suffix + f".bak_{stamp}")
    shutil.copy2(path, backup)
    return backup


def save_external_records(path: Path, records: list[dict]) -> None:
    path.write_text(json.dumps(records, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


# ---------------------------------------------------------------------------
# Logic layer
# ---------------------------------------------------------------------------


def normalize_artist(artist: str) -> str:
    return artist.strip().lower()


def merge_unique(existing: list[str], new: list[str], vocab: set[str]) -> list[str]:
    """Append new items not already in existing, filtered to vocabulary."""
    merged = list(existing)
    for item in new:
        if item in vocab and item not in merged:
            merged.append(item)
    return merged


def infer_energy_tags(energy: float) -> dict[str, list[str]]:
    if energy < 0.18:
        return {
            "suggestedMood": ["restrained", "submerged", "detached"],
            "mechanism": ["drifting", "background-engine", "low-end-carrier"],
            "grouping": ["background engine"],
        }
    if energy < 0.30:
        return {
            "suggestedMood": ["deep", "minimal", "late-night"],
            "mechanism": ["soft-pulse", "looping", "micro-grid"],
            "grouping": ["microhouse drift"],
        }
    if energy < 0.45:
        return {
            "suggestedMood": ["hypnotic", "warm", "afterhours"],
            "mechanism": ["rolling", "shuffling", "locked-groove"],
            "grouping": ["afterhours pulse"],
        }
    return {
        "suggestedMood": ["tense", "urban", "hypnotic"],
        "mechanism": ["machine-loop", "pressure-cycle", "percussion-skeleton"],
        "grouping": ["minimal pressure"],
    }


def infer_bpm_tags(bpm: float) -> dict[str, list[str]]:
    if 60 <= bpm <= 65:
        return {"mechanism": ["slow-pulse", "low-end-carrier", "drifting"]}
    if 99 <= bpm <= 115:
        return {"mechanism": ["gliding", "elastic-groove", "soft-pulse"]}
    if 116 <= bpm <= 124:
        return {"mechanism": ["rolling", "shuffling", "micro-grid"]}
    if 125 <= bpm <= 132:
        return {"mechanism": ["locked-groove", "machine-loop", "pressure-cycle"]}
    return {}


def infer_duration_tags(duration_sec: float) -> dict[str, list[str]]:
    if duration_sec > 600:
        return {"grouping": ["deep loop system"]}
    return {}


def infer_context_tags(artist: str) -> dict[str, list[str]]:
    normalized = normalize_artist(artist)
    for artist_set, bias in ARTIST_BIASES:
        # Match if any token in artist_set appears in the normalized artist string
        for key in artist_set:
            if key in normalized:
                return bias
    return {}


def generate_mood_metadata(record: dict) -> dict[str, Any]:
    """Combine energy, BPM, duration, and artist context into suggestion fields."""
    energy: float = record.get("energy") or 0.0
    bpm: float = record.get("bpm") or 0.0
    duration: float = record.get("durationSeconds") or 0.0
    artist: str = str(record.get("artist") or "")

    # Accumulate from each signal source
    sources = [
        infer_energy_tags(energy),
        infer_bpm_tags(bpm),
        infer_duration_tags(duration),
        infer_context_tags(artist),
    ]

    mood: list[str] = []
    mech: list[str] = []
    group: list[str] = []

    for src in sources:
        mood = merge_unique(mood, src.get("suggestedMood", []), MOOD_VOCAB)
        mech = merge_unique(mech, src.get("mechanism", []), MECHANISM_VOCAB)
        group = merge_unique(group, src.get("grouping", []), GROUPING_VOCAB)

    return {
        "suggestedMood": mood[:4],
        "mechanism": mech[:4],
        "grouping": group[:2],
        "moodReviewStatus": "suggested",
        "moodAnalysisVersion": MOOD_ANALYSIS_VERSION,
        "moodAnalysisSource": MOOD_ANALYSIS_SOURCE,
        "moodAnalyzedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }


# ---------------------------------------------------------------------------
# Regression guard
# ---------------------------------------------------------------------------

def check_protected_fields(before: list[dict], after: list[dict]) -> list[str]:
    """Return list of violation messages if any protected field changed."""
    violations: list[str] = []
    before_by_id = {r.get("trackId"): r for r in before}
    for rec in after:
        tid = rec.get("trackId")
        orig = before_by_id.get(tid)
        if not orig:
            continue
        for field_name in PROTECTED_FIELDS:
            if orig.get(field_name) != rec.get(field_name):
                violations.append(
                    f"trackId={tid}: protected field '{field_name}' changed "
                    f"from {orig.get(field_name)!r} to {rec.get(field_name)!r}"
                )
    return violations


# ---------------------------------------------------------------------------
# Interface layer
# ---------------------------------------------------------------------------

@dataclass
class RunResult:
    total: int = 0
    generated: int = 0
    already_had: int = 0
    skipped_protected: int = 0
    partial_handled: int = 0
    missing_analysis: int = 0
    failed: int = 0
    backup_path: str = "none"
    samples: list[dict] = field(default_factory=list)


def process_records(records: list[dict], write: bool) -> RunResult:
    result = RunResult(total=len(records))

    for rec in records:
        result.total  # already counted above

        # Tracks with confirmed mood should not be touched at suggestion level either
        if rec.get("mood") and str(rec["mood"]).strip() not in {"", "—", "[]", "null"}:
            result.skipped_protected += 1
            continue

        # Already has suggestions from THIS version — preserve and count.
        # Values without a moodAnalysisVersion were written by the old analysis
        # script using out-of-controlled-vocabulary terms and should be replaced.
        has_suggestions = (
            rec.get("moodAnalysisVersion") == MOOD_ANALYSIS_VERSION
            and (
                bool(rec.get("suggestedMood"))
                or bool(rec.get("mechanism"))
                or bool(rec.get("grouping"))
            )
        )

        energy = rec.get("energy")
        bpm = rec.get("bpm")
        if energy is None or bpm is None:
            result.missing_analysis += 1
            # Still attempt generation — partial is not a failure
        if rec.get("analysisStatus") == "partial":
            result.partial_handled += 1

        try:
            new_meta = generate_mood_metadata(rec)
        except Exception as e:
            result.failed += 1
            continue

        if has_suggestions:
            result.already_had += 1
            # Only fill missing fields — do not erase existing suggestions
            if write:
                for key, val in new_meta.items():
                    if key not in rec or not rec[key]:
                        rec[key] = val
                # Always update provenance fields
                for prov in ("moodReviewStatus", "moodAnalysisVersion", "moodAnalysisSource", "moodAnalyzedAt"):
                    rec[prov] = new_meta[prov]
        else:
            result.generated += 1
            if write:
                rec.update(new_meta)

        # Collect sample rows
        if len(result.samples) < 10:
            result.samples.append({
                "artist": rec.get("artist", ""),
                "title": rec.get("title", ""),
                "bpm": rec.get("bpm"),
                "energy": rec.get("energy"),
                "suggestedMood": new_meta["suggestedMood"],
                "mechanism": new_meta["mechanism"],
                "grouping": new_meta["grouping"],
            })

    return result


def write_report(result: RunResult, data_source: Path, write_mode: bool) -> None:
    REPORT_FILE.parent.mkdir(parents=True, exist_ok=True)
    now = datetime.now().isoformat(timespec="seconds")

    lines = [
        "# MUSIC External Mood Generation Report",
        "",
        f"Generated: {now}",
        f"Mode: {'WRITE' if write_mode else 'DRY-RUN'}",
        "",
        "## Data Source",
        "",
        f"External data source: `{data_source}`",
        f"External records found: {result.total}",
        "",
        "## Results",
        "",
        f"| | Count |",
        f"|---|---:|",
        f"| Generated mood metadata | {result.generated} |",
        f"| Already had suggestions (provenance updated) | {result.already_had} |",
        f"| Skipped (confirmed mood protected) | {result.skipped_protected} |",
        f"| Partial-analysis records handled | {result.partial_handled} |",
        f"| Missing analysis fields | {result.missing_analysis} |",
        f"| Failed | {result.failed} |",
        f"| Backup written | `{result.backup_path}` |",
        "",
        f"Library protected fields preserved: {'true' if result.failed == 0 else 'CHECK REPORT'}",
        "",
        "## Sample Generated Rows",
        "",
        "| # | Artist | Title | BPM | Energy | Suggested | Mechanism | Grouping |",
        "|---:|---|---|---:|---:|---|---|---|",
    ]

    for i, s in enumerate(result.samples, 1):
        mood_str = ", ".join(s["suggestedMood"])
        mech_str = ", ".join(s["mechanism"])
        grp_str = ", ".join(s["grouping"])
        bpm_str = f"{s['bpm']:.1f}" if s["bpm"] else "—"
        energy_str = f"{s['energy']:.2f}" if s["energy"] else "—"
        lines.append(f"| {i} | {s['artist'][:25]} | {s['title'][:30]} | {bpm_str} | {energy_str} | {mood_str} | {mech_str} | {grp_str} |")

    REPORT_FILE.write_text("\n".join(lines) + "\n", encoding="utf-8")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate mechanical mood metadata for External library tracks.")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--write", action="store_true")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if args.dry_run == args.write:
        raise SystemExit("Choose exactly one of --dry-run or --write.")

    data_source = locate_external_data_source()
    records = load_external_records(data_source)
    print(f"External data source: {data_source}")
    print(f"External records found: {len(records)}")

    # Snapshot protected fields before any changes
    before_snapshot = [
        {f: r.get(f) for f in PROTECTED_FIELDS}
        | {"trackId": r.get("trackId")}
        for r in records
    ]

    result = process_records(records, write=args.write)

    if args.write:
        # Regression guard
        violations = check_protected_fields(
            [{**s} for s in before_snapshot],
            records,
        )
        if violations:
            print("ABORT: Protected field violations detected:")
            for v in violations:
                print(f"  {v}")
            raise SystemExit(1)

        backup = create_backup(data_source)
        result.backup_path = str(backup)
        save_external_records(data_source, records)
        print(f"Backup: {backup}")

    write_report(result, data_source, write_mode=args.write)

    print(f"Generated: {result.generated}")
    print(f"Already had suggestions: {result.already_had}")
    print(f"Partial-analysis handled: {result.partial_handled}")
    print(f"Missing analysis fields: {result.missing_analysis}")
    print(f"Failed: {result.failed}")
    print(f"Report: {REPORT_FILE}")


if __name__ == "__main__":
    main()
