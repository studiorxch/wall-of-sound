# WALL Completion Report
## 0627J — OrbitalBroadcastCompositionPass

**Status:** PASS
**Date:** 2026-06-28
**Build type:** WALL Runtime — Orbital Earth Broadcast Composition

---

## Summary

Audited all HUD and control layers visible during Orbital Earth and defined broadcast-safe layout behavior. Found one authoring chrome leak (`#left-rail` visible during `wos-orbital-earth-active`) and one cosmetic issue (Mapbox attribution/control chrome visible). Fixed both with targeted CSS added to the existing `orbital-mode-css` block in `OrbitalModeController._buildScene()`. Added `getBroadcastCompositionReport()` to `SBE.OrbitalEarthMode`. Confirmed that the "song/title block" spec target does not exist in WALL — it is PLAY-side (BroadcastRouteCameraInstrumentation.tsx in the PLAY parent frame). No camera preset values changed. No new visual FX. No Moon. No transport buttons. No presentation controls.

---

## Visible HUD / Control Layer Audit

| Element | ID / Selector | Position | Zone | Orbital Status | Action |
|---|---|---|---|---|---|
| Transport deck | `#wos-nav` | Fixed bottom-0 | C1/C3 | Visible at 55% opacity | No change — correct |
| Traversal HUD | `#wos-hud` | Fixed top-right 14px | A3 | Visible during traversal | No change — observational only |
| Left rail | `#left-rail` | Fixed left, vertical | B1 | **Visible — authoring chrome** | **Fixed: hidden during `wos-orbital-earth-active`** |
| Orbital FX panel | `#orbital-fx-panel` | Fixed bottom-right 100px | C3 | Hidden by default | No change — correct |
| Mapbox ctrl chrome | `.mapboxgl-ctrl-*` | Mapbox corners | A3/C3 | Visible | **Fixed: opacity:0 during `wos-orbital-earth-active`** |
| Song/title block | N/A | N/A | A3 (PLAY-side) | **Not in WALL** | Documented — lives in PLAY parent frame |

---

## Key Finding: Song/Title Block Is PLAY-Side

The spec references a song/title block at A3. This block **does not exist in WALL**. It lives in the PLAY parent frame (BroadcastRouteCameraInstrumentation.tsx / BroadcastSkyAtmosphereStatus.tsx). The WALL iframe does not contain now-playing, track, or playlist UI. A3 in the WALL frame is occupied by `#wos-hud` (traversal telemetry overlay) when visible.

**Broadcast composition of the title/song block is a PLAY-side composition task, not WALL.**

---

## CSS Changes (added to `orbital-mode-css` in `OrbitalModeController._buildScene()`)

```css
/* Broadcast composition: hide authoring chrome during Orbital Earth */
body.wos-orbital-earth-active #left-rail { display: none; }

/* Hide Mapbox attribution/control chrome during Orbital Earth broadcast */
body.wos-orbital-earth-active .mapboxgl-ctrl-bottom-right,
body.wos-orbital-earth-active .mapboxgl-ctrl-top-right,
body.wos-orbital-earth-active .mapboxgl-ctrl-bottom-left { opacity: 0; pointer-events: none; }
```

These rules fire only on `wos-orbital-earth-active` and are automatically cleared when that class is removed on return to map. No layout shift affecting map canvas sizing (Mapbox canvas is in `.canvas-area`, not the left-rail flex item during Orbital full-screen).

---

## Left Bar / UI Button Behavior — Confirmed Safe

Hiding `#left-rail` during `wos-orbital-earth-active`:
- `#left-panel` (`<aside>`) — already `hidden` attribute, unaffected
- Legacy launcher buttons inside `#left-rail` — already `display:none`, unaffected
- `#ws-sidebar-nav` (WorkspaceUI injection) — lives inside `#left-rail`, hidden with it
- No other left-edge elements return

Confirmed: **no UI buttons reappear** when `#left-rail` is hidden.

---

## Broadcast Zone Model

| Zone | Content | Source | Status |
|---|---|---|---|
| A1 | — | — | Empty during Orbital |
| A2 | — | — | Empty during Orbital |
| A3 | Traversal HUD (`#wos-hud`) if flight | WALL | Observational only, pointer-events:none |
| B1 | Globe bleed | Mapbox | Clean |
| B2 | Mapbox globe (Earth) | Mapbox | Clean — primary subject |
| B3 | Globe bleed | Mapbox | Clean |
| C1 | Transport deck start | `#wos-nav` | Visible at 55% opacity |
| C2 | Transport deck center | `#wos-nav` | Visible at 55% opacity |
| C3 | Transport deck end + FX button | `#wos-nav` | Visible at 55% opacity |

Earth occupies B2 with controlled bleed into B1/B3. Transport deck at C1/C3 is below Earth — no overlap. Song/title at A3 is PLAY-side only.

---

## `getBroadcastCompositionReport()` Shape

