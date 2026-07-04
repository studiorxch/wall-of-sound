# WALL Completion Report
## 0627H — OrbitalFxReintroductionPass

**Status:** PASS
**Date:** 2026-06-28
**Build type:** WALL Runtime — Orbital Earth Recovery

---

## Summary

Audited and patched the FX layer to enforce Clean Earth as the permanent default Orbital Earth entry state. Fixed two CSS variable fallback bugs in `WosMapStyleTokens.toCssVars()` where star opacity (`0.28`) and haze opacity (`0.10`) were used as fallbacks — both corrected to `0` to match `_WOS_DEFAULTS`. Fixed the same star fallback bug in `OrbitalEarthMode._applyAudioSignals()`. Added an audio star guard: audio reactive shimmer now only fires when `stars && baseStars > 0`, preventing audio from revealing stars when tokens enforce zero. Added `getFxReport()` diagnostic to `SBE.OrbitalEarthMode`. No new visual FX added. No new architecture. No Moon, presentation, or transport changes.

---

## Precondition Verification

| Precondition | Result |
|---|---|
| `getCleanEarthReport().passed` | PASS (stars=0, haze=0, vignette=0, overlay clear) |
| `getVisibilityStackReport()` — no major suspects | PASS |
| `getGlobeFitReport().globeTooSmall` | false |
| `getTransitionCleanupReport().passed` after return | PASS |
| Legacy visualizer quarantined (`getLegacyPathReport()`) | PASS |
| Presentation router dormant | PASS |
| Moon gated | PASS |

---

## FX Defaults — Before / After

| FX Layer | Before | After |
|---|---|---|
| Stars | 0 (token correct; CSS fallback was 0.28 — BUG) | 0 (CSS fallback fixed to 0) |
| Haze | 0 (token correct; CSS fallback was 0.10 — BUG) | 0 (CSS fallback fixed to 0) |
| Vignette | off | off |
| Scan ring | off | off |
| Audio overlay | off (guard already present) | off |
| Audio → star shimmer | fired even at starOpacity=0 — BUG | guarded: `if (stars && baseStars > 0)` |
| Route arc | off | off |
| Signal particles | off | off |
| Soft rim | on (orbitalAtmosphereOpacity=0.18, orbitalRimOpacity=0.22) | unchanged |
| Origin marker | on (orbitalOriginOpacity=0.55) | unchanged |
| Legacy visualizer | quarantined | unchanged |
| Fake sphere | blocked | unchanged |

**FX layers enabled by default after 0627H:** soft rim, minimal origin marker, HUD. All others off.

---

## Bugs Fixed

| Bug | File | Fix |
|---|---|---|
| `--orb-star-opacity` CSS fallback was `0.28` | `WosMapStyleTokens.js` | Changed to `0` |
| `--orb-haze-opacity` CSS fallback was `0.10` | `WosMapStyleTokens.js` | Changed to `0` |
| `_applyAudioSignals()` star fallback was `0.28` | `OrbitalEarthMode.js` | Changed to `0` |
| Audio shimmer fired at `starOpacity=0` | `OrbitalEarthMode.js` | Added `if (stars && baseStars > 0)` guard |

---

## Key API Delivered

| API | Behavior |
|---|---|
| `SBE.OrbitalEarthMode.getFxReport()` | Returns full FX state: which layers enabled, their opacities, audio mode, DOM vs token state, blockers list, passed boolean |

---

## `getFxReport()` Shape

```js
{
  cleanEarthDefault,    // true if no FX active above baseline
  starsEnabled,         // boolean
  starOpacity,          // from token
  starDomOpacity,       // from DOM CSS var
  scanRingEnabled,      // boolean
  scanRingOpacity,
  audioMode,            // "off" | "reactive"
  audioOverlayEnabled,  // boolean
  routeArcEnabled,      // always false — no route context
  signalParticlesEnabled, // always false
  hazeEnabled,          // boolean
  hazeOpacity,
  vignetteEnabled,      // false
  legacyVisualizerEnabled,
  atmosphereOpacity,
  atmosphereDomOpacity,
  originOpacity,
  originDomOpacity,
  earthReadable,        // true when no blockers
  blockers,             // []
  passed                // true when earthReadable and cleanEarthDefault
}
```

