"""
Audit Reference library playback states and repair stale audio paths.

Usage:
  python3 tools/music_audit_reference_playback.py --dry-run
  python3 tools/music_audit_reference_playback.py --write
  python3 tools/music_audit_reference_playback.py --dry-run --allow-title-only
  python3 tools/music_audit_reference_playback.py --write --allow-title-only
"""
from __future__ import annotations

import argparse
import csv
import json
import os
import re
import shutil
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any

# ──────────────────────────────────────────────────────────────────────────────
# Constants
# ──────────────────────────────────────────────────────────────────────────────

REPO_ROOT = Path("/Users/studio/Projects/wall-of-sound")
# CWD of the Vite dev server — used to evaluate whether a relative filePath resolves
VITE_CWD = REPO_ROOT / "music"

AUDIO_EXTENSIONS = {".mp3", ".wav", ".flac", ".m4a", ".aac", ".ogg", ".aif", ".aiff"}

REFERENCE_DATA_FILES = [
    REPO_ROOT / "library/music/reference/library.index.json",
]

AUDIO_ROOTS = [
    REPO_ROOT / "library/music/reference/audio",
    REPO_ROOT / "library/music/catalog/audio",
    REPO_ROOT / "library/music/external/audio",
]

AUDIO_PATH_FIELDS = {
    "filePath", "filepath", "path", "src", "source", "url", "href",
    "audioSrc", "audioPath", "audioUrl", "clipPath", "clipSrc",
    "samplePath", "sampleSrc", "previewPath", "previewSrc",
    "resolvedPath", "externalPath", "originalPath",
    "mediaPath", "mediaSrc", "assetPath",
}

RELINKSCRIPT_VERSION = "0707_MUSIC_ReferencePlaybackAuditAndRelink_v1.0.1"

# ──────────────────────────────────────────────────────────────────────────────
# Playback states
# ──────────────────────────────────────────────────────────────────────────────

PLAYBACK_STATES = (
    "playable_existing",
    "relinked",
    "missing_source_field",
    "missing_file",
    "ambiguous_match",
    "unsupported_extension",
    "browser_url_invalid",
    "metadata_only",
)


@dataclass
class RowAudit:
    track_id: str
    title: str
    artist: str
    source_file: Path
    original_path: str | None
    resolved_path: str | None          # absolute path we computed
    playback_state: str
    confidence: float
    reason: str
    relink_path: str | None = None     # what we'd write (absolute)
    already_relinked: bool = False


# ──────────────────────────────────────────────────────────────────────────────
# Audio catalog index
# ──────────────────────────────────────────────────────────────────────────────

@dataclass
class AudioEntry:
    path: Path
    filename: str
    filename_lower: str
    stem_lower: str


def build_catalog(audio_roots: list[Path]) -> list[AudioEntry]:
    seen: set[Path] = set()
    entries: list[AudioEntry] = []
    for root in audio_roots:
        if not root.exists():
            continue
        for p in sorted(root.rglob("*")):
            if not p.is_file() or p.suffix.lower() not in AUDIO_EXTENSIONS:
                continue
            resolved = p.resolve()
            if resolved in seen:
                continue
            seen.add(resolved)
            entries.append(AudioEntry(
                path=p,
                filename=p.name,
                filename_lower=p.name.lower(),
                stem_lower=p.stem.lower(),
            ))
    return entries


def normalize(s: str) -> str:
    return re.sub(r"[^a-z0-9]", "", s.lower())


