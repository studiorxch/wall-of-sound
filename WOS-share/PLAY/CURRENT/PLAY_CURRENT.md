---
date_generated: 2026-07-02
project: PLAY
source_pack: current
coverage_start: 2026-06-22
coverage_end: 2026-07-02
status: active
---

# PLAY Current

## Current Focus

PLAY is a **programmable music channel system** — playlist authoring + live scheduler + event-first programming + Smart Grid broadcast composition + Broadcast HUD output.

```text
PLAYLIST    — creates trusted program blocks with source-grouped tracks
SCHEDULER   — event-first TV-guide timeline; playlists attach to events
LIBRARY     — mood-tagged track catalog; catalog audition/playback; objectUrl linking
SMART GRID  — schedule-aware broadcast compositor (off by default, ⊞-gated)
BROADCAST HUD — clean OBS-friendly output surface
```

## Active Build / Active Work

Last completed: **0702A** (PlaylistIdentityModalRedesign — two-column layout, removed broadcast/theme controls, 2026-07-02).
Prior chain: **0701J** → **0701I** → **0701H** → **0701G** → **0624G**.

## Current Blocker

None known. `tsc --noEmit` exits 0. `npm run build` fails at the Vite step only due to Node 18 environment (pre-existing, unrelated to product code).

## Current Product Model

```text
Operator creates a Library of tagged, mood-catalogued tracks.
Tracks are organized into Source Pools (genre/mood/album filters).
Playlists are created from pools (static or template).
Events are scheduled on the TV-guide; playlists attach to events.
Scheduler resolves NOW EVENT / NEXT EVENT.
Smart Grid routes visual content into schedule-aware regions.
Broadcast HUD is the clean output surface.
```

## Left Nav Structure (as of 0701I + 0701J)

```text
LIBRARIES
  ├── [SR] StudioRich Catalog   (⋯ menu: Source Settings, Scan Catalog, Re-scan Audio Folder, Analyze Mechanical Moods)
  ├── [EXT] External            (⋯ menu: Import Audio Folder as External Tracks…, Scan Catalog CSV, Analyze, Source Settings)
  └── ⊞ All Tracks

PLAYLISTS
  ├── [cover] Playlist Name   [count]  ⋮
  └── + Create New Playlist
```

## What Changed (0701H → 0702A)

- **0701H** — Workspace separation: Flow Curve/PlaylistHeader are playlist-only. Catalog table full-height in library view. Play buttons in far-left `col-play-ctrl` column. `currentTrack` falls back to `auditionTrackId`. Single-line mood chips. Left nav playlist rows: name + count badge only.
- **0701H** — Catalog UI: removed chip strip entirely; replaced with CATALOG page header (section identity + status line), always-visible filter section (Search, Mood, Group, Genre, Source, Rating, Playable), TRACKS label above table. Mechanical moods column added.
- **0701I** — Left nav trimmed to LIBRARIES + PLAYLISTS only. Removed Groups, Build From Catalog, Utility section (Orphans, Excluded, Locked Tracks).
- **0701J** — Left nav Libraries: StudioRich + External + All Tracks only (Reference and Unknown Review hidden). StudioRich source menu simplified to 4 actions. External source menu leads with "Import Audio Folder as External Tracks…". `handleImportAudioFolderAsExternal` creates Track records from audio files (no CSV required), `sourceOwner: "external"`, live objectUrl.
- **0702A** — Playlist Identity modal fully redesigned. Two-column layout: Artwork (Cover + Background with Choose File / Clear) left, Details (Title + large Description textarea + Mood Tags) right. Footer: Cancel + Save Changes. Removed: Accent Color, Presentation Mode, Map Color Themes, Extracted Theme, Broadcast Preview.

Prior changes (0701G and earlier): see rollup `REPORTS/rollups/2026-07-02_PLAY_CONTINUITY_ROLLUP.md`.

## What Is Working

- Full playlist authoring, curve-based assignment, source-group isolation
- Decoupled playback (editor selection does not interrupt live playback)
- Catalog audition: `▶` plays track, `+▶` auditions and adds to playlist
- Audio folder linking with live objectUrl playback (no media server required)
- External audio folder import: creates Track records from audio files without CSV
- Mood tag workflow: import ref → suggestions → user edit, with restore actions
- Scheduler with event-first model (BroadcastEvent + ScheduleBlock dual record)
- Smart Grid composition (schedule-aware regions, map region with iframe opt-in)
- Library with mood tags, audio analysis fields, bulk metadata edit, source pools
- Durable project export/import (.wosplay format)
- Playlist Identity modal: Title, Description, Cover, Background, Mood Tags
- TypeScript build clean (`tsc --noEmit` exits 0)

## What Is Not Working

- `npm run build` (Vite) fails: Node 18 present, Vite requires Node 20+ (pre-existing environment issue)
- Live WOS / Mapbox integration not wired (iframe source is dev opt-in only)
- Source pool editor UI not built (data model exists)
- Event recurrence expansion not implemented

## Continue From Here

App root: `play/src/` (Vite + React + TypeScript, port 5173).
Last stable state: **0702A** — `tsc --noEmit` clean, all features above working.
See `PLAY_BUILD_STATUS.md` for full build ledger.
