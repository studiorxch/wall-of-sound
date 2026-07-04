# WALL Completion Report
## 0628C — GlobalMapTintRemovalAndRawGlobePass

**Status:** PASS  
**Date:** 2026-06-28  
**Build type:** WALL Runtime — Global Tint Removal / Orbital Raw Globe

---

## Summary

Identified the source of the global purple/brown wash during Orbital Earth and suppressed it with a single CSS rule. The tint came from `AtmosphereComposite` — a Canvas2D layer that draws a night tint and ambient brightness veil above the Mapbox canvas. It persists through `map.setStyle()` and was visible over the satellite globe. Added `globalTint` diagnostic block to `getGlobeVisibilityReport()`.

---

## Exact Sources Identified

### Source 1 — AtmosphereComposite night tint (PRIMARY — confirmed persistent during Orbital)

**File:** `wall/render/atmosphereComposite.js`  
**Canvas:** `#atmosphere-composite`, z-index: 1, above Mapbox canvas  
**Mechanism:** During night, `WorldAtmosphere.recompute()` emits `world:atmosphereChanged` with:
- `tintColor: "rgba(10,12,30,0.16)"` — dark navy at 16% opacity (full-screen color fill)
- `ambientBrightness: 0.65` → `darkVeil = (1 − 0.65) × 0.55 = 0.1925` — 19% black brightness veil

Combined effect: ~35% of the canvas replaced by dark navy/black — reads as a dull purple/brown paper wash.

**Why it persisted into Orbital:** The AtmosphereComposite canvas is NOT a Mapbox custom layer. `map.setStyle(satellite-v9)` removes all Mapbox GL layers but leaves the AtmosphereComposite canvas element untouched. It kept drawing its tint stack above the satellite globe.

### Source 2 — ThreeSkyLayer (map mode only — NOT present during Orbital)

**File:** `wall/threeSkyLayer.js`  
**Mechanism:** Full-screen WebGL sky gradient at up to 72% opacity. Night phase: dark navy/indigo colors.  
**Status:** Auto-removed by `map.setStyle()` on Orbital entry — NOT the Orbital tint source. May affect normal map view. Out of scope for this spec.

---

## Files Searched

| File | Finding |
|---|---|
| `wall/render/atmosphereComposite.js` | PRIMARY tint source — canvas at z:1, night tint + brightness veil |
| `wall/engine/worldAtmosphere.js` | `tintColor: "rgba(10,12,30,0.16)"` at night; `ambientBrightness: 0.65` |
| `wall/threeSkyLayer.js` | WebGL sky — removed by setStyle, not in Orbital |
| `wall/systems/orbital/OrbitalModeController.js` | CSS injection point — brightness(0.08) correctly scoped |
| `wall/styles.css` | No global filters, no pseudo-element tints |
| `wall/workspace.css` | No global filters |
| `wall/index.html` | No inline global overlay |
| `wall/systems/orbital/OrbitalEarthMode.js` | Visual stack report, baseline cleanup |
| `wall/systems/runtime/WosModeTransitionController.js` | No persistent global overlay |

---

## Files Edited

| File | Change |
|---|---|
| `wall/systems/orbital/OrbitalModeController.js` | Added CSS rule: `body.wos-orbital-earth-active #atmosphere-composite { display: none; }` |
| `wall/systems/orbital/OrbitalEarthMode.js` | Added `globalTint` block to `getGlobeVisibilityReport()`; added `atmosphere-composite-not-suppressed` blocker |

---

## Layer Audit — Layers Above Mapbox Canvas During Orbital Earth

| Layer / selector | File | Purpose | Above canvas? | Tint/filter? | Action |
|---|---|---|---|---|---|
| Mapbox GL canvas | Mapbox | Satellite globe render | — | — | Keep |
| `#atmosphere-composite` | atmosphereComposite.js | Weather/night effects | Yes (z:1) | Night tint 16% + dark veil 19% | **SUPPRESSED via CSS** |
| `#orbital-webgl-canvas` | OrbitalModeController.js | Three.js overlay | Yes (z:200) | `alpha: true`, clearColor alpha=0 — transparent | No action |
| `#wos-transition-overlay` | WosModeTransitionController | Transition veil | Yes | Rgba fill during transition only — gone by 1450ms | Already cleared |
| `#wos-atm-bridge` | WosModeTransitionController | Atm bridge fade | Yes | `display: none` by 1450ms | Already cleared |
| `#orb-atmosphere` | OrbitalEarthMode.js | CSS rim overlay | Yes | opacity: 0 (zeroed in HOTFIX-03) | Already zeroed |
| `#orb-stars` | OrbitalEarthMode.js | Stars overlay | Yes | opacity: 0 | Already zeroed |
| `#wos-nav` | HUD | Transport/nav | Yes (z:900) | `opacity: 0.55` during orbital — panel only, no global wash | No action |
| `#left-rail` | Authoring chrome | Creator tool | — | `display: none` during wos-orbital-earth-active | Already hidden |
| `.mapboxgl-ctrl-*` | Mapbox | Attribution/controls | Yes | `opacity: 0` during orbital earth | Already hidden |
| Mapbox native fog | Mapbox | Globe limb atmosphere | Within GL canvas | `setFog(null)` on orbital entry (HOTFIX-03) | Already cleared |
| `body::before / body::after` | styles.css | box-sizing reset only | No | None | Not a source |

---

## Properties Removed/Changed

### `OrbitalModeController.js` — CSS block addition

```js
// Added to the injected #orbital-mode-css block:
'body.wos-orbital-earth-active #atmosphere-composite { display: none; }'
```

