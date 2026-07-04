---
layout: spec
title: "Transit Presence Pass"
date: 2026-06-05
doc_id: "0605A_WOS_TransitPresencePass_v1.0.0"
version: "1.0.0"

project: "Wall of Sound"
system: "WOS"

domain: "presentation"
component: "transit_presence_pass"

type: "interpretation-spec"
status: "approved"

priority: "high"
risk: "medium"

classification: "presentation-layer"

summary: "Adds lightweight visual presence cues to selected live transit actors — glow, headlights, taillights, subtle motion hints, and class-aware emphasis — without mutating truth, feeds, motion, selector, assets, or Mapbox sources/layers."

doctrine:
  - "2D owns truth"
  - "2.5D owns presentation"
  - "Truth may be dense"
  - "Presentation must be selective"
  - "Presence is not physics"
  - "Atmosphere is presentation-only"

depends_on:
  - "0604G_WOS_MTABusFeedSourceInventory_v1.0.0"
  - "0604H_WOS_MTABusRealtimeAdapter_v1.0.0"
  - "0604I_WOS_MTABusActorBridge_v1.0.0"
  - "0604J_WOS_BusVisualFallbackRenderer_v1.0.0"
  - "0604K_WOS_BusPresentationSelector_v1.0.0"
  - "0604L_WOS_BusDebugLabelPass_v1.0.0"
  - "0604M_WOS_BusAssetPack_v1.0.0"
  - "BusPresentationSelector"
  - "BusAssetResolver"
  - "MapboxViewportRuntime"

enables:
  - "0605B_WOS_BusMotionSmoothing_v1.0.0"
  - "0605C_WOS_TransitLiveryHooks_v1.0.0"
  - "0605D_WOS_CruiseMovementField_v1.0.0"
  - "0605E_WOS_HeroTransitTargeting_v1.0.0"

tags:
  - "transit"
  - "bus"
  - "presence"
  - "atmosphere"
  - "lighting"
  - "wall"
  - "presentation"
---

# 0605A_WOS_TransitPresencePass_v1.0.0_BUILD

## PURPOSE

Make live transit feel more present on the Wall.

0604M made buses recognizable as a fleet hierarchy.

0605A adds a lightweight presentation layer that makes selected buses feel less like map markers and more like moving world entities.

This pass adds:

```text
headlight glow
taillight glow
class-aware accent glow
subtle motion streak hints
night/city readability
optional debug visibility
```

It must not add:

```text
physics
motion smoothing
camera follow
route labels
ads
graffiti
new truth fields
Mapbox sources/layers
```

The goal is visible atmosphere, not simulation complexity.

---

# CURRENT BUILD CONTEXT

Completed bus stack:

```text
0604G Feed Inventory        ✅
0604H Realtime Adapter      ✅
0604I Actor Bridge          ✅
0604J Fallback Renderer     ✅
0604K Presentation Selector ✅
0604L Debug Label Pass      ✅
0604M Bus Asset Pack        ✅
```

Current path:

```text
MTA GTFS-RT
→ raw rows
→ vehicle.bus truth actors
→ selector-selected actors
→ distinct bus silhouettes
→ optional debug labels
```

Current weakness:

```text
buses are real, visible, selectable, identifiable, and visually classified
but they still need atmosphere and presence
```

---

# CORE DECISION

0605A is a presentation overlay.

It does not replace bus meshes.

It draws transient visual cues around the selected buses that already exist.

Canonical split:

```text
BusVisualFallbackRenderer draws bodies.
BusAssetResolver chooses class form.
BusPresentationSelector chooses candidates.
TransitPresencePass adds atmosphere.
```

---

# AUTHORITY BOUNDARIES

## This spec owns

- transit presence overlay canvas
- class-aware bus glow cues
- headlight / taillight cue drawing
- subtle motion streak drawing
- altitude-gated presence visibility
- night/city presence presets
- debug state for rendered presence cues

## This spec may read

- `SBE.BusPresentationSelector.select()`
- `SBE.BusAssetResolver.getPresentationProfile(actor)`
- `SBE.MapboxViewportRuntime`
- map projection / zoom / pitch / bearing
- selected bus actor metadata
- selected actor heading/speed/freshness

