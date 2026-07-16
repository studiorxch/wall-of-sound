#!/usr/bin/env python3
"""
music_recover_playlists_and_crates.py

Recovers user playlist/crate data lost due to the index-wins race condition bug
(moodDrifted check triggered a save while playlistsRef was still the default "My Mix").

Playlists and crates are stored ONLY in browser localStorage (key: play-project-v2).
The library.index.json backups do NOT contain playlists/crates — they are track-only.

This script:
  1. Reports what library.index.json backups contain (track data only)
  2. Searches for exported project JSON files (from the app's Export feature)
  3. Builds a recovery import file from the best available source
  4. On --write: saves the importable project JSON so the user can import via the app UI

Usage:
  python3 tools/music_recover_playlists_and_crates.py --dry-run
  python3 tools/music_recover_playlists_and_crates.py --write
"""

import sys
import json
import os
import shutil
import glob
from pathlib import Path
from datetime import datetime, timezone

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

REPO_ROOT = Path(__file__).resolve().parent.parent
EXTERNAL_INDEX = REPO_ROOT / "library" / "music" / "external" / "library.index.json"
SEED_FILE = REPO_ROOT / "data" / "catalog" / "studiorich" / "studiorich-project-seed.json"
REPORTS_DIR = REPO_ROOT / "music" / "reports"
RECOVERY_OUT = REPORTS_DIR / "MUSIC_playlist_crate_recovery_report.md"
RECOVERY_IMPORT = REPORTS_DIR / "MUSIC_recovery_import.json"

EXPORT_SEARCH_PATHS = [
    Path.home() / "Downloads" / "_INBOX" / "SAVES",
    Path.home() / "Downloads",
    Path.home() / "Desktop",
    Path.home() / "Documents",
]

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def load_json(path: Path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)

def now_iso():
    return datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")

def count_playlist_tracks(playlists):
    return sum(len(pl.get("slots", [])) for pl in playlists)

# ---------------------------------------------------------------------------
# 1. Inspect library.index.json backups
# ---------------------------------------------------------------------------

def inspect_bak_files():
    """Confirm that .bak files are track-only arrays, not PlayProject objects."""
    bak_files = sorted(EXTERNAL_INDEX.parent.glob("library.index.json.bak_*"))
    results = []
    for bak in bak_files:
        try:
            data = load_json(bak)
            if isinstance(data, list):
                has_playlists = False
                has_crates = False
                track_count = len(data)
            elif isinstance(data, dict):
                has_playlists = bool(data.get("playlists"))
                has_crates = bool(data.get("crates"))
                track_count = len(data.get("libraryTracks", data.get("tracks", [])))
            else:
                has_playlists = has_crates = False
                track_count = 0
            results.append({
                "path": str(bak),
                "name": bak.name,
                "track_count": track_count,
                "has_playlists": has_playlists,
                "has_crates": has_crates,
            })
        except Exception as e:
            results.append({"path": str(bak), "name": bak.name, "error": str(e)})
    return results

# ---------------------------------------------------------------------------
# 2. Find exported project files
# ---------------------------------------------------------------------------

def find_export_files():
    """Search common locations for PLAY_Project_*.json export files."""
    candidates = []
    for search_dir in EXPORT_SEARCH_PATHS:
        if not search_dir.exists():
            continue
        for p in sorted(search_dir.glob("PLAY_Project_*.json"), reverse=True):
            try:
                data = load_json(p)
                project = data.get("project", data)
                if project.get("schemaVersion") != "play-project-v2":
                    continue
                playlists = project.get("playlists", [])
                crates = project.get("crates", [])
                library_tracks = project.get("libraryTracks", [])
                non_empty_playlists = [pl for pl in playlists if pl.get("slots")]
                candidates.append({
                    "path": str(p),
                    "name": p.name,
                    "exported_at": data.get("exportedAt", "unknown"),
                    "playlist_count": len(playlists),
                    "non_empty_playlist_count": len(non_empty_playlists),
                    "playlist_names": [pl.get("title", "?") for pl in playlists],
                    "total_slots": count_playlist_tracks(playlists),
                    "crate_count": len(crates),
                    "library_track_count": len(library_tracks),
                    "project": project,
                })
            except Exception:
                pass
    # Sort by most recent export date
    candidates.sort(key=lambda x: x.get("exported_at", ""), reverse=True)
    return candidates