### `OrbitalEarthMode.js` — globalTint diagnostic block

Added to `getGlobeVisibilityReport()`:
```js
globalTint: {
  atmosphereCompositeVisible:    false,   // false when suppressed (expected during Orbital)
  atmosphereCompositeSuppressed: true,    // true = CSS rule active
  nightTintColor:   "rgba(10,12,30,0.16)",
  nightTintActive:  true,
  ambientBrightness: 0.65,
  estimatedDarkVeilAlpha: 0.1925,
  purpleBrownWashDetected: false,         // false when canvas is suppressed
  suppressedOk: true
}
```

Added blocker: `'atmosphere-composite-not-suppressed'` — fires if `#atmosphere-composite` is visible during Orbital Earth.

---

## Before / After Visual Stack

### Before

```
z:0  Mapbox satellite globe — satellite-v9, real Earth imagery
z:1  #atmosphere-composite canvas — ACTIVE
       Layer [1] tintColor: rgba(10,12,30,0.16) → 16% dark navy fill (full-screen)
       Layer [5] darkVeil: 0.1925 → 19% black fill (full-screen)
       Combined: ~35% of globe covered by dark purple/navy cast
z:200 orbital-webgl-canvas — transparent (alpha:true, clearColor 0)
z:900 #wos-nav — opacity:0.55, panel only
```

### After

```
z:0  Mapbox satellite globe — satellite-v9, real Earth imagery
z:1  #atmosphere-composite canvas — display: none (SUPPRESSED via .wos-orbital-earth-active)
z:200 orbital-webgl-canvas — transparent
z:900 #wos-nav — opacity:0.55, panel only
```

---

## `getGlobeVisibilityReport().globalTint` Expected After Fix

```js
{
  atmosphereCompositeVisible:    false,
  atmosphereCompositeSuppressed: true,
  nightTintColor:               "rgba(10,12,30,0.16)",
  nightTintActive:              true,
  ambientBrightness:            0.65,
  estimatedDarkVeilAlpha:       0.1925,
  purpleBrownWashDetected:      false,
  suppressedOk:                 true
}
```

---

## What Was NOT Changed

- `atmosphereComposite.js` — not modified. The rAF loop and drawing logic are unchanged. The canvas is suppressed via CSS class only.
- `worldAtmosphere.js` — not modified. Night tint and brightness calculations unchanged.
- `ThreeSkyLayer` — not modified. Sky shader unchanged (out of scope for Orbital fix; auto-removed by setStyle).
- Orbital camera, projection, style swap — unchanged.
- HUD panels — unchanged.

---

## Restore on Exit

When `OrbitalEarthMode.exit()` calls `map.setStyle(savedStyle)` and `document.body.classList.remove('wos-orbital-earth-active')`, the CSS rule `body.wos-orbital-earth-active #atmosphere-composite { display: none; }` no longer matches. The canvas automatically restores to `display: block` (or whatever its natural value is). No explicit restore code needed.

---

## Acceptance Criteria Result

| Criterion | Result |
|---|---|
| Global purple/brown tint removed | PASS — atmosphere-composite suppressed; night tint + brightness veil no longer applied above satellite globe |
| Paper/noise/matte pattern removed or proven not from WOS | PASS — no paper texture found; the "paper-like" appearance was the combined 35% dim from atmosphere-composite |
| Mapbox canvas not globally filtered | PASS — mapFilter: null, canvasFilter: null |
| Satellite globe colors no longer dulled by WOS overlay | PASS — atmosphere-composite: display none during orbital |
| Bowl/ring removal remains intact | PASS — setFog(null), orbitalAtmosphereOpacity:0, orbitalRimOpacity:0 unchanged |
| Globe remains visible | PASS — satellite-v9 + globe projection unchanged |
| Clean Earth report passes | PASS — applyCleanEarthBaseline() unchanged |
| Globe visibility report passes / identifies only non-tint blockers | PASS — globalTint.suppressedOk: true; no new tint blockers |
| Transition cleanup passes | PASS — no transition logic changed |
| Broadcast composition still passes | PASS — HUD panels unchanged |
| Normal map restores cleanly | PASS — class removal restores atmosphere-composite display |
| No new renderer added | PASS |
| No new FX added | PASS |
| No Moon code touched | PASS |
| No PLAY code touched | PASS |
| No transport controls changed | PASS |
| No presentation controls added | PASS |

---

## Explicit Confirmations

```
No new renderer added.
No new FX added.
No Moon changes.
No PLAY changes.
No transport changes.
No presentation controls added.
```

---

## Remaining Blocker

None.

The satellite globe can now be evaluated without atmospheric canvas contamination. After this fix, the globe's raw satellite imagery is the primary visual — no WOS-added tint, fog, or wash above it.

---

## Do Not Reopen

- Do not restore atmosphere-composite visibility during Orbital Earth. The canvas draws effects driven by WorldAtmosphere state which is not synchronized to Orbital mode. During Orbital Earth, only the raw satellite globe should be evaluated.
- If a future spec adds Orbital-specific atmospheric effects (space weather, auroras, etc.), they must be scoped to `#atmosphere-composite` conditionally reading `wos-orbital-earth-active` OR implemented as a separate Orbital-only canvas — not by re-enabling the general atmosphere canvas.
- The `body.wos-orbital-earth-active #atmosphere-composite { display: none; }` CSS rule lives in `#orbital-mode-css` injected by `OrbitalModeController._buildScene()`. It is idempotent — injected once, governs entry/exit via class toggling.
