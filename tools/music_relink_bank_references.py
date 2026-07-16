from __future__ import annotations

import argparse
import json
import re
import shutil
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Iterable

AUDIO_EXTENSIONS = {".mp3", ".wav", ".flac", ".m4a", ".aac", ".ogg"}
DATA_EXTENSIONS = {".json", ".m3u", ".m3u8", ".txt", ".md"}
PATH_FIELD_NAMES = {
    "filePath",
    "filepath",
    "path",
    "src",
    "source",
    "audioSrc",
    "audioPath",
    "url",
    "href",
}

# These fields store bare filenames used as lookup keys, not resolvable paths.
# Do not treat them as stale references even if they end in an audio extension.
FILENAME_KEY_NAMES = {
    "fileName",
    "filename",
    "audioFilename",
    "name",
    "file",
}


@dataclass(frozen=True)
class AudioCandidate:
    path: Path
    filename: str
    filename_lower: str
    filename_normalized: str
    stem_lower: str


@dataclass(frozen=True)
class RelinkDecision:
    source_file: Path
    old_value: str
    new_value: str | None
    confidence: float
    reason: str
    writable: bool


def normalize_name(value: str) -> str:
    cleaned = value.strip().lower()
    cleaned = re.sub(r"[^a-z0-9._-]+", "_", cleaned)
    cleaned = re.sub(r"_+", "_", cleaned)
    return cleaned.strip("_")


def is_audio_reference(value: str) -> bool:
    lowered = value.lower().split("?")[0].split("#")[0]
    return any(lowered.endswith(ext) for ext in AUDIO_EXTENSIONS)


def path_exists(repo_root: Path, value: str) -> bool:
    if value.startswith("http://") or value.startswith("https://"):
        return True

    candidate = Path(value).expanduser()
    if candidate.is_absolute():
        return candidate.exists()

    return (repo_root / value).exists()


def _is_under(path: Path, parent: Path) -> bool:
    try:
        path.relative_to(parent)
        return True
    except ValueError:
        return False


def to_repo_relative(repo_root: Path, target: Path) -> str:
    try:
        return target.resolve().relative_to(repo_root.resolve()).as_posix()
    except ValueError:
        return target.resolve().as_posix()


def collect_audio_candidates(audio_roots: list[Path]) -> list[AudioCandidate]:
    seen: set[Path] = set()
    candidates: list[AudioCandidate] = []
    for audio_root in audio_roots:
        for path in sorted(audio_root.rglob("*")):
            if not path.is_file() or path.suffix.lower() not in AUDIO_EXTENSIONS:
                continue
            resolved = path.resolve()
            if resolved in seen:
                continue
            seen.add(resolved)
            filename = path.name
            candidates.append(
                AudioCandidate(
                    path=path,
                    filename=filename,
                    filename_lower=filename.lower(),
                    filename_normalized=normalize_name(filename),
                    stem_lower=path.stem.lower(),
                )
            )
    return candidates


def match_audio_reference(
    repo_root: Path,
    old_value: str,
    candidates: list[AudioCandidate],
    allow_stem: bool,
) -> tuple[Path | None, float, str]:
    old_name = Path(old_value.split("?")[0].split("#")[0]).name
    old_name_lower = old_name.lower()
    old_name_normalized = normalize_name(old_name)
    old_stem_lower = Path(old_name).stem.lower()

    exact = [item for item in candidates if item.filename == old_name]
    if len(exact) == 1:
        return exact[0].path, 1.0, "exact filename match"

    lower = [item for item in candidates if item.filename_lower == old_name_lower]
    if len(lower) == 1:
        return lower[0].path, 0.98, "case-insensitive filename match"

    normalized = [item for item in candidates if item.filename_normalized == old_name_normalized]
    if len(normalized) == 1:
        return normalized[0].path, 0.95, "normalized filename match"

    stem = [item for item in candidates if item.stem_lower == old_stem_lower]
    if len(stem) == 1 and allow_stem:
        return stem[0].path, 0.85, "unique stem match"
    if len(stem) == 1:
        return None, 0.85, "unique stem match requires --allow-stem"
    if len(stem) > 1:
        return None, 0.0, "multiple candidates share same stem"

    return None, 0.0, "no candidate found"


