---
date_generated: 2026-06-30
project: WALL
report_type: continuity_rollup
coverage_start: 2026-06-28
coverage_end: 2026-06-30
---

# WALL Continuity Rollup — 2026-06-28

## Summary

Six builds shipped on 2026-06-28, completing the Orbital Earth globe visibility and broadcast surface work (0628B–0628D). The Orbital Earth globe now renders as real satellite imagery (satellite-v9 style swap on entry, WOS style restored on exit), free of all WOS tint layers (atmosphere composite, fog, rim overlay), and all Studio authoring chrome is suppressed from the broadcast frame. Entry desync failures are guarded and self-reverting. A complete broadcast surface diagnostic is available. This rollup continues from the 2026-06-27 chain (0627–0628A).

---

## Completion Reports Covered

| Build | Name | Date | File |
|---|---|---|---|
| 0628B | OrbitalEarthGlobeVisibilityAndMapTransition | 2026-06-28 | `WALL/REPORTS/2026-06-28_WALL_0628B_OrbitalEarthGlobeVisibilityAndMapTransition_COMPLETION_REPORT.md` |
| 0628B-HOTFIX-02 | OrbitalGlobeStyleSwap | 2026-06-28 | `WALL/REPORTS/2026-06-28_WALL_0628B-HOTFIX-02_OrbitalGlobeStyleSwap_COMPLETION_REPORT.md` |
| 0628B-HOTFIX-03 | OrbitalBowlRingRemoval | 2026-06-28 | `WALL/REPORTS/2026-06-28_WALL_0628B-HOTFIX-03_OrbitalBowlRingRemoval_COMPLETION_REPORT.md` |
| 0628C | GlobalMapTintRemovalAndRawGlobePass | 2026-06-28 | `WALL/REPORTS/2026-06-28_WALL_0628C_GlobalMapTintRemovalAndRawGlobePass_COMPLETION_REPORT.md` |
| 0628C-FOLLOWUP | OrbitalUIRuntimeDesync | 2026-06-28 | `WALL/REPORTS/2026-06-28_WALL_0628C-FOLLOWUP_OrbitalUIRuntimeDesync_COMPLETION_REPORT.md` |
| 0628D | OrbitalFrontAndCenterBroadcastSurface | 2026-06-28 | `WALL/REPORTS/2026-06-28_WALL_0628D_OrbitalFrontAndCenterBroadcastSurface_COMPLETION_REPORT.md` |

---

## Major Changes

### 1. Globe Visibility + Transition Timing (0628B)

Identified three failure causes for a dim/invisible globe:
1. `applyCleanEarthBaseline()` was not called in `OrbitalEarthMode.enter()` — stuck transition filters from `_setMapDim()` were not cleared at orbital entry
2. `wos-atm-bridge` lingered at `opacity: 0.85` for 800ms post-entry — covering the globe during the first-impression window
3. No `getGlobeVisibilityReport()` diagnostic

**Fixes:**
- `applyCleanEarthBaseline()` now called in `enter()` immediately after `_active = true`
- Atm bridge fade starts at `+150ms` after entry (was `+400ms`); 300ms duration (was 400ms); globe fully clear by 1350ms (was 1700ms)
- `getGlobeVisibilityReport()` added to `SBE.OrbitalEarthMode`

### 2. Satellite Style Swap (0628B-HOTFIX-02)

Root cause: WOS dark styles (harbor night, dark-v11) render as a dim black/cyan bowl in globe projection — not Planet Earth. Fix: Orbital entry swaps to `mapbox://styles/mapbox/satellite-v9` (real satellite imagery). WOS style saved and restored on exit.

**Architecture:**
```
OrbitalEarthMode.enter():
  → _savedStyle = map.getStyle()
  → map.setStyle('satellite-v9')   (async)
  → map.once('style.load', _onOrbitalStyleReady)
    → map.setFog(null)
    → _switchToGlobe()
    → applyCleanEarthBaseline()
    → setCameraPreset('readable_orbit')

OrbitalEarthMode.exit():
  → map.setStyle(this._savedStyle)   (restores full WOS style JSON)
```

Projection + camera applied in `style.load` callback because `setStyle()` resets projection state. `getGlobeVisibilityReport()` updated with `styleSwap` block.

### 3. Bowl Ring Removal (0628B-HOTFIX-03)

