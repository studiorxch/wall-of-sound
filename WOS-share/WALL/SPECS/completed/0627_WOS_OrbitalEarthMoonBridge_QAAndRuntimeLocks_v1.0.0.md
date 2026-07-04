# 0627_WOS_OrbitalEarthMoonBridge_QAAndRuntimeLocks_v1.0.0

## Project

**Project:** WOS  
**Feature Layer:** Orbital Earth / Moon Bridge  
**Document Type:** QA + Runtime Lock Spec  
**Version:** v1.0.0  
**Status:** Proposed  
**Primary Runtime Owner:** WOS  
**Connected Systems:** Mapbox Earth/Globe, Orbital Earth Mode, Moon Mode, Broadcast HUD, PLAY visual-control bridge

---

## Purpose

Lock and verify the current WOS Orbital Earth and Moon architecture before adding more visuals.

This spec prevents regression back to the broken model where Orbital entered a fake Three.js planet disconnected from the live WOS map. It also verifies that Moon Mode only extends from a believable Orbital Earth state, not directly from the local map or an abstract visualizer object.

The QA goal:

```text
WOS Map
→ Mapbox Orbital Earth
→ style-preserving audio overlays
→ Moon Mode gate
```

No fake Earth swap.  
No unlabeled celestial objects.  
No Moon shortcut from local map.  
No hard-coded cyan overlay if the map style changes.

---

## Architecture Lock

### Correct runtime sequence

```text
Flight / local map
→ Orbital Earth
→ optional Signal / Atmosphere overlays
→ Moon prep / cislunar transition
→ Moon orbit
→ Moon surface
```

### Forbidden runtime sequence

```text
Map
→ fake Three.js Earth sphere
```

```text
Map
→ Moon Mode directly
```

```text
Map
→ portal orb / visualizer
```

```text
Orbital Earth
→ unlabeled sphere object
```

---

## Runtime Ownership

### WOS owns

- Mapbox map
- Mapbox globe / Orbital Earth continuity
- transport modes
- Orbital HUD
- Orbital overlays
- Moon mode
- object-role registry
- camera transitions
- runtime state cleanup

### PLAY may provide

- playback state
- current track
- playlist section
- flow-curve position
- track transition event
- audio analyser values

### PLAY must not own

- Orbital Earth rendering
- Moon Mode state
- WOS transport state
- Mapbox camera state
- celestial object registry

Correct bridge:

```text
PLAY signals
→ WOS visual-control bridge
→ WOS Orbital/Moon runtime
```

---

## Active Runtime Locks

### 1. Orbital entry lock

Default Orbital entry must call:

```js
enterFromMapContext(context, "earth")
```

Expected behavior:
- routes to `OrbitalEarthMode.enter()`
- keeps the Mapbox globe visible
- bypasses Three.js fake sphere
- applies style tokens
- activates Orbital HUD state

### 2. Three.js sphere lock

Three.js sphere modes are manual-only secondary states.

Allowed manual submodes:
- `signal`
- `visualizer`
- `portal`

Forbidden:
- automatic entry into `visualizer`
- automatic entry into `portal`
- default entry into any fake Earth object

### 3. Style-token lock

Orbital overlays must consume `WosMapStyleTokens`.

Forbidden:
- hard-coded cyan as universal overlay color
- hard-coded portal glow as default
- hard-coded linework color that ignores active map style

Expected:
- cyan map → cyan overlays
- pink map → pink overlays
- gold map → gold overlays
- fallback only if style extraction fails

### 4. Object-role lock

Every visible object must have a declared role.

Allowed role registries:
- `OrbitalOverlayRoles.js`
- `MoonObjectRegistry.js`

Forbidden:
- unlabeled sphere
- accidental moon
- accidental planet
- debug marker visible by default
- signal particle large enough to read as celestial body

### 5. Moon gate lock

Moon Mode must only be entered from active Orbital Earth.

Required gate:

```js
MoonModeController.enterFromOrbitalEarth()
```

Expected:
- works only if `OrbitalEarthMode.isActive()` is true
- blocks from local map
- blocks from visualizer/portal submode unless explicitly routed back through Orbital Earth
- logs clear `[WOS Moon]` diagnostic

### 6. Scale-authenticity lock

Moon Mode must preserve realism-first scale logic.

Expected:
- Earth radius = 1.0 render unit
- Moon radius ≈ 0.272 render unit
- cinematic distance and authentic distance are explicitly separated
- near-side / far-side visibility logic is respected
- Earthrise is orbital, not default surface behavior

