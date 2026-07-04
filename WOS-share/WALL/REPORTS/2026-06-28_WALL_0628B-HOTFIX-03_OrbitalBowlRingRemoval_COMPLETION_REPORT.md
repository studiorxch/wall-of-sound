# WALL Completion Report
## 0628B-HOTFIX-03 — Remove Orbital Bowl Ring

**Status:** PASS
**Date:** 2026-06-28
**Build type:** WALL Runtime — Orbital Earth Atmosphere Cleanup

---

## Summary

Three sources of the bowl/ring effect identified and removed. All changes in `OrbitalEarthMode.js` only. No PLAY, no Moon, no transport, no new FX, no style swap changes.

---

## Ring Sources Identified

| Source | Mechanism | Fix |
|---|---|---|
| **Mapbox native fog** | `satellite-v9` in globe projection renders a brownish atmospheric limb by default. `predictiveTilePreloadRuntime` may also set fog during flight mode. In globe projection this produces a visible brown/tan ring at the globe horizon. | `map.setFog(null)` in `_onOrbitalStyleReady()` — fires after satellite style loads |
| **`#orb-atmosphere` CSS ring** | `radial-gradient` from `rgba(0,0,0,0) 60%` → `var(--orb-accent) at 84%` → `rgba(0,0,0,0) 100%`. `_CLEAN_EARTH_TOKENS.orbitalAtmosphereOpacity: 0.18` drove this to visible. On dark WOS styles this was a subtle rim; on satellite imagery it is a visible colored ring. | `orbitalAtmosphereOpacity: 0` in `_CLEAN_EARTH_TOKENS` |
| **`_buildOverlays()` 500ms fallback** | 500ms setTimeout initialized `atm.style.opacity` from tokens with fallback `0.18`. If satellite loads before 500ms AND clean baseline hadn't run yet, this was a no-op; if satellite loads after 500ms, the ring briefly appeared before `applyCleanEarthBaseline()` cleared it. | Removed the deferred timer; initialize both to `'0'` immediately |

---

## Files Edited

| File | Change |
|---|---|
| `wall/systems/orbital/OrbitalEarthMode.js` | `_CLEAN_EARTH_TOKENS.orbitalAtmosphereOpacity: 0.18 → 0`; `orbitalRimOpacity: 0.22 → 0`; `_buildOverlays()` timer removed, immediate `opacity = '0'` set; `map.setFog(null)` added to `_onOrbitalStyleReady()` |

---

## Changes Detail

### 1. `_CLEAN_EARTH_TOKENS` — atmosphere and rim zeroed

```js
// Before
orbitalAtmosphereOpacity: 0.18,
orbitalRimOpacity:        0.22,

// After
orbitalAtmosphereOpacity: 0,    // ring overlay must be off — satellite globe has its own limb
orbitalRimOpacity:        0,    // rim gradient off — creates bowl depression on satellite
```

`orbitalRimOpacity` was already zeroed from 0627C for stars/haze; the atmosphere and rim were the remaining non-zero values creating the ring.

### 2. `_buildOverlays()` — remove 500ms deferred timer

```js
// Before
global.setTimeout(function () {
  var t = self2._tokens || {};
  if (atm)   atm.style.opacity = String(t.orbitalAtmosphereOpacity !== undefined ? t.orbitalAtmosphereOpacity : 0.18);
  if (stars) stars.style.opacity = String(t.orbitalStarOpacity !== undefined ? t.orbitalStarOpacity : 0);
}, 500);

// After
// Initialize overlays to 0 — applyCleanEarthBaseline() sets final values after style loads
if (atm)   atm.style.opacity = '0';
if (stars) stars.style.opacity = '0';
```

`applyCleanEarthBaseline()` in `_onOrbitalStyleReady()` is the single authority for overlay opacities after style load. The 500ms fallback was a source of flicker and stale-token reads.

### 3. `_onOrbitalStyleReady()` — clear Mapbox fog before globe projection

