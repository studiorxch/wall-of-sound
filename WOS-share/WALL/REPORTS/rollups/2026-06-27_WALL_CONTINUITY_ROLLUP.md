---
date_generated: 2026-06-28
project: WALL
report_type: continuity_rollup
coverage_start: 2026-06-27
coverage_end: 2026-06-28
chain_complete: true
---

# WALL Continuity Rollup — 2026-06-27

## Summary

Ten builds shipped across 2026-06-27–28, completing the full Orbital Earth Recovery chain (0627 → 0627H) plus three post-recovery passes: Moon gate revalidation (0627I), broadcast composition audit (0627J), and PLAY now-playing A3 placement (0628A). Orbital Earth now has a guaranteed clean entry baseline, canonical camera presets, all legacy visual submodes quarantined, a clean round-trip transition, controlled FX, Moon gate enforcement via `OrbitalEarthMode.isActive()`, broadcast-safe chrome (left rail + Mapbox attribution hidden), and PLAY track-title overlay repositioned to B3 (right of Earth center). A full diagnostic suite covers every layer. The prior Sky chain (0625E–F) remains intact.

**Chain complete.** The full 0627–0628A post-recovery chain is done.

---

## Completion Reports Covered

| Build | Name | Date | File |
|---|---|---|---|
| 0627 | OrbitalVisibilityStackAudit | 2026-06-27 | `WALL/REPORTS/2026-06-27_WALL_0627_OrbitalVisibilityStackAudit_COMPLETION_REPORT.md` |
| 0627C | OrbitalCleanEarthBaseline | 2026-06-27 | `WALL/REPORTS/2026-06-27_WALL_0627C_OrbitalCleanEarthBaseline_COMPLETION_REPORT.md` |
| 0627D | OrbitalCameraFramingCorrection | 2026-06-27 | `WALL/REPORTS/2026-06-27_WALL_0627D_OrbitalCameraFramingCorrection_COMPLETION_REPORT.md` |
| 0627E | OrbitalRuntimeOwnershipCleanup | 2026-06-27 | `WALL/REPORTS/2026-06-27_WALL_0627E_OrbitalRuntimeOwnershipCleanup_COMPLETION_REPORT.md` |
| 0627F | OrbitalLegacyPathQuarantine | 2026-06-27 | `WALL/REPORTS/2026-06-27_WALL_0627F_OrbitalLegacyPathQuarantine_COMPLETION_REPORT.md` |
| 0627G | OrbitalMapTransitionCleanup | 2026-06-27 | `WALL/REPORTS/2026-06-27_WALL_0627G_OrbitalMapTransitionCleanup_COMPLETION_REPORT.md` |
| 0627H | OrbitalFxReintroductionPass | 2026-06-28 | `WALL/REPORTS/2026-06-28_WALL_0627H_OrbitalFxReintroductionPass_COMPLETION_REPORT.md` |
| 0627I | MoonGateRevalidationAfterOrbitalCleanup | 2026-06-28 | `WALL/REPORTS/2026-06-28_WALL_0627I_MoonGateRevalidationAfterOrbitalCleanup_COMPLETION_REPORT.md` |
| 0627J | OrbitalBroadcastCompositionPass | 2026-06-28 | `WALL/REPORTS/2026-06-28_WALL_0627J_OrbitalBroadcastCompositionPass_COMPLETION_REPORT.md` |
| 0628A | BroadcastNowPlayingA3Placement (PLAY) | 2026-06-28 | `WALL/REPORTS/2026-06-28_WALL_0628A_BroadcastNowPlayingA3Placement_COMPLETION_REPORT.md` |

---

## Major Changes

### 1. Visibility Stack Diagnostic (0627)

`SBE.OrbitalEarthMode.getVisibilityStackReport()` — audits every layer that could cause Orbital Earth dimming: body classes, map canvas/container filter+opacity, transition overlay, orbital overlays, style tokens, audio mode, camera. Returns `suspects[]` with severity and `mostLikelyDimmingSource`. Establishes the diagnostic-first principle: no visual guessing without running this first.

### 2. Clean Earth Baseline (0627C)

`applyCleanEarthBaseline()` and `_CLEAN_EARTH_TOKENS` define the canonical default Orbital Earth visual state. Called in `OrbitalEarthMode.enter()` on every entry.

**Default ON:** Mapbox globe, linework, soft rim, minimal origin marker, HUD
**Default OFF:** stars (`starOpacity: 0`), scan rings, haze, vignette, fake sphere, portal orb, Moon