Three ring sources identified and removed:
- **Mapbox native fog** — `satellite-v9` renders a brownish limb fog in globe projection: fixed via `map.setFog(null)` in `_onOrbitalStyleReady()`
- **`#orb-atmosphere` CSS overlay** — `orbitalAtmosphereOpacity: 0.18` created a visible radial ring: changed to `0` in `_CLEAN_EARTH_TOKENS`
- **`orbitalRimOpacity: 0.22`** — rim gradient created a bowl depression on satellite: changed to `0`
- **500ms deferred overlay init timer** — removed; overlays now initialize to `'0'` immediately; `applyCleanEarthBaseline()` in `_onOrbitalStyleReady` is the single authority

### 4. AtmosphereComposite Global Tint Removal (0628C)

Root cause: `#atmosphere-composite` canvas (z-index: 1) draws a night tint (`rgba(10,12,30,0.16)` = 16% dark navy) + dark veil (~19% black) above the Mapbox canvas. Combined ~35% coverage. This canvas is NOT removed by `map.setStyle()` — it persisted over the satellite globe.

**Fix:** `body.wos-orbital-earth-active #atmosphere-composite { display: none; }` added to `#orbital-mode-css` in `OrbitalModeController`. CSS class removal on exit restores it automatically. `atmosphereComposite.js` and `worldAtmosphere.js` not modified.

`getGlobeVisibilityReport()` updated with `globalTint` diagnostic block and `atmosphere-composite-not-suppressed` blocker.

**Visual stack after all fixes:**
```
z:0  Mapbox satellite globe — real Earth imagery, no filter
z:1  #atmosphere-composite — display: none (suppressed)
z:200 orbital-webgl-canvas — transparent
z:900 #wos-nav — 55% opacity, transport rail only
```

### 5. UI/Runtime Desync Fix (0628C-FOLLOWUP)

Problem: `getGlobeVisibilityReport()` returned `orbitalEarthActive:false, projection:null` while UI showed Orbital selected. Three root causes:
1. `OrbitalEarthMode.enter()` setup could throw before `_active = true` — entry aborted but UI stayed on Orbital
2. `transitionToOrbital()` catch block didn't revert transport deck
3. `getGlobeVisibilityReport()` returned misleading `passed:false` when called before entry was complete (0–900ms window)

**Fixes:**
- `enter()` setup wrapped in try/catch; on throw: `_active` stays false, class not added, transition controller detects failure
- `transitionToOrbital()` now reverts transport deck to `flight` on both throw and silent `_active=false` failure
- `getGlobeVisibilityReport()` returns early with `blockers: ['orbital-earth-mode-not-active']` when called while not active

### 6. Broadcast Surface — Transport Bar + CSS Injection Fix (0628D)

**Problem:** `.transport-bar` (Studio canvas transport: BPM, bar count, quantize, Play/Record/Stop) was visible during Orbital Earth because the CSS injection that hides authoring chrome (`_injectOrbitalCSS()`) was only called inside `_buildScene()`, which is never called for the earth submode.

**Fixes:**
- `_injectOrbitalCSS()` extracted as standalone idempotent method
- Called from `enterFromMapContext()` before the submode branch — guarantees injection for all submodes including earth
- Added rule: `body.wos-orbital-earth-active .transport-bar { display: none !important; }`
- `getBroadcastSurfaceReport()` added to `SBE.OrbitalEarthMode` — audits all control surfaces vs an approved list; returns `leakedControls[]` and `blockers[]`

---

## Orbital Earth State Machine — Full Entry (as of 0628D)

```
User clicks Orbital button
→ TraversalControlDeck sets transport = 'orbital'
→ WosModeTransitionController.transitionToOrbital()
  → transition overlay ramps, atm bridge up at 500ms
  → t=900ms: OrbitalModeController.enterFromMapContext(ctx, 'earth')
    → _injectOrbitalCSS()  ← ALL orbital CSS injected (atm-composite, left-rail, mapbox-ctrl, transport-bar)
    → OrbitalEarthMode.enter():
        try: _injectCSS(), _buildOverlays(), _applyTokens(), _buildAudioOverlay()
        catch: abort, log, return (transition controller reverts UI)
      → document.body.classList.add('wos-orbital-earth-active')
      → this._active = true
      → _savedStyle = map.getStyle()
      → map.setStyle('satellite-v9')
      → map.once('style.load', _onOrbitalStyleReady)
        → map.setFog(null)
        → _switchToGlobe()
        → applyCleanEarthBaseline()
        → setCameraPreset('readable_orbit')
  → t=1050ms: atm bridge fade starts
  → t=1350ms: atm bridge clear
  → post-entry: isActive() check — if false, revert UI + log

VISUAL RESULT:
  Satellite globe (real Earth imagery)
  Fog cleared
  No bowl ring
  No atmosphere composite tint
  No left rail, no transport bar, no Mapbox attribution
  orbit camera zoom=1.0, full-viewport globe
```