def iter_data_files(search_roots: Iterable[Path]) -> Iterable[Path]:
    ignored_dirs = {"node_modules", ".git", "dist", "build", ".next", "coverage"}
    for root in search_roots:
        if not root.exists():
            continue
        for path in sorted(root.rglob("*")):
            if any(part in ignored_dirs for part in path.parts):
                continue
            if path.is_file() and path.suffix.lower() in DATA_EXTENSIONS:
                yield path


def walk_json_values(data: Any) -> Iterable[str]:
    if isinstance(data, dict):
        for key, value in data.items():
            if key in FILENAME_KEY_NAMES:
                # Bare filename fields are lookup keys, not resolvable paths — skip
                continue
            if isinstance(value, str) and (key in PATH_FIELD_NAMES or is_audio_reference(value)):
                yield value
            else:
                yield from walk_json_values(value)
    elif isinstance(data, list):
        for item in data:
            yield from walk_json_values(item)
    elif isinstance(data, str) and is_audio_reference(data):
        yield data


def extract_references_from_file(path: Path) -> list[str]:
    text = path.read_text(encoding="utf-8", errors="ignore")
    if path.suffix.lower() == ".json":
        try:
            parsed = json.loads(text)
        except json.JSONDecodeError:
            return extract_references_from_text(text)
        return sorted(set(value for value in walk_json_values(parsed) if is_audio_reference(value)))
    return extract_references_from_text(text)


def extract_references_from_text(text: str) -> list[str]:
    pattern = re.compile(r"[^\s\"'<>]+\.(?:mp3|wav|flac|m4a|aac|ogg)", re.IGNORECASE)
    return sorted(set(match.group(0) for match in pattern.finditer(text)))


def build_decisions(
    repo_root: Path,
    audio_roots: list[Path],
    search_roots: list[Path],
    allow_stem: bool,
    exclude_paths: set[Path] | None = None,
    exclude_scan_dirs: list[Path] | None = None,
) -> list[RelinkDecision]:
    candidates = collect_audio_candidates(audio_roots)
    decisions: list[RelinkDecision] = []
    excluded_files = {p.resolve() for p in (exclude_paths or set())}
    excluded_dirs = [d.resolve() for d in (exclude_scan_dirs or [])]

    for source_file in iter_data_files(search_roots):
        # Skip files inside audio content directories (they list audio, not reference it)
        resolved = source_file.resolve()
        if any(_is_under(resolved, d) for d in excluded_dirs):
            continue
        # Skip explicitly excluded files (e.g. the report output file)
        if resolved in excluded_files:
            continue
        references = extract_references_from_file(source_file)
        for old_value in references:
            if path_exists(repo_root, old_value):
                continue

            matched_path, confidence, reason = match_audio_reference(
                repo_root=repo_root,
                old_value=old_value,
                candidates=candidates,
                allow_stem=allow_stem,
            )
            new_value = to_repo_relative(repo_root, matched_path) if matched_path else None
            writable = matched_path is not None and confidence >= 0.95
            if allow_stem and matched_path is not None and confidence >= 0.85:
                writable = True

            decisions.append(
                RelinkDecision(
                    source_file=source_file,
                    old_value=old_value,
                    new_value=new_value,
                    confidence=confidence,
                    reason=reason,
                    writable=writable,
                )
            )

    return decisions


def backup_file(path: Path) -> Path:
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_path = path.with_suffix(path.suffix + f".bak_{stamp}")
    shutil.copy2(path, backup_path)
    return backup_path


def apply_decisions(decisions: list[RelinkDecision]) -> list[Path]:
    changed_files: list[Path] = []
    grouped: dict[Path, list[RelinkDecision]] = {}
    for decision in decisions:
        if decision.writable and decision.new_value is not None:
            grouped.setdefault(decision.source_file, []).append(decision)

    for source_file, file_decisions in grouped.items():
        text = source_file.read_text(encoding="utf-8", errors="ignore")
        updated = text
        for decision in file_decisions:
            updated = updated.replace(decision.old_value, decision.new_value or decision.old_value)

        if updated != text:
            backup_file(source_file)
            source_file.write_text(updated, encoding="utf-8")
            changed_files.append(source_file)

    return changed_files


