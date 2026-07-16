#!/usr/bin/env python3
"""
music_audit_catalog_missing_audio.py

Audit Catalog records that have no linked audio file.
Diagnoses each missing row using multiple matching heuristics.

Usage:
    python3 tools/music_audit_catalog_missing_audio.py --dry-run
    python3 tools/music_audit_catalog_missing_audio.py --write-report
"""

import argparse
import csv
import difflib
import re
import unicodedata
from datetime import datetime
from pathlib import Path

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
PROJECT_ROOT = Path(__file__).parent.parent
CATALOG_CSV = PROJECT_ROOT / "library" / "music" / "catalog" / "tracks.csv"
CATALOG_AUDIO_DIR = PROJECT_ROOT / "library" / "music" / "catalog" / "audio"
REPORT_PATH = PROJECT_ROOT / "music" / "reports" / "MUSIC_catalog_missing_audio_audit.md"

AUDIO_EXTENSIONS = {".mp3", ".wav", ".flac", ".aiff", ".aif", ".m4a", ".ogg", ".opus"}

# The CSV column name that holds the expected audio filename.
AUDIO_FILENAME_COLUMN = "Audio Filename"


# ---------------------------------------------------------------------------
# Normalization helpers
# ---------------------------------------------------------------------------

def normalize(text: str) -> str:
    """Lowercase, strip accents, collapse whitespace."""
    text = unicodedata.normalize("NFKD", str(text))
    text = "".join(c for c in text if not unicodedata.combining(c))
    return re.sub(r"\s+", " ", text.lower().strip())


def remove_apostrophes(text: str) -> str:
    return text.replace("'", "").replace("’", "")


def remove_ampersand(text: str) -> str:
    """Replace & with _ to match filesystem normalization, then collapse runs."""
    return re.sub(r"_+", "_", text.replace("&", "_")).strip("_")


def remove_suffix_variants(stem: str) -> str:
    """Remove S01, S02, S03 … trailing suffix."""
    return re.sub(r"_s0\d+$", "", stem, flags=re.IGNORECASE).strip("_")


def normalize_for_match(stem: str) -> str:
    s = normalize(stem)
    s = remove_apostrophes(s)
    s = remove_ampersand(s)
    s = re.sub(r"[^\w\s]", "", s)
    return re.sub(r"\s+", "_", s)


# ---------------------------------------------------------------------------
# Load catalog CSV
# ---------------------------------------------------------------------------

def load_catalog_csv() -> list[dict]:
    if not CATALOG_CSV.exists():
        raise FileNotFoundError(f"Catalog CSV not found: {CATALOG_CSV}")
    with open(CATALOG_CSV, newline="", encoding="utf-8-sig") as f:
        return list(csv.DictReader(f))


def get_expected_filename(row: dict) -> str:
    """Return the expected audio filename from the CSV row (may be empty)."""
    return row.get(AUDIO_FILENAME_COLUMN, "").strip()


# ---------------------------------------------------------------------------
# Scan audio folder
# ---------------------------------------------------------------------------

def scan_audio_files() -> dict[str, Path]:
    """Return dict of lowercase-filename → Path for all audio files."""
    if not CATALOG_AUDIO_DIR.exists():
        return {}
    result: dict[str, Path] = {}
    for f in CATALOG_AUDIO_DIR.rglob("*"):
        if f.is_file() and f.suffix.lower() in AUDIO_EXTENSIONS:
            result[f.name.lower()] = f
    return result


# ---------------------------------------------------------------------------
# Matching
# ---------------------------------------------------------------------------