---

## Diagnostic Suite (complete as of 0628D)

| Method | Owner | Reports |
|---|---|---|
| `getVisibilityStackReport()` | `SBE.OrbitalEarthMode` | Full DOM/style/camera/audio suspects |
| `getCleanEarthReport()` | `SBE.OrbitalEarthMode` | Token state, baseline passed |
| `getGlobeFitReport()` | `SBE.OrbitalEarthMode` | Globe size, crop, camera restore failure |
| `getGlobeVisibilityReport()` | `SBE.OrbitalEarthMode` | Globe visual stack, style swap, globalTint, `orbital-earth-mode-not-active` guard |
| `getFxReport()` | `SBE.OrbitalEarthMode` | FX layer state, audio guard |
| `getOwnershipReport()` | `SBE.OrbitalEarthMode` | Ownership map |
| `getBroadcastCompositionReport()` | `SBE.OrbitalEarthMode` | Zone model, overlap checks |
| `getBroadcastSurfaceReport()` | `SBE.OrbitalEarthMode` | Approved vs leaked control surfaces |
| `getLegacyPathReport()` | `SBE.OrbitalModeController` | Quarantine state, blocked attempts |
| `getTransitionCleanupReport()` | `SBE.WosModeTransitionController` | Phase-stamped round-trip state |
| `getGateReport()` | `SBE.MoonModeController` | Moon authorization, class cleanup |

---

## Files Edited (This Rollup)

| File | Changed By |
|---|---|
| `wall/systems/orbital/OrbitalEarthMode.js` | 0628B (baseline in enter, getGlobeVisibilityReport), HOTFIX-02 (style swap), HOTFIX-03 (token zeroing), 0628C (globalTint block), 0628C-FU (entry guard, report guard), 0628D (getBroadcastSurfaceReport) |
| `wall/systems/runtime/WosModeTransitionController.js` | 0628B (atm bridge timing), 0628C-FU (failure revert, post-entry isActive check) |
| `wall/systems/orbital/OrbitalModeController.js` | 0628C (atmosphere-composite CSS), 0628D (extract _injectOrbitalCSS, transport-bar rule, enterFromMapContext injection) |

---

## Builds Completed

All 6 builds: **PASS**.

## Builds Still Active

None. 0628D is the last completed build for this chain.

---

## Decisions Made

- Orbital Earth uses `satellite-v9` (real satellite imagery) as its Mapbox style. WOS dark styles cannot read as Planet Earth in globe projection — brightening filters do not fix a dark source texture.
- Projection and camera must be applied in `style.load` callback — `setStyle()` is async and resets projection.
- `atmosphereComposite.js` is suppressed during Orbital via CSS class, not modified directly.
- `map.setFog(null)` must run before `setProjection('globe')` in `_onOrbitalStyleReady`.
- `orbitalAtmosphereOpacity` and `orbitalRimOpacity` must be `0` for satellite Orbital — the satellite globe has its own natural limb.
- `_injectOrbitalCSS()` must run from `enterFromMapContext()`, not from `_buildScene()` — earth submode bypasses `_buildScene()`.
- `getGlobeVisibilityReport()` is non-authoritative if called before `_active = true` — it returns `orbital-earth-mode-not-active` blocker.

## Do Not Reopen

- Do not set `_ORBITAL_STYLE` to any dark WOS style. Dark styles cannot read as Planet Earth.
- Do not remove `map.setFog(null)` from `_onOrbitalStyleReady()`. It is the primary fix for the bowl ring.
- Do not restore `orbitalAtmosphereOpacity > 0` for satellite Orbital. CSS rim overlays damage the planet read.
- Do not re-enable `#atmosphere-composite` during Orbital. Its draw loop is driven by WOS weather state, not Orbital state — re-enabling causes uncontrolled tinting of the globe.
- Projection + camera must remain in the `style.load` callback — not before `setStyle()` fires.
- `_injectOrbitalCSS()` must remain called from `enterFromMapContext()`, not only from `_buildScene()`.
- Do not use `display:none` for `.mapboxgl-ctrl-*` during Orbital — use `opacity:0` to avoid triggering Mapbox resize events.

---

## Source Pack Files To Update

- `WOS-share/WALL/CURRENT/` — all 5 files should be updated to reflect 0628D as last build

## Next Recommended Step

Not specified. Orbital Earth globe is now front-and-center broadcast quality. Candidates:
1. Live Orbital Earth session (broadcast proof pass)
2. Route display on Orbital globe
3. Next WALL build area (Studio, Sky compositor, Actors)
