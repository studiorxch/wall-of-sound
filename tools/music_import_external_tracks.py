#!/usr/bin/env python3
"""MUSIC external track import pipeline — Stages 1–6.

Stages:
  1 — File discovery (scan source folder)
  2 — Filename metadata parse
  3 — Audio header read (embedded tags via mutagen if available)
  4 — Duplicate detection (hash, normalized artist+title, filename)
  5 — Staged write (preview report + import manifest)
  6 — Analysis queue

Usage:
  python3 tools/music_import_external_tracks.py --source /path/to/audio --dry-run
  python3 tools/music_import_external_tracks.py --source /path/to/audio --write
  python3 tools/music_import_external_tracks.py --source /path/to/audio --write --allow-duplicates
"""
from __future__ import annotations

import argparse
import hashlib
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
IGNORE_EXTENSIONS = {".ds_store", ".jpg", ".jpeg", ".png", ".pdf", ".txt", ".cue", ".log", ".nfo"}

REPO_ROOT = Path("/Users/studio/Projects/wall-of-sound")
EXTERNAL_LIBRARY_FILE = REPO_ROOT / "library" / "music" / "external" / "library.index.json"
MANIFESTS_FILE = REPO_ROOT / "library" / "music" / "manifests" / "external.index.json"
IMPORTS_DIR = REPO_ROOT / "music" / "imports"
REPORTS_DIR = REPO_ROOT / "music" / "reports"

TRACK_ARTIST_TITLE_RE = re.compile(
    r"^\s*(?:(?P<track>\d{1,3})\s*[\.\-\)]\s*)?"
    r"(?P<artist>.+?)\s+[-–—]\s+(?P<title>.+?)\s*$"
)

PLACEHOLDER_VALUES = {"", "—", "unknown", "Unknown"}


def is_placeholder(value: Any) -> bool:
    if value is None:
        return True
    if isinstance(value, (list, dict)):
        return len(value) == 0
    return str(value).strip() in PLACEHOLDER_VALUES


