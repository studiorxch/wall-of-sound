---
date_generated: 2026-06-30
project: WALL
source_pack: source_index
coverage_start: 2026-06-28
coverage_end: 2026-06-30
---

# WALL Source Index

## Completion Reports Used (This Rollup — 0628B–0628D)

| Build | File |
|---|---|
| 0628B | `WOS-share/WALL/REPORTS/2026-06-28_WALL_0628B_OrbitalEarthGlobeVisibilityAndMapTransition_COMPLETION_REPORT.md` |
| 0628B-HOTFIX-02 | `WOS-share/WALL/REPORTS/2026-06-28_WALL_0628B-HOTFIX-02_OrbitalGlobeStyleSwap_COMPLETION_REPORT.md` |
| 0628B-HOTFIX-03 | `WOS-share/WALL/REPORTS/2026-06-28_WALL_0628B-HOTFIX-03_OrbitalBowlRingRemoval_COMPLETION_REPORT.md` |
| 0628C | `WOS-share/WALL/REPORTS/2026-06-28_WALL_0628C_GlobalMapTintRemovalAndRawGlobePass_COMPLETION_REPORT.md` |
| 0628C-FOLLOWUP | `WOS-share/WALL/REPORTS/2026-06-28_WALL_0628C-FOLLOWUP_OrbitalUIRuntimeDesync_COMPLETION_REPORT.md` |
| 0628D | `WOS-share/WALL/REPORTS/2026-06-28_WALL_0628D_OrbitalFrontAndCenterBroadcastSurface_COMPLETION_REPORT.md` |

## Prior Completion Reports (2026-06-27–28 — full Orbital chain)

| Build | File |
|---|---|
| 0628A | `2026-06-28_WALL_0628A_BroadcastNowPlayingA3Placement_COMPLETION_REPORT.md` |
| 0627J | `2026-06-28_WALL_0627J_OrbitalBroadcastCompositionPass_COMPLETION_REPORT.md` |
| 0627I | `2026-06-28_WALL_0627I_MoonGateRevalidationAfterOrbitalCleanup_COMPLETION_REPORT.md` |
| 0627H | `2026-06-28_WALL_0627H_OrbitalFxReintroductionPass_COMPLETION_REPORT.md` |
| 0627G | `2026-06-27_WALL_0627G_OrbitalMapTransitionCleanup_COMPLETION_REPORT.md` |
| 0627F | `2026-06-27_WALL_0627F_OrbitalLegacyPathQuarantine_COMPLETION_REPORT.md` |
| 0627E | `2026-06-27_WALL_0627E_OrbitalRuntimeOwnershipCleanup_COMPLETION_REPORT.md` |
| 0627D | `2026-06-27_WALL_0627D_OrbitalCameraFramingCorrection_COMPLETION_REPORT.md` |
| 0627C | `2026-06-27_WALL_0627C_OrbitalCleanEarthBaseline_COMPLETION_REPORT.md` |
| 0627 | `2026-06-27_WALL_0627_OrbitalVisibilityStackAudit_COMPLETION_REPORT.md` |
| 0625F | `2026-06-25_WALL_0625F_ThreeSkyBrightnessExposureTuningPatch_COMPLETION_REPORT.md` |
| 0625E | `2026-06-25_WALL_0625E_ThreeSkyLayerMapboxCustomLayerPatch_COMPLETION_REPORT.md` |
| 0620A | `2026-06-20_WOS_0620A_BuildingTextureVisibleProofPatch_COMPLETION_REPORT.md` |
| 0619G | `2026-06-20_WOS_0619G_StudioLibraryAndPlacementUXRecoveryPatch_COMPLETION_REPORT.md` |

## Files Changed in This Rollup (0628B–0628D)

| File | Changed By |
|---|---|
| `wall/systems/orbital/OrbitalEarthMode.js` | 0628B, 0628B-HOTFIX-02, 0628B-HOTFIX-03, 0628C, 0628C-FOLLOWUP, 0628D |
| `wall/systems/runtime/WosModeTransitionController.js` | 0628B, 0628C-FOLLOWUP |
| `wall/systems/orbital/OrbitalModeController.js` | 0628C, 0628D |

