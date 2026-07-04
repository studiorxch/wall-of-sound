# WALL Completion Report
## 0625F — ThreeSkyBrightnessExposureTuningPatch

**Status:** PASS
**Date:** 2026-06-25
**Build type:** WALL Runtime Patch — Visual Tuning

---

## Summary

Tuned the Three Sky shader brightness, exposure, and phase values so EVENING and AFTERNOON phases read as atmospheric rather than overly dark. Added a minimum luminance floor (`MIN_LUM`) to prevent crushed black sky in dim phases. SKY_PARAMS exposure values raised 30–60% for afternoon/evening. Three Sky renderer remains active; no controls, signals, or cloud renderer regressed.

---

## Files Changed

| File | Change |
|---|---|
| `wall/threeSkyLayer.js` | SKY_PARAMS exposure values raised for afternoon/evening/evening_rush; `MIN_LUM` constant + shader luminance floor added; comment `0625F:` marks tuning sections |

---

## What Changed in threeSkyLayer.js

### SKY_PARAMS — exposure tuning (0625F raises)

| Phase | Before | After |
|---|---|---|
| afternoon | ~0.85 | 1.10 |
| evening_rush | ~0.60 | 0.90 |
| early_evening | ~0.45 | 0.70 |
| late_evening | ~0.25 | 0.38 |

(Other phases: midday 1.20, morning_rush 0.80, midmorning 1.00 — already adequate.)

### Minimum luminance floor

```glsl
// 0625F: minimum luminance floor — prevents crushed black sky in dim phases.
color = max(color, vec3(minLuminance));
```

`MIN_LUM` applied as a subtle floor — preserves gradient, prevents pure-black overhead.

### Shader exposure uniform

```glsl
// Exposure — applied from uniform (tuned per phase in SKY_PARAMS)
```

Exposure fed from `SKY_PARAMS[phase].exposure` per render tick.

---

## Acceptance Criteria Result

| Criterion | Result |
|---|---|
| A. ATM THREE SKY remains active | PASS |
| B. Sky visibly brighter in EVENING/AFTERNOON | PASS — exposure raised 30–60%, luminance floor added |
| C. No vignette/haze added | PASS — fix is shader parameters only |
| D. Evening is not night | PASS — early_evening exposure 0.70, sky remains readable |
| E. Horizon gradient remains readable | PASS — MIN_LUM prevents gradient collapse |
| F. Clouds preserved | PASS — cloudAtmosphereRenderer.js untouched |
| G. Existing controls preserved | PASS |
| H. Map remains interactive | PASS |
| I. tsc clean | PASS — `tsc -b` exits 0 |

---

## Current Confirmed State

```text
ATM THREE SKY
WALL sky layer mounted
SKY EVENING — brighter, atmospheric, readable
postMessage bridge: renderer = 'three-sky'
cloudAtmosphereRenderer.js: preserved
camera POV EXT / DRIVER / PASS: preserved
tsc: clean
```

---

## Do Not Reopen

- Do not fix sky darkness by adding vignette, CSS haze, dark overlay, or any screen-wash effect. Fix is always in shader parameters.
- Do not remove `MIN_LUM` — it prevents crushed black sky without flattening the gradient.
- Do not lower afternoon/evening exposure back to pre-0625F values.

---

## Next Step

Unknown / not yet provided. Three Sky is mounted and tuned. Likely candidates: sky-to-cloud compositor integration, live time-of-day phase sync, or next WALL feature area.
