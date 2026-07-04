---
date: 2026-06-26
project: WOS
connected_system: PLAY
document_type: implementation_spec
version: v1.0.1
status: refined
runtime_owner: WOS
control_source: PLAY playback / playlist / flow curve
feature_layer: Orbital Mode
supersedes: 0626_PLAY_OrbitalMode_ControlPanelAndMotionSystem_v1.0.0
---

# 0626_WOS_OrbitalMode_PLAYControlBridge_v1.0.1

## Purpose

Define the next implementation spec for **WOS Orbital Mode**: a controllable, performable space-listening view with slow orbital motion, HUD-safe movement, effect controls, stream presets, and future-ready audio-reactive hooks.

This revision corrects the product boundary:

```text
PLAY = focused playlist-centered audio-visual music player
WOS  = world / map / orbital / route / broadcast runtime
Orbital Mode = WOS visual environment controlled by PLAY state
```

Orbital Mode belongs to WOS. PLAY can drive it through playlist state, playback state, Flow Curve energy, track metadata, and audio-reactive control signals.

## Identity Boundary

### Non-Negotiable Product Split

PLAY must not become the overall visual-world identity. PLAY is the player layer.

WOS remains the spatial broadcast system and runtime environment that renders city, map, route, flight, drive, transit, and orbital views.

### Correct Language

Use:

```text
WOS Orbital Mode
PLAY-controlled WOS visual mode
PLAY playback-driven orbital environment
WOS broadcast view for PLAY playlist sessions
PLAY → WOS Visual Control Bridge → Orbital Mode
```

Avoid:

```text
PLAY Orbital Mode
PLAY world view
PLAY navigation mode
PLAY Earth environment
PLAY as the master top-bar identity
```

### Top-Bar Rule

The top bar should not make **PLAY** read as the parent identity of the whole system.

If the word PLAY remains visible in the top bar, it should behave and read as a **functional player button**, not as the global product masthead.

Recommended top-bar model:

```text
[system mark] WOS        [Player] [Flow-Curve] [Scheduler] [Broadcast HUD]
```

Alternative compact model:

```text
[system mark] WOS        [PLAY] [Flow-Curve] [Scheduler] [Broadcast HUD]
```

In the compact model, `PLAY` must be styled as a tab/control, not as the overall identity.

## Environmental Assumptions

- Runtime: existing WOS local web app with PLAY-connected player modules.
- Target view: Broadcast HUD / Wall runtime.
- Rendering: current map/globe stack plus optional Three.js overlay modules.
- No backend required for this phase.
- No audio file decoding is required in this phase.
- Audio-reactive controls may read from an existing analyser if available; otherwise manual controls must still work.
- Orbital Mode must work with no active route.
- Orbital Mode must not break Flight, Drive, Walk, Bike, or Transit modes.
- PLAY identity should remain bounded to player / playlist / playback controls.

## Product Definition

WOS Orbital Mode is a **music-listening cockpit in space**.

It should not behave like passive wallpaper. It should give the user control over atmosphere, motion, camera behavior, signal layers, scan effects, grid intensity, route arcs, and broadcast-safe visual presets.

The user should be able to:

1. Enter WOS Orbital Mode from Broadcast HUD.
2. See slow, deliberate motion immediately.
3. Choose between passive, perform, and auto behavior.
4. Control visible orbital effects from a panel.
5. Keep the scene stream-safe and not visually chaotic.
6. Use the mode with or without an active route.
7. Let PLAY playback state influence the visual layer later without making PLAY the world runtime.
8. Prepare future audio-reactive behavior without forcing it into this first build.

## Core Concept

Orbital Mode turns the planet into a slow instrument rendered by WOS and controlled by PLAY state when available.

```text
PLAY Track / Playlist / Flow State
  ↓
WOS Visual Control Bridge
  ↓
Orbital Motion System
  ↓
Planet / Atmosphere / Grid / Signal Layers
  ↓
Broadcast HUD
  ↓
Stream-Ready Space Listening View
```

The viewer should feel suspended in space while the track plays. Motion should be subtle, layered, and controllable.

## Architecture Boundary

```text
PLAY
├── playlist state
├── track metadata
├── playback state
├── Flow Curve state
├── visual preset selection
└── audio-reactive control signals

WOS
├── Broadcast HUD
├── map mode
├── route / travel modes
├── Orbital Mode
├── Earth rendering
├── camera rigs
├── environmental FX
└── stream-safe visual output

Bridge
└── PLAY → WOS Visual Control Bridge → Orbital Mode
```

### Ownership Rules

