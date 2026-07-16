"""
manifest_input.py — Parse MUSIC-exported CSV manifests for AudioLab.

Supports:
  - Missing Analysis CSV  (trackId,title,artist,filename,filePath,crateIds,missingFields,reason)
  - External Manifest CSV (adds currentBpm, currentKey, etc.)

Returns manifest rows and skipped rows.
"""

import csv
import pathlib
from typing import NamedTuple

SUPPORTED_EXTENSIONS = {".wav", ".flac", ".mp3", ".aiff", ".aif", ".m4a", ".ogg"}


class ManifestRow(NamedTuple):
    trackId: str
    filePath: str
    filename: str
    title: str
    artist: str
    missingFields: list     # list of field names, may be empty
    crateIds: list          # list of crate ids, may be empty
    raw: dict               # full original row for passthrough


class SkippedRow(NamedTuple):
    trackId: str
    title: str
    artist: str
    filePath: str
    filename: str
    reason: str


def _norm_col(name: str) -> str:
    """Lowercase + strip for tolerant column matching."""
    return name.strip().lower()


def parse_manifest_csv(csv_path: str) -> tuple[list[ManifestRow], list[SkippedRow]]:
    """
    Read a MUSIC-exported CSV manifest.
    Returns (rows_to_analyze, skipped_rows).
    """
    p = pathlib.Path(csv_path)
    if not p.exists():
        raise FileNotFoundError(f"Manifest not found: {csv_path}")

    rows: list[ManifestRow] = []
    skipped: list[SkippedRow] = []
    seen_file_paths: dict[str, ManifestRow] = {}  # filePath → first row (dedup)

    with open(p, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        if reader.fieldnames is None:
            return rows, skipped

        # Build normalised field map
        field_map: dict[str, str] = {_norm_col(c): c for c in reader.fieldnames}

        def get(row: dict, *candidates: str) -> str:
            for c in candidates:
                orig = field_map.get(c)
                if orig and row.get(orig, "").strip():
                    return row[orig].strip()
            return ""

        for raw_row in reader:
            track_id  = get(raw_row, "trackid")
            file_path = get(raw_row, "filepath")
            filename  = get(raw_row, "filename")
            title     = get(raw_row, "title")
            artist    = get(raw_row, "artist")
            missing_str = get(raw_row, "missingfields")
            crate_str   = get(raw_row, "crateids")

            missing_fields = [f.strip() for f in missing_str.split(";") if f.strip()] if missing_str else []
            crate_ids      = [c.strip() for c in crate_str.split(";") if c.strip()] if crate_str else []

            def skip(reason: str):
                skipped.append(SkippedRow(
                    trackId=track_id,
                    title=title,
                    artist=artist,
                    filePath=file_path,
                    filename=filename,
                    reason=reason,
                ))

            if not file_path:
                skip("missing_file_path")
                continue

            resolved = pathlib.Path(file_path).resolve()

            if not resolved.exists():
                skip("file_not_found")
                continue

            if resolved.suffix.lower() not in SUPPORTED_EXTENSIONS:
                skip("unsupported_extension")
                continue

            # Dedup by resolved filePath — analyze once, write per trackId
            resolved_str = str(resolved)
            if resolved_str in seen_file_paths:
                # Mark original as duplicate in skipped — but we still track this
                # trackId so we can clone the result later
                skipped.append(SkippedRow(
                    trackId=track_id,
                    title=title,
                    artist=artist,
                    filePath=resolved_str,
                    filename=filename,
                    reason="duplicate_file_path",
                ))
                continue

            # Derive filename from path if not supplied
            if not filename:
                filename = resolved.name

            row = ManifestRow(
                trackId=track_id,
                filePath=resolved_str,
                filename=filename,
                title=title,
                artist=artist,
                missingFields=missing_fields,
                crateIds=crate_ids,
                raw=dict(raw_row),
            )
            rows.append(row)
            seen_file_paths[resolved_str] = row

    return rows, skipped


def write_skipped_csv(skipped: list[SkippedRow], path: pathlib.Path):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["trackId", "title", "artist", "filePath", "filename", "reason"])
        for r in skipped:
            writer.writerow([r.trackId, r.title, r.artist, r.filePath, r.filename, r.reason])
