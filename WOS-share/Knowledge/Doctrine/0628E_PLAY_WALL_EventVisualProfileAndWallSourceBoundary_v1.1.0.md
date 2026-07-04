---
location: Doctrine
title: PLAY Event Visual Profile + WALL Source Boundary
date: 2026-06-28
status: architecture-note
scope: "PLAY / WALL / MAPS / Canvas / OBS source separation"
primary_wall: MAPS
default_world_surface: WALL_MAP
tags:
  - wos
  - play
  - wall
  - maps
  - obs
  - doctrine
  - source-boundary
  - event-visual-profile
---

# PLAY Event Visual Profile + WALL Source Boundary

## Core Decision

PLAY does not own the map.

PLAY schedules **Events**. Playlists/media payloads give Events content.

An Event may carry an **Event Visual Profile** that tells a WALL what visual surface, mode, route, theme, location, camera preset, and motion level should accompany the Event.

WALL renders the visual output.

OBS composites one or more WALL outputs as independent browser sources.

---

## Operating Model

```text
PLAY orchestrates Events.
WALL renders visual surfaces.
OBS composites browser sources.
Canvas authors/publishes WALLS.
WOS/MAPS provides the default world surface.
```

---

## System Foundation

```text
WOS = world system grounded in geography, directory structure, WALLS, MAPS, routes, locations, and authored world surfaces.

PLAY = event scheduling system grounded in Events, media payloads, identity cards, intros/outros, intermissions, and broadcast programming.

STUDIO = authoring system for objects, actors, assets, and future Canvas-created WALL/WALLPAPER surfaces.

SMART GRID = future HUD / multi-source layer for displaying multiple WALLS, PIP views, Events, schedules, and content panels.

OBS = final external compositor.
```

---

## PLAY Role

PLAY is the automation/player/broadcast programming brain.

PLAY owns:

```text
Event schedule
Event timing
playlist/media payload selection
music playback
track order
block timing
identity card timing
intro/outro timing
intermission selection
Event metadata
Event Visual Profile selection
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
detailed WOS camera shot sequencing
world actor scheduling
```

---

## Events Are Default Under PLAY

Under PLAY, the default scheduled object is the **Event**.

A playlist is not the Event. A playlist/media payload gives the Event its content.

Current PLAY Events are expected to involve a playlist/media payload because PLAY is built around playback. That payload may include:

```text
music
reading
webcam
video loop
ambient silence
radio-style program
carnival programming
intermission content
other timed media
```

Event model:

```text
EVENT
├── eventId
├── schedule
├── identity card
├── intro / outro
├── playlist / media payload
├── optional WOS location
├── optional MAPS route/mode/camera/theme
├── optional SMART GRID layout
└── fallback / intermission behavior
```

Core rule:

```text
PLAY schedules Events.
Playlists/media payloads give Events content.
Events carry identity, timing, media, and optional visual profiles.
```

---

## Event Visual Profile

PLAY attaches a visual profile to an Event.

The profile describes what should be shown outside or behind the Event identity card.

Example:

```json
{
  "eventId": "soft-disconnects-miami-flight",
  "title": "Soft Disconnects: Miami Flight",
  "schedule": {
    "startTime": "20:00",
    "duration": "2h"
  },
  "identity": {
    "card": "event-card-soft-disconnects-miami",
    "intro": "intro-soft-disconnects",
    "outro": "outro-soft-disconnects"
  },
  "media": {
    "playlistId": "soft-disconnects",
    "payloadType": "music"
  },
  "visual": {
    "primarySurface": "WALL_MAP",
    "mode": "flight",
    "routeId": "nyc-to-miami",
    "location": "Miami",
    "mapTheme": "soft-blue-gray",
    "cameraPreset": "cruise-altitude-forward",
    "motionLevel": "low",
    "duration": "event"
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
  "command": "SHOW_EVENT_VISUAL",
  "eventId": "soft-disconnects-miami-flight",
  "wall": "WALL_MAP",
  "mode": "flight",
  "routeId": "nyc-to-miami",
  "location": "Miami",
  "mapTheme": "soft-blue-gray",
  "cameraPreset": "cruise-altitude-forward",
  "motionLevel": "low",
  "duration": "event"
}
```

This is not a second map controller.

This is a display request.

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
WALL_CANVAS_WALLPAPER
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

## MAPS as Default WALL

For the current WOS architecture, `MAPS` is the primary/default WALL.

This should remain true for a long time.

`WALL_MAP` is the adopted default world surface for WOS and currently owns the main visual runtime:

```text
Mapbox
city/world view
routes
locations
Flight
Drive
Walk
Route
Orbital
playlist/event visual coverage
```

