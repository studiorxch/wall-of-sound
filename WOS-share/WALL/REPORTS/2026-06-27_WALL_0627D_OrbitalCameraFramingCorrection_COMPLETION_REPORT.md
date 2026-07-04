# WALL Completion Report
## 0627D — OrbitalCameraFramingCorrection

**Status:** PASS
**Date:** 2026-06-27
**Build type:** WALL Runtime — Orbital Earth Recovery

---

## Summary

Added camera presets to `OrbitalEarthMode.js` and implemented `setCameraPreset()` with globe-fit retry. Default entry preset is `readable_orbit` (zoom 1.0). Added `getGlobeFitReport()` diagnostic to detect globe-too-small, globe-possibly-cropped, and camera restore failures. Retry step corrected to 0.10 (was 0.25 — too coarse). No visual FX added.

---

## Camera Presets Delivered

| Preset | zoom | pitch | bearing | padding |
|---|---|---|---|---|
| `readable_orbit` | 1.0 | 0 | 0 | top:80, right:80, bottom:150, left:80 |
| `broadcast_orbit` | 0.8 | 0 | 0 | top:100, right:120, bottom:180, left:120 |
| `deep_orbit` | 0.45 | 0 | 0 | top:80, right:80, bottom:150, left:80 |
| `cinematic_crop` | 1.35 | 0 | 0 | `manualOnly: true` |

`cinematic_crop` is manual-only and not reachable via default Orbital entry.

---

## Key APIs Delivered

| API | Behavior |
|---|---|
| `OrbitalEarthMode.setCameraPreset(name)` | Applies preset; retries with step 0.10 if globe does not fit; logs failure |
| `OrbitalEarthMode.getGlobeFitReport()` | Returns `globeTooSmall`, `globePossiblyCropped`, zoom, pitch, bearing, center, preset, passed boolean |

---

## Retry Logic

- Step: 0.10 (not 0.25 — fine enough to catch globe-fit thresholds without overshooting)
- On retry failure: logs `[WOS Orbital] CAMERA RESTORE FAILED` with reason
- No silent fallbacks — failure is always reported

---

## `getGlobeFitReport()` Fields

```js
{
  preset,
  zoom, pitch, bearing, center,
  globeTooSmall,       // boolean: globe appears smaller than expected for preset
  globePossiblyCropped, // boolean: globe may be clipped by padding
  cameraRestoreFailed, // boolean: retry exhausted
  passed
}
```

Logs `[WOS Orbital] CAMERA RESTORE FAILED` if `cameraRestoreFailed` is true.

---

## Files Edited

| File | Change |
|---|---|
| `wall/systems/orbital/OrbitalEarthMode.js` | Added `_CAMERA_PRESETS`, `setCameraPreset()`, `getGlobeFitReport()` |

---

## Acceptance Criteria Result

| Criterion | Result |
|---|---|
| `readable_orbit` zoom=1.0 | PASS |
| `broadcast_orbit` zoom=0.8 | PASS |
| `deep_orbit` zoom=0.45 | PASS |
| `cinematic_crop` manualOnly | PASS |
| Retry step 0.10 | PASS |
| `getGlobeFitReport()` with globeTooSmall, globePossiblyCropped | PASS |
| `CAMERA RESTORE FAILED` log on retry exhaustion | PASS |
| No new visual FX | PASS |

---

## Do Not Reopen

- Do not change retry step back to 0.25. Globe-fit misses were caused by the coarse step.
- `cinematic_crop` must remain `manualOnly: true` — it must never be reachable via default Orbital entry.

---

## Next Step

0627E — OrbitalRuntimeOwnershipCleanup: formalize which file owns which Orbital subsystem.
