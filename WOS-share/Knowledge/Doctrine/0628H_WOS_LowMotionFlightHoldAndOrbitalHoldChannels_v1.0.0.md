---
location: Doctrine
title: WOS Low-Motion Flight Hold + Orbital Hold Channels
date: 2026-06-28
status: architecture-note
scope: "WOS / MAPS / Low-Motion Channels / Flight Hold / Orbital Hold"
tags:
  - wos
  - maps
  - flight-hold
  - orbital-hold
  - low-motion
  - channels
  - doctrine
---

# WOS Low-Motion Flight Hold + Orbital Hold Channels

## Core Decision

People may not want to watch a moving map all day.

WOS needs low-motion visual channels for background listening, intermission, and calm Event visuals.

Initial low-motion channels:

```text
Flight Hold
Orbital Hold
Orbital Transition
```

---

## Flight Hold

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

This baseline was visually approved from the Miami flight test setup.

---

## Why Flight Hold Works

Flight Hold provides:

```text
calm movement
peaceful aerial perspective
broad composition
less dependence on street-level skyline quality
lower visual fatigue than constant map travel
good background-listening behavior
```

Views from above can feel calm and peaceful when camera movement is restrained.

---

## Cloud Requirement

Clouds are important for Flight Hold because they reduce redundancy.

Without clouds, Flight Hold risks becoming:

```text
ocean-heavy
empty horizon
visually repetitive
too static in the wrong way
```

Clouds provide:

```text
soft motion
depth
layering
occlusion
atmosphere
changing composition
```

Flight Hold should prioritize:

```text
cloud presence
atmosphere
broad aerial composition
slow movement
low interaction
minimal HUD
no aggressive route switching
avoid excessive ocean/empty horizon views
```

---

## Orbital Hold

`Orbital Hold` should become a clean Earth-centered low-motion state.

Use cases:

```text
intermission
transition
ambient listening
global/world identity
event intro/outro
```

Orbital Hold should be:

```text
Earth-centered
low-motion
clean
minimal overlays
free of markers/junk
not overused as constant full-motion map replacement
```

---

## Orbital Transition

`Orbital Transition` should be a short premium transition, not necessarily an all-day visual.

Use cases:

```text
event start
event end
scene change
identity card transition
world-to-world change
```

Orbital may be strongest as a sell point or transition, especially when still identity cards are the primary listening visual.

---

## Identity Cards and Stillness

PLAY should not assume constant motion is always desirable.

Many Events may work better with:

```text
still identity card
low-motion identity card
Flight Hold
Orbital Hold
PIP map
short Orbital Transition
```

Still visuals allow music to sit in the background without demanding constant attention.

Motion should be intentional, not constant.

---

## Event Visual Use

PLAY Events may choose:

```text
identity-card
flight-hold
orbital-hold
orbital-transition
route-drive
route-walk
pip-map
```

MAPS should be optional in PLAY Event visuals.

MAPS should be used when geography, route, location, Flight, Drive, Walk, or Orbital meaningfully supports the Event.

---

## Short Reference

```text
Flight Hold = 1x speed, cruise altitude, calm aerial view, clouds preferred.
Orbital Hold = clean Earth-centered low-motion state.
Orbital Transition = short premium transition.
Motion should be intentional, not constant.