## This spec may write

- its own transparent canvas overlay only
- its own internal state only

## This spec must not write

- TruthActorRuntime
- MTABusRealtimeAdapter rows
- MTABusActorBridge rows
- BusPresentationSelector state
- BusAssetResolver cache/classification
- WorldSpaceVehicleLayer vehicle payloads
- Mapbox sources
- Mapbox layers
- Studio
- asset assignments
- maritime/AIS
- Citi Bike/subway systems

---

# NEW FILE

```text
wall/systems/transit/transitPresencePass.js
```

Register in:

```text
wall/index.html
```

after:

```text
wall/systems/transit/busAssetResolver.js
wall/systems/transit/busDebugLabelPass.js
```

and before debug tooling if possible.

---

# PUBLIC API

Expose:

```js
SBE.TransitPresencePass
```

Frozen API:

```js
start()
stop()
isActive()

renderOnce()
clear()

setEnabled(enabled)
setDebug(enabled)
setPreset(presetName)
getPreset()

setIntensity(value)
setMaxCues(count)

getState()
getRenderedCues()
```

---

# DEBUG COMMANDS

Add to:

```js
_wos.debug.worldActors
```

Required:

```js
transitPresenceStart()
transitPresenceStop()
transitPresenceRenderOnce()
transitPresenceClear()
transitPresenceState()
transitPresencePreset(name)
transitPresenceIntensity(value)
transitPresenceMaxCues(count)
transitPresenceDebug(on)
```

Optional convenience:

```js
busPresenceProof()
```

Runs:

```text
busLiveProof()
→ transitPresenceRenderOnce()
```

and returns a combined report.

---

# RENDERING STRATEGY

Use a single transparent 2D canvas overlay.

Requirements:

```text
pointer-events: none
position: absolute
inset: 0
z-index above Mapbox canvas
below UI panels
no DOM element per bus
no Mapbox source/layer creation
no per-bus permanent objects
```

Canvas should attach to the same Mapbox container used by other presentation overlays.

If no map/container exists:

```text
return ok:false
lastError:'map_unavailable'
never throw
```

---

# INPUT SELECTION

TransitPresencePass may only draw cues for:

```js
SBE.BusPresentationSelector.select().selectedActors
```

It must not run its own actor scan.

Reason:

```text
selector chooses
presence pass decorates
```

The pass may optionally use:

```js
selection.readyActors
```

only for future prewarm/debug reporting.

It must not draw ready actors in v1.0.0.

---

# ALTITUDE POLICY

Presence cues appear only at:

```text
low
city
regional
```

Never at:

```text
cruise
```

Baseline:

```js
low      → full cues
city     → compact cues
regional → tiny light pulse only
cruise   → off
```

Cruise aggregate movement belongs to a future movement-field pass.

---

# MAX CUE BUDGETS

Default maximum cues:

```js
low      → 80
city     → 160
regional → 260
cruise   → 0
```

The budget is separate from bus render budget.

Reason:

```text
not every visible bus needs a glow cue
presence must remain tasteful
```

If selected buses exceed budget, use selector order.

---

# PRESENCE PRESETS

Required presets:

```js
"clean"
"night_city"
"cyan_infra"
"debug_bright"
"off"
```

## clean

Minimal cues.

```text
soft head/tail dots
no bloom
no streaks
```

## night_city

Default.

```text
soft glow
subtle taillight warmth
moderate class accent
tiny motion hints
```

## cyan_infra

Stylized WOS/StudioRich mood.

```text
cyan transit energy
low haze
cooler glow
```

## debug_bright

Diagnostic.

```text
strong cue visibility
route/class differences easy to inspect
not for stream output
```

## off

No drawing.

```text
enabled false
renderOnce returns ok:true renderedCueCount:0
```

---

# CUE TYPES

## Headlight cue

Position:

```text
front of bus based on heading
```

Visual:

```text
small soft cone/dot
white or cyan-white
```

Required at:

```text
low
city
```

