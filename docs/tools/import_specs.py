#!/usr/bin/env python3
"""
0425_DOCS_ImportLegacySpecs_v1.0.0

Imports legacy Wall of Sound markdown specs into the Jekyll docs collection.

Behavior:
- Reads .md files from a source folder.
- Adds YAML front matter if missing.
- Writes converted specs into docs/_specs/wall/.
- Does not alter original files.
"""

from __future__ import annotations

import re
import shutil
from pathlib import Path
from typing import Optional


PROJECT_ROOT = Path(__file__).resolve().parents[2]
DOCS_DIR = PROJECT_ROOT / "docs"

SOURCE_DIR = PROJECT_ROOT / "legacy_specs"
OUTPUT_DIR = DOCS_DIR / "_specs" / "wall"

DEFAULT_PROJECT = "Wall of Sound"
DEFAULT_DOMAIN = "wall"
DEFAULT_SYSTEM = "WOS"


def infer_date(filename: str) -> str:
    match = re.match(r"(\d{2})(\d{2})_", filename)
    if not match:
        return "2026-04-01"

    month, day = match.groups()
    return f"2026-{month}-{day}"


def infer_version(filename: str) -> str:
    match = re.search(r"_v(\d+(?:\.\d+){0,2})", filename)
    if not match:
        return "1.0.0"

    version = match.group(1)
    parts = version.split(".")

    while len(parts) < 3:
        parts.append("0")

    return ".".join(parts[:3])


def infer_component(filename: str) -> str:
    name = filename.lower()

    component_rules = [
        ("emitter", "emitter_system"),
        ("physics", "physics"),
        ("world", "world_system"),
        ("panel", "ui"),
        ("hud", "ui"),
        ("inspector", "ui"),
        ("ui", "ui"),
        ("audio", "audio_system"),
        ("sound", "audio_system"),
        ("sample", "sample_engine"),
        ("linetool", "line_tool"),
        ("line", "line_tool"),
        ("motion", "motion_system"),
        ("particle", "particle_system"),
        ("shape", "shape_system"),
        ("export", "export_system"),
        ("dragdrop", "drag_drop"),
        ("performance", "performance"),
        ("master", "master_pack"),
    ]

    for token, component in component_rules:
        if token in name:
            return component

    return "general"


def clean_title(filename: str) -> str:
    stem = Path(filename).stem
    stem = re.sub(r"^\d{4}_", "", stem)
    stem = stem.replace("WALL_OF_SOUND_", "")
    stem = stem.replace("WOS_", "")
    stem = re.sub(r"_v\d+(?:\.\d+){0,2}.*$", "", stem)
    stem = stem.replace("_", " ")
    stem = stem.replace("+", " + ")
    return stem.strip()


def has_front_matter(content: str) -> bool:
    return content.startswith("---\n")


def build_front_matter(filename: str) -> str:
    stem = Path(filename).stem
    title = clean_title(filename)
    date = infer_date(filename)
    version = infer_version(filename)
    component = infer_component(filename)

    return f"""---
layout: spec
title: "{title}"
date: {date}
doc_id: "{stem}"
version: "{version}"
project: "{DEFAULT_PROJECT}"
domain: "{DEFAULT_DOMAIN}"
system: "{DEFAULT_SYSTEM}"
component: "{component}"
type: "legacy-spec"
status: "needs-review"
priority: "medium"
risk: "unknown"
summary: "Imported legacy Wall of Sound spec. Needs review."
---

"""


def normalize_filename(path: Path) -> str:
    filename = path.name

    if not filename.endswith(".md"):
        filename = f"{filename}.md"

    return filename


def convert_file(source_path: Path, output_dir: Path) -> Optional[Path]:
    if source_path.is_dir():
        return None

    if source_path.name.startswith("."):
        return None

    if source_path.suffix and source_path.suffix.lower() != ".md":
        return None

    output_dir.mkdir(parents=True, exist_ok=True)

    output_name = normalize_filename(source_path)
    output_path = output_dir / output_name

    content = source_path.read_text(encoding="utf-8", errors="replace")

    if has_front_matter(content):
        converted = content
    else:
        converted = build_front_matter(output_name) + content

    output_path.write_text(converted, encoding="utf-8")
    return output_path


def main() -> None:
    if not SOURCE_DIR.exists():
        raise FileNotFoundError(
            f"Missing source folder: {SOURCE_DIR}\n"
            "Create it and copy legacy specs there first."
        )

    converted_count = 0

    for source_path in sorted(SOURCE_DIR.iterdir()):
        output_path = convert_file(source_path, OUTPUT_DIR)

        if output_path:
            converted_count += 1
            print(f"[OK] {source_path.name} → {output_path.relative_to(PROJECT_ROOT)}")

    print(f"\nImported {converted_count} legacy specs.")


if __name__ == "__main__":
    main()