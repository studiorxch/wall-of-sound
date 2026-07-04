# 0627_WOS_OrbitalEarthStylePreservingAudioOverlay_v1.0.0

## Project

**Project:** WOS  
**Feature Layer:** Orbital Earth Mode  
**Document Type:** Build Spec  
**Version:** v1.0.0  
**Status:** Proposed  
**Primary Runtime Owner:** WOS  
**Connected Systems:** Broadcast HUD, Mapbox Earth/Globe, PLAY playback/control signals, future Moon Mode

---

## Purpose

Define the missing bridge between WOS Mapbox map continuity and later abstract audio environments.

This spec keeps **Orbital Earth** on the real WOS / Mapbox globe first, preserves the active map style, and introduces a restrained audio-reactive overlay language that feels derived from the same world rather than swapped into a separate synthetic sphere.

The goal is to make this path believable:

```text
Local Map
→ Mapbox Earth / Orbital Earth
→ style-preserving audio overlays
→ optional abstract audio environment later
→ optional Moon / other-world travel later
```

---

## Core Product Statement

Orbital Earth is not a separate planet asset.

Orbital Earth is the same WOS map system viewed from a higher altitude, with audio-reactive overlays applied on top of the current map style.

If the active map style is cyan, the Orbital Earth overlay uses cyan.  
If the active map style is pink, the Orbital Earth overlay uses pink.  
If the active map style is gold, the Orbital Earth overlay uses gold.

The system must preserve the active map identity before introducing any abstract visualizer.

---

## Current Problem

The existing experimental Three.js sphere creates a hard visual disconnect:

```text
WOS Mapbox map
→ fade
→ unrelated blue sphere
```

This breaks the user’s belief that they are still on Earth.

Even if the system captures map coordinates, the visual surface reads as a new object. That creates questions such as:

```text
Am I still on planet Earth?
Is this related to the map?
Why did the city/world surface disappear?
```

This spec corrects that by establishing Orbital Earth as a **Mapbox-first continuity mode**.

---

## Product Locks

### 1. Mapbox-first Orbital rule

Default Orbital entry must use the live WOS Mapbox map/globe.

Forbidden as default entry:
- fake Earth sphere
- portal orb
- abstract shader planet
- unrelated particle sphere
- static synthetic planet texture

Allowed only after continuity is established:
- Three.js audio environment
- signal orb
- archive orb
- portal orb
- particle world

### 2. Style preservation rule

Orbital Earth must inherit the active WOS map style.

Required:
- preserve active map accent color
- preserve active background relationship
- preserve linework identity
- preserve route color family
- preserve HUD compatibility

Do not hard-code cyan into Orbital overlays.

### 3. Audio activates the map, not replaces it

Audio reactivity should behave like signal pressure applied to the existing world.

Required:
- bass may pulse atmosphere or line glow
- highs may produce star/signal sparkle
- track energy may affect line opacity or camera drift
- transitions may trigger scan rings
- route state may animate arcs

Forbidden:
- equalizer-style takeover as default
- full-screen bloom flash as default
- replacing the map with a generic visualizer
- losing geographic readability

### 4. Abstract environments are secondary

The abstract sphere / visualizer layer may exist, but it must be reached from Orbital Earth, not directly from the local map.

Correct sequence:

```text
Map
→ Orbital Earth
→ Signal Overlay
→ Audio Environment
```

Incorrect sequence:

```text
Map
→ Audio Environment
```

---

## Mode Stack

WOS transport modes remain:

```text
Flight
Drive
Walk
Bike
Transit
Orbital
```

Inside Orbital, define submodes:

| Submode | Runtime Owner | Purpose |
|---|---|---|
| `earth` | Mapbox / WOS | true Earth continuity |
| `signal` | WOS overlay | style-preserving data/audio layer |
| `atmosphere` | WOS overlay | stronger space/HUD listening state |
| `visualizer` | Three.js / shader | abstract audio environment |
| `portal` | Three.js / shader | experimental manual-only |
| `moon_prep` | WOS celestial bridge | future Earth-to-Moon route staging |

Default submode:

```text
orbital.earth
```

---

## Style Token Model

Add a lightweight style-token extraction layer.

Recommended file:

```text
wall/systems/orbital/WosMapStyleTokens.js
```

### Token shape

