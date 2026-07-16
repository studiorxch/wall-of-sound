#!/usr/bin/env python3
"""MUSIC external library cleanup — Passes A through E.

Passes:
  A — inventory (scan all external records, classify needs)
  B — title/artist/track-number repair
  C — audio reference relink
  D — artist-level metadata inheritance
  E — analysis queue creation

Usage:
  python3 tools/music_cleanup_external_library.py --dry-run
  python3 tools/music_cleanup_external_library.py --write
  python3 tools/music_cleanup_external_library.py --write --force   # overwrite non-placeholder artist/title
"""
from __future__ import annotations

import argparse
import json
import re
import shutil
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

AUDIO_EXTENSIONS = {".flac", ".wav", ".aiff", ".aif", ".mp3", ".m4a", ".aac", ".ogg"}
PLACEHOLDER_VALUES = {"", "—", "unknown", "Unknown", "null", "undefined", "none", "None"}

REPO_ROOT = Path("/Users/studio/Projects/wall-of-sound")
AUDIO_ROOTS = [
    REPO_ROOT / "library" / "music" / "external" / "audio",
    REPO_ROOT / "library" / "music" / "catalog" / "audio",
    REPO_ROOT / "library" / "music" / "reference" / "audio",
]
ARTIST_PROFILES_DIR = REPO_ROOT / "library" / "music" / "intelligence" / "artists"

# Pattern: optional "01." or "01 - " prefix, then "Artist - Title"
# Handles em-dash (—), en-dash (–), hyphen-minus (-)
TRACK_ARTIST_TITLE_RE = re.compile(
    r"^\s*(?:(?P<track>\d{1,3})\s*[\.\-\)]\s*)?"
    r"(?P<artist>.+?)\s+[-–—]\s+(?P<title>.+?)\s*$"
)

# ---------------------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------------------


@dataclass
class InventoryRow:
    record_id: str
    current_title: str
    current_artist: str
    current_path: str
    path_exists: bool
    playable_candidate: bool
    status: str
    needs_title_repair: bool
    needs_artist_repair: bool
    needs_path_repair: bool
    needs_analysis: bool
    source_file: str


@dataclass
class RepairResult:
    title: str
    artist: str
    track_number: int | None
    confidence: float
    changed: bool


@dataclass
class RelinkResult:
    old_path: str
    new_path: str | None
    category: str  # already_valid | relinked | ambiguous | missing | unsupported_extension
    reason: str


@dataclass
class Stats:
    inventory: list[InventoryRow] = field(default_factory=list)
    repaired: list[dict] = field(default_factory=list)
    relinks: list[RelinkResult] = field(default_factory=list)
    inherited: list[dict] = field(default_factory=list)
    analysis_queue: list[dict] = field(default_factory=list)
    changed_files: list[Path] = field(default_factory=list)
    artist_profiles: dict[str, dict] = field(default_factory=dict)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def is_placeholder(value: Any) -> bool:
    if value is None:
        return True
    if isinstance(value, (list, dict)):
        return len(value) == 0
    return str(value).strip() in PLACEHOLDER_VALUES