| System | Owns | Does Not Own |
|---|---|---|
| PLAY | playlist playback, flow state, track context, player controls | map runtime, orbital renderer, world modes |
| WOS | map, orbital scene, HUD, route views, environment FX | playlist scoring, player identity, Flow Curve authoring |
| Bridge | translation of PLAY state into WOS visual controls | brand identity, rendering ownership, playlist logic |

## Phase Scope

### Included

| Feature | Required | Notes |
|---|---:|---|
| Orbital motion controller | Yes | Slow rotation, drift, pause support |
| Orbital FX panel | Yes | User-facing control surface |
| Motion presets | Yes | Passive, Perform, Auto |
| Camera behavior modes | Yes | Lock, Drift, Orbit, Dive-ready |
| Effect toggles | Yes | Atmosphere, grid, particles, scans, route arcs |
| Manual intensity controls | Yes | Works without audio analyser |
| HUD-safe composition | Yes | Effects must not bury the side HUDs |
| PLAY control bridge | Yes | Optional state input from player/playlist layer |
| State persistence | Preferred | Preserve selected preset during session |
| Broadcast-safe defaults | Yes | Low motion, low flash, readable track card |

### Excluded

| Feature | Reason |
|---|---|
| Full audio-reactive engine | Later phase after controls are stable |
| Beat / bar / phrase detection | Requires dedicated audio timing layer |
| Complex shader authoring | Should not block the control surface |
| Real 3D planet replacement | Earth visual upgrade can remain separate |
| OBS scene automation | Later broadcast integration phase |
| Playlist scheduler automation | Later PLAY Scheduler integration |
| PLAY as global WOS identity | Product boundary violation |

## Required File Structure

```text
wall/
  js/
    orbital/
      OrbitalModeController.js
      OrbitalMotionController.js
      OrbitalFxPanel.js
      OrbitalPresetRegistry.js
      OrbitalCameraRig.js
      OrbitalEffectState.js
      OrbitalHudAdapter.js
      OrbitalAudioReactiveBridge.js
      OrbitalDiagnostics.js
      PlayToWosVisualBridge.js
```

If the existing project uses a different module location, keep this folder as the conceptual boundary and adapt imports to the current runtime.

## Data Layer

Build the state contract first.

### `OrbitalEffectState.js`

```js
export const ORBITAL_CONTROL_MODES = Object.freeze({
  PASSIVE: 'passive',
  PERFORM: 'perform',
  AUTO: 'auto'
});

export const ORBITAL_CAMERA_MODES = Object.freeze({
  LOCK: 'lock',
  DRIFT: 'drift',
  ORBIT: 'orbit',
  DIVE: 'dive'
});

export const ORBITAL_TEXTURE_MODES = Object.freeze({
  DARK_TERRAIN: 'dark_terrain',
  SIGNAL_GRID: 'signal_grid',
  PARTICLE_EARTH: 'particle_earth',
  ARCHIVE_ORB: 'archive_orb',
  WIREFRAME: 'wireframe'
});

export function createDefaultOrbitalEffectState() {
  return {
    enabled: false,
    controlMode: ORBITAL_CONTROL_MODES.PASSIVE,
    cameraMode: ORBITAL_CAMERA_MODES.DRIFT,
    textureMode: ORBITAL_TEXTURE_MODES.SIGNAL_GRID,
    rotationSpeed: 0.08,
    cameraDrift: 0.18,
    atmosphereIntensity: 0.42,
    gridIntensity: 0.34,
    signalIntensity: 0.28,
    particleIntensity: 0.12,
    scanRingIntensity: 0.18,
    routeArcIntensity: 0.2,
    bloomIntensity: 0.22,
    trackCardVisible: true,
    hudSafeMode: true,
    audioReactive: false,
    lastUpdatedAt: Date.now()
  };
}
```

### State Rules

- `enabled` controls whether WOS Orbital Mode is active.
- `controlMode` controls whether settings are passive, manually performed, or eventually automated.
- `audioReactive` must default to `false` until the analyser path is verified.
- All intensities must be clamped from `0.0` to `1.0`.
- Rotation speed must support `0.0` so the user can freeze the planet.
- HUD-safe mode must remain enabled by default.
- PLAY-derived state must be optional. Orbital Mode must work without PLAY data.

## Logic Layer

Build the logic layer after the state contract and before UI polish.

### `OrbitalModeController.js`

Responsibilities:

- Enter WOS Orbital Mode.
- Exit WOS Orbital Mode.
- Own the current Orbital effect state.
- Create or connect motion, camera, HUD, bridge, and panel controllers.
- Prevent mode conflicts with Flight, Drive, Walk, Bike, and Transit.
- Expose a small public API for Broadcast HUD controls.

