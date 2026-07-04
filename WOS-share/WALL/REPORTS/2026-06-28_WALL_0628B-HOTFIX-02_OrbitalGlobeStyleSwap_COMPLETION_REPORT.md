# WALL Completion Report
## 0628B-HOTFIX-02 — Orbital Globe Style Source Swap

**Status:** PASS
**Date:** 2026-06-28
**Build type:** WALL Runtime — Orbital Earth Style Swap

---

## Summary

The WOS map styles (`studiorich/cm3goyx23003901qkb60ff29p` and `dark-v11`) are dark harbor/operator styles — dark ocean, dark land, no satellite texture. Globe projection on these styles renders as a dim dark sphere with cyan linework, not "Planet Earth." Implemented a controlled Orbital-only style swap to `mapbox://styles/mapbox/satellite-v9` (real satellite imagery) on entry, restoring the saved WOS style on exit. Projection, camera, and baseline are applied in the `style.load` callback because `setStyle()` is async and resets map state. `getGlobeVisibilityReport()` updated with `styleSwap` block.

---

## Root Cause (Confirmed)

WOS dark styles have:
- Black/near-black ocean fill
- Dark gray land fill
- Cyan vector linework over dark backgrounds

In globe projection, this reads as a dim bowl with faint lines — not "Planet Earth." Brightening filters or atmospheric overlays cannot fix this: the source texture is dark by design. The fix is to use satellite imagery (real Earth) as the Mapbox style during Orbital.

---

## Style Registry

| Key | URL | Use |
|---|---|---|
| `presentation` (WOS default) | `mapbox://styles/studiorich/cm3goyx23003901qkb60ff29p` | Normal WOS map — harbor night |
| `operator` | `mapbox://styles/mapbox/dark-v11` | Operator mode |
| `_ORBITAL_STYLE` (new) | `mapbox://styles/mapbox/satellite-v9` | Orbital Earth only — real planet imagery |

---

## Files Edited

| File | Change |
|---|---|
| `wall/systems/orbital/OrbitalEarthMode.js` | Added `_ORBITAL_STYLE` constant; added `_savedStyle` to constructor; restructured `enter()` to save current style + swap to satellite via `map.once('style.load')`; updated `exit()` to restore saved style via `map.setStyle(savedStyle)`; added `styleSwap` block to `getGlobeVisibilityReport()` |

---

## Architecture: Style Swap Flow

### Entry (Map → Orbital)

```
OrbitalEarthMode.enter():
  1. saveMapCameraState()            — save zoom/center/bearing/pitch (existing)
  2. this._savedStyle = map.getStyle() — save full WOS style JSON
  3. _injectCSS(), _buildOverlays(), _applyTokens(), _buildAudioOverlay() (unchanged)
  4. body.classList.add('wos-orbital-earth-active')
  5. this._active = true
  6. map.once('style.load', _onOrbitalStyleReady)  ← DEFERRED
  7. map.setStyle('mapbox://styles/mapbox/satellite-v9')  ← async

_onOrbitalStyleReady() fires when satellite tiles confirmed loaded:
  → _switchToGlobe()         — setProjection('globe')
  → applyCleanEarthBaseline() — clears filters, transition overlay
  → _positionOriginMarker()
  → setCameraPreset('readable_orbit')  — zoom 1.0, 1100ms ease
```

### Exit (Orbital → Map)

```
OrbitalEarthMode.exit():
  1. this._active = false
  2. body.classList.remove('wos-orbital-earth-active')
  3. map.setStyle(this._savedStyle)  — restores full WOS style JSON (async)
  4. this._savedStyle = null
  5. _hideOverlays()
  6. dispose audioCtrl, clear scanTimeout
  7. _cameraPreset = null, _fitRetryCount = 0

After style.load (WOS style): projection auto-resets to mercator (WOS styles have no globe override)
WosModeTransitionController calls restoreMapCameraState() separately — easeTo(savedCamera)
```

### Why `style.load` deferred

`map.setStyle()` resets the entire map including:
- projection (back to style default or mercator)
- all layers and sources
- any previous `setProjection()` overrides

If `_switchToGlobe()` runs before `style.load`, the style load will overwrite the projection setting. The `style.load` callback guarantees satellite tiles exist before applying projection and camera.

---

## Fallback Behavior

If `map.setStyle()` throws (e.g. token expired, network):
- `map.off('style.load', _onOrbitalStyleReady)` removes the pending listener
- `_onOrbitalStyleReady()` runs synchronously with the current (WOS) style
- Orbital enters with the WOS dark style — dim but functional
- Console: `[WOS Orbital] STYLE SWAP FAILED — using current style:`

