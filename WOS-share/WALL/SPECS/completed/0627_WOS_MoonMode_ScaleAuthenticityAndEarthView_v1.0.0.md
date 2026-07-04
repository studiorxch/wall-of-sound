# 0627_WOS_MoonMode_ScaleAuthenticityAndEarthView_v1.0.0

## Project

**Project:** WOS  
**Feature Layer:** Moon Mode  
**Document Type:** Build Spec  
**Version:** v1.0.0  
**Status:** Proposed  
**Primary Runtime Owner:** WOS  
**Connected Systems:** PLAY, Broadcast HUD, Orbital Earth Mode, future Signal / News / Social layers

---

## Purpose

Define a realism-first **Moon Mode** for WOS that preserves believable Earth–Moon scale, distinguishes lunar orbit from lunar surface experience, and keeps the Moon experience grounded in real cartographic and astronomical truth before any abstract visualizer layers are introduced.

This spec also establishes that WOS signal overlays should increasingly be tied to **real-world, map-based truth**, including social/news event signals when the system is ready to support them.

Moon Mode should not begin as a fantasy planet swap. It should emerge from the existing WOS Earth / Mapbox continuity stack and become a believable extension of the world.

---

## Core Product Statement

WOS should support a transition path such as:

```text
NYC / local map
→ Earth orbit
→ cislunar transit
→ Moon orbit
→ lunar surface
→ Earth view listening mode
```

The user should feel that they have left the city, entered Earth orbit, traveled outward, and arrived at the Moon while preserving scale, geography, and environmental credibility.

---

## Product Locks

### 1. Realism-first rule

Moon Mode must default to a **realism-first** presentation.

Required:
- Earth and Moon size relationship should be based on real proportions.
- Earth–Moon distance should be treated as vast, not compressed into a decorative dual-sphere layout.
- Lunar near-side / far-side behavior must be respected.
- The Earth-in-lunar-sky view must be treated as a real phenomenon, not a generic space wallpaper.

Stylization may come later, but only as an explicit secondary mode.

### 2. Earth continuity rule

Moon Mode must derive from the existing WOS Earth continuity path.

Required:
- Default Earth state remains Mapbox / WOS Earth continuity.
- Moon Mode must not replace Earth continuity with a fake Earth object.
- Abstract Three.js sphere systems must not become the default Earth-to-Moon bridge.

### 3. Signal truth rule

Signal layers in WOS should increasingly reflect **real mapped reality**.

Required:
- When WOS later supports signal overlays for social/news/cultural events, those signals should be based on real events, real places, and real timing.
- Signal visualization should preserve geographic truth and should not arbitrarily invent event relationships.
- Cartographic truth is a product strength and should be preserved for New York and future cities/regions.

Examples of signal grounding direction:
- news-correlated cultural moments
- real protest/event areas
- mapped social activity clusters
- route-linked or place-linked cultural signals

This spec does not require building the signal system now, but it establishes the principle for future Moon / Earth modes as well.

---

## Why Moon Mode Matters

Moon Mode is not only a space novelty. It supports several WOS goals:

1. **Geographic truth extended beyond the city**  
   WOS can expand from local city worlds to Earth and then to nearby celestial environments while preserving continuity.

2. **Emotional listening environments**  
   A lunar Earth-view listening mode can become a powerful music environment.

3. **Timely cultural relevance**  
   Renewed attention to lunar exploration gives Moon Mode real-world relevance.

4. **Cartographic identity**  
   Pinterest and adjacent visual-culture spaces show interest in map-based truth and visualization systems. WOS can occupy that lane with stronger realism and better design.

---

## Real-World Astronomy Constraints

These should guide build behavior.

### Earth and Moon scale

Use real proportional guidance:
- Earth diameter ≈ **12,742 km**
- Moon diameter ≈ **3,474 km**
- Earth is ≈ **3.67× wider** than the Moon
- Average Earth–Moon distance ≈ **384,400 km**

This does **not** require literal full-distance rendering at all times, but it does require that:
- Earth and Moon do not appear as casually adjacent decorative objects.
- Travel between them should imply significant separation.
- Any compressed presentation should be clearly framed as stylized if used.

### Earth in the lunar sky

Required truth:
- On most of the **near side** of the Moon, Earth appears roughly fixed in the sky.
- On the **far side**, Earth is not visible.
- Dramatic “Earthrise” is primarily associated with orbital movement, not the default standing experience on the lunar surface.