```js
{
  styleId: "string",
  accentColor: "#00d7ff",
  secondaryColor: "#5b6bff",
  backgroundColor: "#05080d",
  lineColor: "#00d7ff",
  routeColor: "#00ffaa",
  hudColor: "#d8f7ff",
  lineOpacity: 0.72,
  glowStrength: 0.35,
  grainStrength: 0.12,
  scanlineStrength: 0.10
}
```

### Required behavior

- Tokens should be captured before entering Orbital.
- Tokens should be updated if the map style changes.
- Orbital overlays should consume tokens.
- If token extraction fails, use current WOS defaults, not hard-coded experimental values.

### Future use

The same token layer should later support:
- pink map themes
- gold map themes
- monochrome archive themes
- infrared / thermal styles
- moon mode overlays
- other-city map identities

---

## Orbital Earth Entry Sequence

Clicking Orbital should produce a staged camera transition.

### Required sequence

```text
0ms      capture map state and style tokens
100ms    begin map camera lift
300ms    reduce local UI emphasis
500ms    increase star/atmosphere overlay
700ms    Mapbox globe curvature becomes primary
900ms    activate Orbital HUD state
1100ms   enable audio overlay layer at low intensity
```

### Required user perception

The user should feel:

```text
I left the city and entered orbit around the same Earth.
```

Not:

```text
A new blue object replaced the map.
```

---

## Audio-Reactive Overlay Language

The audio overlay should be subtle and map-derived.

### Phase 1 overlay signals

| Audio / Playback Signal | Visual Response | Notes |
|---|---|---|
| Bass / kick | atmosphere rim pulse | low amplitude |
| Low mids | street/network line glow | style-token color |
| Highs | sparse star/signal sparkle | above map, not on top of UI |
| Track energy | map line opacity / camera drift | smooth, not twitchy |
| Track transition | scan ring / orbital sweep | occasional, meaningful |
| Flow-curve peak | increased route/signal density | PLAY-driven later |
| Silence / intro | wider, darker orbital state | less overlay activity |

### Default behavior

Default audio overlay should be restrained:

```text
bass pulse: low
line glow: low
sparkle: low
camera drift: very low
scan ring: transition-only
```

---

## Visual Overlay Types

### 1. Atmosphere Rim

Purpose:
- sell orbital depth
- respond gently to bass
- preserve Earth continuity

Requirements:
- color from style tokens
- opacity clamped
- no giant portal glow by default

### 2. Signal Line Glow

Purpose:
- make map linework feel alive
- preserve current style

Requirements:
- pulse line brightness or overlay duplicate linework
- do not destroy basemap readability
- inherit accent color

### 3. Scan Ring

Purpose:
- mark track transitions, scene shifts, or route activation

Requirements:
- rare
- soft
- readable
- style-token colored

### 4. Star / Signal Sparkle

Purpose:
- create space-listening depth
- respond to highs

Requirements:
- sparse by default
- should not look like bugs or random markers
- must not be confused with moon / planets / destination objects

### 5. Route Arc

Purpose:
- connect Orbital Earth to WOS transport logic

Requirements:
- only appears when route exists or user requests it
- preserve origin/destination truth
- later can support Earth-to-Moon routing

---

## Object Role Discipline

Every visible object in Orbital Earth must have a clear runtime role.

Allowed roles:
- `earth_mapbox_globe`
- `atmosphere_overlay`
- `style_signal_line`
- `scan_ring`
- `star_particle`
- `origin_marker`
- `destination_marker`
- `route_arc`
- `debug_marker`
- `future_moon`

Rule:
No unlabeled object should appear as a moon, planet, or secondary body.

If a small sphere appears in the scene, it must be one of:
- intentionally implemented Moon
- origin marker
- destination marker
- debug marker
- hidden/removed

---

## PLAY Integration

PLAY should not own Orbital Earth.

Correct relationship:

```text
PLAY playback / playlist / flow state
→ WOS visual control bridge
→ Orbital Earth overlays
```

PLAY may send:
- current track
- playlist section
- energy value
- flow-curve position
- transition event
- audio analyser values

WOS owns:
- Mapbox globe
- Earth continuity
- Orbital HUD
- camera
- overlay rendering
- transport mode state

---

## Future Signal Grounding

