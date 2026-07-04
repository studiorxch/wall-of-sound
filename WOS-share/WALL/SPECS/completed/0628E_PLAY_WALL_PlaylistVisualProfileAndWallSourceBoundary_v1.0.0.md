# 0628E — PLAY Playlist Visual Profile + WALL Source Boundary

**Version:** v1.0.0  
**Date:** 2026-06-28  
**Status:** Architecture note  
**Scope:** PLAY / WALL / Canvas / OBS source separation

---

## Core Decision

PLAY does not own the map.

PLAY schedules music and attaches a **Playlist Visual Profile** to the playlist block. The visual profile tells a WALL what visual mode, route, theme, and camera preset should accompany the playlist.

WALL renders the visual output.

OBS composites one or more WALL outputs as independent browser sources.

---

## Operating Model

```text
PLAY orchestrates.
WALL renders.
OBS composites.
Canvas authors/publishes WALLS.
```

---

## PLAY Role

PLAY is the automation/player brain.

PLAY owns:

```text
playlist schedule
music playback
track order
block timing
identity card timing
playlist metadata
visual profile selection
automation commands
audio signal publishing
```

PLAY should not own:

```text
Mapbox
map lifecycle
map camera
route rendering
Orbital runtime
Flight / Drive / Walk map modes
WALL display controls
Canvas authoring controls
OBS composition
```

---

## WALL Role

A WALL is a self-contained visual surface that can operate as an OBS browser source.

A WALL can be automated by PLAY or operated standalone.

A WALL owns its own visual runtime.

Examples:

```text
WALL_MAP
WALL_KINETIC_FISH
WALL_GRID
WALL_PLAYLIST_CARD
```

A thing should only become a WALL if it can:

```text
open as its own browser source
render without editor controls
run standalone
be used full-screen or PIP in OBS
optionally accept automation from PLAY
```

---

## WALL_MAP Role

`WALL_MAP` is the authoritative map visual source.

It owns:

```text
Mapbox
map lifecycle
map camera
routes
map color/theme rendering
Flight mode
Drive mode
Walk mode
Route mode
Orbital mode
```

Orbital is a mode inside `WALL_MAP`.

```text
WALL_MAP
└── modes
    ├── Flight
    ├── Drive
    ├── Walk
    ├── Route
    └── Orbital
```

Orbital should not be treated as a separate competing map app.

---

## Playlist Visual Profile

PLAY attaches a visual profile to a playlist block.

The profile describes what should be shown outside the playlist identity card.

Example:

```json
{
  "playlistId": "soft-disconnects",
  "title": "Soft Disconnects",
  "identity": {
    "card": "playlist-card-soft-disconnects"
  },
  "visual": {
    "wall": "WALL_MAP",
    "mode": "orbital",
    "routeId": "nyc-night-drift",
    "mapTheme": "soft-blue-gray",
    "cameraPreset": "slow-broadcast",
    "duration": "playlist"
  }
}
```

PLAY stores the visual request.

WALL_MAP executes the rendering.

---

## PLAY → WALL Display Command

PLAY should send simple display instructions.

Example:

```json
{
  "command": "SHOW_PLAYLIST_VISUAL",
  "wall": "WALL_MAP",
  "mode": "orbital",
  "routeId": "nyc-night-drift",
  "mapTheme": "soft-blue-gray",
  "cameraPreset": "slow-broadcast",
  "duration": "playlist"
}
```

This is not a second map controller.

This is a display request.

---

## Boundary Rule

```text
PLAY schedules playlists.
Playlist carries a Visual Profile.
WALL_MAP renders that Visual Profile.
OBS captures the result.
```

Do not create:

```text
a PLAY map controller
a duplicate Mapbox instance
PLAY route controls inside WALL
Flow Curve controls inside WALL
sampler controls inside WALL
debug controls inside broadcast WALL
```

---

## Canvas Role

Canvas/Studio is the authoring and publishing system for WALLS.

Canvas should create, configure, preview, and publish WALL outputs.

Canvas may eventually export self-contained HTML WALL packages, but the primary recovery path is:

```text
Canvas authors WALL configs.
WALL renders configs.
PLAY automates WALLS.
OBS composites WALL sources.
```

HTML export is useful later for:

```text
portable demos
offline WALL packages
archived scenes
shareable browser-source bundles
```

---

## Kinetic Fish

Kinetic Fish should be considered a possible standalone WALL if it can run as its own browser source.

```text
WALL_KINETIC_FISH
└── standalone HTML canvas
└── fish simulation
└── optional transparent background
└── optional audio-reactive adapter
└── usable full-screen or PIP in OBS
```

It should not be buried inside PLAY controls.

It should not depend on the Mapbox controller unless intentionally used as a map overlay.

---

## Audio-Reactive Components

Audio-reactive should be treated as a shared signal capability, not automatically as its own WALL.

PLAY should publish audio/timing signals.

WALLS may consume those signals.

Example signal:

```json
{
  "trackId": "track-03",
  "bpm": 120,
  "energy": 0.64,
  "beatPhase": 0.25,
  "barPhase": 0.5,
  "section": "build",
  "mood": "nocturnal",
  "intensity": 0.72
}
```

Ownership:

```text
PLAY owns playback/timing/schedule.
Audio Signal Provider exposes normalized audio state.
WALLS consume audio signals visually.
```

---

## OBS Source Principle

WALLS should be safe independent OBS layers.

A WALL can be:

```text
full-screen source
PIP source
background layer
overlay layer
transparent browser source
manual standalone source
PLAY-automated source
```

OBS combines sources. PLAY should not force all visuals into one front-end container.

---

## Immediate Correction

The current system should be untangled toward:

```text
one authoritative WALL_MAP
Orbital as a mode inside WALL_MAP
no duplicate map controller
no duplicate map instance
no PLAY controls inside WALL
PLAY visual profile only
Canvas restored as WALL authoring/publishing app
```

---

## Acceptance Criteria

A corrected implementation passes when:

```text
WALL_MAP can run as an OBS browser source.
Orbital works as a mode inside WALL_MAP.
PLAY can schedule a playlist and request a WALL_MAP visual.
PLAY does not instantiate Mapbox.
PLAY does not mount map controls into WALL.
No duplicate map surface appears.
Kinetic Fish can be evaluated as a standalone WALL.
Audio-reactive components are exposed through a shared signal contract.
Canvas remains the future source for authoring/publishing WALLS.
```

---

## Short Reference

```text
PLAY = automation / playlist / music / schedule.
WALL = self-contained visual surface.
WALL_MAP = map source with Orbital as a mode.
Canvas = WALL authoring and publishing app.
OBS = final compositor.
Playlist Visual Profile = the bridge from PLAY to WALL visuals.
```
