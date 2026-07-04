---
date_generated: 2026-06-26
project: WALL
report_type: continuity_rollup
coverage_start: 2026-06-25
coverage_end: 2026-06-26
---

# WALL Continuity Rollup — 2026-06-25 to 2026-06-26

## Summary

Two builds shipped on 2026-06-25: Three Sky mounted as a Mapbox custom layer (0625E) and sky brightness/exposure tuned (0625F). Sky rendering moved permanently to the correct WALL runtime layer. PLAY Broadcast now shows `ATM THREE SKY` via postMessage bridge. The prior Studio recovery chain (0619E–0620A) remains intact. This is the second WALL rollup; the first covered 0619E–0620A.

## Completion Reports Covered

| Build | Name | Date | File |
|---|---|---|---|
| 0625E | ThreeSkyLayerMapboxCustomLayerPatch | 2026-06-25 | `WALL/REPORTS/2026-06-25_WALL_0625E_...COMPLETION_REPORT.md` |
| 0625F | ThreeSkyBrightnessExposureTuningPatch | 2026-06-25 | `WALL/REPORTS/2026-06-25_WALL_0625F_...COMPLETION_REPORT.md` |

Note: Completion reports for 0625E and 0625F were reconstructed from spec files + `wall/threeSkyLayer.js` source. Original reports were not preserved.

## Major Changes

1. **`wall/threeSkyLayer.js` added** (394 lines) — Mapbox `CustomLayerInterface` with self-contained GLSL atmospheric sky/sun shader. `renderingMode: '2d'` places sky behind all 3D geometry. Registers as `SBE.ThreeSkyLayer`.

2. **10-phase SKY_PARAMS table** — `deep_night` through `late_night`, each with `elev`, `azim`, `turbidity`, `rayleigh`, `exposure`. Parameters sourced from `SBE.AtmosphereRuntime.getState().phase`.

3. **postMessage bridge** — WALL reports `renderer: 'three-sky'` to PLAY via `postMessage`. PLAY Broadcast shows `ATM THREE SKY`. Exact blocker reported if layer fails to mount.

4. **`cloudAtmosphereRenderer.js` preserved** — sky and clouds remain separate renderers running in parallel. No compositor yet.

5. **SKY_PARAMS exposure raised 30–60%** for afternoon/evening phases (0625F). `MIN_LUM` minimum luminance floor added to shader to prevent crushed black sky in dim phases.

6. **All prior controls intact** — POV EXT/DRIVER/PASS, vehicle controls, route launch, music play, clock/weather, TAB/Show/Operate, map pan/zoom. tsc clean.

## Builds Completed

All 2 builds: PASS.

## Builds Still Active

None.

## Decisions Made

- Sky rendering belongs in WALL, not PLAY. PLAY overlay canvas was wrong path.
- `renderingMode: '2d'` is correct for sky-behind-world rendering.
- `SKY_PARAMS` in `threeSkyLayer.js` is the single source for sky constants.
- Sky brightness must be fixed in shader parameters only — no CSS/overlay hacks.
- `MIN_LUM` luminance floor is the correct approach for preventing crushed dark phases.

## Blockers / Risks

- Live time-of-day phase sync not confirmed wired.
- Sky and cloud renderers are separate — no compositor yet.
- Studio building texture proof still pending real-browser verification (from 0620A).

## Do Not Reopen Updates

- Do not move sky back to PLAY.
- Do not fix sky darkness with vignette, CSS haze, or overlay.
- Do not remove MIN_LUM or lower pre-0625F exposure values.
- Do not remove `cloudAtmosphereRenderer.js`.

## Source Pack Files Updated

- `WOS-share/WALL/CURRENT/WOS_CURRENT.md`
- `WOS-share/WALL/CURRENT/WOS_BUILD_STATUS.md`
- `WOS-share/WALL/CURRENT/WOS_DECISIONS.md`
- `WOS-share/WALL/CURRENT/WOS_DO_NOT_REOPEN.md`
- `WOS-share/WALL/CURRENT/WOS_SOURCE_INDEX.md`

## Next Recommended Step

Unknown / not yet provided. Three Sky is mounted and tuned. Candidates:
1. Live time-of-day phase sync
2. Sky/cloud compositor integration
3. Next WALL feature area (Studio, actors, broadcast GLB render pass)