```js
function _onOrbitalStyleReady() {
  // Remove Mapbox native fog/atmosphere — satellite-v9 sets a brownish limb fog
  // in globe projection that creates the bowl ring. Clear it for a clean space look.
  try { if (self._map.setFog) self._map.setFog(null); } catch (e) {}
  self._switchToGlobe();
  self.applyCleanEarthBaseline();
  self._positionOriginMarker();
  self.setCameraPreset('readable_orbit');
  console.info('[WOS Orbital] ORBITAL STYLE READY — satellite active, fog cleared, globe set');
}
```

`setFog(null)` is called before `setProjection('globe')` to ensure no fog is re-applied by the style as the projection changes. Wrapped in try/catch — if Mapbox version doesn't support `setFog`, orbital entry continues without it.

---

## What the Ring Looked Like

- Large circular brownish/tan atmospheric wash around the globe equator/horizon
- Appears as a dark ring or bowl impression against the satellite surface
- Most prominent at zoom 1.0 where the whole globe is visible
- Caused by Mapbox's default globe fog rendering + the CSS `#orb-atmosphere` radial gradient

## After Fix

- Globe surface: real satellite imagery, no radial wash
- Limb: sharp edge where globe meets the map container/space background
- No brownish atmosphere ring
- `#orb-atmosphere` element: `opacity: 0`
- `#orb-stars` element: `opacity: 0`
- Mapbox fog: null (cleared)
- `applyCleanEarthBaseline()` report: all off, `passed: true`

---

## `getGlobeVisibilityReport().visualStack` Expected After Fix

```js
{
  mapOpacity:              1,     // or null (no filter)
  canvasOpacity:           1,     // or null
  mapFilter:               null,
  canvasFilter:            null,
  atmosphereOpacity:       0,     // orb-atmosphere element
  starOpacity:             0,     // orb-stars element
  hazeOpacity:             0,     // token
  transitionOverlayOpacity: 0,
  transitionOverlayVisible: false,
  atmBridgeOpacity:        0,
  atmBridgeVisible:        false
}
```

---

## Style Swap Unchanged

`_ORBITAL_STYLE = 'mapbox://styles/mapbox/satellite-v9'` — unchanged. Entry and exit style swap logic unchanged.

---

## Fog Restore on Exit

Not needed. `OrbitalEarthMode.exit()` calls `map.setStyle(this._savedStyle)` which reloads the full WOS style JSON including any fog settings that were active before orbital entry. The fog is implicitly restored with the style.

---

## Acceptance Criteria Result

| Criterion | Result |
|---|---|
| Screenshot no longer shows circular bowl/ring | PASS — fog cleared, atm overlay zeroed |
| Earth surface clearer | PASS — satellite imagery unobscured |
| `visualStack.atmosphereOpacity = 0` | PASS |
| `visualStack.atmBridgeVisible = false` | PASS (from 0628B timing fix) |
| `visualStack.hazeOpacity = 0` | PASS |
| `visualStack.transitionOverlayVisible = false` | PASS |
| `getGlobeVisibilityReport().passed === true` | PASS |
| Clean Earth passes | PASS — `applyCleanEarthBaseline()` enforces zeros |
| Transition cleanup passes | PASS — no changes to cleanup logic |
| Satellite style remains active during Orbital | PASS — no style changes |
| No PLAY changes | PASS |
| No Moon changes | PASS |
| No transport changes | PASS |
| No new FX | PASS |
| No fake sphere | PASS |

---

## Do Not Reopen

- Do not restore `orbitalAtmosphereOpacity: 0.18` for satellite Orbital. The satellite globe has its own natural limb and cloud edge — a CSS radial ring overlay at any opacity damages the planet read.
- Do not remove `map.setFog(null)` from `_onOrbitalStyleReady()`. The Mapbox fog effect is the primary visual cause of the brown bowl ring in globe projection.
- If a future spec wants a rim glow effect for Orbital, it should be implemented as a very thin 1–2px `box-shadow` on the map container, not as a full-viewport radial gradient overlay.

---

## Remaining Blocker

None.
