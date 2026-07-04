# WALL Completion Report
## 0628C Follow-up — Orbital UI/Runtime Desync

**Status:** PASS  
**Date:** 2026-06-28  
**Build type:** WALL Runtime — Orbital Entry Guard + UI Revert

---

## Problem

`SBE.OrbitalEarthMode.getGlobeVisibilityReport()` returned `orbitalEarthActive: false` and `projection: null` while the transport UI showed Orbital selected.

---

## Root Causes (three, compounding)

### Root cause 1 — `OrbitalEarthMode.enter()` setup throws before `_active = true`

**File:** `OrbitalEarthMode.js`

`_injectCSS()`, `_buildOverlays()`, `_applyTokens()`, `_buildAudioOverlay()` all run BEFORE `_active = true` without a try/catch. Any uncaught exception exits `enter()` early, leaving `_active = false` and no `wos-orbital-earth-active` body class. The map, however, may have already had `saveMapCameraState()` called — leaving internal state partially mutated.

### Root cause 2 — `transitionToOrbital()` catch block doesn't revert the transport deck UI

**File:** `WosModeTransitionController.js`

The catch at line 228 called `restoreMapVisualState()` and reset `_transitioning = false` but did not call `TraversalControlDeck.selectTransport('flight')`. The transport button stayed on Orbital even though no Orbital state was active. Second failure: `enter()` can return without throwing AND without setting `_active = true` (e.g. if a guard returned early). The post-call `isActive()` check was missing — the transition continued assuming entry succeeded.

### Root cause 3 — `getGlobeVisibilityReport()` gave a misleading `passed: false` when called outside active mode

**File:** `OrbitalEarthMode.js`

Called at t=0ms (after UI click, before the 900ms entry delay fires), the report returned `orbitalEarthActive: false, projection: null, passed: false`. Callers using this as a pass/fail gate would incorrectly conclude Orbital was broken when it hadn't even started yet.

---

## Entry Chain — What `orbitalEarthActive:false, projection:null` Actually Means

```
t=0ms:   User clicks Orbital button in TraversalControlDeck
         → btn.classList.add('active')  — UI shows Orbital
         → _state.transport = 'orbital'
         → coord.requestOrbitalEntry() → returns true (map is ready)
         → OrbitalEarthMode._active is still false

t=0–900ms: WosModeTransitionController.transitionToOrbital() delays in progress
           map dim, overlay, atm bridge ramp up
           OrbitalEarthMode._active = false ← report called here = MISLEADING

t=900ms: orbital.enterFromMapContext(context, 'earth') runs
         earthMode.enter() → if setup throws → _active stays false
         if ok → _active = true, wos-orbital-earth-active added
         map.setStyle(satellite) called
         style.load fires ~300–800ms later → _onOrbitalStyleReady → globe set

t≈1200–1700ms: ORBITAL FULLY ACTIVE
               OrbitalEarthMode._active = true
               projection = 'globe'
               getGlobeVisibilityReport() is now authoritative
```

---

## Files Edited

| File | Change |
|---|---|
| `wall/systems/orbital/OrbitalEarthMode.js` | Wrapped pre-active setup in try/catch with abort logging; added `isActive()` guard at top of `getGlobeVisibilityReport()` |
| `wall/systems/runtime/WosModeTransitionController.js` | Catch block now reverts transport deck to flight; added post-entry `isActive()` check to catch silent non-throw failures |

---

## Changes Detail

### 1. `OrbitalEarthMode.enter()` — pre-active setup wrapped in try/catch

```js
// Before
this._injectCSS();
this._buildOverlays();
this._applyTokens();
this._buildAudioOverlay();
document.body.classList.add(_GLOBE_CLASS);
this._active = true;

// After
try {
  this._injectCSS();
  this._buildOverlays();
  this._applyTokens();
  this._buildAudioOverlay();
} catch (e) {
  console.error('[WOS Orbital] ENTRY SETUP FAILED — aborting orbital entry:', e);
  return;
}
document.body.classList.add(_GLOBE_CLASS);
this._active = true;
```

If setup throws: entry aborts cleanly. `_active` stays false. `wos-orbital-earth-active` is NOT added to body. The transition controller's post-entry `isActive()` check then detects the failure and reverts the UI.

### 2. `WosModeTransitionController.transitionToOrbital()` — failure reverts transport deck