`getCleanEarthReport()` returns token state and baseline passed flag.

### 3. Camera Presets + Globe-Fit (0627D)

Four explicit camera presets:

| Preset | zoom | Access |
|---|---|---|
| `readable_orbit` | 1.0 | Default entry |
| `broadcast_orbit` | 0.8 | Explicit request |
| `deep_orbit` | 0.45 | Explicit request |
| `cinematic_crop` | 1.35 | Manual-only |

Retry step corrected from 0.25 → 0.10. `getGlobeFitReport()` returns `globeTooSmall`, `globePossiblyCropped`, `CAMERA RESTORE FAILED` log on retry exhaustion.

### 4. Ownership Map (0627E)

`OrbitalEarthMode.js` is the single owner of: globe, camera presets, `applyCleanEarthBaseline()`, `_CLEAN_EARTH_TOKENS`, and all Orbital Earth diagnostics. `getOwnershipReport()` formalizes the map.

CSS isolation: `body.wos-orbital-active:not(.wos-orbital-earth-active)` — legacy dimming selectors scoped away from Earth mode.

### 5. Legacy Path Quarantine (0627F)

`_KNOWN_LEGACY_SUBMODES` = `[portal_orb, deep_space_listen, minimal_dark_sphere, three_fake_sphere]`. Dispatch guard: `"earth"` submode does not call `_buildScene()` or `_applyPreset()`. `LEGACY PATH BLOCKED` log on attempted default access. `LEGACY VISUALIZER ENTERED` log on manual dispatch. `getLegacyPathReport()` added to `SBE.OrbitalModeController`.

### 6. Transition Cleanup (0627G)

Full Map → Orbital Earth → Map round trip with no residue:
- `wos-transition-active`, `wos-map-dimmed` cleared in both `WosModeTransitionController` and inline fallback
- `.mapboxgl-canvas-container` filter + opacity explicitly cleared in `restoreMapVisualState()`
- Camera, transport, body classes all restored
- Repeated round trips: no compounding residue

`getTransitionCleanupReport()` added to `SBE.WosModeTransitionController` with phase-stamped report.

---

## Canonical Orbital Earth Routes (as of 0627G)

**Entry:**
```text
traversalControlDeck orbital button
→ WosModeTransitionController.transitionToOrbital()
→ OrbitalMapContext.capture()
→ OrbitalModeController.enterFromMapContext(ctx, "earth")
→ OrbitalEarthMode.enter()
→ OrbitalEarthMode.applyCleanEarthBaseline()
→ OrbitalEarthMode.setCameraPreset("readable_orbit")
```

**Return:**
```text
transport button deselects orbital
→ WosModeTransitionController.transitionToMap()
→ OrbitalEarthMode.restoreMapCameraState()
→ OrbitalModeController.exit()
→ OrbitalEarthMode.exit()
→ WosModeTransitionController.restoreMapVisualState()
→ traversalControlDeck.selectTransport("flight")
```

---

## Diagnostic Suite Available (as of 0627G)

| Method | Owner | Reports |
|---|---|---|
| `getVisibilityStackReport()` | `SBE.OrbitalEarthMode` | Full DOM/style/camera/audio suspects |
| `getCleanEarthReport()` | `SBE.OrbitalEarthMode` | Token state, baseline passed |
| `getGlobeFitReport()` | `SBE.OrbitalEarthMode` | Globe size, crop, camera restore failure |
| `getOwnershipReport()` | `SBE.OrbitalEarthMode` | Ownership map |
| `getLegacyPathReport()` | `SBE.OrbitalModeController` | Quarantine state, last blocked attempt |
| `getTransitionCleanupReport()` | `SBE.WosModeTransitionController` | Phase-stamped round-trip state |

---

## Builds Completed

All 10 builds: **PASS**.

## Builds Still Active

None. Full 0627–0628A chain is closed.

---

## Decisions Made

See [WOS_DECISIONS.md](../../CURRENT/WOS_DECISIONS.md) for full list. Key:

- Orbital Earth is Mapbox-first. No `_buildScene()` or `_applyPreset()` in the earth entry path.
- `applyCleanEarthBaseline()` is the contract — FX reintroduction (0627H) must only add FX on top of it.
- Camera retry step is 0.10 (not 0.25).
- CSS dimming on `body.wos-orbital-active` must always use `:not(.wos-orbital-earth-active)` scope.
- Transition cleanup requires both coordinator and inline fallback — one site is not enough.