### 7. Startup lock

WOS must always boot to readable map state.

Required startup state:
- Flight selected
- map visible
- Orbital Earth inactive
- Moon inactive
- visualizer inactive
- no stuck overlay
- no dimmed map filter
- no travel-state body class
- no FX panel forced open

---

## QA Scope

This pass verifies:

1. Map startup
2. Orbital Earth entry
3. Mapbox globe continuity
4. Style-token inheritance
5. Audio overlay default safety
6. Manual overlay behavior
7. Three.js sphere demotion
8. Object-role discipline
9. Moon gate behavior
10. Moon state-machine behavior
11. Return-state cleanup
12. Regression prevention

---

## Required Test Sequence A — Startup

### Steps

```text
1. Hard refresh WOS.
2. Wait for runtime ready.
3. Do not click any transport.
```

### Expected

```text
Flight selected.
Map is visible.
Mapbox style is loaded.
No Orbital canvas is visible.
No Moon layer is active.
No visualizer/portal sphere is visible.
No stuck dim overlay.
```

### Fail if

- map appears black or hidden
- starfield appears before Orbital selection
- Three.js sphere appears at boot
- Moon object appears at boot
- nav says Orbital while map is still local mode

---

## Required Test Sequence B — Orbital Earth Entry

### Steps

```text
1. Start from visible Flight map.
2. Pan/zoom to a recognizable location.
3. Click Orbital.
4. Wait for transition to complete.
```

### Expected

```text
Mapbox globe / Earth continuity remains visible.
No fake Three.js Earth appears.
Orbital HUD state is active.
OrbitalEarthMode.isActive() returns true.
Overlay CSS variables match current map style tokens.
```

### Console checks

```js
SBE.OrbitalEarthMode?.isActive()
SBE.WosMapStyleTokens?.getLastTokens?.()
```

### Fail if

- Orbital switches to fake blue planet
- portal orb appears automatically
- map disappears completely
- overlay colors ignore current style
- origin/marker objects look like a moon

---

## Required Test Sequence C — Style Token Preservation

### Steps

```text
1. Simulate or load a non-cyan map style token set.
2. Enter Orbital.
3. Observe overlays.
```

### Expected

```text
Overlay colors inherit active style.
No cyan-only assumption.
CSS vars reflect token values.
```

### Suggested check

```js
getComputedStyle(document.documentElement).getPropertyValue("--orb-accent")
getComputedStyle(document.documentElement).getPropertyValue("--orb-line")
```

### Fail if

- cyan remains when token says pink/gold
- overlay glow uses old portal values
- hard-coded color overrides token extraction

---

## Required Test Sequence D — Audio Overlay Safety

### Steps

```text
1. Enter Orbital Earth.
2. Confirm audio overlay default mode.
3. Switch overlay to manual low.
4. Trigger scan ring.
5. Switch overlay to reactive if PLAY bridge exists.
```

### Expected

```text
Default overlay mode is off or restrained.
Manual low is subtle.
Scan ring is rare and soft.
Reactive mode does not error if PLAY is unavailable.
```

### Fail if

- overlay behaves like a nightclub equalizer
- scan ring loops constantly
- bass/energy destroys map readability
- PLAY bridge absence causes errors

---

## Required Test Sequence E — Three.js Secondary Modes

### Steps

```text
1. Enter Orbital Earth.
2. Manually select visualizer or portal.
3. Return to Orbital Earth.
4. Return to map.
5. Re-enter Orbital.
```

### Expected

```text
Visualizer/portal only appears after manual selection.
Re-entering Orbital defaults back to earth submode.
Portal does not leak into default entry.
Map return clears Three.js state.
```

### Fail if

- portal/visualizer appears by default
- fake sphere remains behind map
- previous manual submode becomes new default
- FX panel forces portal state on next entry

---

## Required Test Sequence F — Object Role Discipline

### Steps

```text
1. Enter Orbital Earth.
2. Inspect visible markers / particles / route arcs.
3. Enter Moon Mode gate if available.
4. Inspect Moon objects.
```

### Expected

Every visible object is one of the approved roles:

```text
earth_mapbox_globe
atmosphere_overlay
style_signal_line
scan_ring
star_particle
origin_marker
destination_marker
route_arc
debug_marker
future_moon
earth
moon
signal_particle
```