```js
// Before
} catch (e) {
  console.warn('[WOS Transition] Orbital entry failed:', e);
  restoreMapVisualState();
  _transitioning = false;
  return;
}

// After
} catch (e) {
  console.error('[WOS Transition] Orbital entry failed — reverting UI to flight:', e);
  restoreMapVisualState();
  _transitioning = false;
  try {
    var tcdFail = SBE.TraversalControlDeck;
    if (tcdFail && tcdFail.selectTransport) tcdFail.selectTransport('flight');
  } catch (e2) {}
  return;
}
// Post-entry isActive() check — catches silent failures (enter() returned without throw but _active=false)
var earthMode2 = SBE.OrbitalEarthMode;
if (earthMode2 && earthMode2.isActive && !earthMode2.isActive()) {
  console.error('[WOS Transition] OrbitalEarthMode.enter() returned but isActive()===false — entry aborted, reverting UI');
  restoreMapVisualState();
  _transitioning = false;
  try {
    var tcdAbort = SBE.TraversalControlDeck;
    if (tcdAbort && tcdAbort.selectTransport) tcdAbort.selectTransport('flight');
  } catch (e3) {}
  return;
}
```

Two guards:
1. **Exception guard** — thrown exception → revert
2. **Silent failure guard** — `enter()` returned without throw but `isActive()` is still false → revert

### 3. `getGlobeVisibilityReport()` — early return when not active

```js
OrbitalEarthMode.prototype.getGlobeVisibilityReport = function () {
  // Guard: not authoritative unless active
  if (!self._active) {
    var inactive = {
      orbitalEarthActive: false,
      passed: false,
      blockers: ['orbital-earth-mode-not-active'],
      note: 'getGlobeVisibilityReport() called while OrbitalEarthMode is not active — result is non-authoritative'
    };
    console.warn('[WOS Orbital] getGlobeVisibilityReport: called while not active ...', inactive);
    return inactive;
  }
  // ... full report
```

Callers see a single clear blocker: `'orbital-earth-mode-not-active'`. The `note` field explains what happened. No misleading `projection: null` or empty `styleSwap` block.

---

## UI/Runtime Sync Contract (post-fix)

| Scenario | Before | After |
|---|---|---|
| User clicks Orbital, report run before 900ms | `passed:false`, misleading `projection:null` | `blockers:['orbital-earth-mode-not-active']`, `note` explains not active yet |
| `enter()` setup throws | UI stuck on Orbital, `_active=false` | UI reverts to Flight, console.error logs the throw |
| `enter()` returns without throw but `_active=false` | UI stuck on Orbital, no log | UI reverts to Flight, console.error logs silent failure |
| Normal entry — `enter()` succeeds | UI on Orbital, `_active=true`, report authoritative | Same + `note` field in early-return path only |
| Report called after full entry (style loaded, globe set) | Authoritative | Same |

---

## Usage Pattern After Fix

```js
// Correct pattern — check isActive() before reading report
if (SBE.OrbitalEarthMode.isActive()) {
  var r = SBE.OrbitalEarthMode.getGlobeVisibilityReport();
  console.log(r.passed, r.blockers);
} else {
  console.log('Orbital not active — report would be non-authoritative');
}

// Shorthand — report itself tells you via blockers
var r = SBE.OrbitalEarthMode.getGlobeVisibilityReport();
if (r.blockers.includes('orbital-earth-mode-not-active')) {
  // not active yet — retry after transition settles (~1500ms)
}
```

---

## What Was NOT Changed

- Transport deck button ordering, layout, or labels — unchanged
- Orbital camera, style swap, projection — unchanged  
- `_onOrbitalStyleReady()` — unchanged
- `restoreMapVisualState()` — unchanged
- Moon, PLAY, transport controls — unchanged
- No new FX, no new architecture

---

## Acceptance Criteria

| Criterion | Result |
|---|---|
| `getGlobeVisibilityReport()` returns `orbital-earth-mode-not-active` blocker when called outside active mode | PASS |
| `enter()` setup failure aborts cleanly — `_active` stays false, class not added | PASS |
| `transitionToOrbital()` reverts transport deck to flight on throw | PASS |
| `transitionToOrbital()` reverts transport deck on silent `_active=false` failure | PASS |
| UI Orbital selected ↔ `OrbitalEarthMode.isActive()` remain in sync on failure paths | PASS |
| Normal entry path unchanged | PASS |
| No Moon/PLAY/transport/FX changes | PASS |