Expected API:

```js
export class OrbitalModeController {
  constructor({ map, hudRoot, sceneBridge, playBridge, audioBridge, logger }) {}
  enter() {}
  exit() {}
  toggle() {}
  update(deltaMs) {}
  setEffectState(partialState) {}
  getEffectState() {}
  dispose() {}
}
```

### `PlayToWosVisualBridge.js`

Responsibilities:

- Read optional PLAY state without making Orbital Mode dependent on it.
- Translate track, playlist, flow, and playback state into neutral visual control signals.
- Return no-op values when PLAY state is unavailable.
- Keep the boundary clear: PLAY controls, WOS renders.

Expected API:

```js
export class PlayToWosVisualBridge {
  constructor({ playerProvider, playlistProvider, flowCurveProvider, logger }) {}

  getVisualSignals() {
    return {
      hasPlayState: false,
      isPlaying: false,
      trackTitle: '',
      trackArtist: '',
      playlistTitle: '',
      flowEnergy: 0,
      sectionEnergy: 0,
      transitionPulse: 0,
      preferredPreset: null
    };
  }
}
```

Bridge rules:

- Never import WOS renderer logic into PLAY modules.
- Never make PLAY responsible for camera, planet, route, or HUD rendering.
- Never require PLAY state to enter Orbital Mode.
- Treat PLAY state as an optional signal source.

### `OrbitalMotionController.js`

Responsibilities:

- Rotate the Earth slowly.
- Apply camera breathing / micro-drift.
- Animate scan rings.
- Apply subtle parallax to stars or background layer.
- Respect pause and low-motion states.

Expected API:

```js
export class OrbitalMotionController {
  constructor({ sceneBridge, cameraRig }) {}
  update(deltaMs, effectState, visualSignals) {}
  pause() {}
  resume() {}
  reset() {}
}
```

Motion rules:

- Default rotation must be extremely slow.
- Camera drift must be subtle enough for long listening sessions.
- No rapid strobing.
- No effect should flash faster than stream-safe thresholds.
- Movement should remain visible even without audio.

### `OrbitalCameraRig.js`

Responsibilities:

- Maintain orbital framing.
- Support lock, drift, orbit, and future dive behavior.
- Keep Earth framed behind HUD without covering key interface blocks.
- Expose camera presets.

Camera modes:

| Mode | Behavior | Use Case |
|---|---|---|
| `lock` | Static camera, rotating Earth only | Reading, archive, low motion |
| `drift` | Slow breathing movement | Default listening mode |
| `orbit` | Gentle lateral orbital move | More cinematic sections |
| `dive` | Reserved transition back to map | Future map return animation |

### `OrbitalPresetRegistry.js`

Responsibilities:

- Define stream-safe presets.
- Apply complete state bundles.
- Prevent inconsistent manual settings.

Required presets:

| Preset | Purpose |
|---|---|
| `deep_space_listen` | Default passive listening mode |
| `signal_earth` | Broadcast/data state with grid and routes |
| `particle_planet` | More musical and reactive visual density |
| `archive_orb` | Slow artifact/documentary state |
| `route_transmission` | Travel/route arc state |

Example preset:

```js
export const ORBITAL_PRESETS = Object.freeze({
  deep_space_listen: {
    controlMode: 'passive',
    cameraMode: 'drift',
    textureMode: 'signal_grid',
    rotationSpeed: 0.06,
    cameraDrift: 0.14,
    atmosphereIntensity: 0.38,
    gridIntensity: 0.18,
    signalIntensity: 0.12,
    particleIntensity: 0.08,
    scanRingIntensity: 0.06,
    routeArcIntensity: 0.0,
    bloomIntensity: 0.18,
    trackCardVisible: true,
    hudSafeMode: true,
    audioReactive: false
  }
});
```

### `OrbitalAudioReactiveBridge.js`

Responsibilities:

- Provide a future-safe interface for audio features.
- Return neutral values when no analyser exists.
- Keep manual controls functional.

Expected API:

```js
export class OrbitalAudioReactiveBridge {
  constructor({ analyserProvider }) {}
  getAudioFeatures() {
    return {
      bass: 0,
      mids: 0,
      highs: 0,
      energy: 0,
      transient: 0
    };
  }
}
```

This phase should wire the bridge without depending on it.

### `OrbitalHudAdapter.js`

Responsibilities:

- Update HUD labels for WOS Orbital Mode.
- Hide, compress, or dim route controls when appropriate.
- Keep track card visible and readable.
- Show current preset and control mode.
- Avoid making PLAY appear as the global product masthead.

Required HUD text:

```text
MODE      ORBITAL
CAM       DRIFT / LOCK / ORBIT
SIGNAL    MUSIC / ROUTE / NEWS / ARCHIVE
FX        PASSIVE / PERFORM / AUTO
AUDIO     MANUAL / REACTIVE
ALT       ORBITAL
PLAYER    PLAY / LOCAL / OFF
```

`PLAYER` can reference PLAY as a functional source/control layer, not a global identity.

## Interface Layer

Build the Orbital FX Panel after the controller APIs are stable.

### `OrbitalFxPanel.js`

The panel should be collapsible and should not take over the entire screen.

Recommended position:

- Desktop: right side, under existing status HUD, collapsible.
- OBS/broadcast: compact bottom-right drawer.
- Small window: modal drawer or hidden behind `FX` button.

### Panel Layout

```text
ORBITAL FX

MODE
[ Passive ] [ Perform ] [ Auto ]

PRESET
Deep Space Listen
Signal Earth
Particle Planet
Archive Orb
Route Transmission

CAMERA
[ Lock ] [ Drift ] [ Orbit ] [ Dive ]

EFFECTS
Atmosphere     [ slider ]
Grid           [ slider ]
Signals        [ slider ]
Particles      [ slider ]
Scan Rings     [ slider ]
Route Arcs     [ slider ]
Bloom          [ slider ]
Rotation       [ slider ]
Camera Drift   [ slider ]

TOGGLES
[ Track Card ] [ HUD Safe ] [ Audio Reactive ]

ACTIONS
[ Reset Preset ] [ Freeze ] [ Return to Map ]
```

### Interaction Rules

- Passive mode applies preset defaults and keeps controls subtle.
- Perform mode allows manual overrides.
- Auto mode is reserved for playlist/audio curve integration but can apply preset automation later.
- Freeze sets rotation speed and camera drift to `0.0` without exiting Orbital Mode.
- Reset Preset restores the selected preset.
- Return to Map exits Orbital Mode safely.
- PLAY-derived data may update track card and visual signals, but WOS owns the rendered environment.

## Visual Motion Requirements

### Required Motion Layers

| Layer | Required | Default Behavior |
|---|---:|---|
| Earth rotation | Yes | Very slow eastward or westward drift |
| Camera breathing | Yes | Slow zoom/position oscillation |
| Atmosphere pulse | Yes | Manual intensity in this phase |
| Star parallax | Preferred | Subtle background movement |
| Scan ring | Yes | Occasional sweep, not constant |
| Grid drift | Preferred | Slow opacity/offset motion |
| Route arc trace | Preferred | Only if route data exists |
| Track card movement | Yes | Soft entrance, stable during play |

### Motion Constraints

- No rapid flashing.
- No jitter camera.
- No forced constant scan rings.
- No excessive particle density by default.
- No UI overlap with title card or side HUDs.
- All effects must be reducible to zero.

## Preset Definitions

### 1. Deep Space Listen

Default ambient state.

- low rotation
- low grid
- medium atmosphere
- minimal particles
- track card visible
- route arcs off
- camera drift on

Best for ambient, dub techno, lofi, slow electronic, late-night listening.

### 2. Signal Earth

Broadcast/data state.

- stronger grid
- moderate signal intensity
- scan ring enabled
- route arcs if available
- sharper HUD labels
- particles low

Best for news, transit, city systems, AI/culture signal playlists.

### 3. Particle Planet

Music-reactive visual state.

- particle shell visible
- stronger atmosphere
- moderate bloom
- scan rings occasional
- grid lower
- audio-reactive ready

Best for IDM, electro, experimental, energetic electronic tracks.

### 4. Archive Orb

Artifact/documentary state.

- low motion
- archive or stone texture
- minimal grid
- low particles
- track card prominent
- subdued atmosphere

Best for older records, cinema references, archive entries, cultural notes.

### 5. Route Transmission

Travel/route state.

- route arcs visible
- origin/destination labels
- moderate signal intensity
- scan ring tied to route pulse
- camera drift reduced

Best for Flight/Drive routes and map-to-orbit transitions.

## Broadcast Composition Rules

- The large left track number/title block must remain readable.
- The right HUD should not be covered by FX panel unless panel is collapsed.
- Bottom controls should compress or dim while Orbital FX is open.
- Effects should avoid the far-left title block safe zone.
- Earth framing should support both close crop and centered globe presets.
- A `HUD Safe` toggle must reduce effect intensity near interface zones.
- Top-bar identity should read as WOS or neutral system shell; PLAY should read as a player control/tab when present.

## Flow-Curve Integration

