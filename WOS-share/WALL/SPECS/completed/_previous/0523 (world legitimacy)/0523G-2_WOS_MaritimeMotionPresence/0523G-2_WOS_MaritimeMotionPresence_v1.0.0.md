---
title: "WOS Maritime Motion Presence"
filename: "0523G-2_WOS_MaritimeMotionPresence_v1.0.0.md"
version: "1.0.0"
date: "2026-05-24"
system: "WOS"
module: "Maritime Motion Presence"
type: "presentation-interpretation-spec"

status: "[BUILD]"
stage: "[BUILD]"
freeze_decision: "GO"

build_scope: "presentation-motion-presence-only"
owner: "StudioRich / WOS"

depends_on:
  - "0523A_WOS_MaritimeVesselTaxonomyProfiles_v1.2.2"
  - "0523B_WOS_MaritimePopulationHierarchy_v1.1.0"
  - "0523D_WOS_MaritimeWakeAuthority_v1.2.1"
  - "0523E_WOS_MaritimeAtmosphericReadability_v1.2.0"
  - "0523F_WOS_MaritimeContinuityDensity_v1.2.0"
  - "0523G_WOS_MaritimeOccupancyRenderer_v1.1.0"
---

# 🚦 SPEC STAGE

Stage: [BUILD]  
Freeze Decision: GO  
Action: Implement maritime motion-presence upgrade for occupancy renderer.

---

# 0523G-2_WOS_MaritimeMotionPresence_v1.0.0

## Purpose

Upgrade maritime occupancy from static/debug-like vessel markers into readable harbor motion presence.

This spec governs presentation-layer motion language only:

- navigation light presence
- speed-tail readability
- wake emphasis
- underway vs anchored visual distinction
- ferry/traffic corridor rhythm
- heading readability
- slow-glide presentation cues
- harbor movement confidence

This spec does NOT govern AIS truth, vessel lifecycle, vessel position mutation, synthetic vessel truth, wake segment authority, population tier assignment, atmospheric visibility authority, density scoring authority, camera targeting, or gameplay pacing.

Core doctrine:

```text
MotionPresence may make motion readable.
MotionPresence may never fabricate maritime truth.
```

---

# 1. Problem Statement

The current occupancy renderer proves that vessels can appear on the map, but the visual language still reads as debug markers.

Observed issue:

```text
boats exist visually,
but harbor motion does not yet feel alive
```

Real harbor perception is not primarily label-driven.

People perceive harbor traffic through:

- slow movement
- directional gliding
- navigation lights
- ferry rhythm
- wakes
- anchored stillness
- traffic lanes
- density bands
- shoreline movement

Therefore the next upgrade must emphasize:

```text
behavior readability before icon detail
```

---

# 2. Authority Boundaries

## MotionPresence Owns

- presentation-layer motion cues
- light glyphs
- speed-tail rendering
- wake visual emphasis
- heading readability glyphs
- underway/anchored visual distinction
- class-aware motion styling
- optional renderer-local visual smoothing

## MotionPresence May Observe

- AIS vessel state
- AIS vessel speed
- AIS vessel heading
- AIS vessel class
- population tier
- atmospheric visibility result
- wake segments
- density class
- clutter pressure
- renderer LOD state

## MotionPresence May Not Mutate

- AISRuntime state
- vessel coordinates
- vessel heading
- vessel speed
- lifecycle state
- population tier
- WakeAuthority segments
- AtmosphericReadability results
- ContinuityDensity results
- SpawnEcology state
- camera state

---

# 3. Presentation Motion Rule

MotionPresence may only create:

```text
visual evidence of existing motion
```

It may not create:

```text
new runtime motion
```

Allowed:

- draw speed tail from current heading/speed
- draw navigation lights from heading/class
- draw wake glow from existing wake segment
- visually pulse active ferry route indicators
- smooth renderer-local glyph transitions

Forbidden:

- move vessel position
- invent future vessel position
- generate wake geometry without WakeAuthority
- create runtime vessels
- alter speed or heading
- use visual smoothing as runtime state

---

# 4. Visual Priorities

MotionPresence should prioritize:

1. underway direction
2. navigation light readability
3. wake/water memory
4. ferry rhythm
5. anchored/moored stillness
6. class identity
7. labels

Labels are secondary.

Motion and lights are primary.

---

# 5. Vessel State Visual Language

