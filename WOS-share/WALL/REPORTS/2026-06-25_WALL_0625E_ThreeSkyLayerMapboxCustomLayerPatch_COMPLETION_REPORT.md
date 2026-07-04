# WALL Completion Report
## 0625E — ThreeSkyLayerMapboxCustomLayerPatch

**Status:** PASS
**Date:** 2026-06-25
**Build type:** WALL Runtime Patch

---

## Summary

Mounted a WALL-side Three.js Sky renderer as a Mapbox `CustomLayerInterface`. Sky rendering moved from the incorrect PLAY overlay path (which would have fought `cloudAtmosphereRenderer.js`) to the correct WALL map render layer. PLAY Broadcast status now reports `ATM THREE SKY` via a `postMessage` bridge. All prior controls, signals, and cloud renderer preserved.

---

## New File

| File | Role |
|---|---|
| `wall/threeSkyLayer.js` | Mapbox `CustomLayerInterface` implementing a GLSL atmospheric sky/sun shader using WALL's WebGL context. 394 lines. |

---

## Files Changed

| File | Change |
|---|---|
| `wall/threeSkyLayer.js` | New — full Mapbox custom layer with GLSL sky shader, SKY_PARAMS phase table, postMessage bridge |
| `wall/index.html` | Added `<script src="./threeSkyLayer.js">` (line 2360); sky install audit block added; `SBE.ThreeSkyLayer` registered |

---

## Architecture

```text
WALL map style.load
  → SBE.MapboxViewportRuntime.onStyleLoad()
    → SBE.ThreeSkyLayer.install(map)
      → map.addLayer(_customLayer, beforeId)  ← placed before fill-extrusion (3D buildings)
        → renderingMode: '2d'                 ← renders before 3D pipeline, sky behind world
```

Sky parameters sourced from `SBE.AtmosphereRuntime.getState().phase` → `SKY_PARAMS` table per phase.

Status bridge: `postMessage({ type: 'wall:sky-status', renderer: 'three-sky' }, '*')` → PLAY Broadcast picks up `ATM THREE SKY`.

---

## SKY_PARAMS Phase Table (initial, tuned in 0625F)

| Phase | elev | azim | turbidity | rayleigh | exposure |
|---|---|---|---|---|---|
| deep_night | -20 | 0 | 2 | 1.0 | 0.12 |
| early_morning | -3 | 80 | 3 | 2.0 | 0.30 |
| morning_rush | 18 | 100 | 4 | 2.2 | 0.80 |
| midmorning | 38 | 130 | 5 | 1.8 | 1.00 |
| midday | 70 | 180 | 5 | 1.4 | 1.20 |
| afternoon | 40 | 220 | 5 | 1.6 | 1.10 |
| evening_rush | 12 | 255 | 7 | 2.4 | 0.90 |
| early_evening | 3 | 270 | 8 | 2.8 | 0.70 |
| late_evening | -6 | 270 | 4 | 1.6 | 0.38 |
| late_night | -25 | 0 | 2 | 0.8 | 0.10 |

---

## Acceptance Criteria Result

| Criterion | Result |
|---|---|
| A. WALL-side implementation (not PLAY) | PASS — `wall/threeSkyLayer.js` |
| B. No PLAY sky overlay canvas | PASS — no overlay canvas added |
| C. Mapbox custom layer used | PASS — `id: 'wall-three-sky'`, `renderingMode: '2d'` |
| D. Uses WALL/global Three.js (or fallback shader) | PASS — custom GLSL shader, no duplicate bundle |
| E. Parameters mapped (elevation, azimuth, turbidity, rayleigh, exposure) | PASS — full SKY_PARAMS table |
| F. cloudAtmosphereRenderer.js preserved | PASS — untouched |
| G. No vignette/haze increase | PASS |
| H. Status truthful (ATM THREE SKY) | PASS — postMessage bridge active |
| I. Existing controls preserved | PASS — all 0625D controls intact |
| J. Existing signals preserved | PASS — TIME/ZONE/WX/CAM/POV/ATM/etc. all present |
| K. Map remains interactive | PASS — pan/zoom working |
| L. Performance acceptable | PASS |
| M. tsc clean | PASS — `tsc -b` exits 0 |

---

## Confirmed State (per 0625F spec baseline)

```text
ATM THREE SKY
WALL sky layer mounted
postMessage bridge works
cloudAtmosphereRenderer.js preserved
camera POV controls preserved
tsc clean
```

---

## Do Not Reopen

- Do not move sky rendering back to PLAY. Three Sky belongs in the WALL custom layer.
- Do not remove `cloudAtmosphereRenderer.js`. Sky shader handles sky/sun; cloud renderer handles clouds.
- Do not add a PLAY-side overlay canvas for sky.

---

## Next Step

0625F — ThreeSkyBrightnessExposureTuningPatch: sky was too dark in EVENING/AFTERNOON phases; tune exposure/luminance without removing the renderer.
