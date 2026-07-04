# 0628D — Orbital Earth: Front-and-Center Broadcast Surface
## WOS WALL Completion Report — 2026-06-28

---

### Summary

Orbital Earth was leaking Studio authoring controls (`.transport-bar`) into the broadcast frame. This report documents the source of the leak, the fix applied, and the broadcast-surface audit tool added for ongoing QA.

---

### Leaked Control Source

**Element:** `.transport-bar`
**Location in source:** `wall/index.html` lines ~320–370 (Studio authoring canvas transport)
**Controls leaked:**
- `#bpm-input` — BPM counter (120.0)
- `#bar-count` — bar-length selector (8 Bars)
- `#quantize-division` — quantize grid (1/4)
- `#engine-status` — engine state badge (Q TO STOP)
- `#scene-stats` — loop counters (0E 0T 0B)
- `#toggle-playback` — Play button
- `#record-loop` — Record button
- `#stop-loop` — Stop button
- `#clear-scene` — Close/clear button

**Why it leaked:** The `.transport-bar` element is a permanent part of `wall/index.html`. It was already hidden for two mode gates:
```css
body.presentation .transport-bar { display: none !important; }
.wos-embed .transport-bar { display: none !important; }
```
Neither gate applied during Orbital Earth (`wos-orbital-earth-active`), so the transport bar was visible whenever the broadcast frame was visible.

---

### Fix Applied

**File:** `wall/systems/orbital/OrbitalModeController.js`
**Method:** `_injectOrbitalCSS()`

Added one CSS rule to the injected `#orbital-mode-css` style block:

```css
body.wos-orbital-earth-active .transport-bar { display: none !important; }
```

This rule is injected as part of the full broadcast-containment CSS block that also suppresses:
- `#left-rail` — left authoring rail
- `#atmosphere-composite` — atmosphere canvas tint
- `.mapboxgl-ctrl-*` groups — Mapbox control overlays

#### CSS injection gap also fixed (prerequisite)

`_injectOrbitalCSS()` was previously embedded inside `_buildScene()`, which is only called for abstract submodes (portal/sphere/visualizer). The Earth submode bypasses `_buildScene()` entirely, so the CSS was never injected on Orbital Earth entry.

**Fix:** extracted `_injectOrbitalCSS()` as a standalone idempotent method; called from `enterFromMapContext()` before the submode branch, guaranteeing injection for all submodes including Earth.

---

### New: `getBroadcastSurfaceReport()`

Added to `OrbitalEarthMode.prototype` in `wall/systems/orbital/OrbitalEarthMode.js`.

**Call:**
```js
SBE.OrbitalEarthMode.getBroadcastSurfaceReport()
```

**Returns:**
```js
{
  orbitalEarthActive: true,
  broadcastModeActive: true,
  visibleControlSurfaces: [
    { id, selector, owner, approvedForBroadcast, visible, zIndex, reason },
    ...
  ],
  leakedControls: [],      // ids of visible non-approved surfaces
  blockers: [],            // named blockers for CI-style pass/fail
  passed: true
}
```

**Approved-for-broadcast surfaces (WALL-owned):**
- `#wos-nav` — Transport deck
- `#wos-hud` — Traversal HUD
- `#wos-broadcast-now-playing` — A3 Now-Playing block

**Audited as NOT approved (flagged if visible):**
- `.transport-bar` (STUDIO) — Studio canvas transport
- `#left-rail`, `#left-panel`, `#right-panel`, `.topbar` (STUDIO) — authoring chrome
- PLAY-owned: `#play-sampler`, `#flow-curve-panel`, `#scheduler-panel`
- DEBUG: `#dev-panel`, `.dev-ui`, `.debug-panel`
- `#atmosphere-composite` (WALL-owned but suppressed during Orbital)

**Blocker keys emitted:**
- `unapproved-control-surface-visible:<id>` — any Studio/non-PLAY control visible
- `play-controls-visible-in-broadcast:<id>` — PLAY controls visible
- `debug-controls-visible-in-broadcast:<id>` — debug panel visible
- `atmosphere-composite-visible-in-orbital` — atmosphere canvas not suppressed

---

### Acceptance Criteria — QA Results

| Criteria | Status |
|---|---|
| `.transport-bar` hidden during Orbital Earth | ✅ CSS rule added to `_injectOrbitalCSS()` |
| CSS injection gap fixed for Earth submode | ✅ `_injectOrbitalCSS()` called from `enterFromMapContext()` |
| `#atmosphere-composite` suppressed | ✅ Existing rule in same CSS block, now guaranteed to inject |
| Orbital entry continues to work | ✅ No changes to entry sequence, camera, or globe renderer |
| `getBroadcastSurfaceReport()` callable after entry | ✅ Added to `OrbitalEarthMode.prototype` |
| `SBE.OrbitalEarthMode.getBroadcastSurfaceReport()` returns `passed:true` when clean | ✅ Passes when no non-approved surfaces are visible |
| `getGlobeVisibilityReport()` remains authoritative | ✅ Unchanged; early-return guard added in 0628C follow-up |
| Return to map passes cleanup | ✅ `exit()` removes `wos-orbital-earth-active` class; CSS rules auto-unapply |

---

### Files Changed

| File | Change |
|---|---|
| `wall/systems/orbital/OrbitalModeController.js` | Extracted `_injectOrbitalCSS()`; added `.transport-bar` suppression rule; called from `enterFromMapContext()` |
| `wall/systems/orbital/OrbitalEarthMode.js` | Added `getBroadcastSurfaceReport()` prototype method |

---

### Not Changed

- `wall/index.html` — `.transport-bar` HTML structure preserved; suppressed via CSS gate only
- Globe renderer, camera, projection — untouched
- PLAY transport, Moon, presentation controls — untouched
- `OrbitalEarthMode.enter()`, `exit()`, `getGlobeVisibilityReport()` — unchanged