| State | Visual Treatment |
|---|---|
| STATUS_UNDERWAY | chevron/hull + speed tail + navigation lights |
| STATUS_ANCHORED | fixed anchor pin + soft water ring |
| STATUS_MOORED | docked pin + minimal light |
| STATUS_RESTRICTED | amber caution ring + slow-motion cue |
| STATUS_EMERGENCY | red pulse + high-priority visibility |
| STATUS_STALE | dimmed marker + no speed tail |
| STATUS_DORMANT | ghosted marker only |
| STATUS_FORCED_COAST | fading light + no new wake cue |

---

# 6. Navigation Lights

Render navigation-light hints for visible underway vessels.

```ts
type NavigationLightCue = {
  port: boolean;
  starboard: boolean;
  stern: boolean;
  mast: boolean;
};
```

Lights are renderer-local glyphs derived from:

- projected vessel center
- heading
- visual hull length
- visual hull width

They must not alter vessel truth.

Suggested colors:

```ts
const NAV_LIGHT_COLORS = {
  port: "#ff4b4b",
  starboard: "#4bff8a",
  stern: "#dcecff",
  mast: "#ffe8a0",
};
```

Navigation lights should appear when:

- visibilityClass is `FULL`
- visibilityClass is `REDUCED`
- visibilityClass is `LIGHT_ONLY`
- timeOfDay is `DUSK` or `NIGHT`
- weatherState is `FOG`, `HAZE`, or `RAIN`

At night, lights should carry more readability than hull geometry.

---

# 7. Speed Tail

Speed tails communicate direction and motion.

```ts
speedTailLengthPx =
clamp(speedKts * 1.8, 4, 48) * tierScale
```

Tail extends opposite vessel heading.

```text
heading = bow direction
tail = stern direction
```

Render speed tail only when:

- vessel is underway
- speedKts > 1.0
- visibilityClass is not `ATMOSPHERIC_HIDDEN`
- lifecycle is not anchored/moored/dormant

Synthetic vessels may use shorter tails:

```text
syntheticTailMultiplier = 0.55
```

---

# 8. Wake Presence Upgrade

WakeAuthority owns wake geometry.

MotionPresence may enhance visibility of existing wake segments.

Allowed:

- brighter near wake for AIS vessels
- tapered alpha
- glow pass
- parentEvicted fade
- intensity-based width emphasis

Forbidden:

- invent wake segments
- connect AIS gaps
- extend wake lifetime
- mutate WakeAuthority

AIS wakes should read more clearly:

```text
AIS wake alpha multiplier: 1.0
Synthetic wake alpha multiplier: 0.42
parentEvicted multiplier: 0.4
```

If vessel class is FERRY or PASSENGER:

```text
wake visual emphasis may increase by 1.2×
```

This is presentation only.

WakeAuthority remains unchanged.

---

# 9. Ferry Rhythm

Ferry motion is the strongest NYC harbor readability pattern.

MotionPresence may visually emphasize ferry rhythm through:

- stronger nav lights
- slightly stronger wake glow
- clearer direction tails
- route-facing label priority
- periodic cabin-light shimmer

MotionPresence may NOT:

- create ferry vessels
- assign ferry class
- alter ferry route state
- move ferry position
- schedule ferry crossings

---

# 10. Traffic Corridor Readability

MotionPresence may reveal perceived harbor lanes using only existing vessel/wake distributions.

Allowed:

- faint directional lane glow where multiple vessels align
- low-opacity water-path emphasis
- route-neutral movement bands

Forbidden:

- creating canonical route truth
- altering spawn ecology
- steering vessels
- declaring official maritime lanes

Any hard corridor authority belongs to a future route/corridor spec.

---

# 11. Anchored / Moored Stillness

Anchored and moored vessels must not read as moving.

Required:

- no speed tail
- no underway chevron priority
- fixed pin/ring
- soft anchor radius hint
- dim or steady light only

This distinction is critical.

A moored vessel should feel:

```text
present but stationary
```

not:

```text
broken or inactive
```

---

# 12. Renderer-Local Visual Smoothing

MotionPresence may smooth visual glyph transitions.

Allowed smoothing:

- alpha easing
- label fade
- tail fade
- light shimmer
- halo breathing
- hull glyph interpolation

Forbidden smoothing:

- geographic coordinate smoothing
- heading truth mutation
- vessel position prediction
- wake path interpolation
- AIS gap bridging

Renderer-local smoothing must be visually discardable.

It must not become truth.

---

# 13. Atmospheric Integration

MotionPresence must consume AtmosphericReadability result.

| visibilityClass | MotionPresence Behavior |
|---|---|
| FULL | hull + lights + tail + label if allowed |
| REDUCED | hull/capsule + lights + reduced tail |
| SILHOUETTE | outline + dim lights |
| MARKER_ONLY | pin/dot only, optional minimal light |
| LIGHT_ONLY | lights/glow only |
| ATMOSPHERIC_HIDDEN | render nothing |

AtmosphericReadability remains authority for visibility class.

---

# 14. Density Integration

MotionPresence may consume:

- clutterPressure
- densityClass

for presentation adjustment only.

Allowed effects:

- reduce label frequency
- shorten tails slightly
- dim background markers
- reduce wake glow in saturated sectors

Forbidden effects:

- hide AIS truth independently
- remove vessels
- alter population hierarchy
- alter wake registry
- alter atmospheric result

---

# 15. Label Strategy

Labels should be reduced further.

| Tier | Label Behavior |
|---|---|
| HERO | vesselName or class |
| MID | vesselName or class |
| BACKGROUND | class only, optional |
| GHOST | no label |

MMSI should remain hidden unless:

```ts
SBE.runtimeFlags.showMaritimeDebugLabels === true
```

Labels should never be the primary readability mechanism.

---

# 16. Visual Debug Flags

Add flags:

```ts
SBE.runtimeFlags.showMaritimeNavLights = true;
SBE.runtimeFlags.showMaritimeSpeedTails = true;
SBE.runtimeFlags.showMaritimeWakeGlow = true;
SBE.runtimeFlags.showMaritimeCorridorHints = false;
```

Defaults:

- nav lights on
- speed tails on
- wake glow on
- corridor hints off

---

# 17. Validation Helper

Add console helper:

```ts
_wos.debugMotionPresence()
```

Should return:

```ts
{
  navLightsRendered: number;
  speedTailsRendered: number;
  wakeGlowSegments: number;
  anchoredPinsRendered: number;
  lightOnlyVessels: number;
  ferryEmphasisCount: number;
  corridorHintsRendered: number;
}
```

Telemetry is diagnostic only.

---

# 18. Implementation Target

Patch:

```text
wall/render/maritimeOccupancyRenderer.js
```

Do not add a separate runtime system unless necessary.

This is a presentation upgrade to the existing occupancy renderer.

---

# 19. Required Implementation Changes

Implement:

```ts
_drawNavigationLights(ctx, pt, headingDeg, lenPx, widPx, tier, vesselClass, alpha)
```

Implement or upgrade:

```ts
_drawSpeedTail(ctx, pt, headingDeg, speedKts, tier, provenance, alpha)
```

Upgrade wake pass with optional glow pass for existing wake segments.

No new wake geometry.

Anchored/moored vessels must route to anchor/moored primitives.

Underway vessels route to motion primitives.

Track:

- nav lights rendered
- tails rendered
- wake glow rendered
- anchored pins
- ferry emphasis

---

# 20. Acceptance Criteria

Build is successful when:

- underway vessels read as moving even when small
- anchored/moored vessels read as stationary
- night harbor has visible light behavior
- ferry/passenger vessels read stronger than background boats
- wakes are more legible but still atmospheric
- labels are no longer the main readability tool
- renderer remains read-only
- no AIS, wake, density, atmosphere, spawn, or population mutation occurs

---

# 21. Non-Goals

This spec does NOT implement:

- full 3D boats
- hydrodynamic simulation
- ferry route authority
- live AIS subscription
- gameplay interactions
- camera behavior
- official maritime lane routing
- synthetic spawn scheduling
- audio-reactive maritime behavior

---

# 22. Build Readiness

```text
Stage: [BUILD]
Freeze Decision: GO
```

This is safe to build as:

```text
presentation-motion-presence-only
```

---

# 23. Implementation Guide

- **Where this goes:** `wall/render/maritimeOccupancyRenderer.js`
- **What to run:** patch occupancy renderer with nav lights, speed tails, wake glow, stationary-vessel primitives, and motion-presence telemetry.
- **What to expect:** harbor vessels become readable as moving maritime traffic rather than static debug markers.