Optional simplified dot at:

```text
regional
```

## Taillight cue

Position:

```text
rear of bus based on heading
```

Visual:

```text
small red/warm dot pair or simple glow
```

Required at:

```text
low
city
```

## Class accent glow

Color/strength derived from:

```js
SBE.BusAssetResolver.getPresentationProfile(actor).accent
```

Expected use:

```text
articulated / express / shuttle subtly distinguish in motion
```

Do not introduce final livery colors.

## Motion streak hint

Draw only when:

```js
actor.speedMps > 0.5
```

Visual:

```text
short translucent trail opposite heading
```

Allowed only:

```text
low
city
```

Not allowed:

```text
regional
cruise
```

Motion streak is visual-only.

It must not perform interpolation or change actor positions.

---

# CLASS-AWARE PRESENCE

Use bus asset class when available:

```text
standard    → normal cue
articulated → slightly longer light span
express     → sleeker/brighter front cue
shuttle     → smaller tighter cue
special     → subtle elevated accent
```

If resolver unavailable:

```text
fallback to generic bus cue
```

---

# SCREEN PROJECTION

For each selected actor:

```text
project actor.lng/actor.lat to screen position
compute heading vector from headingDeg
draw cues in screen space
```

If projection fails:

```text
skip actor
projectionRejected++
```

Do not mutate actor.

---

# FRESHNESS / STALE HANDLING

Presence pass relies on selector for stale filtering.

However, it may reduce alpha based on freshness:

```text
fresh < 15s      → full opacity
15s–45s          → fade slightly
> stale threshold → should not be selected; skip if encountered
```

Do not change truth TTL.

---

# PERFORMANCE REQUIREMENTS

0605A must remain lightweight.

Requirements:

```text
single canvas
no DOM-per-bus
no Mapbox sources/layers
no Three.js geometry creation
no per-frame actor scan
no continuous RAF by default
renderOnce required
optional interval >= 15000ms only
no unbounded arrays
max cues enforced
```

Default operation:

```text
manual renderOnce()
```

Optional start interval:

```text
start({ intervalMs })
```

If implemented:

```js
intervalMs >= 15000
```

---

# STATE MODEL

```js
type TransitPresencePassState = {
  version: "1.0.0"
  active: boolean
  enabled: boolean
  debug: boolean

  preset: "clean" | "night_city" | "cyan_infra" | "debug_bright" | "off"
  intensity: number
  maxCues: number | null

  lastRenderAt: number | null
  renderCount: number
  lastError: string | null

  profile: "low" | "city" | "regional" | "cruise"
  selectedActorCount: number
  cueCandidateCount: number
  renderedCueCount: number
  skippedCount: number

  projectionRejected: number
  cruiseRejected: number
  budgetRejected: number

  canvasAttached: boolean
  canvasSize: {
    width: number
    height: number
    dpr: number
  }
}
```

---

# RENDERED CUE MODEL

```js
type TransitPresenceCue = {
  actorId: string
  vehicleId: string | null
  routeId: string | null
  busAssetClass: string | null
  profile: string
  cueTypes: string[]
  screenX: number
  screenY: number
}
```

`getRenderedCues()` returns these lightweight debug objects.

---

# EXECUTION FLOW

Manual proof:

```text
1. _wos.debug.worldActors.mtaBusSetApiKey("<key>")
2. _wos.debug.worldActors.busLiveProof()
3. _wos.debug.worldActors.transitPresenceStart()
4. _wos.debug.worldActors.transitPresencePreset("night_city")
5. _wos.debug.worldActors.transitPresenceRenderOnce()
6. _wos.debug.worldActors.transitPresenceState()
```

Expected:

```text
visible buses gain subtle presence cues
truth remains unchanged
WSL payloads remain unchanged
Mapbox sources/layers remain unchanged
```

---

# VISUAL TARGET

The pass should make buses read as:

```text
moving civic lights
living transit presence
small illuminated world objects
```

not:

```text
neon stickers
debug spam
glowing Christmas lights
```

Default must be tasteful.

`debug_bright` may be loud.

---