Orbital is a mode inside `WALL_MAP`, not a separate WALL.

```text
WALL_MAP
└── modes
    ├── Flight
    ├── Drive
    ├── Walk
    ├── Route
    └── Orbital
```

Future WALLS should not be nested inside `WALL_MAP` by default. They should become independent WALL sources only when they can operate as their own browser/OBS layer.

Examples of possible future independent WALLS:

```text
Graffiti Wall
Subway Wall
Kinetic Fish Wall
Canvas Wallpaper Wall
Smart Grid Wall
Playlist Card Wall
```

These future WALLS should be treated as separate visual surfaces, not child features hidden inside MAPS, unless they are intentionally designed as overlays or modes of the map.

Current rule:

```text
MAPS is the default WOS world.
Other WALLS may exist later as independent OBS/browser sources.
Do not prematurely nest future WALLS inside MAPS.
Do not prematurely split Orbital out of MAPS.
```

---

## MAPS Is Not Default Under PLAY

MAPS is the default WOS world surface.

MAPS is not the default PLAY object.

Under PLAY, Events are default.

An Event may attach a MAPS profile when location, route, travel, or world context is useful.

```text
PLAY Event
├── identity card
├── media payload
├── schedule
└── optional MAPS profile
```

PLAY should support Events based on conceptual themes, still identity visuals, motion visuals, and location-based MAPS visuals.

Until Canvas returns, many PLAY visuals may be still or low-motion identity/event cards.

MAPS should be used selectively when the Event benefits from geography, route, location, Orbital transition, or Flight/Drive/Walk mode.

---

## WALL_MAP Role

`WALL_MAP` is the authoritative map visual source.

It owns:

```text
Mapbox
map lifecycle
map camera
routes
locations
map color/theme rendering
Flight mode
Drive mode
Walk mode
Route mode
Orbital mode
```

WALL_MAP must remain the only map rendering authority for broadcast MAPS output.

---

## Boundary Rule

```text
PLAY schedules Events.
Events carry media payloads and optional Event Visual Profiles.
WALL_MAP renders MAPS visual profiles.
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

## Canvas / STUDIO Role

Canvas/Studio is the authoring and publishing system for WALLS and world objects.

Canvas/Studio should create, configure, preview, and publish WALL outputs and WOS objects.

Canvas may eventually export self-contained HTML WALL packages, but the primary recovery path is:

```text
Canvas authors WALL configs.
STUDIO authors objects/actors/world assets.
WALL renders configs.
PLAY automates Events.
OBS composites WALL sources.
```

HTML export is useful later for:

```text
portable demos
offline WALL packages
archived scenes
shareable browser-source bundles
Canvas Wallpaper WALLS
```

STUDIO should not be the broadcast scheduler.

STUDIO authors. WOS runs. PLAY schedules.

---

## Intermission

Intermission is a Scheduler-generated Event type.

Its duration is unknown and lasts until the next scheduled Event begins, or until the Scheduler exits the gap/fallback state.

Intermission may use:

```text
playlist
silence
ambient loop
title card
countdown
upcoming schedule
MAPS idle route/location
Flight Hold
Orbital Hold
video loop
station ID
```

Intermission ownership:

```text
Scheduler decides when Intermission starts and ends.
Library/media payload provides optional content.
Broadcast renders it.
MAPS may provide its visual profile.
```

Core rule:

```text
Intermission is not just a playlist.
Intermission is an Event type.
It may use a playlist/media payload as content.
Its duration is controlled by the Scheduler gap.
```

---

## WOS / PLAY Scheduler Split

There are two different scheduler layers.

```text
PLAY Scheduler = broadcast/programming scheduler.
WOS Scheduler / Channel Runtime = world/camera/scene scheduler.
```

PLAY Scheduler handles:

```text
Events
media payloads
identity cards
intros/outros
intermissions
audience-facing schedule
broadcast timing
```

WOS Channel Runtime handles:

```text
camera shots
camera paths
world traversal
actor behavior
scene timing
route sequences
world triggers
cinematic movement
Moon / Carnival / Subway / Graffiti environments
```

Core rule:

```text
PLAY schedules the program.
WOS directs the world.
STUDIO authors the world/channel.
OBS composites the output.
```

---

## WOS Channels

A WOS Channel is a programmed world/camera experience.

A channel is more advanced than a route.

```text
route = path from A to B
channel = cinematic world program
```

Examples:

```text
WOS_CHANNEL_FLIGHT_HOLD
WOS_CHANNEL_ORBITAL_HOLD
WOS_CHANNEL_ORBITAL_TRANSITION
WOS_CHANNEL_MOON_CARNIVAL
WOS_CHANNEL_NYC_NIGHT_DRIVE
WOS_CHANNEL_SUBWAY_DRIFT
WOS_CHANNEL_GRAFFITI_WALLS
```

Future PLAY Events may point to a WOS Channel instead of directly controlling route/mode/camera details.

Example:

```json
{
  "eventId": "moon-carnival-night",
  "visual": {
    "primarySurface": "WALL_MAP",
    "wosChannel": "WOS_CHANNEL_MOON_CARNIVAL",
    "duration": "event"
  }
}
```

PLAY should not need to know the detailed camera shot list.

WOS owns world/camera/runtime complexity.

PLAY owns event timing, audience programming, and broadcast orchestration.

---

## Low-Motion WOS Channels

People may not want to watch a moving map all day.

WOS needs low-motion visual channels for background listening, intermission, and calm Event visuals.

Initial low-motion channels:

```text
Flight Hold
Orbital Hold
Orbital Transition
```

### Flight Hold

`Flight Hold` is the current strongest low-motion WOS channel candidate.

Baseline:

```text
Mode: Flight
Speed: 1x
Altitude: Cruise / 35,000 ft
Camera: forward / calm aerial
Motion Level: low
Use: ambient stream, intermission, background listening, Event visual
```

Clouds are important for Flight Hold because they reduce visual redundancy and prevent excessive ocean/empty horizon views.

Flight Hold should prioritize:

```text
cloud presence
atmosphere
broad aerial composition
slow movement
low interaction
minimal HUD
no aggressive route switching
```

### Orbital Hold

`Orbital Hold` should become a clean Earth-centered low-motion state.

Use cases:

```text
intermission
transition
ambient listening
global/world identity
event intro/outro
```

### Orbital Transition

`Orbital Transition` should be a short premium transition, not necessarily an all-day visual.

Use cases:

```text
event start
event end
scene change
identity card transition
world-to-world change
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