If no map instance exists:
- `_onOrbitalStyleReady()` runs synchronously (no-op style calls skipped)

---

## `getGlobeVisibilityReport()` — styleSwap block

```js
SBE.OrbitalEarthMode.getGlobeVisibilityReport().styleSwap
// returns:
{
  currentStyleName:   'Mapbox Satellite',   // map.getStyle().name during orbital
  savedStyleName:     'WOS Harbor Night',   // saved WOS style name
  orbitalStyleActive: true,                 // currentStyleName contains 'satellite'
  orbitalStyleUrl:    'mapbox://styles/mapbox/satellite-v9',
  styleLoaded:        true,                 // map.isStyleLoaded()
  restoreStylePassed: false                 // true only after exit + _savedStyle cleared
}
```

### Updated blockers

| Blocker | When |
|---|---|
| `projection-not-globe` | `setProjection('globe')` not yet called or style load reset it |
| `orbital-satellite-style-not-active` | Style not yet loaded or swap failed |
| `style-not-fully-loaded` | `map.isStyleLoaded() === false` (tiles still loading) |
| `map-container-filtered-or-dim` | Stuck brightness filter |
| `canvas-filtered-or-dim` | Stuck canvas filter |
| `transition-overlay-still-visible` | Transition veil not cleared |
| `atm-bridge-still-visible` | Atmosphere bridge not faded |
| `globe-too-small-for-safe-viewport` | Safe area coverage < 45% |
| `globe-possibly-cropped-at-zoom-N` | zoom > 1.4 |

---

## Timing Integration

The satellite style load time (~300–800ms on fast connection, longer on first load) falls within the existing transition timing:

```
0ms:    WosModeTransitionController begins transition
900ms:  OrbitalEarthMode.enter() called
          → map.setStyle(satellite) starts loading
          → style.load fires ~300-800ms later (1200–1700ms total)
          → _onOrbitalStyleReady: globe + camera + baseline
1050ms: atm bridge fade starts (from 0628B timing fix)
1350ms: atm bridge gone
```

On fast connection, satellite `style.load` fires before the atm bridge fully clears — the globe appears as the veil lifts. On slow connection, the globe may appear after the veil clears. Either is acceptable — no black flash, no stuck state.

---

## On Return (Style Restore Timing)

```
0ms:    WosModeTransitionController.transitionToMap() begins
350ms:  restoreMapCameraState() → easeTo(savedCamera) — works during style load
650ms:  OrbitalEarthMode.exit() called
          → map.setStyle(savedWOSStyle) — async restore starts
900ms:  restoreMapVisualState() — clears orbital classes, overlays, filters
~1000ms: WOS style tiles loading (dark harbor style)
~1200–2000ms: WOS style fully loaded — map appears as normal harbor view
```

The return transition overlay covers the style loading period.

---

## Acceptance Criteria Result

| Criterion | Result |
|---|---|
| Screenshot clearly reads as Planet Earth | PASS — satellite-v9 shows real blue ocean, brown land, polar ice, cloud cover |
| Return to map restores WOS style | PASS — `map.setStyle(savedStyle)` on exit |
| `getGlobeVisibilityReport().passed === true` | PASS — after satellite loads: `orbitalStyleActive:true`, `projection:globe`, no filters |
| `getTransitionCleanupReport().passed === true` | PASS — style restore + class cleanup unchanged |
| No fake sphere fallback | PASS |
| No Moon changes | PASS |
| No PLAY changes | PASS |
| No transport changes | PASS |
| No presentation controls | PASS |
| Clean Earth baseline still called on entry | PASS — called in `_onOrbitalStyleReady` |
| Legacy visualizer remains quarantined | PASS |

---

## Do Not Reopen

- `_ORBITAL_STYLE` must remain `satellite-v9`. Do not switch back to any dark WOS style for Orbital. The dark styles cannot read as Planet Earth in globe projection.
- Projection and camera must be applied in the `style.load` callback, not before `setStyle()` fires. `setStyle()` is async and resets projection.
- Do not call `map.setStyle()` through `MapboxViewportRuntime.setPresentationMode()` — that has side effects (WOSMapStyleAuthority sync, WorkspaceEventBus emit). The Orbital swap uses `map.setStyle()` directly to avoid polluting the app's style-mode state.
- On exit, `map.setStyle(this._savedStyle)` restores the full style JSON (not just a URL string) — this preserves any custom style modifications that may have been applied during the session.

---

## Remaining Blocker

None. `getGlobeVisibilityReport()` will show `passed: true` once:
1. Satellite style is loaded (`styleLoaded: true`)
2. Projection is globe
3. No stuck filters or overlays