---

## Do Not Reopen Updates

See [WOS_DO_NOT_REOPEN.md](../../CURRENT/WOS_DO_NOT_REOPEN.md) for full list. Key additions:

- Do not add stars/haze/vignette/scan rings to the default baseline — that is 0627H work.
- Do not call `_buildScene()` or `_applyPreset()` in the earth submode dispatch.
- Do not allow legacy submodes to reach default Orbital entry.
- Do not remove `:not(.wos-orbital-earth-active)` CSS scope guard.
- Do not remove `wos-transition-active`/`wos-map-dimmed` cleanup from either cleanup site.

---

## Source Pack Files Updated

- `WOS-share/WALL/CURRENT/WOS_CURRENT.md` — last build: 0627G, Orbital Earth state, 0627H as next
- `WOS-share/WALL/CURRENT/WOS_BUILD_STATUS.md` — full 0627 chain logged
- `WOS-share/WALL/CURRENT/WOS_DECISIONS.md` — 6 new Orbital decisions
- `WOS-share/WALL/CURRENT/WOS_DO_NOT_REOPEN.md` — 9 new closed issues
- `WOS-share/WALL/CURRENT/WOS_SOURCE_INDEX.md` — 6 new completion reports, Orbital file table

---

## Post-Recovery Chain (0627I – 0628A)

### 0627I — MoonGateRevalidationAfterOrbitalCleanup (2026-06-28)

Moon gate enforced via `OrbitalEarthMode.isActive()`. `_MOON_CLASSES` constant added for safety-net cleanup in `exit()` and `returnToOrbitalEarth()`. Public `enter()` alias added. `getGateReport()` diagnostic added. All legacy/map/presentation Moon entry paths blocked.

See: `WALL/REPORTS/2026-06-28_WALL_0627I_MoonGateRevalidationAfterOrbitalCleanup_COMPLETION_REPORT.md`

### 0627J — OrbitalBroadcastCompositionPass (2026-06-28)

Authoring chrome (`#left-rail`) and Mapbox attribution/control chrome hidden during `wos-orbital-earth-active` via CSS in `orbital-mode-css` block. `getBroadcastCompositionReport()` added to `SBE.OrbitalEarthMode`. Song/title block confirmed PLAY-side only — not in WALL.

See: `WALL/REPORTS/2026-06-28_WALL_0627J_OrbitalBroadcastCompositionPass_COMPLETION_REPORT.md`

### 0628A — BroadcastNowPlayingA3Placement — PLAY (2026-06-28)

`TypedTrackIndexOverlay` `.bti-overlay` repositioned from left (B1) to right-aligned (B3) in PLAY CSS. `BroadcastMicrographicsGrid` (CHANNEL/TRACK compact identity) already at A3 in `hud-right-cluster` — no change. `window.PLAY.BroadcastComposition.getNowPlayingA3Report()` registered in `BroadcastHudShell`. `tsc -b` exits 0.

See: `WALL/REPORTS/2026-06-28_WALL_0628A_BroadcastNowPlayingA3Placement_COMPLETION_REPORT.md`

---

## Diagnostic Suite Available (as of 0628A)

| Method | Owner | Reports |
|---|---|---|
| `getVisibilityStackReport()` | `SBE.OrbitalEarthMode` | Full DOM/style/camera/audio suspects |
| `getCleanEarthReport()` | `SBE.OrbitalEarthMode` | Token state, baseline passed |
| `getGlobeFitReport()` | `SBE.OrbitalEarthMode` | Globe size, crop, camera restore failure |
| `getOwnershipReport()` | `SBE.OrbitalEarthMode` | Ownership map |
| `getBroadcastCompositionReport()` | `SBE.OrbitalEarthMode` | Chrome leaks, zone audit |
| `getFxReport()` | `SBE.OrbitalEarthMode` | FX token state |
| `getLegacyPathReport()` | `SBE.OrbitalModeController` | Quarantine state, last blocked attempt |
| `getTransitionCleanupReport()` | `SBE.WosModeTransitionController` | Phase-stamped round-trip state |
| `getGateReport()` | `SBE.MoonModeController` | Moon authorization state, class leaks |
| `getNowPlayingA3Report()` | `window.PLAY.BroadcastComposition` | PLAY-side track title/identity overlay audit |

---

## Next Recommended Step

Full chain closed through 0628A. Next work at discretion: incremental FX enablement (steps 3–7 from 0627H spec), live Moon integration testing, or transport/presentation work.
