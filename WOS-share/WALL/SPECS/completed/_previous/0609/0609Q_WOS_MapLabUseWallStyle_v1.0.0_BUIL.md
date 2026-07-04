# 0609Q_WOS_MapLabUseWallStyle_v1.0.0_BUILD

## Objective

Make Studio Map Lab use the same Mapbox style as Wall.

Current problem:
- Wall uses the WOS visual map style with blue roads.
- Map Lab uses hardcoded `mapbox://styles/mapbox/dark-v11`.
- This makes Map Lab visually inconsistent and may hide the same layers we need to select/edit.

## Required Fix

Replace the hardcoded MapLab default style:

`mapbox://styles/mapbox/dark-v11`

with the same style source used by Wall.

## Scope

In:
- Audit where Wall defines its active Mapbox style.
- Reuse that style in `studio/mapLab/mapboxAdapter.js`.
- Do not duplicate style constants if a shared source already exists.
- Fall back to dark-v11 only if Wall style cannot be resolved.
- Add debug output showing active style URL.

Out:
- No Canvas work.
- No Glyph work.
- No Wall UI changes.
- No object replacement.

## Acceptance Tests

T1 — MapLab no longer defaults to `mapbox://styles/mapbox/dark-v11`.

T2 — MapLab reports the same active style as Wall.

T3 — Blue-road WOS visual style appears in MapLab when tiles load.

T4 — Building selection still works.

T5 — No Wall/Canvas/Glyph changes.

## Required Report

- Wall style source found
- MapLab previous style
- MapLab new style
- files changed
- acceptance results