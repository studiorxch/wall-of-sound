---
spec: 0528S_WOS_PresentationModeTabToggle_v1.0.0
status: active
classification: presentation-debug
created: 2026-05-28
depends_on:
  - 0528R_WOS_AircraftContrailAndNavLighting_v1.0.0
---

# WOS Presentation Mode Tab Toggle v1.0.0

## Purpose

Tab key creates a clean cinematic viewing mode for WOS watchability testing.
All editor/tool chrome disappears. Map, weather, time, and location HUD remain
visible. Mode is reversible — Tab again restores UI.

---

## What Changed

### EXTENDED: `wall/styles.css` — `body.presentation` block

Added missing chrome selectors to the existing `body.presentation` CSS block:

```css
body.presentation #left-rail,
body.presentation #left-panel,
body.presentation #right-panel,
body.presentation .tool-group,
body.presentation .canvas-tool-subbar,
body.presentation .viewport-controls,
body.presentation .drawer-panel,
body.presentation .panel,
body.presentation .launcher-btn,
body.presentation .launcher-rail {
  opacity: 0 !important;
  pointer-events: none !important;
  visibility: hidden !important;
}
```

Existing block (`.topbar`, `.panel-left`, `.panel-right`, `.transport-bar`,
`.shortcut-hud`) uses `display:none` and is preserved as-is.

Uses the existing `body.presentation` class — Tab key already toggles this via
`main.js → togglePresentationMode()`. No competing handler introduced.

### NEW: `wall/systems/presentation/presentationModeDebug.js` v1.0.0

Exposes `_wos.presentationMode` and `_wos.presentationModeState`:

```js
_wos.presentationMode(true)   // enter cinematic mode
_wos.presentationMode(false)  // restore UI
_wos.presentationMode()       // toggle
_wos.presentationModeState()  // → true / false
```

Calls `SBE.MapboxViewportRuntime.resize()` (50ms delay) after each toggle so
Mapbox recomputes viewport if layout columns collapsed.

### Load order addition

```html
<script src="./systems/presentation/aircraftResidueDebug.js"></script>
<script src="./systems/presentation/presentationModeDebug.js"></script>  ← NEW
<script src="./systems/presentation/regionalFlightTripDebug.js"></script>
```

---

## Existing behavior preserved

- `main.js:17441` — Tab key → `togglePresentationMode()` (unchanged)
- `main.js:17241` — `isTypingTarget()` guard prevents mode toggle while typing
  in `INPUT`, `TEXTAREA`, `SELECT`, or `contenteditable` (unchanged)
- `main.js:26193` — `setViewClasses()` toggles `body.presentation` (unchanged)

---

## Verification

```js
// Enter cinematic mode
_wos.presentationMode(true)
// Expected: left rail hidden, transport bar hidden, right tools hidden,
//           map + weather/time/location HUD visible

// Restore
_wos.presentationMode(false)
// Expected: all UI returns

// Tab key toggle
// Press Tab → mode on; press Tab again → mode off

// Read state
_wos.presentationModeState()  // → true or false
```

### Watchability test sequence

```js
_wos.presentationMode(true)

_wos.debug.regionalFlight.start('nyc_to_boston_regional_001')
_wos.debug.regionalFlight.speed(20)
_wos.debug.regionalFlight.cameraRig(true)

_wos.debug.atmosphere.pressure(0.25)
_wos.debug.atmosphere.silence(0.45)

_wos.debug.aircraftResidue.contrails(true)
_wos.debug.aircraftResidue.lights(true)
```

---

## Success Criteria

- [x] Tab creates clean cinematic viewing mode
- [x] Weather/time/location HUD remains visible
- [x] All editor/tool chrome disappears
- [x] Map remains correctly sized (resize() call after toggle)
- [x] Existing transport Tab behavior preserved (same body.presentation class)
- [x] No input/editing workflow broken (isTypingTarget() guard already in place)
- [x] `_wos.presentationMode()` console helper available