Moon Mode must respect this distinction.

---

## Mode Split

Moon Mode should be treated as multiple related but distinct experiences.

### 1. Cislunar Transit Mode

Purpose:
- Show travel from Earth orbit to the Moon.
- Establish scale and movement.
- Preserve the sense of crossing distance.

Characteristics:
- Earth behind / Moon ahead (or vice versa, depending on path state)
- sparse HUD
- distance/time/route framing
- subtle signal layer only

### 2. Lunar Orbit Mode

Purpose:
- Cinematic orbital view
- Earthrise-style perspectives
- approach / departure states

Characteristics:
- moving camera
- lunar curvature
- Earth visible according to position
- useful for major transition moments

### 3. Lunar Surface Mode

Purpose:
- Listener-oriented contemplative environment
- “stand on the Moon and look at Earth” mode

Characteristics:
- horizon-based composition
- Earth fixed in sky on near side
- near-side / far-side location awareness
- low-motion atmosphere
- ideal for ambient / contemplative music

### 4. Moon Signal / Visualizer Mode (later)

Purpose:
- add music-reactive overlays and signal-driven behavior after authenticity is established

Characteristics:
- restrained audio reactivity first
- later stylized variants possible
- may support archive, news, mission, or cultural overlays

---

## Authenticity Levels

Define explicit presentation levels.

### Level A — Authentic

Use for default Moon Mode.

Required:
- real size ratio guidance
- believable lighting
- correct near/far-side logic
- Earth visibility rules respected
- camera behavior grounded in place and orbit

### Level B — Stylized but grounded

Use for enhanced broadcast states.

Allowed:
- subtle exaggeration for readability
- slightly compressed distance for presentation
- stronger overlays
- enhanced glow / signal lines if rooted in the scene

Constraint:
- scene must still clearly read as Earth/Moon reality.

### Level C — Abstract / experimental

Use later for optional visualizer paths.

Allowed:
- artistic reinterpretation
- stronger audio transformation
- symbolic, atmospheric, or narrative environments

Constraint:
- must not replace the realism-first default.

---

## Earth-to-Moon Transition Path

Moon Mode should be entered through a staged sequence.

### Required sequence

```text
Local Map
→ Earth Orbit
→ Cislunar Transit
→ Moon Orbit or Lunar Surface
```

### Forbidden shortcuts

Do not do:
- Map → fake Moon sphere
- Earth map → unrelated Three.js planet
- arbitrary moon-like dot with no named runtime role

### Transition design intent

The user must feel the same world is being extended, not replaced.

---

## Runtime Objects and Roles

All visible celestial or signal objects must have a declared role.

Required object roles:
- `earth`
- `moon`
- `origin_marker`
- `destination_marker`
- `route_arc`
- `signal_particle`
- `social_signal_cluster` (future)
- `news_signal_cluster` (future)
- `debug_marker`

Rule:
No object should accidentally read as the Moon or a secondary planet unless it is explicitly assigned that role.

---

## Moon View Requirements

### Lunar Surface Earth View

This is a flagship mode and must be handled carefully.

Required:
- Earth appears large and emotionally significant in the sky.
- Earth placement must be consistent with the selected lunar location.
- If the camera is on the near side, Earth should be visible.
- If the camera is on the far side, Earth should not be visible.
- Earth should not float ambiguously like a UI marker.

Desired mood:
- contemplative
- spacious
- truthful
- suitable for music listening

### Lunar Orbit Earthrise View

Required:
- camera motion makes the Earthrise readable as an orbital event
- should not be confused with the static lunar-surface Earth view
- useful for transition scenes and broadcast drama

---

## Cartography Truth and Signal Grounding

WOS should continue to lean into real map-based visual truth.

### Cartography truth

Required direction:
- preserve location-aware visuals
- allow multiple cities and regions beyond New York over time
- keep truth-based geographic frameworks as a primary product strength

### Signal grounding

Future signal layers should be able to reflect real mapped events.

Examples of intended direction:
- signal activity around real protest zones
- news-linked map pulses
- event-timed cultural markers
- social/media linked map signals

Important rule:
Signal overlays must remain interpretable as **real place-based visual information**, not random decoration.

Moon Mode does not need these systems immediately, but must leave architectural room for them.

---

## Style Preservation

Moon Mode should respect WOS style systems.

Required:
- active WOS style tokens should propagate where appropriate
- Earth continuity layers should preserve current style family (cyan, pink, gold, monochrome, etc.)
- Moon overlays should be compatible with this token system