# ACCEPTANCE TESTS

## T1 — Loads safely

Expected:

```text
SBE.TransitPresencePass exists
no key required
no bus actors required
no crash
```

## T2 — Starts safely

Expected:

```text
start() attaches one canvas when map container exists
active:true
canvasAttached:true
```

## T3 — Stops safely

Expected:

```text
stop() active:false
canvas hidden or cleared
no RAF leak
```

## T4 — No selector

Expected:

```text
renderOnce() ok:false
lastError:'selector_unavailable'
no crash
```

## T5 — No selected actors

Expected:

```text
renderOnce() ok:true
renderedCueCount:0
lastError:null
```

## T6 — Selected bus draws cues

Given one selected low/city bus:

Expected:

```text
renderedCueCount:1
cueTypes includes headlight
cueTypes includes taillight
```

## T7 — Cruise draws zero

At cruise profile:

Expected:

```text
renderedCueCount:0
cruiseRejected increments
```

## T8 — Regional draws simplified cue only

Expected:

```text
cueTypes does not include motion_streak
cueTypes may include regional_light
```

## T9 — Budget enforced

Given selected buses above cue budget:

Expected:

```text
renderedCueCount <= max cue budget
budgetRejected increments
```

## T10 — Presets apply safely

Expected:

```text
clean/night_city/cyan_infra/debug_bright/off valid
invalid preset returns false and leaves current preset unchanged
```

## T11 — Intensity clamps

Expected:

```text
setIntensity(-1) clamps to 0
setIntensity(2) clamps to 1
```

## T12 — Class accent reads resolver profile

Given articulated/express/shuttle actors:

Expected:

```text
presence cue stores busAssetClass
class accent differs by class
```

## T13 — No truth mutation

Expected:

```text
TruthActorRuntime actor count unchanged
actor metadata unchanged
```

## T14 — No WSL mutation

Expected:

```text
WorldSpaceVehicleLayer vehicle payload count unchanged
no upsertVehicle/removeVehicle calls
```

## T15 — No Mapbox mutation

Expected:

```text
no new Mapbox sources
no new Mapbox layers
```

## T16 — Debug commands work

Expected:

```text
transitPresenceState()
transitPresenceRenderOnce()
transitPresencePreset()
transitPresenceIntensity()
transitPresenceClear()
```

return structured data without throwing.

---

# NON-GOALS

This spec does not create:

```text
bus motion smoothing
bus interpolation
camera follow
route labels
public transit UI
bus ads
graffiti bus system
livery editor
Studio controls
subway rendering
Citi Bike rendering
cruise movement field
hero locations
marble physics
```

---

# DEFERRED SYSTEMS

## 0605B — Bus Motion Smoothing

Interpolation/dead-reckoning between GTFS-RT updates.

## 0605C — Transit Livery Hooks

Reserved presentation hooks for StudioRich, graffiti, sponsored/event buses.

## 0605D — Cruise Movement Field

Aggregate citywide movement lights at far altitude.

## 0605E — Hero Transit Targeting

Camera/follow targeting for selected buses/routes/vehicles.

---

# NEXT SPEC

Recommended next:

```text
0605B_WOS_BusMotionSmoothing_v1.0.0_BUILD
```

Only after 0605A proves that live buses now feel present in the scene.

If the cues overpower the map:

```text
0605A.1_WOS_TransitPresenceTuningPatch_v1.0.0_BUILD
```

---

# IMPLEMENTATION GUIDE

- **Where**: Add `wall/systems/transit/transitPresencePass.js`; register it in `wall/index.html` after `busDebugLabelPass.js` and `busAssetResolver.js`; add debug commands to `wall/systems/presentation/worldSpaceVehicleDebug.js`.
- **What**: Run `node --check wall/systems/transit/transitPresencePass.js` and `node --check wall/systems/presentation/worldSpaceVehicleDebug.js`.
- **Expect**: Selected live buses receive subtle screen-space headlight, taillight, class-accent, and optional motion-streak cues; truth, WSL payloads, Mapbox sources/layers, selector, assets, and feeds remain unchanged.