This spec reserves room for real-world signal overlays.

Signal overlays should eventually use real sources:
- news events
- social posts
- cultural clusters
- mapped protest/activity zones
- local event signals
- transit/route signals

Required principle:

```text
Signals should be grounded in real place, real timing, or real source logic.
```

Do not create fake news/social signal clusters as default decoration.

---

## Future Moon Bridge

This spec supports the Moon Mode path.

Correct sequence:

```text
Orbital Earth
→ Earth-based audio overlay
→ cislunar route / signal corridor
→ Moon Mode
```

Moon Mode must not be entered from a fake abstract sphere.

Orbital Earth is the realism bridge required before Moon travel.

---

## Runtime File Plan

Recommended additions:

```text
wall/systems/orbital/
  OrbitalEarthMode.js
  WosMapStyleTokens.js
  OrbitalAudioOverlayController.js
  OrbitalOverlayRoles.js
```

Recommended updates:

```text
wall/systems/runtime/WosModeTransitionController.js
wall/systems/orbital/OrbitalModeController.js
wall/systems/orbital/OrbitalFxPanel.js
wall/systems/traversalControlDeck.js
```

---

## Build Order

### Phase 1 — Earth continuity lock

- Orbital entry stays on Mapbox globe.
- No Three.js fake sphere on default entry.
- Camera lift establishes Earth orbit.
- HUD updates to Orbital state.

### Phase 2 — Style tokens

- Extract current style tokens.
- Apply token colors to overlays.
- Verify non-cyan themes remain coherent.

### Phase 3 — Audio overlay controller

- Add low-intensity overlay responses.
- Support manual / auto / off modes.
- Default to low-intensity or off if no audio signal exists.

### Phase 4 — FX panel controls

Add controls for:

```text
Overlay: Off / Low / Medium / High
Audio: Off / Manual / Reactive
Atmosphere
Line Glow
Scan Ring
Sparkle
Route Arc
Style Sync
Static Background
```

### Phase 5 — Abstract bridge

Only after Earth continuity works:
- add Visualizer submode
- allow transition from Orbital Earth to abstract sphere
- preserve return path

---

## Acceptance Criteria

This spec is complete when:

1. Clicking Orbital does not replace the map with a fake sphere.
2. Orbital first presents a Mapbox / WOS Earth continuity view.
3. The active map style is captured into style tokens.
4. Orbital overlays inherit the current map color family.
5. Cyan is not hard-coded into the overlay system.
6. Audio overlays can be disabled, manual, or reactive.
7. Default audio response is restrained and does not erase Earth readability.
8. Three.js sphere / portal states are manual-only secondary modes.
9. Any marker or secondary object has a declared object role.
10. The system is ready to later bridge from Orbital Earth into Moon Mode.

---

## Testing Checklist

- Boot WOS into Flight.
- Change or simulate a different style token set.
- Click Orbital.
- Confirm Mapbox Earth remains the visible base.
- Confirm overlays inherit current style color.
- Confirm no fake sphere appears by default.
- Confirm no accidental moon-like dot appears without role.
- Toggle audio overlay off.
- Toggle audio overlay low.
- Trigger a track transition event and confirm scan ring.
- Return to map and confirm original map state restores.
- Enter Orbital again and confirm style continuity remains.

---

## Non-Goals

Do not build these in this pass:
- Moon Mode rendering
- cislunar travel
- abstract portal transitions
- heavy shader visualizer
- social/news data ingestion
- new map style editor
- fully dynamic Mapbox style authoring

---

## Final Principle

Orbital Earth must earn the transformation.

The user should first believe they are still looking at the same WOS Earth. Only then should WOS introduce more musical, abstract, or celestial transformations.

## Implementation Guide

- **Where:** Add `OrbitalEarthMode.js`, `WosMapStyleTokens.js`, `OrbitalAudioOverlayController.js`, and `OrbitalOverlayRoles.js` under `wall/systems/orbital/`; patch runtime transition handling.
- **What:** Keep Orbital entry on the Mapbox globe, extract active style tokens, apply restrained audio-reactive overlays using those tokens, and keep abstract Three.js spheres manual-only.
- **Expect:** WOS moves from local map to Earth orbit with visual continuity, then introduces music-reactive overlays that preserve the current map style before any later abstract or Moon transition.
