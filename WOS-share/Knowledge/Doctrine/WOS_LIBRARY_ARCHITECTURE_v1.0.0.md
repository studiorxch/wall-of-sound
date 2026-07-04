---
doc_id: WOS_LIBRARY_ARCHITECTURE
version: 1.0.0
date: 2026-07-04
status: PLANNING NOTE — future domains are not yet implemented
scope: cross-system
---

# WOS Library Architecture

## Purpose

This document defines the two classes of WOS Library and establishes the Transit/Subway Library as a planned future domain. It is a planning note only — no implementation is authorized here beyond the MUSIC Library (documented in PLAY CURRENT).

---

## Two Classes of WOS Library

### Asset Libraries

Asset libraries hold media files and their metadata. Items are primarily files that can be played, displayed, or rendered. The library's job is curation, organization, and playback routing.

| Library | Domain | Primary Asset | Status |
|---|---|---|---|
| MUSIC | Sound | Audio files (MP3, FLAC, WAV, etc.) | Active (PLAY) |
| IMAGE | Visual | Image files | Planned |
| COLOR | Palette | Color sets, gradients | Planned |
| VIDEO | Moving image | Video clips | Planned |

**Key property:** Asset library items always have a backing file. Missing the file = broken link. The `audioLinked` / `audioMissing` pattern in MUSIC is the canonical model for all asset libraries.

---

### Entity / Intelligence Libraries

Entity libraries hold structured records about real-world or conceptual objects. Items are not files — they are data entities that may optionally link to assets (photos, sounds, maps, etc.). The library's job is relational structuring, lookup, and intelligence routing.

| Library | Domain | Primary Entity | Status |
|---|---|---|---|
| TRANSIT | Infrastructure | Station, Route, Line | Planned |
| PLACES | Geography | Venue, Neighborhood, Address | Planned |
| EVENTS | Temporal | Performance, Broadcast, Show | Partial (BroadcastEvent in PLAY) |
| ACTORS | Human | Person, Band, Role | Planned |

**Key property:** Entity library items can exist without any linked file. A Station record is valid without a photo or field recording attached. Assets enrich entities — they do not constitute them.

---

## Transit / Subway Library (Future Domain)

### Motivation

The subway map is a core WOS surface. The map already carries real geographic structure: stations, routes, lines, transfers. This structure belongs in a proper Library — not hard-coded into the map layer — so that:

- Stations can carry metadata (neighborhood, ridership window, atmosphere, nearby places)
- Field recordings can be linked to stations
- Music playlists can be associated with route segments or service patterns
- Broadcast routes (WOS sequences) can follow transit topology
- The Smart Grid can render station-intelligence views

### Entity Structure (Proposed)

```
TRANSIT Library
└── Subway
    ├── Lines          — named subway lines (A, C, E; 4, 5, 6; L; etc.)
    ├── Routes         — directional service variants within a line
    ├── Stations       — individual station records (the primary entity)
    │   ├── Identity      name, borough, neighborhood, coordinates
    │   ├── Service       lines served, transfer points, ADA status
    │   ├── Atmosphere    character tags, time-of-day notes, crowd notes
    │   ├── Assets        field recordings, photos, visual references
    │   ├── Music         linked playlist or mood profile for this station
    │   └── Intelligence  smart grid data, broadcast trigger rules
    ├── Transfers      — inter-line or inter-station transfer records
    ├── Entrances      — entrance/exit points with directional metadata
    └── Service Patterns — peak/off-peak/weekend variants
```

### Station Record Connections (Cross-System)

A Station record is a hub that touches multiple WOS systems:

| Connection | Linked system | Description |
|---|---|---|
| Field recordings | MUSIC (External) | Audio captured at or near the station |
| Playlist | MUSIC Playlist | Recommended listening for this station's character |
| Map pin | MAP / WORLD | Station location rendered on the world surface |
| Broadcast route | PLAY Scheduler | WOS broadcast sequence that "travels" the line |
| Smart Grid view | BroadcastGridLayer | Station intelligence panel as a grid region |
| Nearby places | PLACES Library | Adjacent venues, landmarks, food, etc. |
| Events | EVENTS Library | Performances or broadcasts associated with station area |

### Relationship to MUSIC Library

Transit is an entity library; MUSIC is an asset library. They connect at specific points:

- A Station record may reference a `playlistId` from the MUSIC Library (mood/character playlist)
- A Station record may reference one or more `trackId`s from External (`sourceOwner: "external"`) for field recordings
- Transit never owns Track records — it links to them by ID
- MUSIC tracks never carry station metadata — linking is one-directional (Transit → MUSIC)

### What Transit Is NOT

- Not a replacement for the map layer (Transit Library is data; the map is a rendering surface)
- Not a music organization system (playlists belong to MUSIC)
- Not a scheduler (broadcast routes are defined in PLAY Scheduler)
- Not a navigation product (no turn-by-turn or live service data)

---

## Asset vs. Entity: Decision Rule

When adding a new Library domain, ask: **Is the primary record a file, or a structured object that may optionally have files?**

- **File first** → Asset Library (MUSIC, IMAGE, COLOR, VIDEO pattern)
- **Object first, files optional** → Entity Library (TRANSIT, PLACES, EVENTS, ACTORS pattern)

The distinction determines:
- Schema shape (asset: `filePath` + `linked` flags; entity: typed fields + optional `assets[]`)
- Missing-state semantics (asset: broken; entity: still valid, just unattached)
- Maintenance surface (asset: audio/image linker; entity: field editor + relationship manager)

---

## Implementation Constraint

**Do not implement the Transit Library until the MUSIC Library is fully stable and the cover assignment workflow is complete.**

The cover assignment workflow (bulk image-to-track matching from folder scan) is the current next milestone in PLAY. Transit is post-that.

---

## Related Documents

- `WOS-share/PLAY/CURRENT/PLAY_DECISIONS.md` — MUSIC Library architecture decisions
- `WOS-share/PLAY/CURRENT/PLAY_BUILD_STATUS.md` — current PLAY build state
- `WOS-share/Knowledge/Doctrine/0628G_WOS_ChannelRuntimeAndSchedulerBoundary_v1.0.0.md` — channel/scheduler boundary doctrine