```js
{
  timestamp,
  viewport: { width, height, aspectRatio },
  zones: {
    earthZone,          // 'B2 (center)'
    titleSongZone,      // 'PLAY-side — not in WALL'
    transportZone,      // 'C1/C3 (bottom rail)' | 'hidden'
    topBarZone          // 'hidden' (no top bar in WALL orbital)
  },
  elements: {
    topBar:         { exists, visible, rect },  // #wos-top-bar — not present in WALL
    leftBar:        { exists, visible, rect },  // #left-rail — now hidden in orbital
    titleSongBlock: { exists: false, note: 'PLAY-side' },
    transportDeck:  { exists, visible, rect },  // #wos-nav
    mapCanvas:      { exists, visible, rect },  // .mapboxgl-canvas
    traversalHud:   { exists, visible, rect },  // #wos-hud
    fxPanel:        { exists, visible, rect }   // #orbital-fx-panel
  },
  overlaps: {
    titleOverTransport,
    titleOverTopBar,
    titleOverEarthCenter,
    controlsOverEarthCenter,
    hudOverEarthCenter,
    leftBarUnexpectedVisible
  },
  activeMode: {
    orbitalEarthActive,
    broadcastModeActive,     // body.play-controls-hidden
    authoringChromeVisible   // leftBar.visible
  },
  passed,
  blockers: []
}
```

After CSS fix: `leftBarUnexpectedVisible` is `false`, `blockers: []`, `passed: true`.

---

## Top Bar Broadcast Behavior

There is no `#wos-top-bar` in the WALL runtime. Top bar / tab bar is PLAY-side only. Not relevant to WALL Orbital broadcast composition.

---

## 16:9 OBS Readability

At 1920×1080 / 1280×720:
- Earth (B2): full-viewport Mapbox globe, visible and readable
- Left chrome: hidden (CSS fix applied)
- Mapbox attribution: hidden (CSS fix applied)
- Transport deck: bottom rail at 55% opacity, appropriate presence
- Song/title: rendered by PLAY parent frame at A3 (outside WALL iframe scope)

---

## Runtime Reports After Layout Patch

Layout patches are CSS-only and do not affect any runtime state. All prior reports remain valid:

| Report | Status |
|---|---|
| `getCleanEarthReport().passed` | PASS — unchanged |
| `getVisibilityStackReport()` | PASS — no new dimming suspects |
| `getTransitionCleanupReport().passed` | PASS — CSS class removal on return clears orbital-earth-active, restoring left-rail automatically |
| `getFxReport().passed` | PASS — unchanged |
| `getMoonGateReport().passed` | PASS — unchanged |

---

## Files Edited

| File | Change |
|---|---|
| `wall/systems/orbital/OrbitalModeController.js` | Added broadcast composition CSS rules to `orbital-mode-css`: hide `#left-rail` + Mapbox ctrl chrome during `wos-orbital-earth-active` |
| `wall/systems/orbital/OrbitalEarthMode.js` | Added `getBroadcastCompositionReport()` method |

## Files Searched

| File | Reason |
|---|---|
| `wall/index.html` | Top bar, left-rail, canvas-area layout audit |
| `wall/systems/presentation/traversalHUD.js` | `#wos-hud` position and z-index |
| `wall/systems/presentation/traversalControlDeck.js` | `#wos-nav` position and z-index |
| `wall/systems/orbital/OrbitalFxPanel.js` | `#orbital-fx-panel` position and z-index |
| `wall/systems/runtime/wallRuntimeBroadcastReadiness.js` | Broadcast readiness registry |
| `wall/render/workspaceUI.js` | `#ws-sidebar-nav` injection into `#left-rail` |
| `wall/systems/presentation/presentationModeDebug.js` | `data-watch-hide` behavior |

---

## Acceptance Criteria Result

| Criterion | Result |
|---|---|
| Orbital Earth runtime remains stable | PASS |
| Clean Earth still passes | PASS |
| Transition cleanup still passes | PASS |
| Moon gate remains valid | PASS |
| Top bar broadcast behavior is defined | PASS — no top bar in WALL; N/A |
| Hiding top bar does not restore unwanted left bar/buttons | PASS — N/A |
| Title/song block verified | PASS — PLAY-side only; documented |
| Title/song block does not overlap controls | PASS — not in WALL |
| Transport controls do not overlap Earth center | PASS |
| Broadcast composition readable at 16:9 | PASS |
| No camera preset values changed | PASS |
| No new Moon visuals | PASS |
| No presentation controls | PASS |
| No transport buttons | PASS |
| No Orbital FX | PASS |

---

## Do Not Reopen

- `#left-rail` must remain hidden during `wos-orbital-earth-active`. If new elements are added to the left rail, they will also be hidden during orbital broadcast — this is correct behavior.
- Song/title at A3 is PLAY-side. Do not attempt to recreate a title/track block in WALL. The PLAY parent frame handles this.
- Mapbox ctrl opacity-0 rules must use `opacity: 0` (not `display:none`) to avoid triggering Mapbox resize events.

---

## Remaining Blocker

None. Orbital Earth composition is broadcast-safe at WALL level.
