---
date_generated: 2026-06-30
project: WALL
source_pack: current
coverage_start: 2026-06-28
coverage_end: 2026-06-30
status: active
---

# WALL Current

## Current Focus

WALL is the **3D city map runtime** — Mapbox GL JS map surface, Three.js actor/building render layer, atmosphere system, Orbital Earth mode, camera/POV controls, and the WOS world engine. PLAY connects to WALL via `postMessage` bridge.

```text
WALL
├── MAP        — Mapbox GL JS surface (dark-v11 / harbor night via studiorich token)
├── CANVAS     — Three.js 3D render layer (actors, buildings)
├── ATMOSPHERE — Three Sky custom layer + cloudAtmosphereRenderer.js
├── ORBITAL    — Orbital Earth mode (satellite globe, clean baseline, broadcast surface)
├── STUDIO     — actor placement, building inspector, library
└── BROADCAST  — postMessage bridge to PLAY Broadcast HUD
```

## Active Build / Active Work

Last completed: **0628D** (OrbitalFrontAndCenterBroadcastSurface — 2026-06-28). Orbital Earth is now broadcast-quality: real satellite imagery, no tint/fog/ring, no Studio chrome, full diagnostic suite.

No active build in progress.

## Current Blocker

None. Orbital Earth broadcast surface clean. tsc clean.

## Current Product Model

```text
ORBITAL EARTH (Mapbox-first, satellite globe):
  Style:   satellite-v9 on entry, WOS style restored on exit
  Entry:   traversalControlDeck → WosModeTransitionController → OrbitalMapContext.capture
           → OrbitalModeController.enterFromMapContext(ctx, "earth")
             → _injectOrbitalCSS() (all broadcast CSS)
             → OrbitalEarthMode.enter()
               → map.setStyle(satellite-v9) → style.load callback:
                 → setFog(null), setProjection('globe'), applyCleanEarthBaseline()
                 → setCameraPreset('readable_orbit')
  Return:  transitionToMap → restoreMapCameraState → OrbitalEarthMode.exit()
           → map.setStyle(savedStyle) → restoreMapVisualState → selectTransport('flight')
  Globe:   real satellite imagery (blue ocean, brown land, ice caps)
  Default ON:  Mapbox globe, HUD, transport deck at 55% opacity
  Default OFF: fog, atmosphere overlay, rim gradient, stars, scan rings, haze, vignette
               left rail, transport bar, Mapbox attribution, #atmosphere-composite tint
  Camera:  readable_orbit (zoom 1.0, pitch 0, bearing 0)
  Guards:  entry setup fail → abort + revert UI to flight
           UI/runtime desync → post-entry isActive() check
  Legacy quarantine: portal_orb, deep_space_listen, minimal_dark_sphere, three_fake_sphere — manual-only
  CSS scope: body.wos-orbital-active:not(.wos-orbital-earth-active) — legacy dimming off in Earth mode

THREE SKY (Atmosphere):
  wall/threeSkyLayer.js — Mapbox CustomLayerInterface, renderingMode: '2d'
  10-phase SKY_PARAMS table; MIN_LUM luminance floor; removed by setStyle on Orbital entry
  postMessage bridge → PLAY shows ATM THREE SKY
  cloudAtmosphereRenderer.js preserved, runs in parallel on normal map view
```

## What Changed in This Rollup (2026-06-28)

**Globe visibility + broadcast surface — 6 builds (0628B–0628D):**
- **0628B**: `applyCleanEarthBaseline()` in `enter()`; atm bridge timing fix (350ms sooner); `getGlobeVisibilityReport()`
- **0628B-HOTFIX-02**: satellite-v9 style swap — real Earth imagery replaces dark WOS style during Orbital; saved/restored on exit; projection/camera in `style.load` callback
- **0628B-HOTFIX-03**: `setFog(null)` clears Mapbox brown bowl ring; `orbitalAtmosphereOpacity:0`, `orbitalRimOpacity:0`; 500ms deferred overlay timer removed
- **0628C**: `#atmosphere-composite` suppressed via `body.wos-orbital-earth-active #atmosphere-composite { display:none }` — removes ~35% dark navy/black tint covering satellite globe; `globalTint` block in visibility report
- **0628C-FOLLOWUP**: entry setup try/catch guard; transport deck reverts to flight on entry failure or silent `_active=false`; `getGlobeVisibilityReport()` returns `orbital-earth-mode-not-active` blocker when not active
- **0628D**: `.transport-bar` suppressed during Orbital; `_injectOrbitalCSS()` extracted and called from `enterFromMapContext()` (not only from `_buildScene()`); `getBroadcastSurfaceReport()`

## What Is Working

- **Orbital Earth**: Real satellite globe (blue ocean, land, ice), no WOS tint, no fog ring, no authoring chrome
- Atm bridge clears by 1350ms; globe visible ~350ms sooner than before 0628B
- All Studio chrome hidden during Orbital: `#left-rail`, `.transport-bar`, `.mapboxgl-ctrl-*`, `#atmosphere-composite`
- UI/runtime always in sync: failure paths revert transport deck to flight automatically
- Full round trip Map → Orbital → Map clean; all styles restored on exit
- Complete diagnostic suite (10 methods — see Source Index)
- Three Sky active on normal map view (separate; removed by setStyle on Orbital entry)
- postMessage bridge → PLAY Broadcast shows `ATM THREE SKY`
- Camera POV EXT / DRIVER / PASS controls working
- tsc clean

## What Is Not Working / Deferred

- Live time-of-day phase sync for Three Sky (not confirmed wired)
- Sky-to-cloud compositor integration (sky and clouds run as separate renderers)
- Studio building texture proof: real-browser verification still pending (from 0620A)
- Orbital route arc display
- Stars / scan rings / audio pulse (opt-in only, not shipped)

## Next Action

Not specified. Orbital Earth broadcast quality confirmed. Candidates:
1. Live broadcast session / OBS proof pass
2. Orbital route arc
3. Next WALL area (Sky compositor, Studio actor placement, Actors build)

## Continue From Here

WALL runtime: `wall/` directory.
Orbital Earth: `wall/systems/orbital/OrbitalEarthMode.js`, `OrbitalModeController.js`, `WosModeTransitionController.js`.
Three Sky: `wall/threeSkyLayer.js`.
PLAY app: `play/flow-curve-builder/` (Vite + React + TypeScript, port 5173).
Last stable state: **0628D** — Orbital Earth satellite globe, broadcast-safe surface, full diagnostic suite.