This build does not need full Flow-Curve automation, but the state model must prepare for it.

Future mappings:

| PLAY / Flow-Curve Signal | WOS Orbital Output |
|---|---|
| Macro energy | Atmosphere intensity |
| Local peak | Scan ring sweep |
| Valley/reset | Camera pulls back |
| Track transition | Route/signal pulse |
| High-energy segment | Particle density increase |
| Warning/orphan zone | Red signal interruption |

Do not implement full automation until the manual panel is stable.

## Acceptance Criteria

This phase is complete when:

1. WOS Orbital Mode can be entered and exited from Broadcast HUD.
2. The Earth/orbital scene has visible slow movement without audio input.
3. The user can open an Orbital FX Panel.
4. The panel can switch presets.
5. The panel can change camera mode.
6. The panel can adjust atmosphere, grid, signals, particles, scan rings, route arcs, bloom, rotation, and camera drift.
7. Freeze stops motion without exiting the mode.
8. Reset Preset restores the active preset.
9. Return to Map exits safely.
10. The system works even when no route is active.
11. HUD Safe mode keeps title and side HUD areas readable.
12. No existing travel mode is broken.
13. Console diagnostics show Orbital state changes without noisy logs.
14. PLAY is represented only as player/source/control state, not as the global WOS identity.
15. Orbital Mode remains usable when PLAY state providers are unavailable.

## Testing Checklist

Minimum tests:

- Enter WOS Orbital Mode from Broadcast HUD.
- Exit WOS Orbital Mode back to prior mode.
- Switch every preset.
- Move every slider to `0.0` and `1.0`.
- Confirm Freeze stops rotation and camera drift.
- Confirm Reset Preset restores expected values.
- Confirm route arcs do not error when no route exists.
- Confirm Audio Reactive toggle does not error without analyser.
- Confirm HUD Safe reduces effect intensity near HUD zones.
- Confirm repeated enter/exit does not duplicate panels or animation loops.
- Confirm Flight/Drive/Walk/Bike/Transit still launch after Orbital exit.
- Confirm Orbital Mode works with no PLAY state provider.
- Confirm top-bar PLAY label, if present, reads as a control/tab and not the master identity.

## Development Order

### 1. Data Layer

Build first:

- `OrbitalEffectState.js`
- constants
- clamp helpers
- preset data objects
- default state factory
- neutral PLAY visual signal contract

### 2. Logic Layer

Build second:

- `OrbitalModeController.js`
- `PlayToWosVisualBridge.js`
- `OrbitalMotionController.js`
- `OrbitalCameraRig.js`
- `OrbitalPresetRegistry.js`
- `OrbitalHudAdapter.js`
- `OrbitalAudioReactiveBridge.js`
- `OrbitalDiagnostics.js`

### 3. Interface Layer

Build third:

- `OrbitalFxPanel.js`
- Broadcast HUD Orbital button wiring
- slider/toggle events
- panel open/close behavior
- Return to Map action
- top-bar label correction if needed

## Implementation Notes

- Use small single-purpose modules.
- Do not put all Orbital behavior inside one Broadcast HUD file.
- Use `requestAnimationFrame` only from one owned loop or hook into the existing render loop.
- Guard all map/scene/audio/PLAY references before use.
- Use no-op fallbacks when optional systems are missing.
- Keep console output short and diagnostic-only.
- Avoid hard dependency on route data.
- Avoid hard dependency on live audio data.
- Avoid hard dependency on PLAY state data.
- Keep PLAY as a functional player layer, not a parent identity.

## Expected Result

WOS Orbital Mode becomes a controllable music-listening space rather than a static globe.

The user can sit in space with the music, switch between visual moods, manually control effects, freeze or intensify motion, keep the HUD readable, and prepare the system for future audio-reactive and Flow-Curve automation.

The architecture remains clean: PLAY stays focused on playlist-centered audio-visual playback; WOS owns the world, orbital environment, route modes, HUD, and rendered broadcast space.

## Implementation Guide

- **Where:** Add the new WOS Orbital modules under `wall/js/orbital/`; add `PlayToWosVisualBridge.js` only as an optional signal bridge; keep PLAY/player code outside the world renderer.
- **What:** Build the data layer first (`OrbitalEffectState.js`, presets, neutral PLAY visual signal contract), then the WOS controller/motion/camera layer, then the Orbital FX panel and top-bar label correction.
- **Expect:** Broadcast HUD gains a controllable WOS Orbital Mode with slow movement, presets, an FX panel, freeze/reset/return controls, HUD-safe composition, optional PLAY-driven visual signals, and no confusion between PLAY as player layer and WOS as world runtime.