def match_candidates(expected_fn: str, audio_files: dict[str, Path]) -> list[dict]:
    """Try to find the audio file using a cascade of matching heuristics."""
    if not expected_fn:
        return []

    expected_stem = Path(expected_fn).stem  # e.g. "maxines_drift"
    candidates = []

    for raw_fn_lower, path in audio_files.items():
        actual_stem = Path(raw_fn_lower).stem
        score = 0.0
        reason = ""

        # Pass 1: exact filename match (case-insensitive)
        if raw_fn_lower == expected_fn.lower():
            score, reason = 1.0, "exact filename match"

        # Pass 2: normalized stem match (handles unicode/case)
        elif normalize(actual_stem) == normalize(expected_stem):
            score, reason = 0.97, "normalized stem match"

        # Pass 3: apostrophe normalization (scouts_promise → scout's_promise)
        elif remove_apostrophes(actual_stem.lower()) == remove_apostrophes(expected_stem.lower()):
            score, reason = 0.95, "apostrophe normalization match"

        # Pass 4: ampersand normalization (skylines_&_softbeats → skylines_softbeats)
        elif remove_ampersand(actual_stem.lower()) == remove_ampersand(expected_stem.lower()):
            score, reason = 0.93, "ampersand normalization match"

        # Pass 5: combined apostrophe + ampersand normalization
        elif (remove_ampersand(remove_apostrophes(actual_stem.lower())) ==
              remove_ampersand(remove_apostrophes(expected_stem.lower()))):
            score, reason = 0.92, "apostrophe + ampersand normalization match"

        # Pass 6: strip S01/S02 suffix, then compare base title
        else:
            base_actual = remove_suffix_variants(actual_stem.lower())
            base_expected = remove_suffix_variants(expected_stem.lower())
            base_actual_norm = remove_ampersand(remove_apostrophes(base_actual))
            base_expected_norm = remove_ampersand(remove_apostrophes(base_expected))

            if base_actual_norm == base_expected_norm and base_actual_norm:
                # Both are variants of the same base title
                if base_actual == actual_stem.lower():
                    # actual is the BASE, expected is a specific variant
                    score, reason = 0.80, "base title match (expected has S-variant, actual is base)"
                else:
                    score, reason = 0.78, "both are S-variants of the same base title"

        # Pass 7: fuzzy ratio (fallback)
        if score == 0.0:
            ratio = difflib.SequenceMatcher(
                None,
                normalize_for_match(expected_stem),
                normalize_for_match(actual_stem),
            ).ratio()
            if ratio >= 0.80:
                score = round(ratio * 0.75, 3)
                reason = f"fuzzy ratio {ratio:.2f}"

        if score >= 0.70:
            candidates.append({
                "filename": path.name,
                "path": str(path.relative_to(PROJECT_ROOT)),
                "confidence": score,
                "reason": reason,
            })

    candidates.sort(key=lambda c: c["confidence"], reverse=True)
    return candidates[:5]


# ---------------------------------------------------------------------------
# Diagnosis
# ---------------------------------------------------------------------------