---

## FX Reintroduction Order (per spec)

| Step | Layer | Status |
|---|---|---|
| 1 | Soft rim | Baseline — present, low opacity |
| 2 | Origin marker | Baseline — present, low opacity |
| 3 | Route arc | Off — no route context |
| 4 | Subtle stars | Off — opt-in only, guards enforced |
| 5 | Scan ring | Off — opt-in only |
| 6 | Audio pulse | Off — mode guard enforced |
| 7 | Signal particles | Off — awaiting real data source |

No layers advanced past step 2 (baseline). Steps 3–7 are opt-in only.

---

## Clean Earth Reset Test

After any FX modification:

```js
SBE.OrbitalEarthMode.applyCleanEarthBaseline()
```

Result:
- Stars off (`orbitalStarOpacity: 0`)
- Haze off (`orbitalHazeOpacity: 0`)
- Scan rings off
- Audio mutation blocked by mode guard
- Route particles off
- Signal particles off
- Transition overlay cleared
- `wos-travel-state` cleared
- Map/canvas filters cleared
- `getCleanEarthReport().passed === true`

---

## Transition Cleanup After FX Test

After FX test + return to map:

```js
SBE.WosModeTransitionController.getTransitionCleanupReport()
```

Expected and confirmed:
- `passed: true`
- `blockers: []`
- No stuck FX/body/filter residue

---

## Acceptance Criteria Result

| Criterion | Result |
|---|---|
| Clean Earth remains default Orbital entry | PASS |
| Stars off by default | PASS |
| Haze off by default | PASS |
| Vignette off by default | PASS |
| Scan rings off by default | PASS |
| Audio overlay off by default | PASS |
| Audio cannot mutate visuals when mode is off | PASS |
| Audio cannot reveal stars when star token is 0 | PASS |
| CSS fallbacks match `_WOS_DEFAULTS` | PASS |
| `applyCleanEarthBaseline()` resets FX | PASS |
| `getFxReport()` exposes full FX state | PASS |
| No new visual FX added | PASS |
| No dimming suspects introduced | PASS |
| No Moon expansion | PASS |
| No presentation controls | PASS |
| No transport buttons | PASS |
| Transition cleanup passes after FX testing | PASS |

---

## Files Edited

| File | Change |
|---|---|
| `wall/systems/orbital/WosMapStyleTokens.js` | Fixed `toCssVars()` fallbacks: `--orb-star-opacity` `0.28→0`, `--orb-haze-opacity` `0.10→0` |
| `wall/systems/orbital/OrbitalEarthMode.js` | Fixed `_applyAudioSignals()` star fallback `0.28→0`; added `if (stars && baseStars > 0)` audio shimmer guard; added `getFxReport()` method |

---

## Files Searched

| File | Reason |
|---|---|
| `wall/systems/orbital/OrbitalAudioOverlayController.js` | Confirmed audio mode guard location and setMode API |
| `wall/systems/orbital/OrbitalFxPanel.js` | Confirmed FX panel does not own default state |
| `wall/systems/orbital/OrbitalPresetRegistry.js` | Confirmed preset fallback is Three.js-path-only |
| `wall/systems/orbital/OrbitalModeController.js` | Confirmed legacy quarantine intact (0627F) |
| `wall/systems/runtime/WosModeTransitionController.js` | Confirmed transition cleanup intact (0627G) |

---

## Do Not Reopen

- Do not change the `--orb-star-opacity` CSS fallback away from `0`. If it is undefined, it must emit `0`, not any positive value.
- Do not change the `--orb-haze-opacity` CSS fallback away from `0`.
- The audio shimmer guard `if (stars && baseStars > 0)` must remain. Audio must not reveal stars when the token is zero.
- `applyCleanEarthBaseline()` is the FX reset contract. Do not route FX resets around it.

---

## Chain Complete

The full 0627 Orbital Earth Recovery chain (0627, 0627C, 0627D, 0627E, 0627F, 0627G, 0627H) is complete.

**Orbital Earth is the product. FX support it. FX never replace it.**

Orbital Earth now has: guaranteed clean entry baseline, canonical camera presets, legacy quarantine, clean round-trip transitions, and a controlled FX layer with diagnostic suite.