## SMART GRID Role

SMART GRID is a future HUD / multi-source visual board.

It may display:

```text
PIP displays
different WALLS
event cards
schedule rows
LA / NYC / Tokyo views
live event windows
playlist/media signals
reference/image panels
status widgets
```

SMART GRID should not be reduced to image response.

It is a possible future display layer for viewing multiple sources, WALLS, Events, locations, and broadcast panels at once.

Example:

```text
SMART GRID
├── NYC MAPS PIP
├── LA MAPS PIP
├── Tokyo MAPS PIP
├── active Event card
├── upcoming schedule
├── live webcam/event panel
└── music/playlist signal
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

Browser sources are preferred over window/display capture where possible.

Window/display capture is fragile because:

```text
window size can change
window focus can be disturbed
browser chrome can appear
desktop movement can break framing
wrong monitor/window can be captured
```

OBS combines sources.

PLAY should not force all visuals into one front-end container.

PLAY does not need to control OBS immediately. First priority is that PLAY/WOS always output a valid visual state. OBS scene/source control can come later.

---

## Immediate Correction

The current system should be untangled toward:

```text
one authoritative WALL_MAP
Orbital as a mode inside WALL_MAP
no duplicate map controller
no duplicate map instance
no PLAY controls inside WALL
PLAY Event Visual Profile only
Events as default PLAY scheduled units
MAPS as default WOS world surface
Canvas/Studio restored as WALL/object authoring and publishing app
```

---

## Acceptance Criteria

A corrected implementation passes when:

```text
WALL_MAP can run as an OBS browser source.
Orbital works as a mode inside WALL_MAP.
PLAY can schedule an Event and request a WALL_MAP visual.
PLAY does not instantiate Mapbox.
PLAY does not mount map controls into WALL.
No duplicate map surface appears.
Kinetic Fish can be evaluated as a standalone WALL.
Audio-reactive components are exposed through a shared signal contract.
Canvas/Studio remains the future source for authoring/publishing WALLS and map/world objects.
Intermission is treated as a Scheduler-generated Event type.
Low-motion Flight Hold and Orbital Hold channels are preserved as WOS channel candidates.
```

---

## Short Reference

```text
WOS = world / geography / directory structure / WALLS / MAPS.
PLAY = events / schedule / media payloads / identity / broadcast programming.
EVENT = scheduled PLAY unit.
PLAYLIST = media payload inside an Event.
WALL = self-contained visual surface.
MAPS / WALL_MAP = default WOS world surface.
Orbital = mode inside WALL_MAP.
Canvas/STUDIO = authoring and publishing environment.
SMART GRID = future HUD / multi-source display layer.
OBS = final compositor.
Event Visual Profile = bridge from PLAY Events to WALL visuals.
WOS Channel = world/camera/scene program that PLAY may schedule by reference.
```