However:
- realism-first Moon geometry and lighting must take priority over decorative style distortion
- style should tint or inform, not destroy recognizability

---

## Audio-Reactive Rules

Do not overreact the Moon.

### Phase 1 audio-reactive behavior

Allowed:
- subtle atmosphere pulse
- gentle Earth glow response
- sparse signal shimmer
- route/scan sweep events
- low-frequency camera breathing only if very restrained

Forbidden in default realism-first mode:
- nightclub-level equalizer effects
- constant heavy bloom pulses
- transforming the Moon into a generic reactive orb

Principle:
Music should **activate the environment**, not erase it.

---

## HUD Requirements

Moon Mode should integrate with WOS HUD language.

Useful fields:
- MODE: MOON
- STATE: TRANSIT / ORBIT / SURFACE
- VIEW: NEAR SIDE / FAR SIDE / EARTH VIEW / EARTHRISE
- DISTANCE: Earth ↔ Moon (if relevant)
- SIGNAL: LIVE / IDLE / NEWS / CULTURE (future)
- SOURCE: WOS LOCAL / ROUTES LIVE / future feed source

HUD should remain restrained and readable.

---

## Build Order

### Phase 1 — Moon architecture and truth baseline

Build:
- mode definitions
- Earth/Moon object roles
- size and visibility rules
- near-side / far-side logic
- lunar surface Earth-view framing

### Phase 2 — Transit and orbit

Build:
- cislunar transition path
- lunar orbit camera states
- Earthrise-capable orbital view
- route/transition HUD states

### Phase 3 — Style tokens and overlays

Build:
- style propagation support
- low-intensity audio overlays
- restrained mission/signal overlays

### Phase 4 — Future signal realism

Build later:
- real event / social / news grounded signal layers
- multi-city / multi-region truth expansions
- later Moon cultural signal content if relevant

---

## Non-Goals for Initial Moon Spec

Do not build these yet:
- fully abstract lunar visualizer
- fantasy planetary systems as default
- random secondary spheres with no role definition
- heavy reactive effects that compromise realism
- speculative event signals with no grounded data source

---

## Acceptance Criteria

Moon Mode baseline is acceptable when:

1. WOS can distinguish Earth Orbit, Cislunar Transit, Lunar Orbit, and Lunar Surface states.
2. The Moon has a named runtime role and cannot be confused with accidental markers.
3. Earth–Moon proportional behavior is guided by real scale relationships.
4. The lunar near-side can show Earth believably in the sky.
5. The lunar far-side can hide Earth appropriately.
6. Lunar orbit and lunar surface views are not confused with each other.
7. Default Moon Mode remains realism-first.
8. Any stylized or abstract state is clearly secondary and optional.
9. The architecture leaves room for future real-world signal grounding.
10. The user feels continuity from WOS Earth into Moon space, not a detached asset swap.

---

## Recommended File Additions

```text
wall/systems/moon/
  MoonModeController.js
  MoonScaleModel.js
  MoonSurfaceView.js
  MoonOrbitView.js
  CislunarTransitController.js
  MoonObjectRegistry.js
  MoonEarthVisibility.js
```

Potential supporting files:

```text
wall/systems/orbital/
  WosCelestialStyleTokens.js
  WosSignalGroundingModel.js   (future)
```

---

## Recommended Next Step

Before a full Moon build, create a supporting Earth-side spec that locks Orbital Earth continuity and style-preserving overlay language first.

Recommended immediate companion direction:
- strengthen Earth continuity
- keep Earth Mapbox-first
- define audio-reactive overlay language on Earth
- then extend outward to Moon Mode

---

## Final Principle

Moon Mode should feel like a truthful extension of the WOS world.

The Moon is not just another sphere. It is a meaningful destination with real scale, real viewing logic, and real emotional power.

If WOS gets Earth continuity and Moon authenticity right, later abstract environments will feel earned instead of arbitrary.

## Implementation Guide

- **Where:** Add a dedicated `wall/systems/moon/` layer and connect it to the existing WOS Earth / Orbital continuity path.
- **What:** Define realism-first Moon states, Earth–Moon scale rules, object roles, near-side / far-side Earth visibility logic, and future hooks for grounded signal overlays.
- **Expect:** A believable Moon pathway where the user can travel from WOS Earth to lunar orbit or the lunar surface, experience an authentic Earth view, and later build stylized audio environments on top of that truth.
