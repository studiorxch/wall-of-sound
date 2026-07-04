---
location: Doctrine
title: PLAY Event Scheduler + Intermission Doctrine
date: 2026-06-28
status: architecture-note
scope: "PLAY / Events / Scheduler / Intermission / Media Payloads"
tags:
  - wos
  - play
  - events
  - scheduler
  - intermission
  - doctrine
---

# PLAY Event Scheduler + Intermission Doctrine

## Core Decision

PLAY schedules **Events**.

Playlists/media payloads give Events content.

An Event may include music, reading, webcam, video loop, silence, radio-style programming, carnival programming, or intermission content.

PLAY should not assume every Event starts from a playlist concept, but current PLAY Events are expected to include some playlist/media payload because PLAY is built around playback.

---

## PLAY Role

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
WOS camera shot sequencing
world actor scheduling
OBS composition
```

---

## Events Are Default Under PLAY

Under PLAY, the default scheduled object is the **Event**.

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

## Media Payloads

A playlist/media payload may include:

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

Playlist should be understood as a playable payload, not only a list of songs.

---

## Event Visual Profile

An Event may carry an Event Visual Profile that tells a WALL what visual surface, mode, route, theme, location, camera preset, and motion level should accompany the Event.

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
    "cameraPreset": "cruise-altitude-forward",
    "motionLevel": "low",
    "duration": "event"
  }
}
```

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

## Fallback Detection

PLAY should enter intermission/fallback when:

```text
no active Event exists
current Event ended
next Event has not started
Event is missing required fields
music/media payload fails
WALL/MAPS source fails health check
route/location is missing when required
manual stop occurs
browser source fails to load
```

Default fallback should be:

```text
Intermission countdown
upcoming schedule row
idle visual
optional quiet media payload
```

---

## Short Reference

```text
PLAY = broadcast programming scheduler.
EVENT = scheduled unit.
PLAYLIST / MEDIA PAYLOAD = content inside Event.
INTERMISSION = Scheduler-generated Event type for unknown-duration gaps.
EVENT VISUAL PROFILE = bridge from Event to WALL visuals.