### Fail if

- small sphere appears without role
- debug marker appears in normal mode
- origin marker reads as Moon
- Moon appears before Moon state
- particle scale makes it read as a planet

---

## Required Test Sequence G — Moon Gate

### Steps

```text
1. Hard refresh WOS.
2. From normal Flight map, call Moon entry.
3. Enter Orbital Earth.
4. Call Moon entry again.
```

### Suggested console

```js
SBE.MoonMode?.enterFromOrbitalEarth?.()
```

### Expected

From normal map:

```text
Moon entry blocks or no-ops.
Clear diagnostic logs why it blocked.
```

From Orbital Earth:

```text
Moon entry is allowed.
State transitions into cislunar_transit.
```

### Fail if

- Moon starts directly from map
- Moon starts from portal/visualizer without Earth bridge
- Moon state changes without diagnostic
- Moon can be entered before Orbital Earth is active

---

## Required Test Sequence H — Moon State Machine

### Steps

```text
1. Enter Orbital Earth.
2. Start Moon Mode.
3. Advance cislunar transit.
4. Enter lunar orbit.
5. Enter lunar surface.
6. Return to Orbital Earth.
```

### Expected states

```text
inactive
→ cislunar_transit
→ lunar_orbit
→ lunar_surface
→ orbital_earth
```

### Expected HUD fields

```text
MODE: MOON
STATE: TRANSIT / ORBIT / SURFACE
PHASE: departure / midpoint / approach / arrival
DISTANCE: active during transit
VIEW: near_side / far_side / earth_view / earthrise
SIGNAL: idle/live/future
SOURCE: WOS
```

### Fail if

- state skips without explicit call
- surface opens before transit/orbit path
- HUD reports Earthrise during static surface view incorrectly
- return does not restore Orbital Earth

---

## Required Test Sequence I — Scale and Visibility Logic

### Steps

```text
1. Inspect MoonScaleModel constants.
2. Test near-side lunar longitude.
3. Test limb longitude.
4. Test far-side longitude.
```

### Suggested console checks

```js
SBE.MoonScaleModel?.REAL
SBE.MoonScaleModel?.RENDER
SBE.MoonEarthVisibility?.earthVisibilityAlpha?.(0)
SBE.MoonEarthVisibility?.earthVisibilityAlpha?.(90)
SBE.MoonEarthVisibility?.earthVisibilityAlpha?.(180)
```

### Expected

```text
Earth diameter: 12,742 km
Moon diameter: 3,474 km
Average distance: 384,400 km
Moon render radius ≈ 0.272 if Earth radius = 1.0
near side: Earth visible
limb: fade zone
far side: Earth hidden
```

### Fail if

- Moon and Earth are same size by default
- Earth is visible from far side
- Earthrise is treated as normal surface behavior
- render constants overwrite truth constants

---

## Required Test Sequence J — Return Cleanup

### Steps

```text
1. Enter Orbital Earth.
2. Toggle overlays.
3. Enter manual visualizer if available.
4. Return to Orbital Earth.
5. Enter Moon Mode if available.
6. Return to Orbital Earth.
7. Return to map.
```

### Expected

After return to map:

```text
Flight selected.
Map restored.
OrbitalEarthMode inactive.
MoonMode inactive.
Visualizer inactive.
No stuck overlay.
No stuck body classes.
FX button hidden unless Orbital selected.
```

### Body classes to check

```js
document.body.className
```

### Fail if

- `wos-orbital-earth-active` remains after map return
- `wos-moon-active` remains after map return
- map remains dimmed
- FX button remains visible
- rAF loop continues for hidden visualizer

---

## Diagnostic Requirements

### Orbital diagnostics

Must log at mode changes:

```text
[WOS Orbital] ENTER EARTH
[WOS Orbital] EXIT EARTH
[WOS Orbital] STYLE TOKENS
[WOS Orbital] OVERLAY MODE
[WOS Orbital] BLOCKED
```

### Moon diagnostics

Must log at state changes:

```text
[WOS Moon] ENTER TRANSIT
[WOS Moon] ENTER ORBIT
[WOS Moon] ENTER SURFACE
[WOS Moon] RETURN ORBITAL EARTH
[WOS Moon] BLOCKED
```

### Diagnostics should include

- mode
- submode
- style token source
- active object roles
- map visibility
- Moon state
- Earth visibility alpha
- fallback reason if any

---

## Runtime Failure Handling