def diagnose(expected_fn: str, candidates: list[dict]) -> tuple[str, str, str]:
    """Return (category, diagnosis, recommended_action)."""
    if not expected_fn:
        return (
            "no_filename",
            "No Audio Filename in CSV row.",
            "Add the audio filename to the CSV and re-run Update Library."
        )

    if not candidates:
        return (
            "genuinely_missing",
            "No audio file candidate found in catalog/audio/.",
            "Audio file does not exist. Add it or remove/archive this catalog row."
        )

    best = candidates[0]
    score = best["confidence"]

    if score >= 0.90:
        return (
            "likely_relinkable",
            f"Close match found: `{best['filename']}` ({best['reason']}).",
            f"Update CSV `Audio Filename` to `{best['filename']}` and re-run Update Library."
        )
    if score >= 0.78:
        return (
            "likely_relinkable",
            f"Probable match: `{best['filename']}` ({best['reason']}, {score:.0%}).",
            f"Verify `{best['filename']}` is the correct file, then update CSV and re-run Update Library."
        )
    if score >= 0.70:
        return (
            "ambiguous",
            f"Weak match only: `{best['filename']}` ({best['reason']}, {score:.0%}).",
            "Inspect candidate manually before relinking."
        )
    return (
        "genuinely_missing",
        "No usable match found.",
        "Audio file likely genuinely absent. Check source."
    )


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description="Audit Catalog missing-audio records.")
    parser.add_argument("--dry-run", action="store_true", help="Print report to stdout.")
    parser.add_argument("--write-report", action="store_true", help="Write report file.")
    args = parser.parse_args()

    if not args.dry_run and not args.write_report:
        parser.print_help()
        return

    print(f"Loading: {CATALOG_CSV}")
    rows = load_catalog_csv()
    total = len(rows)

    print(f"Scanning: {CATALOG_AUDIO_DIR}")
    audio_files = scan_audio_files()
    audio_count = len(audio_files)

    # Identify missing: expected filename absent or not found on disk
    missing_rows = [
        r for r in rows
        if not get_expected_filename(r) or get_expected_filename(r).lower() not in audio_files
    ]
    linked_count = total - len(missing_rows)

    print(f"\nCatalog records:  {total}")
    print(f"Linked audio:     {linked_count}")
    print(f"Missing audio:    {len(missing_rows)}")
    print(f"Audio files:      {audio_count}")

    findings = []
    relinkable = 0
    ambiguous = 0
    genuinely_missing = 0

    for row in missing_rows:
        expected_fn = get_expected_filename(row)
        candidates = match_candidates(expected_fn, audio_files)
        category, diagnosis, action = diagnose(expected_fn, candidates)

        if category == "likely_relinkable":
            relinkable += 1
        elif category == "ambiguous":
            ambiguous += 1
        else:
            genuinely_missing += 1

        findings.append({
            "row": row,
            "expected_fn": expected_fn,
            "candidates": candidates,
            "category": category,
            "diagnosis": diagnosis,
            "action": action,
        })

    # Sort: relinkable first, then ambiguous, then missing
    cat_order = {"likely_relinkable": 0, "ambiguous": 1, "genuinely_missing": 2, "no_filename": 3}
    findings.sort(key=lambda f: cat_order.get(f["category"], 9))

    print(f"\nLikely relinkable: {relinkable}")
    print(f"Ambiguous:         {ambiguous}")
    print(f"Genuinely missing: {genuinely_missing}")

    # -----------------------------------------------------------------------
    # Build report
    # -----------------------------------------------------------------------
    lines = [
        "# MUSIC Catalog Missing Audio Audit",
        "",
        f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
        "",
        "## Summary",
        "",
        "| | |",
        "|---|---|",
        f"| Catalog records | {total} |",
        f"| Linked audio | {linked_count} |",
        f"| Missing audio | {len(missing_rows)} |",
        f"| Audio files scanned | {audio_count} |",
        f"| Likely relinkable | {relinkable} |",
        f"| Ambiguous | {ambiguous} |",
        f"| Genuinely missing | {genuinely_missing} |",
        "",
        "---",
        "",
    ]

    for cat, label in [
        ("likely_relinkable", "Likely Relinkable"),
        ("ambiguous", "Ambiguous"),
        ("genuinely_missing", "Genuinely Missing / No Filename"),
    ]:
        group = [f for f in findings if f["category"] == cat or (cat == "genuinely_missing" and f["category"] == "no_filename")]
        if not group:
            continue
        lines += [f"## {label} ({len(group)})", ""]

        for f in group:
            row = f["row"]
            title = row.get("Title", "(no title)").strip()
            artist = row.get("Artist", row.get("Album Artist", "")).strip()
            track_id = row.get("Suno ID", row.get("trackId", "")).strip()

            lines.append(f"### {title} — {artist}")
            lines.append("")
            lines.append(f"- **Record ID:** `{track_id or '(none)'}`")
            lines.append(f"- **Expected filename:** `{f['expected_fn'] or '(empty)'}`")
            if f["candidates"]:
                lines.append("- **Best candidates:**")
                for c in f["candidates"]:
                    lines.append(f"  - `{c['filename']}` — confidence {c['confidence']:.0%} — {c['reason']}")
            else:
                lines.append("- **Best candidates:** _(none)_")
            lines.append(f"- **Diagnosis:** {f['diagnosis']}")
            lines.append(f"- **Recommended action:** {f['action']}")
            lines.append("")

        lines += ["---", ""]

    report_text = "\n".join(lines)

    if args.dry_run:
        print("\n" + report_text)

    if args.write_report:
        REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
        REPORT_PATH.write_text(report_text, encoding="utf-8")
        print(f"\nReport written: {REPORT_PATH}")


if __name__ == "__main__":
    main()
