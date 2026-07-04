---
location: Doctrine
title: WOS Channel Runtime + Scheduler Boundary
date: 2026-06-28
status: architecture-note
scope: "WOS / PLAY / STUDIO / Channels / Scheduler Boundary"
tags:
  - wos
  - play
  - studio
  - channels
  - scheduler
  - doctrine
---

# WOS Channel Runtime + Scheduler Boundary

## Core Decision

There are two scheduling layers:

```text
PLAY Scheduler = broadcast/programming scheduler.
WOS Scheduler / Channel Runtime = world/camera/scene scheduler.
```

PLAY schedules the program.

WOS directs the world.

STUDIO authors the world/channel.

OBS composites the output.

---

## WOS Role

WOS is the world system grounded in:

```text
geography
directory structure
WALLS
MAPS
routes
locations
travel modes
camera systems
world surfaces
```

WOS should remain able to operate without a PLAY schedule for:

```text
manual exploration
travel
map operation
camera work
route scouting
one-off videos
movie shots
Moon / orbital / world views
OBS browser-source capture
```

Better dependency language:

```text
WOS is standalone-capable.
PLAY may schedule WOS for broadcast.
```

---

## PLAY Role Relative to WOS

PLAY can schedule a WOS visual for broadcast, but should not manage detailed world/camera behavior.

PLAY may request:

```text
show this WOS Channel
show this route
show this location
use this camera preset
activate this world/mode
run this Event visual
```

PLAY should not own:

```text
camera shot lists
actor timing
world triggers
detailed route choreography
scene sequencing
Mapbox lifecycle
```

---

## WOS Channels

A WOS Channel is a programmed world/camera experience.

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

Future PLAY Events may point to a WOS Channel instead of controlling route/mode/camera details directly.

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

---

## WOS Channel Runtime Owns

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
loop behavior
idle behavior
fallback scene behavior
```

---

## STUDIO Role

STUDIO is the authoring system for WOS objects, actors, assets, and world/channel elements.

STUDIO should author:

```text
map objects
actors
assets
placed world objects
camera channels
scene sequences
world triggers
future Canvas-created WALL/WALLPAPER surfaces
```

STUDIO should not be the broadcast scheduler.

Core rule:

```text
STUDIO authors.
WOS runs.
PLAY schedules.
```

---

## Moon / Carnival Example

PLAY Event:

```text
Moon Carnival — 8PM
```

PLAY points to:

```text
WOS_CHANNEL_MOON_CARNIVAL
```

WOS handles:

```text
arrival shot
gate approach
booth passes
crowd/actor scenes
orbital pullback
loop behavior
idle state
camera changes
```

PLAY does not need to know the camera shot list.

---

## Short Reference

```text
PLAY Scheduler = broadcast event timing.
WOS Channel Runtime = world/camera/scene timing.
WOS Channel = cinematic world program.
STUDIO = authoring source for world/channel content.