### If Mapbox globe projection fails

Expected fallback:

```text
Stay on map.
Show diagnostic.
Do not enter fake sphere automatically.
```

### If style token extraction fails

Expected fallback:

```text
Use WOS default tokens.
Continue Orbital Earth.
Log fallback source.
```

### If PLAY bridge unavailable

Expected fallback:

```text
Audio overlay remains off/manual.
No console spam.
No runtime failure.
```

### If Moon entry called too early

Expected fallback:

```text
No-op.
Log blocked state.
Remain in current mode.
```

### If Three.js visualizer fails

Expected fallback:

```text
Return to Orbital Earth.
Do not break Mapbox map.
Log failure.
```

---

## Files to Verify

### Orbital files

```text
wall/systems/orbital/OrbitalOverlayRoles.js
wall/systems/orbital/WosMapStyleTokens.js
wall/systems/orbital/OrbitalAudioOverlayController.js
wall/systems/orbital/OrbitalEarthMode.js
wall/systems/orbital/OrbitalModeController.js
```

### Runtime files

```text
wall/systems/runtime/WosModeTransitionController.js
wall/systems/runtime/WosRuntimeModeState.js
wall/systems/runtime/WosStartupCoordinator.js
wall/systems/runtime/WosEndpointGuard.js
```

### Moon files

```text
wall/systems/moon/MoonObjectRegistry.js
wall/systems/moon/MoonScaleModel.js
wall/systems/moon/MoonEarthVisibility.js
wall/systems/moon/CislunarTransitController.js
wall/systems/moon/MoonSurfaceView.js
wall/systems/moon/MoonOrbitView.js
wall/systems/moon/MoonModeController.js
```

### Interface files

```text
wall/systems/traversalControlDeck.js
TopBar.tsx
index.html
```

---

## Acceptance Criteria

This QA lock is complete when:

1. WOS boots to a readable map every time.
2. Orbital entry stays on Mapbox globe / Earth continuity.
3. No Three.js fake Earth appears by default.
4. Orbital overlays inherit live map style tokens.
5. Cyan is not hard-coded as the universal overlay identity.
6. Audio overlay defaults are off or restrained.
7. Visualizer / portal states are manual-only.
8. Every visible object has a declared role.
9. Moon Mode is blocked unless Orbital Earth is active.
10. Moon Mode state order is enforced.
11. Moon scale constants preserve real truth values.
12. Near-side / far-side Earth visibility works.
13. Return to map clears all Orbital/Moon body classes.
14. PLAY remains a signal source, not the WOS runtime owner.
15. Diagnostics are clear enough for future Claude/Codex sessions.

---

## Do Not Reopen Unless Broken

### Closed direction

```text
Default Orbital should be a fake Three.js sphere.
```

Status:

```text
Closed.
```

Reason:

```text
It breaks Earth continuity and makes the user question whether they are still on the same planet.
```

Reopen only if:

```text
Mapbox globe cannot support the required Orbital Earth presentation after testing.
```

### Closed direction

```text
Moon Mode can start directly from local map.
```

Status:

```text
Closed.
```

Reason:

```text
Moon Mode requires Earth continuity and cislunar context first.
```

Reopen only if:

```text
A future explicit shortcut mode is designed and labeled as non-realistic / demo-only.
```

### Closed direction

```text
Cyan is the Orbital identity.
```

Status:

```text
Closed.
```

Reason:

```text
Orbital must preserve whatever active WOS map style is in use.
```

Reopen only if:

```text
A specific cyan-only theme is selected by the user.
```

---

## Final Runtime Principle

WOS must preserve trust before transformation.

The user should believe:

```text
This is the same map.
This is the same Earth.
The music is activating the world.
The Moon is a real destination from that world.
```

Only after that trust is established should WOS enter abstract visualizer states.

## Implementation Guide

- **Where:** Run QA against `wall/systems/orbital/`, `wall/systems/moon/`, `wall/systems/runtime/`, `wall/systems/traversalControlDeck.js`, `TopBar.tsx`, and `index.html`.
- **What:** Verify Mapbox-first Orbital entry, style-token inheritance, audio overlay restraint, object-role enforcement, Moon gate/state-machine behavior, scale constants, and return cleanup.
- **Expect:** WOS boots to a readable map, enters real Orbital Earth without fake sphere default, allows Moon Mode only from Orbital Earth, and prevents regression through explicit runtime locks.