def normalize_text(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def is_external_record(record: dict) -> bool:
    status = str(record.get("status") or "").lower()
    source = str(record.get("source") or "").lower()
    category = str(record.get("libraryCategory") or record.get("library_category") or "").lower()
    source_owner = str(record.get("sourceOwner") or "").lower()
    return (
        status in {"ext", "external"}
        or source == "external"
        or category == "external"
        or source_owner == "external"
    )


def iter_records(payload: Any) -> list[dict]:
    if isinstance(payload, list):
        return [item for item in payload if isinstance(item, dict)]
    if isinstance(payload, dict):
        for key in ("tracks", "items", "records", "library", "bank", "banks"):
            val = payload.get(key)
            if isinstance(val, list):
                return [item for item in val if isinstance(item, dict)]
    return []


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def backup_and_write(path: Path, payload: Any) -> None:
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup = path.with_suffix(path.suffix + f".bak_{stamp}")
    shutil.copy2(path, backup)
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def collect_audio_files(roots: list[Path]) -> list[Path]:
    seen: set[Path] = set()
    files: list[Path] = []
    for root in roots:
        if not root.exists():
            continue
        for p in sorted(root.rglob("*")):
            if p.is_file() and p.suffix.lower() in AUDIO_EXTENSIONS:
                resolved = p.resolve()
                if resolved not in seen:
                    seen.add(resolved)
                    files.append(p)
    return files


def normalize_filename(name: str) -> str:
    cleaned = re.sub(r"[^a-z0-9]", "", name.lower())
    return cleaned


def build_audio_index(audio_files: list[Path]) -> tuple[dict[str, Path], dict[str, list[Path]]]:
    """Returns (exact_lower→path, normalized→[paths]) maps."""
    exact: dict[str, Path] = {}
    normalized: dict[str, list[Path]] = {}
    for p in audio_files:
        key = p.name.lower()
        exact[key] = p
        nkey = normalize_filename(p.stem)
        normalized.setdefault(nkey, []).append(p)
    return exact, normalized


# ---------------------------------------------------------------------------
# Pass A — Inventory
# ---------------------------------------------------------------------------


def build_inventory(records: list[dict], source_file: str) -> list[InventoryRow]:
    rows: list[InventoryRow] = []
    for rec in records:
        if not is_external_record(rec):
            continue
        title = normalize_text(str(rec.get("title") or ""))
        artist = normalize_text(str(rec.get("artist") or ""))
        path = str(rec.get("filePath") or rec.get("audioPath") or "")
        path_exists = bool(path) and Path(path).exists()
        ext = Path(path).suffix.lower() if path else ""
        playable = path_exists and ext in AUDIO_EXTENSIONS

        needs_title = bool(TRACK_ARTIST_TITLE_RE.match(title))
        needs_artist = is_placeholder(artist)
        needs_path = not path_exists
        needs_analysis = is_placeholder(rec.get("moodTags")) and is_placeholder(rec.get("mood"))

        rows.append(InventoryRow(
            record_id=str(rec.get("trackId") or rec.get("id") or ""),
            current_title=title,
            current_artist=artist,
            current_path=path,
            path_exists=path_exists,
            playable_candidate=playable,
            status=str(rec.get("status") or rec.get("sourceOwner") or ""),
            needs_title_repair=needs_title,
            needs_artist_repair=needs_artist,
            needs_path_repair=needs_path,
            needs_analysis=needs_analysis,
            source_file=source_file,
        ))
    return rows


# ---------------------------------------------------------------------------
# Pass B — Title / Artist / Track number repair
# ---------------------------------------------------------------------------


def repair_title_artist(record: dict, *, force: bool) -> RepairResult:
    current_title = normalize_text(str(record.get("title") or ""))
    current_artist = normalize_text(str(record.get("artist") or ""))
    m = TRACK_ARTIST_TITLE_RE.match(current_title)

    if not m:
        return RepairResult(current_title, current_artist, None, 0.0, False)

    parsed_artist = normalize_text(m.group("artist"))
    parsed_title = normalize_text(m.group("title"))
    track_raw = m.group("track")
    track_number = int(track_raw) if track_raw else None

    if not parsed_artist or not parsed_title:
        return RepairResult(current_title, current_artist, track_number, 0.0, False)

    can_set_artist = is_placeholder(current_artist) or force
    can_set_title = bool(parsed_title) and (parsed_title != current_title or force)

    next_artist = parsed_artist if can_set_artist else current_artist
    next_title = parsed_title if can_set_title else current_title
    changed = next_artist != current_artist or next_title != current_title or track_number is not None

    return RepairResult(next_title, next_artist, track_number, 0.95, changed)


def apply_title_repair(record: dict, result: RepairResult) -> None:
    if "originalTitle" not in record:
        record["originalTitle"] = record.get("title")
    if "originalArtist" not in record:
        record["originalArtist"] = record.get("artist")

    record["title"] = result.title
    record["artist"] = result.artist
    if result.track_number is not None:
        record["trackNumber"] = result.track_number
    record["artistRepairSource"] = "title_pattern"
    record["artistRepairConfidence"] = result.confidence
    record["titleRepairSource"] = "title_pattern"
    record["titleRepairConfidence"] = result.confidence


# ---------------------------------------------------------------------------
# Pass C — Audio relink
# ---------------------------------------------------------------------------


def relink_record(
    record: dict,
    exact: dict[str, Path],
    normalized: dict[str, list[Path]],
) -> RelinkResult:
    current_path = str(record.get("filePath") or record.get("audioPath") or "")
    ext = Path(current_path).suffix.lower() if current_path else ""

    if ext and ext not in AUDIO_EXTENSIONS:
        return RelinkResult(current_path, None, "unsupported_extension", f"extension {ext!r} not supported")

    if current_path and Path(current_path).exists():
        return RelinkResult(current_path, current_path, "already_valid", "path exists")

    # Try exact filename match
    name = Path(current_path).name if current_path else ""
    if name:
        hit = exact.get(name.lower())
        if hit:
            return RelinkResult(current_path, str(hit), "relinked", "exact filename match")

    # Try normalized stem match
    stem = Path(current_path).stem if current_path else ""
    if stem:
        nkey = normalize_filename(stem)
        hits = normalized.get(nkey, [])
        if len(hits) == 1:
            return RelinkResult(current_path, str(hits[0]), "relinked", "normalized stem match")
        if len(hits) > 1:
            return RelinkResult(current_path, None, "ambiguous", f"{len(hits)} candidates share stem")

    return RelinkResult(current_path, None, "missing", "no candidate found")


# ---------------------------------------------------------------------------
# Pass D — Artist metadata inheritance
# ---------------------------------------------------------------------------


def load_artist_profiles(profiles_dir: Path) -> dict[str, dict]:
    """Parse YAML frontmatter from each *.md artist profile.

    Handles one level of nested mappings (e.g. music_profile.mood_tags).
    Nested keys are promoted to the top-level profile dict.
    """
    profiles: dict[str, dict] = {}
    if not profiles_dir.exists():
        return profiles

    yaml_block_re = re.compile(r"^---\s*\n(.*?)\n---\s*\n", re.DOTALL)

    for md_file in profiles_dir.glob("*.md"):
        text = md_file.read_text(encoding="utf-8")
        m = yaml_block_re.match(text)
        if not m:
            continue

        profile: dict = {}
        current_top_key: str | None = None     # top-level key whose value is a list or dict
        current_list: list | None = None        # accumulating list for top-level key
        current_nested_key: str | None = None   # key inside a nested mapping
        current_nested_list: list | None = None # accumulating list for nested key
        nested_target: dict | None = None       # dict holding the nested keys

        def flush_nested() -> None:
            nonlocal current_nested_key, current_nested_list
            if current_nested_key is not None and current_nested_list is not None and nested_target is not None:
                nested_target[current_nested_key] = current_nested_list
                # Promote nested key to top-level profile for easy lookup
                profile[current_nested_key] = current_nested_list
            current_nested_key = None
            current_nested_list = None

        def flush_top() -> None:
            nonlocal current_top_key, current_list, nested_target
            flush_nested()
            if current_top_key is not None and current_list is not None:
                profile[current_top_key] = current_list
            current_top_key = None
            current_list = None
            nested_target = None

        for line in m.group(1).splitlines():
            stripped = line.strip()
            if not stripped or stripped.startswith("#"):
                continue

            indent = len(line) - len(line.lstrip())

            # List item under nested mapping (e.g. "    - microhouse")
            if stripped.startswith("- ") and indent >= 4 and current_nested_key is not None:
                if current_nested_list is None:
                    current_nested_list = []
                current_nested_list.append(stripped[2:].strip())
                continue

            # List item under top-level key (e.g. "  - Playhouse")
            if stripped.startswith("- ") and indent >= 2 and current_top_key is not None and nested_target is None:
                if current_list is None:
                    current_list = []
                current_list.append(stripped[2:].strip())
                continue

            # Nested mapping key (e.g. "  primary_genres:")
            if indent >= 2 and ":" in stripped and not stripped.startswith("- "):
                key, _, val = stripped.partition(":")
                key = key.strip()
                val = val.strip()
                if val == "" or val == "[]":
                    flush_nested()
                    if nested_target is None:
                        # Start a nested mapping under the current top-level key
                        nested_target = {}
                        if current_top_key:
                            profile[current_top_key] = nested_target
                    current_nested_key = key
                    current_nested_list = [] if val == "" else None
                else:
                    flush_nested()
                    if nested_target is None:
                        nested_target = {}
                        if current_top_key:
                            profile[current_top_key] = nested_target
                    nested_target[key] = val
                    profile[key] = val  # promote
                continue

            # Top-level key (no indent)
            if indent == 0 and ":" in stripped:
                flush_top()
                key, _, val = stripped.partition(":")
                key = key.strip()
                val = val.strip()
                if not val or val == "[]":
                    current_top_key = key
                    current_list = [] if val == "[]" else None
                else:
                    profile[key] = val

        flush_top()

        # Index by display_name and filename stem
        name = profile.get("display_name") or profile.get("title") or md_file.stem.replace("_", " ")
        profiles[name.lower()] = profile
        profiles[md_file.stem.lower().replace("_", " ")] = profile

    return profiles


def find_artist_profile(artist: str, profiles: dict[str, dict]) -> dict | None:
    key = artist.strip().lower()
    if key in profiles:
        return profiles[key]
    # Try the first part of compound names like "Herbert, Matthew Herbert"
    for name in [p.strip() for p in re.split(r"[,/]", artist)]:
        k = name.strip().lower()
        if k in profiles:
            return profiles[k]
    return None


def apply_artist_inheritance(record: dict, profile: dict) -> bool:
    changed = False

    mood_tags = profile.get("mood_tags") or []
    if mood_tags and is_placeholder(record.get("moodTags")) and is_placeholder(record.get("suggestedMood")):
        record["suggestedMood"] = ", ".join(mood_tags) if isinstance(mood_tags, list) else str(mood_tags)
        record["moodInheritedFromArtist"] = True
        changed = True

    genres = (profile.get("primary_genres") or []) + (profile.get("secondary_genres") or [])
    if genres and is_placeholder(record.get("genres")) and is_placeholder(record.get("suggestedGenre")):
        record["suggestedGenre"] = ", ".join(genres[:3]) if isinstance(genres, list) else str(genres)
        record["genreInheritedFromArtist"] = True
        changed = True

    grouping = profile.get("grouping") or profile.get("suggested_grouping")
    if grouping and is_placeholder(record.get("grouping")) and is_placeholder(record.get("suggestedGrouping")):
        record["suggestedGrouping"] = str(grouping)
        record["groupingInheritedFromArtist"] = True
        changed = True

    if changed:
        record["metadataSource"] = "artist_inheritance"

    return changed


# ---------------------------------------------------------------------------
# Pass E — Analysis queue
# ---------------------------------------------------------------------------

ANALYSIS_FIELDS = ["durationSeconds", "bpm", "moodTags", "mood", "grouping", "genres"]


def build_analysis_queue_item(record: dict) -> dict | None:
    needs = [f for f in ANALYSIS_FIELDS if is_placeholder(record.get(f))]
    if not needs:
        return None
    return {
        "recordId": record.get("trackId") or record.get("id") or "",
        "artist": record.get("artist") or "",
        "title": record.get("title") or "",
        "audioPath": record.get("filePath") or record.get("audioPath") or "",
        "needs": needs,
    }


# ---------------------------------------------------------------------------
# External library data files
# ---------------------------------------------------------------------------

EXTERNAL_DATA_FILES = [
    REPO_ROOT / "library" / "music" / "external" / "library.index.json",
    REPO_ROOT / "library" / "music" / "manifests" / "external.index.json",
]


def discover_external_data_files() -> list[Path]:
    found: list[Path] = []
    for p in EXTERNAL_DATA_FILES:
        if p.exists():
            found.append(p)
    return found


# ---------------------------------------------------------------------------
# Main pipeline
# ---------------------------------------------------------------------------


def process_file(
    path: Path,
    *,
    write: bool,
    force: bool,
    exact: dict[str, Path],
    normalized_audio: dict[str, list[Path]],
    artist_profiles: dict[str, dict],
    stats: Stats,
) -> None:
    payload = load_json(path)
    records = iter_records(payload)
    external = [r for r in records if is_external_record(r)]

    if not external:
        return

    # Pass A
    stats.inventory.extend(build_inventory(external, str(path)))

    file_changed = False
    for rec in external:
        rec_id = str(rec.get("trackId") or rec.get("id") or rec.get("title") or "?")

        # Pass B
        repair = repair_title_artist(rec, force=force)
        if repair.changed:
            stats.repaired.append({
                "source_file": str(path),
                "record_id": rec_id,
                "original_title": rec.get("title"),
                "new_title": repair.title,
                "new_artist": repair.artist,
                "track_number": repair.track_number,
            })
            if write:
                apply_title_repair(rec, repair)
                file_changed = True

        # Pass C
        relink = relink_record(rec, exact, normalized_audio)
        stats.relinks.append(relink)
        if write and relink.category == "relinked" and relink.new_path:
            path_field = "filePath" if "filePath" in rec else "audioPath"
            rec[path_field] = relink.new_path
            file_changed = True

        # Pass D — use repaired artist if available
        artist = repair.artist if repair.changed else normalize_text(str(rec.get("artist") or ""))
        profile = find_artist_profile(artist, artist_profiles) if artist else None
        if profile:
            inherited = apply_artist_inheritance(rec, profile)
            if inherited:
                stats.inherited.append({"record_id": rec_id, "artist": artist})
                if write:
                    file_changed = True

        # Pass E
        queue_item = build_analysis_queue_item(rec)
        if queue_item:
            stats.analysis_queue.append(queue_item)

    if write and file_changed:
        backup_and_write(path, payload)
        stats.changed_files.append(path)


def write_reports(stats: Stats, report_dir: Path, write_mode: bool) -> None:
    report_dir.mkdir(parents=True, exist_ok=True)
    now = datetime.now().isoformat(timespec="seconds")

    # Inventory JSON
    inv_data = [
        {
            "recordId": r.record_id,
            "currentTitle": r.current_title,
            "currentArtist": r.current_artist,
            "currentPath": r.current_path,
            "pathExists": r.path_exists,
            "playableCandidate": r.playable_candidate,
            "status": r.status,
            "needsTitleRepair": r.needs_title_repair,
            "needsArtistRepair": r.needs_artist_repair,
            "needsPathRepair": r.needs_path_repair,
            "needsAnalysis": r.needs_analysis,
            "sourceFile": r.source_file,
        }
        for r in stats.inventory
    ]
    (report_dir / "MUSIC_external_library_inventory.json").write_text(
        json.dumps(inv_data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )

    # Inventory MD
    n_title = sum(1 for r in stats.inventory if r.needs_title_repair)
    n_artist = sum(1 for r in stats.inventory if r.needs_artist_repair)
    n_path = sum(1 for r in stats.inventory if r.needs_path_repair)
    n_analysis = sum(1 for r in stats.inventory if r.needs_analysis)
    n_playable = sum(1 for r in stats.inventory if r.playable_candidate)

    inv_md = [
        "# MUSIC External Library Inventory",
        "",
        f"Generated: {now}",
        f"Mode: {'WRITE' if write_mode else 'DRY-RUN'}",
        "",
        "## Summary",
        "",
        f"| | Count |",
        f"|---|---:|",
        f"| External records | {len(stats.inventory)} |",
        f"| Playable candidates | {n_playable} |",
        f"| Needs title repair | {n_title} |",
        f"| Needs artist repair | {n_artist} |",
        f"| Needs path repair | {n_path} |",
        f"| Needs analysis | {n_analysis} |",
        "",
        "## Records",
        "",
        "| # | Title | Artist | Path OK | Needs |",
        "|---|---|---|:---:|---|",
    ]
    for i, r in enumerate(stats.inventory, 1):
        needs = []
        if r.needs_title_repair:
            needs.append("title")
        if r.needs_artist_repair:
            needs.append("artist")
        if r.needs_path_repair:
            needs.append("path")
        if r.needs_analysis:
            needs.append("analysis")
        inv_md.append(
            f"| {i} | {r.current_title[:50]} | {r.current_artist or '—'} | {'✓' if r.path_exists else '✗'} | {', '.join(needs) or '—'} |"
        )
    (report_dir / "MUSIC_external_library_inventory.md").write_text(
        "\n".join(inv_md) + "\n", encoding="utf-8"
    )

    # Relink report MD
    by_cat: dict[str, list[RelinkResult]] = {}
    for r in stats.relinks:
        by_cat.setdefault(r.category, []).append(r)

    relink_md = [
        "# MUSIC External Audio Relink Report",
        "",
        f"Generated: {now}",
        f"Mode: {'WRITE' if write_mode else 'DRY-RUN'}",
        "",
        "## Summary",
        "",
        f"| Category | Count |",
        f"|---|---:|",
    ]
    for cat in ("already_valid", "relinked", "ambiguous", "missing", "unsupported_extension"):
        count = len(by_cat.get(cat, []))
        relink_md.append(f"| `{cat}` | {count} |")

    for cat, items in by_cat.items():
        if cat == "already_valid":
            continue
        relink_md.extend(["", f"## {cat.replace('_', ' ').title()}", ""])
        for item in items:
            relink_md.append(f"- `{Path(item.old_path).name}` → `{item.new_path or 'UNRESOLVED'}` ({item.reason})")

    (report_dir / "MUSIC_external_audio_relink_report.md").write_text(
        "\n".join(relink_md) + "\n", encoding="utf-8"
    )

    # Artist loss regression report
    regression = [
        r for r in stats.inventory
        if r.needs_artist_repair and TRACK_ARTIST_TITLE_RE.match(r.current_title)
    ]
    regression_md = [
        "# MUSIC Artist Loss Regression Report",
        "",
        f"Generated: {now}",
        "",
        f"Records with artist pattern in title but blank artist field: {len(regression)}",
        "",
    ]
    for r in regression:
        regression_md.append(f"- `{r.current_title}`")
    (report_dir / "MUSIC_artist_loss_regression_report.md").write_text(
        "\n".join(regression_md) + "\n", encoding="utf-8"
    )

    # Analysis queue
    (report_dir / "MUSIC_external_analysis_queue.json").write_text(
        json.dumps(stats.analysis_queue, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )

    # Cleanup summary report
    summary_md = [
        "# MUSIC External Library Cleanup Report",
        "",
        f"Generated: {now}",
        f"Mode: {'WRITE' if write_mode else 'DRY-RUN'}",
        "",
        "## Passes Run",
        "",
        f"- **Pass A** — Inventory: {len(stats.inventory)} external records",
        f"- **Pass B** — Title/artist repair: {len(stats.repaired)} records {'repaired' if write_mode else 'would repair'}",
        f"- **Pass C** — Audio relink: {len([r for r in stats.relinks if r.category == 'relinked'])} {'relinked' if write_mode else 'would relink'}",
        f"- **Pass D** — Artist inheritance: {len(stats.inherited)} records {'updated' if write_mode else 'would update'}",
        f"- **Pass E** — Analysis queue: {len(stats.analysis_queue)} records queued",
        "",
        "## Files Changed" if write_mode else "## Files That Would Change",
        "",
    ]
    if stats.changed_files:
        for f in stats.changed_files:
            summary_md.append(f"- `{f}`")
    else:
        summary_md.append("- None" if write_mode else "- (dry-run — no files written)")

    if stats.repaired:
        summary_md.extend(["", "## Title/Artist Repairs", ""])
        for rep in stats.repaired[:50]:
            summary_md.append(
                f"- `{rep['original_title']}` → artist: **{rep['new_artist']}** / title: **{rep['new_title']}**"
                + (f" (track #{rep['track_number']})" if rep['track_number'] else "")
            )
        if len(stats.repaired) > 50:
            summary_md.append(f"- … and {len(stats.repaired) - 50} more")

    (report_dir / "MUSIC_external_library_cleanup_report.md").write_text(
        "\n".join(summary_md) + "\n", encoding="utf-8"
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="MUSIC external library cleanup — Passes A–E.")
    parser.add_argument("--root", default=str(REPO_ROOT), help="Project root")
    parser.add_argument("--dry-run", action="store_true", default=False)
    parser.add_argument("--write", action="store_true", default=False)
    parser.add_argument("--force", action="store_true", help="Overwrite non-placeholder artist/title fields")
    args = parser.parse_args()

    if args.dry_run == args.write:
        raise SystemExit("Choose exactly one of --dry-run or --write.")

    root = Path(args.root).expanduser().resolve()
    report_dir = root / "music" / "reports"

    print("Scanning audio files…")
    audio_files = collect_audio_files(AUDIO_ROOTS)
    exact, normalized_audio = build_audio_index(audio_files)
    print(f"  {len(audio_files)} audio files indexed")

    print("Loading artist profiles…")
    artist_profiles = load_artist_profiles(ARTIST_PROFILES_DIR)
    print(f"  {len(set(id(v) for v in artist_profiles.values()))} profiles loaded")

    data_files = discover_external_data_files()
    print(f"External data files: {[str(p) for p in data_files]}")

    stats = Stats(artist_profiles=artist_profiles)

    for path in data_files:
        print(f"Processing {path.name}…")
        process_file(
            path,
            write=args.write,
            force=args.force,
            exact=exact,
            normalized_audio=normalized_audio,
            artist_profiles=artist_profiles,
            stats=stats,
        )

    write_reports(stats, report_dir, write_mode=args.write)

    print()
    print(f"External records: {len(stats.inventory)}")
    print(f"Title/artist repairs: {len(stats.repaired)}")
    print(f"Audio relinks: {sum(1 for r in stats.relinks if r.category == 'relinked')}")
    print(f"Artist inheritance: {len(stats.inherited)}")
    print(f"Analysis queue: {len(stats.analysis_queue)}")
    print(f"Files changed: {len(stats.changed_files)}")
    print(f"Reports: {report_dir}")


if __name__ == "__main__":
    main()
