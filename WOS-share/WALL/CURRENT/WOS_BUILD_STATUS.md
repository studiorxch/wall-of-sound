---
date_generated: 2026-06-30
project: WALL
source_pack: build_status
coverage_start: 2026-06-28
coverage_end: 2026-06-30
---

# WALL Build Status

## Active

None. Last completed: **0628D** (2026-06-28). No pending spec.

## Completed in This Rollup (2026-06-28) — Globe Visibility + Broadcast Surface

| Build ID | Name | Status | Key Deliverable |
|---|---|---|---|
| `0628B` | OrbitalEarthGlobeVisibilityAndMapTransition | PASS | `applyCleanEarthBaseline()` in `enter()`; atm bridge 350ms sooner; `getGlobeVisibilityReport()` |
| `0628B-HOTFIX-02` | OrbitalGlobeStyleSwap | PASS | `satellite-v9` style swap on entry; full WOS style restored on exit; projection/camera in `style.load` callback |
| `0628B-HOTFIX-03` | OrbitalBowlRingRemoval | PASS | `setFog(null)` in `_onOrbitalStyleReady`; `orbitalAtmosphereOpacity:0`, `orbitalRimOpacity:0`; 500ms timer removed |
| `0628C` | GlobalMapTintRemovalAndRawGlobePass | PASS | `#atmosphere-composite { display:none }` during Orbital Earth; `globalTint` block in visibility report |
| `0628C-FOLLOWUP` | OrbitalUIRuntimeDesync | PASS | Entry try/catch guard; transport deck reverts to flight on failure; `getGlobeVisibilityReport()` `orbital-earth-mode-not-active` blocker |
| `0628D` | OrbitalFrontAndCenterBroadcastSurface | PASS | `.transport-bar` suppressed; `_injectOrbitalCSS()` from `enterFromMapContext()`; `getBroadcastSurfaceReport()` |

## Previously Completed (2026-06-27) — Orbital Earth Recovery + FX + Moon + Broadcast + PLAY

| Build ID | Name | Status | Notes |
|---|---|---|---|
| `0627` | OrbitalVisibilityStackAudit | PASS | `getVisibilityStackReport()` |
| `0627C` | OrbitalCleanEarthBaseline | PASS | `applyCleanEarthBaseline()`, `_CLEAN_EARTH_TOKENS`, stars=0 |
| `0627D` | OrbitalCameraFramingCorrection | PASS | readable_orbit 1.0, broadcast_orbit 0.8, deep_orbit 0.45; retry 0.10 |
| `0627E` | OrbitalRuntimeOwnershipCleanup | PASS | Ownership map; `:not(.wos-orbital-earth-active)` CSS scope |
| `0627F` | OrbitalLegacyPathQuarantine | PASS | `_KNOWN_LEGACY_SUBMODES`; LEGACY PATH BLOCKED |
| `0627G` | OrbitalMapTransitionCleanup | PASS | Round trip clean; `getTransitionCleanupReport()` |
| `0627H` | OrbitalFxReintroductionPass | PASS | CSS fallback bugs fixed; audio shimmer guard; `getFxReport()` |
| `0627I` | MoonGateRevalidationAfterOrbitalCleanup | PASS | `_MOON_CLASSES` loop; `enter()` alias; `getGateReport()` |
| `0627J` | OrbitalBroadcastCompositionPass | PASS | `#left-rail` hidden; Mapbox ctrl hidden; `getBroadcastCompositionReport()` |
| `0628A` | BroadcastNowPlayingA3Placement (PLAY) | PASS | `bti-overlay` moved B1→B3; `direction:rtl`; `getNowPlayingA3Report()` |

## Previously Completed (Three Sky — 2026-06-25)

| Build ID | Status | Notes |
|---|---|---|
| `0625E_WALL_ThreeSkyLayerMapboxCustomLayerPatch` | PASS | `wall/threeSkyLayer.js` 394 lines; SKY_PARAMS 10-phase; postMessage bridge |
| `0625F_WALL_ThreeSkyBrightnessExposureTuningPatch` | PASS | Exposure +30–60%; MIN_LUM floor |

## Previously Completed (Studio Recovery — 2026-06-19 to 2026-06-20)

| Build ID | Status |
|---|---|
| `0620A_WOS_BuildingTextureVisibleProofPatch` | PASS |
| `0619G_WOS_StudioLibraryAndPlacementUXRecoveryPatch_v1.0.1` | PASS |
| `0619F_WOS_MapboxAccessRecoveryPatch` | PASS |
| `0619E_WOS_MapAuthoringSurfaceRecoveryPatch` | PASS |

## Blocked / Deferred

| Item | Reason |
|---|---|
| Live time-of-day phase sync | Phase driven by atmosphere model; real clock sync not confirmed |
| Sky/cloud compositor | Three Sky and cloudAtmosphereRenderer.js run separately |
| Studio building texture proof | Requires real browser with WebGL + Mapbox tiles |
| Stars / scan rings / audio pulse | Opt-in only; defaults enforced at 0 |
| Orbital route arc | No route context in Orbital yet |
