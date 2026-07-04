---
Generated: 
System: WOS  
Domain:  
Component: 
Version: 1.0.0
Summary:
Description:
Tags:
Status:
---
# Discovery

Surfaces visually indicate:
- active playback
- simulation activity
- audio output
- live occupancy
- rendering state
- environmental volatility

---
# Spec
```
# 0520A_WOS_SurfacePresence_v1.0.0

## Overview

Surface Presence extends Surface Identity into a living activity system.

Surfaces should no longer appear static or dormant.  
They should communicate:

- environmental energy
- simulation activity
- broadcast state
- occupancy
- audio motion
- system lifecycle

The goal is subtle persistent life.

NOT:

- dashboards
- noisy animation
- RGB gamer UI
- attention-seeking effects

The surface rail should feel closer to:

- radio frequencies
- surveillance systems
- aircraft instrumentation
- Twitch channel presence
- ambient operating systems

---

# Core Philosophy

## OLD

```
surface = saved world
```

## NEW

```
surface = living transmission
```

A surface should imply:

- something is happening there
- systems are active
- atmosphere is evolving
- audio is flowing
- time is passing

even before entering it.

---

# Presence System Layers

Surface Presence consists of five independent layers:

```
1. Mood Pulse2. Audio Activity3. Occupancy4. Simulation State5. Broadcast State
```

Each layer is additive.

No single layer should dominate visually.

---

# 1. Mood Pulse

## Purpose

The ring subtly breathes based on environmental mood.

This creates:

- atmospheric motion
- persistent life
- emotional identity

without requiring user interaction.

---

# Behavior

## Golden Hour

```
slow warm luminance breathing
```

## Rain

```
soft blue shimmer
```

## Storm

```
low-frequency pressure pulse
```

## Fog

```
diffused opacity drift
```

---

# Technical Rules

## DO NOT

- pulse scale aggressively
- animate continuously at high speed
- use neon bloom
- use rainbow cycling
- create equal timing loops

---

# Recommended Motion

```
duration: 4–12seasing: sine-in-outopacity delta: 0.06–0.14
```

---

# CSS Example

```
.ws-sr-node--active {  animation: wsMoodPulse 8s ease-in-out infinite;}@keyframes wsMoodPulse {  0%   { box-shadow: 0 0 0 rgba(255,255,255,0.06); }  50%  { box-shadow: 0 0 14px rgba(255,255,255,0.16); }  100% { box-shadow: 0 0 0 rgba(255,255,255,0.06); }}
```

---

# 2. Audio Activity Layer

## Purpose

Reflect sound intensity without turning the rail into a VU meter.

This should resemble:

- radio signal energy
- heartbeat
- transmission strength

---

# Inputs

Presence activity may derive from:

```
master gainbeat energycollision densityambient activityparticle densitytransport playback
```

---

# Visual Behavior

## Low Activity

```
almost imperceptible edge flicker
```

## Medium Activity

```
small luminance ripples
```

## High Activity

```
slightly increased ring brightness
```

---

# DO NOT

- animate to every beat
- create equalizer visuals
- pulse entire node rapidly
- strobe

This must remain atmospheric.

---

# Suggested Logic

```
presence.audioLevel = lerp(  previous,  currentAudioEnergy,  0.08);
```

Always smooth the signal.

---

# 3. Occupancy Layer

## Purpose

Represent:

- users
- collaborators
- AI agents
- simulations
- watchers

inside a surface.

---

# Current Phase

Simple numeric count.

Example:

```
◉ NIGHT DRIVE    3○ TOKYO SIGNAL   1○ FOG DISTRICT   —
```

---

# Future Expansion

## Avatar Stack

Tiny stacked circles:

```
◉ [◉◉◉]
```

Similar to:

- Discord voice channels
- Twitch viewers
- multiplayer lobbies

---

# Occupancy Sources

Future compatible with:

```
multiplayer usersAI entitiesrender workerssimulation agentsremote collaborators
```

---

# 4. Simulation State

## Purpose

Communicate operational state.

Surfaces should visibly distinguish:

```
activepausedidlebroadcastingrenderingoffline
```

---

# Canonical Visual Language

## Active

```
solid ring
```

## Paused

```
dashed ring
```

## Dormant

```
dimmed opacity
```

## Broadcasting

```
double pulse
```

## Rendering

```
slow rotating sweep
```

---

# DO NOT

- add loading spinners
- add traditional status LEDs
- use bright warning colors unnecessarily

This is cinematic instrumentation.

---

# 5. Broadcast State

## Purpose

Distinguish autonomous worlds from local edit sessions.

---

# Broadcast Types

## Local

```
LOCAL
```

## Live

```
LIVE
```

## Autonomous

```
AUTO
```

## Shared

```
SHARED
```

---

# Placement

Small micro-label near the node.

NOT:

- giant badges
- floating cards
- streamer overlays

---

# Surface Presence Schema

## Canonical Structure

```
presence: {  moodPulse: {    enabled: true,    intensity: 0.0,    speed: 1.0  },  audio: {    level: 0.0,    smoothed: 0.0  },  occupancy: {    count: 0,    avatars: []  },  simulation: {    state: "active"  },  broadcast: {    mode: "local"  }}
```

---

# Update Flow

## Canonical Pipeline

```
world state→ atmosphere→ audio→ presence resolver→ rail renderer
```

UI NEVER computes world state itself.

---

# Canonical Owner

```
SBE.SurfacePresenceManager
```

New dedicated system.

DO NOT overload:

- SurfaceStateManager
- WorkspaceUI
- atmosphere renderer

Presence is orchestration logic.

---

# Required Systems

## New File

```
systems/world/surfacePresenceManager.js
```

Responsibilities:

```
resolve pulse stateresolve audio activityresolve occupancyresolve simulation stateemit updates
```

---

# Rail Rendering Hooks

## workspaceUI.js

Add support for:

```
presence classespresence data attrssimulation statesaudio activity vars
```

---

# CSS Architecture

## Required Classes

```
.ws-sr-node--active.ws-sr-node--paused.ws-sr-node--broadcast.ws-sr-node--storm.ws-sr-node--rain.ws-sr-node--golden-hour
```

---

# Animation Rules

## IMPORTANT

Animations MUST:

- run on compositor thread when possible
- avoid layout thrashing
- avoid expensive blur chains
- avoid frequent DOM mutation

Preferred:

- opacity
- transform
- box-shadow
- CSS variables

Avoid:

- width
- height
- filter spam

---

# Long-Term Direction

Eventually the rail becomes:

```
a living heartbeat monitorfor the WOS universe.
```

Not navigation.

Not tabs.

A systems-level broadcast spine.

---

# Future Expansion

## Surface Telemetry

Future micro-data:

```
traffic densityweather volatilitysignal strengthroute lengthAI activitymusic genre
```

---

# Future Presence FX

Potential advanced states:

```
electrical interferenceradio noisesignal dropoutweather distortionthermal gloworbital synchronization
```

---

# DO NOT

## DO NOT overanimate

Presence must remain:

- calm
- restrained
- ambient
- infrastructural

---

## DO NOT gamify the rail

Avoid:

- achievements
- badges
- noisy counters
- arcade UI

---

## DO NOT recreate Discord/Twitch literally

They are inspiration only.

WOS remains:

- cinematic
- infrastructural
- atmospheric

---

# Success Criteria

The system succeeds when:

```
the rail feels aliveeven when untouched.
```

---

# Implementation Guide

- Create `surfacePresenceManager.js` as the canonical presence resolver
- Add rail presence classes + CSS animation hooks in `workspaceUI.js`
- Drive pulse/audio presence from atmosphere + transport + audio energy signals
```

---
# Refinement 
![[Pasted image 20260519070138.png]]



---
# Development

```

```