def match_by_filename(
    filename: str,
    catalog: list[AudioEntry],
    allow_title_only: bool,
) -> tuple[Path | None, float, str]:
    fn_lower = filename.lower()
    stem_lower = Path(filename).stem.lower()

    exact = [e for e in catalog if e.filename == filename]
    if len(exact) == 1:
        return exact[0].path, 1.00, "exact filename match"
    if len(exact) > 1:
        return None, 0.00, f"multiple exact matches ({len(exact)})"

    ci = [e for e in catalog if e.filename_lower == fn_lower]
    if len(ci) == 1:
        return ci[0].path, 0.98, "case-insensitive filename match"
    if len(ci) > 1:
        return None, 0.00, f"multiple case-insensitive matches ({len(ci)})"

    norm_fn = normalize(filename.rsplit(".", 1)[0])
    norm_matches = [e for e in catalog if normalize(e.filename.rsplit(".", 1)[0]) == norm_fn and norm_fn]
    if len(norm_matches) == 1:
        return norm_matches[0].path, 0.95, "normalized filename match"
    if len(norm_matches) > 1:
        return None, 0.00, f"multiple normalized matches ({len(norm_matches)})"

    stem_matches = [e for e in catalog if e.stem_lower == stem_lower and stem_lower]
    if len(stem_matches) == 1 and allow_title_only:
        return stem_matches[0].path, 0.80, "unique stem match (--allow-title-only)"
    if len(stem_matches) == 1:
        return None, 0.80, "unique stem match (pass --allow-title-only to auto-relink)"
    if len(stem_matches) > 1:
        return None, 0.00, f"multiple stem matches ({len(stem_matches)})"

    return None, 0.00, "no candidate found"


# ──────────────────────────────────────────────────────────────────────────────
# Path helpers
# ──────────────────────────────────────────────────────────────────────────────

def resolve_stored_path(stored_path: str) -> Path | None:
    """Resolve a stored filePath to an absolute Path, using Vite CWD for relative paths."""
    p = Path(stored_path)
    if p.is_absolute():
        return p if p.exists() else None
    # Vite resolves relative paths from its CWD (music/)
    abs_from_vite = (VITE_CWD / p).resolve()
    if abs_from_vite.exists():
        return abs_from_vite
    # Try from repo root as fallback
    abs_from_repo = (REPO_ROOT / p).resolve()
    if abs_from_repo.exists():
        return abs_from_repo
    return None


def is_browser_servable(stored_path: str) -> tuple[bool, str]:
    """Check if stored path will resolve correctly via /media?path= endpoint (Vite CWD = music/)."""
    p = Path(stored_path)
    if p.is_absolute():
        return p.exists(), "absolute path" if p.exists() else "absolute path missing"
    # Relative path: Vite resolves from music/
    abs_from_vite = (VITE_CWD / p).resolve()
    if abs_from_vite.exists():
        return True, "relative path resolves from vite CWD"
    abs_from_repo = (REPO_ROOT / p).resolve()
    if abs_from_repo.exists():
        return False, f"relative path resolves from repo root but not vite CWD — needs absolute"
    return False, "relative path does not resolve from any known base"


# ──────────────────────────────────────────────────────────────────────────────
# Track record detection
# ──────────────────────────────────────────────────────────────────────────────

def extract_audio_path(record: dict[str, Any]) -> str | None:
    """Return the first audio path field found in a track record."""
    for key in AUDIO_PATH_FIELDS:
        val = record.get(key)
        if isinstance(val, str) and val.strip():
            return val.strip()
    # Nested scan
    def _search(obj: Any, depth: int = 0) -> str | None:
        if depth > 4:
            return None
        if isinstance(obj, dict):
            for k, v in obj.items():
                if k in AUDIO_PATH_FIELDS and isinstance(v, str) and v.strip():
                    return v.strip()
                result = _search(v, depth + 1)
                if result:
                    return result
        elif isinstance(obj, list):
            for item in obj:
                result = _search(item, depth + 1)
                if result:
                    return result
        return None
    return _search(record)


def is_metadata_only(record: dict[str, Any]) -> bool:
    """Heuristic: record has no audio field and no fileName either."""
    return extract_audio_path(record) is None and not record.get("fileName")


# ──────────────────────────────────────────────────────────────────────────────
# Audit core
# ──────────────────────────────────────────────────────────────────────────────