## Important Current Files

### Orbital Earth

| File | Role |
|---|---|
| `wall/systems/orbital/OrbitalEarthMode.js` | Owner: style swap (satellite-v9), globe projection, camera presets, `applyCleanEarthBaseline()`, `_CLEAN_EARTH_TOKENS`, all Orbital Earth diagnostics (10 methods) |
| `wall/systems/orbital/OrbitalModeController.js` | `_injectOrbitalCSS()` (broadcast CSS), orbital dispatch, `_KNOWN_LEGACY_SUBMODES`, legacy quarantine, `getLegacyPathReport()` |
| `wall/systems/runtime/WosModeTransitionController.js` | Transition timing, atm bridge, cleanup, `getTransitionCleanupReport()` |
| `wall/systems/orbital/OrbitalMapContext.js` | Map context capture for orbital entry |
| `wall/traversalControlDeck.js` | Transport selected state, `selectTransport('flight')` |

### Orbital Diagnostic Suite

| Method | Owner | Call |
|---|---|---|
| `getVisibilityStackReport()` | OrbitalEarthMode | `SBE.OrbitalEarthMode.getVisibilityStackReport()` |
| `getCleanEarthReport()` | OrbitalEarthMode | `SBE.OrbitalEarthMode.getCleanEarthReport()` |
| `getGlobeFitReport()` | OrbitalEarthMode | `SBE.OrbitalEarthMode.getGlobeFitReport()` |
| `getGlobeVisibilityReport()` | OrbitalEarthMode | `SBE.OrbitalEarthMode.getGlobeVisibilityReport()` |
| `getFxReport()` | OrbitalEarthMode | `SBE.OrbitalEarthMode.getFxReport()` |
| `getOwnershipReport()` | OrbitalEarthMode | `SBE.OrbitalEarthMode.getOwnershipReport()` |
| `getBroadcastCompositionReport()` | OrbitalEarthMode | `SBE.OrbitalEarthMode.getBroadcastCompositionReport()` |
| `getBroadcastSurfaceReport()` | OrbitalEarthMode | `SBE.OrbitalEarthMode.getBroadcastSurfaceReport()` |
| `getLegacyPathReport()` | OrbitalModeController | `SBE.OrbitalModeController.getLegacyPathReport()` |
| `getTransitionCleanupReport()` | WosModeTransitionController | `SBE.WosModeTransitionController.getTransitionCleanupReport()` |
| `getGateReport()` | MoonModeController | `SBE.MoonModeController.getGateReport()` |

### Atmosphere / Sky

| File | Role |
|---|---|
| `wall/threeSkyLayer.js` | Mapbox CustomLayerInterface — GLSL sky, SKY_PARAMS 10-phase, MIN_LUM, postMessage bridge (394 lines); auto-removed by setStyle on Orbital entry |
| `wall/cloudAtmosphereRenderer.js` | Cloud renderer — separate from sky, preserved |
| `wall/atmosphereRuntime.js` | `SBE.AtmosphereRuntime` — phase state for sky params |
| `wall/render/atmosphereComposite.js` | Night tint canvas — suppressed during Orbital Earth via CSS; not modified |

### Runtime

| File | Role |
|---|---|
| `wall/index.html` | Entry point; script loader; postMessage listener |
| `wall/wosMapStyleAuthority.js` | Shared Mapbox token (WALL + PLAY) |
| `studio/studioShell.js` | Library section state, Import topbar, placement event |

## Repo Locations

- WALL runtime: `wall/`
- Orbital Earth: `wall/systems/orbital/`
- Studio: `studio/`
- Completion reports: `WOS-share/WALL/REPORTS/`
- CURRENT source pack: `WOS-share/WALL/CURRENT/`
- Rollups: `WOS-share/WALL/REPORTS/rollups/`