def write_report(report_path: Path, decisions: list[RelinkDecision], changed_files: list[Path]) -> None:
    resolved = [item for item in decisions if item.new_value]
    unresolved = [item for item in decisions if not item.new_value]
    writable = [item for item in decisions if item.writable]

    lines = [
        "# MUSIC Bank Reference Relink Report",
        "",
        f"Generated: {datetime.now().isoformat(timespec='seconds')}",
        "",
        "## Summary",
        "",
        f"- Broken references found: {len(decisions)}",
        f"- Resolved references: {len(resolved)}",
        f"- Writable references: {len(writable)}",
        f"- Unresolved references: {len(unresolved)}",
        f"- Changed files: {len(changed_files)}",
        "",
        "## Changed Files",
        "",
    ]

    if changed_files:
        lines.extend(f"- `{path.as_posix()}`" for path in changed_files)
    else:
        lines.append("- None")

    lines.extend(["", "## Decisions", ""])
    for decision in decisions:
        lines.extend(
            [
                f"### `{decision.source_file.as_posix()}`",
                "",
                f"- Old: `{decision.old_value}`",
                f"- New: `{decision.new_value or 'UNRESOLVED'}`",
                f"- Confidence: `{decision.confidence:.2f}`",
                f"- Reason: {decision.reason}",
                f"- Writable: `{str(decision.writable).lower()}`",
                "",
            ]
        )

    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text("\n".join(lines), encoding="utf-8")


_DEFAULT_AUDIO_ROOTS = [
    "library/music/catalog/audio",
    "library/music/external/audio",
    "library/music/reference/audio",
]

# Directories that contain audio files themselves (not data that references audio).
# Files inside these dirs are skipped during the reference scan.
_DEFAULT_AUDIO_CONTENT_DIRS = _DEFAULT_AUDIO_ROOTS


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Relink stale MUSIC bank audio references.")
    parser.add_argument("--repo-root", default="/Users/studio/Projects/wall-of-sound")
    parser.add_argument(
        "--audio-root",
        action="append",
        dest="audio_roots",
        metavar="PATH",
        help="Audio content directory (may be repeated). Defaults to the three standard MUSIC audio dirs.",
    )
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--write", action="store_true")
    parser.add_argument("--allow-stem", action="store_true")
    parser.add_argument(
        "--report",
        default="/Users/studio/Projects/wall-of-sound/music/reports/MUSIC_bank_reference_relink_report.md",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if args.dry_run == args.write:
        raise SystemExit("Choose exactly one mode: --dry-run or --write")

    repo_root = Path(args.repo_root).expanduser().resolve()
    report_path = Path(args.report).expanduser()

    if not repo_root.exists():
        raise SystemExit(f"Repo root does not exist: {repo_root}")

    raw_roots = args.audio_roots if args.audio_roots else _DEFAULT_AUDIO_ROOTS
    audio_roots: list[Path] = []
    for r in raw_roots:
        p = Path(r).expanduser()
        if not p.is_absolute():
            p = repo_root / p
        p = p.resolve()
        if p.exists():
            audio_roots.append(p)
        else:
            print(f"Warning: audio root does not exist, skipping: {p}")

    if not audio_roots:
        raise SystemExit("No valid audio roots found.")

    audio_content_dirs = audio_roots  # same set — skip scanning inside these dirs

    search_roots = [
        repo_root / "music",
        repo_root / "library",
        repo_root / "wall" / "data",
    ]

    decisions = build_decisions(
        repo_root=repo_root,
        audio_roots=audio_roots,
        search_roots=search_roots,
        allow_stem=args.allow_stem,
        exclude_paths={report_path},
        exclude_scan_dirs=audio_content_dirs,
    )

    changed_files: list[Path] = []
    if args.write:
        changed_files = apply_decisions(decisions)

    write_report(report_path, decisions, changed_files)

    print(f"Broken references found: {len(decisions)}")
    print(f"Writable references: {sum(1 for item in decisions if item.writable)}")
    print(f"Changed files: {len(changed_files)}")
    print(f"Report: {report_path}")


if __name__ == "__main__":
    main()