def audit_row(
    record: dict[str, Any],
    source_file: Path,
    catalog: list[AudioEntry],
    allow_title_only: bool,
) -> RowAudit:
    track_id = record.get("trackId", "")
    title = record.get("title", "")
    artist = record.get("artist", "")
    stored_path = extract_audio_path(record)

    base = RowAudit(
        track_id=track_id,
        title=title,
        artist=artist,
        source_file=source_file,
        original_path=stored_path,
        resolved_path=None,
        playback_state="missing_source_field",
        confidence=0.0,
        reason="no audio path field found",
    )

    if is_metadata_only(record):
        base.playback_state = "metadata_only"
        base.reason = "no audio path or fileName field — reference record may have no clip"
        return base

    if not stored_path:
        base.playback_state = "missing_source_field"
        base.reason = "audio path field is empty"
        return base

    ext = Path(stored_path.split("?")[0]).suffix.lower()
    if ext not in AUDIO_EXTENSIONS:
        base.playback_state = "unsupported_extension"
        base.reason = f"extension {ext!r} not in supported set"
        return base

    # Check browser servability first
    servable, svc_reason = is_browser_servable(stored_path)
    if servable:
        abs_path = resolve_stored_path(stored_path)
        base.resolved_path = str(abs_path) if abs_path else stored_path
        base.playback_state = "playable_existing"
        base.confidence = 1.0
        base.reason = svc_reason
        return base

    # Not directly servable — check if file exists at all (absolute path missing vs relative path issue)
    p = Path(stored_path)
    if p.is_absolute() and not p.exists():
        # Absolute path, file gone — try to relink
        filename = p.name
        matched, conf, match_reason = match_by_filename(filename, catalog, allow_title_only)
        if matched and conf >= (0.80 if allow_title_only else 0.95):
            base.resolved_path = str(matched.resolve())
            base.relink_path = str(matched.resolve())
            base.playback_state = "relinked"
            base.confidence = conf
            base.reason = match_reason
        elif matched:
            base.resolved_path = str(matched.resolve())
            base.playback_state = "missing_file"
            base.confidence = conf
            base.reason = f"found candidate but below confidence threshold: {match_reason}"
        else:
            base.playback_state = "missing_file"
            base.confidence = 0.0
            base.reason = match_reason
        return base

    # Relative path that doesn't serve from Vite CWD but resolves from repo root
    abs_from_repo = (REPO_ROOT / p).resolve()
    if abs_from_repo.exists():
        base.resolved_path = str(abs_from_repo)
        base.relink_path = str(abs_from_repo)
        base.playback_state = "browser_url_invalid"
        base.confidence = 1.0
        base.reason = svc_reason
        return base

    # Relative path that resolves nowhere
    filename = p.name
    matched, conf, match_reason = match_by_filename(filename, catalog, allow_title_only)
    if matched and conf >= (0.80 if allow_title_only else 0.95):
        base.resolved_path = str(matched.resolve())
        base.relink_path = str(matched.resolve())
        base.playback_state = "relinked"
        base.confidence = conf
        base.reason = match_reason
    else:
        base.playback_state = "missing_file"
        base.confidence = conf
        base.reason = match_reason or svc_reason
    return base


def audit_file(
    source_file: Path,
    catalog: list[AudioEntry],
    allow_title_only: bool,
) -> list[RowAudit]:
    records: list[dict[str, Any]] = json.loads(source_file.read_text(encoding="utf-8"))
    if not isinstance(records, list):
        records = [records]
    return [audit_row(r, source_file, catalog, allow_title_only) for r in records]


# ──────────────────────────────────────────────────────────────────────────────
# Write repairs
# ──────────────────────────────────────────────────────────────────────────────

def apply_repairs(
    audits: list[RowAudit],
    source_file: Path,
) -> int:
    records: list[dict[str, Any]] = json.loads(source_file.read_text(encoding="utf-8"))
    by_id: dict[str, RowAudit] = {a.track_id: a for a in audits if a.relink_path}
    if not by_id:
        return 0

    changed = 0
    now = datetime.utcnow().isoformat(timespec="seconds") + "Z"
    for rec in records:
        tid = rec.get("trackId", "")
        audit = by_id.get(tid)
        if not audit or not audit.relink_path:
            continue
        # Preserve original
        if not rec.get("originalAudioPath") and audit.original_path:
            rec["originalAudioPath"] = audit.original_path
        rec["audioRelinkedAt"] = now
        rec["audioRelinkVersion"] = RELINKSCRIPT_VERSION
        # Find and update the actual path field
        for field_name in AUDIO_PATH_FIELDS:
            if field_name in rec and isinstance(rec[field_name], str):
                rec[field_name] = audit.relink_path
                break
        changed += 1

    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup = source_file.with_suffix(source_file.suffix + f".bak_{stamp}")
    shutil.copy2(source_file, backup)
    source_file.write_text(json.dumps(records, indent=2, ensure_ascii=False), encoding="utf-8")
    return changed