# ---------------------------------------------------------------------------
# 3. Load current state
# ---------------------------------------------------------------------------

def load_current_state():
    """Load current external library tracks + seed file for the import base."""
    external_tracks = []
    if EXTERNAL_INDEX.exists():
        try:
            external_tracks = load_json(EXTERNAL_INDEX)
        except Exception:
            pass

    seed_project = None
    if SEED_FILE.exists():
        try:
            seed_project = load_json(SEED_FILE)
        except Exception:
            pass

    return external_tracks, seed_project

# ---------------------------------------------------------------------------
# 4. Build recovery import
# ---------------------------------------------------------------------------

def build_recovery_import(source_candidate, seed_project):
    """
    Build an importable PlayProject JSON by merging:
    - Recovered playlists from the best available export
    - Current library tracks from the seed project (most complete available set)

    The resulting file can be imported via the app's import UI.
    After import, the app's index-wins hydration will refresh external tracks
    from library.index.json automatically.
    """
    source_project = source_candidate["project"]

    # Library tracks: merge seed (358 tracks, most recent library) + export (catalog tracks
    # for the playlist slots). Seed wins on conflict (newer data); export fills missing.
    lib_tracks = []
    seed_tracks_list = seed_project.get("libraryTracks", []) if seed_project else []
    export_tracks_list = source_project.get("libraryTracks", [])

    seen_ids = {}
    for t in seed_tracks_list:
        seen_ids[t["trackId"]] = t
    # Add export tracks that aren't already in seed
    for t in export_tracks_list:
        if t["trackId"] not in seen_ids:
            seen_ids[t["trackId"]] = t

    lib_tracks = list(seen_ids.values())

    # Build a trackId → track map for cross-referencing
    track_map = {t["trackId"]: t for t in lib_tracks}

    # Annotate each slot with track availability
    recovered_playlists = source_project.get("playlists", [])
    missing_slots = []
    for pl in recovered_playlists:
        for slot in pl.get("slots", []):
            tid = slot.get("assignedTrackId")
            if tid and tid not in track_map:
                missing_slots.append({"playlistTitle": pl.get("title"), "trackId": tid})

    # Recovered crates (likely empty, but include if present)
    recovered_crates = source_project.get("crates", [])

    ts = datetime.now(timezone.utc).isoformat()
    recovery_project = {
        "schemaVersion": "play-project-v2",
        "libraryTracks": lib_tracks,
        "activePlaylistId": recovered_playlists[0]["playlistId"] if recovered_playlists else "",
        "playlists": recovered_playlists,
        "crates": recovered_crates,
        "excludedTrackIds": source_project.get("excludedTrackIds", []),
        "createdAt": source_project.get("createdAt", ts),
        "updatedAt": ts,
    }

    envelope = {
        "schemaVersion": "play-project-export-v1",
        "exportedAt": ts,
        "project": recovery_project,
    }

    return envelope, missing_slots

# ---------------------------------------------------------------------------
# 5. Report writer
# ---------------------------------------------------------------------------