def normalize_text(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def normalize_key(value: str) -> str:
    return re.sub(r"[^a-z0-9]", "", value.lower())


# ---------------------------------------------------------------------------
# Stage 1 — File discovery
# ---------------------------------------------------------------------------


def discover_audio_files(source: Path) -> list[Path]:
    files: list[Path] = []
    for p in sorted(source.rglob("*")):
        if not p.is_file():
            continue
        if p.suffix.lower() in IGNORE_EXTENSIONS:
            continue
        if p.suffix.lower() in AUDIO_EXTENSIONS:
            files.append(p)
    return files


# ---------------------------------------------------------------------------
# Stage 2 — Filename metadata parse
# ---------------------------------------------------------------------------


@dataclass
class FilenameParseResult:
    raw_stem: str
    title: str
    artist: str
    track_number: int | None
    confidence: float


def parse_filename(stem: str) -> FilenameParseResult:
    m = TRACK_ARTIST_TITLE_RE.match(stem)
    if m:
        artist = normalize_text(m.group("artist"))
        title = normalize_text(m.group("title"))
        track_raw = m.group("track")
        track_number = int(track_raw) if track_raw else None
        confidence = 0.90 if track_number else 0.85
        return FilenameParseResult(stem, title, artist, track_number, confidence)
    return FilenameParseResult(stem, normalize_text(stem), "", None, 0.40)


# ---------------------------------------------------------------------------
# Stage 3 — Audio header read
# ---------------------------------------------------------------------------


@dataclass
class AudioTags:
    title: str = ""
    artist: str = ""
    album: str = ""
    track_number: int | None = None
    date: str = ""
    genre: str = ""
    album_artist: str = ""
    duration_seconds: float | None = None
    source: str = "none"  # "mutagen" | "filename" | "none"


def read_audio_tags(path: Path) -> AudioTags:
    try:
        import mutagen  # type: ignore
        from mutagen import File as MutagenFile

        audio = MutagenFile(path, easy=True)
        if audio is None:
            return AudioTags(source="none")

        def get(key: str) -> str:
            val = audio.get(key)
            return normalize_text(str(val[0])) if val else ""

        track_raw = get("tracknumber")
        track_number: int | None = None
        if track_raw:
            try:
                track_number = int(track_raw.split("/")[0])
            except ValueError:
                pass

        duration: float | None = None
        if hasattr(audio, "info") and hasattr(audio.info, "length"):
            duration = audio.info.length

        return AudioTags(
            title=get("title"),
            artist=get("artist"),
            album=get("album"),
            track_number=track_number,
            date=get("date"),
            genre=get("genre"),
            album_artist=get("albumartist"),
            duration_seconds=duration,
            source="mutagen",
        )
    except ImportError:
        return AudioTags(source="none")
    except Exception:
        return AudioTags(source="none")


def merge_metadata(tags: AudioTags, filename_parse: FilenameParseResult) -> dict:
    """Merge tag and filename metadata using priority: tags > filename parse."""
    title = tags.title if tags.title else filename_parse.title
    artist = tags.artist if tags.artist else filename_parse.artist
    track_number = tags.track_number if tags.track_number is not None else filename_parse.track_number

    confidence = tags.source == "mutagen" and bool(title and artist)
    return {
        "title": title,
        "artist": artist,
        "album": tags.album,
        "albumArtist": tags.album_artist,
        "trackNumber": track_number,
        "durationSeconds": round(tags.duration_seconds, 2) if tags.duration_seconds else None,
        "genre": tags.genre,
        "date": tags.date,
        "titleSource": "embedded_tag" if tags.title else "filename_parse",
        "artistSource": "embedded_tag" if tags.artist else "filename_parse",
        "parseConfidence": 1.0 if confidence else filename_parse.confidence,
    }


# ---------------------------------------------------------------------------
# Stage 4 — Duplicate detection
# ---------------------------------------------------------------------------


def file_hash(path: Path, chunk_size: int = 65536) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        while chunk := f.read(chunk_size):
            h.update(chunk)
    return h.hexdigest()[:16]


@dataclass
class DuplicateCheck:
    is_duplicate: bool
    reason: str
    matched_id: str = ""


def build_existing_index(tracks: list[dict]) -> tuple[set[str], dict[str, str], dict[str, str]]:
    """Returns (known_paths, norm_artist_title→id, norm_filename→id)."""
    paths: set[str] = set()
    art_title: dict[str, str] = {}
    filenames: dict[str, str] = {}
    for t in tracks:
        fp = str(t.get("filePath") or "")
        if fp:
            paths.add(fp)
        fn = str(t.get("fileName") or Path(fp).name if fp else "")
        tid = str(t.get("trackId") or "")
        artist = normalize_key(str(t.get("artist") or ""))
        title = normalize_key(str(t.get("title") or ""))
        if artist and title:
            art_title[artist + "_" + title] = tid
        if fn:
            filenames[normalize_key(fn)] = tid
    return paths, art_title, filenames


def check_duplicate(
    path: Path,
    meta: dict,
    known_paths: set[str],
    art_title_idx: dict[str, str],
    filename_idx: dict[str, str],
) -> DuplicateCheck:
    if str(path) in known_paths:
        return DuplicateCheck(True, "identical path", "")

    fn_key = normalize_key(path.name)
    if fn_key in filename_idx:
        return DuplicateCheck(True, "same filename", filename_idx[fn_key])

    artist = normalize_key(str(meta.get("artist") or ""))
    title = normalize_key(str(meta.get("title") or ""))
    if artist and title:
        key = artist + "_" + title
        if key in art_title_idx:
            return DuplicateCheck(True, "same artist+title", art_title_idx[key])

    return DuplicateCheck(False, "")


# ---------------------------------------------------------------------------
# Stage 5 — Staged write
# ---------------------------------------------------------------------------


def gen_id(prefix: str = "ext") -> str:
    import random
    chars = "abcdefghijklmnopqrstuvwxyz0123456789"
    suffix = "".join(random.choices(chars, k=8))
    return f"{prefix}_{suffix}"


@dataclass
class ImportCandidate:
    path: Path
    meta: dict
    duplicate: DuplicateCheck
    track_record: dict = field(default_factory=dict)


def build_track_record(path: Path, meta: dict) -> dict:
    return {
        "trackId": gen_id("ext"),
        "title": meta.get("title") or path.stem,
        "artist": meta.get("artist") or "",
        "albumArtist": meta.get("albumArtist") or "",
        "trackNumber": meta.get("trackNumber"),
        "durationSeconds": meta.get("durationSeconds"),
        "genres": [meta["genre"]] if meta.get("genre") else [],
        "bpm": None,
        "camelotKey": None,
        "energy": None,
        "energySource": None,
        "sourceOwner": "external",
        "sourceLibrary": "external",
        "status": "external",
        "fileName": path.name,
        "filePath": str(path),
        "audioLinked": True,
        "audioMissing": False,
        "audioLastScannedAt": datetime.now().isoformat(timespec="seconds"),
        "moodTags": [],
        "moodSuggestions": [],
        "grouping": "",
        "platformUse": None,
        "analysisStatus": "pending",
        "analysisSources": [],
        "playCount": 0,
        "lastPlayedAt": None,
        "lastPlayedSlotIndex": None,
        "sourceGroupId": None,
        "sourcePoolIds": [],
        "archiveStatus": None,
        "titleSource": meta.get("titleSource"),
        "artistSource": meta.get("artistSource"),
        "parseConfidence": meta.get("parseConfidence"),
        "importedAt": datetime.now().isoformat(timespec="seconds"),
    }


def load_library(path: Path) -> list[dict]:
    if not path.exists():
        return []
    return json.loads(path.read_text(encoding="utf-8"))


def backup_and_write(path: Path, payload: Any) -> None:
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup = path.with_suffix(path.suffix + f".bak_{stamp}")
    shutil.copy2(path, backup)
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


# ---------------------------------------------------------------------------
# Stage 6 — Analysis queue
# ---------------------------------------------------------------------------

ANALYSIS_FIELDS = ["durationSeconds", "bpm", "moodTags", "grouping", "genres"]


def needs_analysis(record: dict) -> list[str]:
    return [f for f in ANALYSIS_FIELDS if is_placeholder(record.get(f))]


# ---------------------------------------------------------------------------
# Reports
# ---------------------------------------------------------------------------


def write_reports(
    candidates: list[ImportCandidate],
    write_mode: bool,
    manifest_path: Path | None,
    source: Path,
) -> None:
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    now = datetime.now().isoformat(timespec="seconds")

    to_import = [c for c in candidates if not c.duplicate.is_duplicate]
    duplicates = [c for c in candidates if c.duplicate.is_duplicate]
    analysis_queue = [
        {
            "recordId": c.track_record.get("trackId", ""),
            "artist": c.meta.get("artist", ""),
            "title": c.meta.get("title", ""),
            "audioPath": str(c.path),
            "needs": needs_analysis(c.track_record),
        }
        for c in to_import
    ]

    # Analysis queue
    (REPORTS_DIR / "MUSIC_external_analysis_queue.json").write_text(
        json.dumps(analysis_queue, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )

    # Preview report
    preview_lines = [
        "# MUSIC External Import Preview",
        "",
        f"Generated: {now}",
        f"Source: `{source}`",
        f"Mode: {'WRITE' if write_mode else 'DRY-RUN'}",
        "",
        "## Summary",
        "",
        f"| | Count |",
        f"|---|---:|",
        f"| Discovered | {len(candidates)} |",
        f"| To import | {len(to_import)} |",
        f"| Duplicates skipped | {len(duplicates)} |",
        f"| Analysis queue | {len(analysis_queue)} |",
        "",
        "## Tracks to Import",
        "",
        "| # | Title | Artist | Track# | Confidence | Path |",
        "|---|---|---|:---:|:---:|---|",
    ]
    for i, c in enumerate(to_import, 1):
        preview_lines.append(
            f"| {i} | {c.meta.get('title','')[:40]} | {c.meta.get('artist','')[:25]} "
            f"| {c.meta.get('trackNumber') or '—'} "
            f"| {c.meta.get('parseConfidence', 0):.2f} "
            f"| `{c.path.name}` |"
        )

    if duplicates:
        preview_lines.extend(["", "## Duplicates Skipped", ""])
        for c in duplicates:
            preview_lines.append(f"- `{c.path.name}` — {c.duplicate.reason}")

    (REPORTS_DIR / "MUSIC_external_import_preview.md").write_text(
        "\n".join(preview_lines) + "\n", encoding="utf-8"
    )

    # Import manifest
    if manifest_path:
        manifest = {
            "importedAt": now,
            "source": str(source),
            "mode": "write" if write_mode else "dry-run",
            "tracksImported": len(to_import) if write_mode else 0,
            "tracks": [c.track_record for c in to_import],
        }
        IMPORTS_DIR.mkdir(parents=True, exist_ok=True)
        manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main() -> None:
    parser = argparse.ArgumentParser(description="MUSIC external track import pipeline.")
    parser.add_argument("--source", required=True, help="Path to audio folder to import from")
    parser.add_argument("--dry-run", action="store_true", default=False)
    parser.add_argument("--write", action="store_true", default=False)
    parser.add_argument("--allow-duplicates", action="store_true", default=False)
    args = parser.parse_args()

    if args.dry_run == args.write:
        raise SystemExit("Choose exactly one of --dry-run or --write.")

    source = Path(args.source).expanduser().resolve()
    if not source.is_dir():
        raise SystemExit(f"Source directory does not exist: {source}")

    # Load existing library
    existing_tracks = load_library(EXTERNAL_LIBRARY_FILE)
    print(f"Existing external tracks: {len(existing_tracks)}")
    known_paths, art_title_idx, filename_idx = build_existing_index(existing_tracks)

    # Stage 1 — Discover
    audio_files = discover_audio_files(source)
    print(f"Discovered: {len(audio_files)} audio files in {source}")

    candidates: list[ImportCandidate] = []

    for path in audio_files:
        # Stage 2 — Filename parse
        fn_parse = parse_filename(path.stem)

        # Stage 3 — Audio tags
        tags = read_audio_tags(path)
        meta = merge_metadata(tags, fn_parse)

        # Stage 4 — Duplicate check
        dup = check_duplicate(path, meta, known_paths, art_title_idx, filename_idx)
        if dup.is_duplicate and not args.allow_duplicates:
            candidates.append(ImportCandidate(path=path, meta=meta, duplicate=dup))
            continue

        # Stage 5 — Build record
        record = build_track_record(path, meta)
        candidates.append(ImportCandidate(path=path, meta=meta, duplicate=dup, track_record=record))

    to_import = [c for c in candidates if not c.duplicate.is_duplicate]
    date_stamp = datetime.now().strftime("%Y-%m-%d")
    manifest_path = IMPORTS_DIR / f"{date_stamp}_external_import_manifest.json"

    # Write reports
    write_reports(candidates, write_mode=args.write, manifest_path=manifest_path, source=source)

    if args.write and to_import:
        new_records = [c.track_record for c in to_import]
        updated = existing_tracks + new_records
        backup_and_write(EXTERNAL_LIBRARY_FILE, updated)
        print(f"Wrote {len(new_records)} new tracks to {EXTERNAL_LIBRARY_FILE}")
        print(f"Manifest: {manifest_path}")
    elif args.write:
        print("No new tracks to import.")

    print()
    print(f"Discovered: {len(candidates)}")
    print(f"To import: {len(to_import)}")
    print(f"Duplicates skipped: {len(candidates) - len(to_import)}")
    print(f"Preview: {REPORTS_DIR / 'MUSIC_external_import_preview.md'}")


if __name__ == "__main__":
    main()