# ──────────────────────────────────────────────────────────────────────────────
# Reports
# ──────────────────────────────────────────────────────────────────────────────

def write_reports(
    audits: list[RowAudit],
    changed: int,
    report_dir: Path,
) -> None:
    report_dir.mkdir(parents=True, exist_ok=True)
    now = datetime.now().isoformat(timespec="seconds")

    from collections import Counter
    state_counts = Counter(a.playback_state for a in audits)

    # ── JSON ──────────────────────────────────────────────────────────────────
    json_path = report_dir / "MUSIC_reference_playback_audit.json"
    json_path.write_text(
        json.dumps({
            "generated": now,
            "total_rows": len(audits),
            "state_counts": dict(state_counts),
            "rows_relinked": changed,
            "rows": [
                {
                    "trackId": a.track_id,
                    "title": a.title,
                    "artist": a.artist,
                    "playback_state": a.playback_state,
                    "confidence": a.confidence,
                    "reason": a.reason,
                    "original_path": a.original_path,
                    "resolved_path": a.resolved_path,
                    "relink_path": a.relink_path,
                }
                for a in audits
            ],
        },
        indent=2,
        ensure_ascii=False,
    ),
    encoding="utf-8",
)

    # ── CSV (unresolved only) ─────────────────────────────────────────────────
    csv_path = report_dir / "MUSIC_reference_unresolved_rows.csv"
    unresolved = [a for a in audits if a.playback_state not in ("playable_existing", "relinked")]
    with open(csv_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=[
            "trackId", "title", "artist", "playback_state", "confidence", "reason", "original_path",
        ])
        writer.writeheader()
        for a in unresolved:
            writer.writerow({
                "trackId": a.track_id,
                "title": a.title,
                "artist": a.artist,
                "playback_state": a.playback_state,
                "confidence": a.confidence,
                "reason": a.reason,
                "original_path": a.original_path or "",
            })

    # ── Markdown ─────────────────────────────────────────────────────────────
    md_path = report_dir / "MUSIC_reference_playback_audit.md"
    lines: list[str] = [
        "# MUSIC Reference Playback Audit",
        "",
        f"Generated: {now}",
        "",
        "## Discovered Reference Data Files",
        "",
    ]
    seen_files: list[str] = sorted({str(a.source_file) for a in audits})
    for sf in seen_files:
        lines.append(f"- `{sf}`")

    lines += [
        "",
        "## Summary",
        "",
        f"- Reference rows discovered: {len(audits)}",
        f"- Rows relinked (this run): {changed}",
        "",
        "### Playback State Counts",
        "",
        "| State | Count |",
        "|---|---:|",
    ]
    total_accounted = 0
    for state in PLAYBACK_STATES:
        cnt = state_counts.get(state, 0)
        total_accounted += cnt
        lines.append(f"| `{state}` | {cnt} |")
    lines += [
        f"| **Total accounted** | **{total_accounted}** |",
        "",
    ]

    if total_accounted != len(audits):
        lines.append(f"> ⚠️ MISMATCH: total accounted ({total_accounted}) ≠ rows discovered ({len(audits)})")
        lines.append("")

    # Relinked rows
    relinked = [a for a in audits if a.playback_state == "relinked"]
    lines += [
        "## Relinked Rows",
        "",
    ]
    if relinked:
        for a in relinked:
            lines += [
                f"- **{a.title}** (`{a.track_id}`)",
                f"  - Old: `{a.original_path}`",
                f"  - New: `{a.relink_path}`",
                f"  - Confidence: `{a.confidence:.2f}` — {a.reason}",
                "",
            ]
    else:
        lines.append("- None")
        lines.append("")

    # Browser URL invalid
    browser_invalid = [a for a in audits if a.playback_state == "browser_url_invalid"]
    lines += [
        "## Browser URL Invalid",
        "",
        "These rows have files that exist on disk but store a relative path that Vite resolves",
        f"from `music/` — not the repo root. They need absolute paths.",
        "",
    ]
    if browser_invalid:
        for a in browser_invalid:
            lines += [
                f"- **{a.title}** (`{a.track_id}`)",
                f"  - Stored: `{a.original_path}`",
                f"  - Needs: `{a.relink_path}`",
                f"  - Reason: {a.reason}",
                "",
            ]
    else:
        lines.append("- None")
        lines.append("")

    # Missing source field
    missing_field = [a for a in audits if a.playback_state == "missing_source_field"]
    lines += ["## Missing Source Field", ""]
    if missing_field:
        for a in missing_field:
            lines.append(f"- **{a.title}** (`{a.track_id}`): {a.reason}")
    else:
        lines.append("- None")
    lines.append("")

    # Missing file
    missing_file = [a for a in audits if a.playback_state == "missing_file"]
    lines += ["## Missing File (Unresolved)", ""]
    if missing_file:
        for a in missing_file:
            lines += [
                f"- **{a.title}** (`{a.track_id}`)",
                f"  - Path: `{a.original_path}`",
                f"  - Reason: {a.reason}",
                "",
            ]
    else:
        lines.append("- None")
        lines.append("")

    # Ambiguous
    ambiguous = [a for a in audits if a.playback_state == "ambiguous_match"]
    lines += ["## Ambiguous Match", ""]
    if ambiguous:
        for a in ambiguous:
            lines.append(f"- **{a.title}** (`{a.track_id}`): {a.reason}")
    else:
        lines.append("- None")
    lines.append("")

    md_path.write_text("\n".join(lines), encoding="utf-8")