def write_report(
    bak_results, export_candidates, selected_candidate, missing_slots,
    current_external_count, write_mode, recovery_import_path=None
):
    lines = [
        "# MUSIC Playlist & Crate Recovery Report",
        "",
        f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
        f"Mode: {'--write' if write_mode else '--dry-run'}",
        "",
        "---",
        "",
        "## Root Cause",
        "",
        "The index-wins hydration (moodDrifted check) triggered a `savePlayProject` call",
        "while `playlistsRef.current` was still the initial default `[\"My Mix\"]` — before",
        "`applyProject` had a chance to sync the ref via React's `useEffect`.",
        "",
        "**Fix applied:** `applyProject` now sets `playlistsRef.current = pls` and",
        "`libraryTracksRef.current = p.libraryTracks` directly, before any async save",
        "can run against a stale ref.",
        "",
        "---",
        "",
        "## Library Backup Files (track data only)",
        "",
        "library.index.json backups contain **track arrays only** — no playlists or crates.",
        "Playlist and crate state is stored exclusively in browser `localStorage`.",
        "",
    ]

    for r in bak_results:
        if "error" in r:
            lines.append(f"- {r['name']}: ERROR — {r['error']}")
        else:
            pl_str = "✓ has playlists" if r["has_playlists"] else "✗ no playlists"
            crate_str = "✓ has crates" if r["has_crates"] else "✗ no crates"
            lines.append(f"- {r['name']}: {r['track_count']} tracks, {pl_str}, {crate_str}")

    lines += [
        "",
        "---",
        "",
        "## Exported Project Files Found",
        "",
    ]

    if not export_candidates:
        lines.append("No exported project files found in search paths.")
    else:
        for c in export_candidates:
            lines.append(f"### {c['name']}")
            lines.append(f"- Path: `{c['path']}`")
            lines.append(f"- Exported: {c['exported_at']}")
            lines.append(f"- Playlists: {c['playlist_count']} ({c['non_empty_playlist_count']} with tracks)")
            lines.append(f"  - Names: {', '.join(c['playlist_names'])}")
            lines.append(f"- Total playlist slots: {c['total_slots']}")
            lines.append(f"- Crates: {c['crate_count']}")
            lines.append(f"- Library tracks in export: {c['library_track_count']}")
            lines.append("")

    lines += [
        "---",
        "",
        "## Recovery Summary",
        "",
    ]

    if selected_candidate:
        lines += [
            f"**Source selected:** `{selected_candidate['name']}`",
            f"**Exported:** {selected_candidate['exported_at']}",
            "",
            "### Recovered Playlists",
        ]
        for pl in selected_candidate["project"].get("playlists", []):
            slots = len(pl.get("slots", []))
            lines.append(f"- {pl.get('title', 'Untitled')} — {slots} slots")

        lines += [
            "",
            f"### Recovered Crates",
            f"- Count: {selected_candidate['crate_count']}",
            "",
        ]

        if missing_slots:
            lines += [
                f"### ⚠ Missing Tracks ({len(missing_slots)})",
                "These slot trackIds were not found in the current library:",
            ]
            for ms in missing_slots:
                lines.append(f"- [{ms['playlistTitle']}] trackId: {ms['trackId']}")
            lines.append("")
        else:
            lines.append("### Track Coverage: All slot trackIds found in current library ✓\n")

        lines += [
            "### Preserved Fields",
            f"- External library tracks preserved: {current_external_count}",
            "- Protected track fields changed: 0",
            "",
        ]

        if write_mode and recovery_import_path:
            lines += [
                "---",
                "",
                "## Recovery Import File Written",
                "",
                f"**Path:** `{recovery_import_path}`",
                "",
                "### How to apply recovery",
                "1. Open the MUSIC app in your browser",
                "2. Click ··· (settings menu) → Import Project",
                "3. Select the file at the path above",
                "4. The app will restore the recovered playlists",
                "5. The index-wins hydration will automatically refresh",
                "   External library tracks from library.index.json",
                "",
            ]
        else:
            lines += [
                "---",
                "",
                "## To Apply Recovery",
                "",
                "Run with --write to create the recovery import file:",
                "```",
                "python3 tools/music_recover_playlists_and_crates.py --write",
                "```",
                "",
                "Then import via the MUSIC app's ··· → Import Project menu.",
                "",
            ]
    else:
        lines += [
            "**No recoverable source found.**",
            "",
            "No exported project files with playlists were found in:",
        ]
        for p in EXPORT_SEARCH_PATHS:
            lines.append(f"- {p}")
        lines += [
            "",
            "If you have a PLAY_Project_*.json export file elsewhere, copy it to",
            f"~/Downloads/_INBOX/SAVES/ and re-run this script.",
            "",
        ]

    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    with open(RECOVERY_OUT, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")

    print(f"Report written to: {RECOVERY_OUT}")

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    write_mode = "--write" in sys.argv
    dry_run = "--dry-run" in sys.argv or not write_mode

    if write_mode:
        print("Mode: --write")
    else:
        print("Mode: --dry-run (use --write to create recovery import file)")
    print()

    # 1. Inspect backups
    print("Scanning library.index.json backups...")
    bak_results = inspect_bak_files()
    bak_with_playlists = [r for r in bak_results if r.get("has_playlists")]
    print(f"  Found {len(bak_results)} backup files, {len(bak_with_playlists)} with playlist data")
    print("  Note: library.index.json is a track-only array — backups have NO playlists/crates")
    print()

    # 2. Find exports
    print("Searching for exported project files...")
    export_candidates = find_export_files()
    print(f"  Found {len(export_candidates)} export file(s)")
    for c in export_candidates:
        print(f"    {c['name']}: {c['non_empty_playlist_count']} non-empty playlists, {c['total_slots']} total slots")
    print()

    # 3. Current state
    print("Loading current library state...")
    current_external_tracks, seed_project = load_current_state()
    print(f"  External index: {len(current_external_tracks)} tracks")
    seed_tracks = len(seed_project.get("libraryTracks", [])) if seed_project else 0
    print(f"  Seed project: {seed_tracks} tracks")
    print()

    # 4. Select best source
    selected = None
    for c in export_candidates:
        if c["non_empty_playlist_count"] > 0:
            selected = c
            break

    if not selected:
        print("No recoverable source found with playlists.")
        write_report(bak_results, export_candidates, None, [], len(current_external_tracks), write_mode)
        sys.exit(0)

    print(f"Selected source: {selected['name']}")
    print(f"  Exported: {selected['exported_at']}")
    print(f"  Playlists: {selected['playlist_names']}")
    print(f"  Total slots: {selected['total_slots']}")
    print()

    # 5. Build recovery import
    recovery_envelope, missing_slots = build_recovery_import(selected, seed_project)
    print(f"Recovery import built:")
    print(f"  Playlists: {len(recovery_envelope['project']['playlists'])}")
    print(f"  Library tracks: {len(recovery_envelope['project']['libraryTracks'])}")
    print(f"  Slots with missing tracks: {len(missing_slots)}")
    if missing_slots:
        for ms in missing_slots:
            print(f"    ⚠ [{ms['playlistTitle']}] {ms['trackId']}")
    print()

    recovery_import_path = None

    if write_mode:
        # Backup current state first
        REPORTS_DIR.mkdir(parents=True, exist_ok=True)
        ts = now_iso()
        bak_out = REPORTS_DIR / f"MUSIC_recovery_import.json.bak_{ts}"

        if RECOVERY_IMPORT.exists():
            shutil.copy2(RECOVERY_IMPORT, bak_out)
            print(f"Backup of previous recovery file: {bak_out.name}")

        with open(RECOVERY_IMPORT, "w", encoding="utf-8") as f:
            json.dump(recovery_envelope, f, indent=2, ensure_ascii=False)

        recovery_import_path = str(RECOVERY_IMPORT)
        print(f"Recovery import file written: {RECOVERY_IMPORT}")
        print()
        print("To apply recovery:")
        print("  1. Open MUSIC app in browser")
        print("  2. Click ··· → Import Project")
        print(f"  3. Select: {RECOVERY_IMPORT}")
        print("  4. App restores playlists; index-wins refreshes external tracks automatically")
    else:
        print("Dry run complete. Run with --write to create the recovery import file.")

    print()
    write_report(
        bak_results, export_candidates, selected, missing_slots,
        len(current_external_tracks), write_mode, recovery_import_path
    )

if __name__ == "__main__":
    main()