# ──────────────────────────────────────────────────────────────────────────────
# CLI
# ──────────────────────────────────────────────────────────────────────────────

def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Audit MUSIC Reference library playback states.")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--write", action="store_true")
    parser.add_argument("--allow-title-only", action="store_true",
                        help="Also relink by unique title stem match (confidence 0.80)")
    parser.add_argument(
        "--report-dir",
        default=str(REPO_ROOT / "music/reports"),
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if args.dry_run == args.write:
        raise SystemExit("Choose exactly one mode: --dry-run or --write")

    catalog = build_catalog(AUDIO_ROOTS)
    print(f"Audio catalog: {len(catalog)} files across {len(AUDIO_ROOTS)} roots")

    all_audits: list[RowAudit] = []
    for source_file in REFERENCE_DATA_FILES:
        if not source_file.exists():
            print(f"Warning: data file not found: {source_file}")
            continue
        file_audits = audit_file(source_file, catalog, args.allow_title_only)
        all_audits.extend(file_audits)
        print(f"Loaded {len(file_audits)} rows from {source_file.name}")

    from collections import Counter
    state_counts = Counter(a.playback_state for a in all_audits)
    print(f"\nReference rows discovered: {len(all_audits)}")
    for state in PLAYBACK_STATES:
        cnt = state_counts.get(state, 0)
        if cnt:
            print(f"  {state}: {cnt}")

    total_accounted = sum(state_counts.values())
    if total_accounted != len(all_audits):
        print(f"\n⚠️  MISMATCH: accounted={total_accounted}, discovered={len(all_audits)}")

    repairable = [a for a in all_audits if a.relink_path]
    print(f"\nRepairable rows: {len(repairable)}")

    changed = 0
    if args.write and repairable:
        by_file: dict[Path, list[RowAudit]] = {}
        for a in repairable:
            by_file.setdefault(a.source_file, []).append(a)
        for source_file, file_audits in by_file.items():
            n = apply_repairs(file_audits, source_file)
            print(f"  Repaired {n} rows in {source_file.name}")
            changed += n

        # Re-audit to reflect updated states in report
        all_audits = []
        for source_file in REFERENCE_DATA_FILES:
            if source_file.exists():
                all_audits.extend(audit_file(source_file, catalog, args.allow_title_only))

    report_dir = Path(args.report_dir)
    write_reports(all_audits, changed, report_dir)
    print(f"\nReports written to {report_dir}/")
    print(f"  MUSIC_reference_playback_audit.md")
    print(f"  MUSIC_reference_playback_audit.json")
    print(f"  MUSIC_reference_unresolved_rows.csv")
    print(f"\nTotal accounted: {total_accounted}")
    if total_accounted != len(all_audits) and not args.write:
        raise SystemExit(f"ERROR: total accounted ({total_accounted}) ≠ rows discovered ({len(all_audits)})")


if __name__ == "__main__":
    main()
