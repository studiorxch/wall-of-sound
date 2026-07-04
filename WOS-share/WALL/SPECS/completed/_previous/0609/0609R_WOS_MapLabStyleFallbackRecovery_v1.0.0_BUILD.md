# 0609R_WOS_MapLabStyleFallbackRecovery_v1.0.0_BUILD

## Objective

Restore visible MapLab map rendering by adding a safe style fallback.

Current state:
- MapLab switched from `mapbox://styles/mapbox/dark-v11` to WOS presentation style.
- Mapbox shell loads, but map imagery/roads do not visibly render.
- Earlier visible map appeared before the WOS style switch.

## Required Fix

Default MapLab back to:

`mapbox://styles/mapbox/dark-v11`

Add WOS style as an optional selectable/debug style, not the default.

## Scope

In:
- Restore visible map rendering.
- Add style fallback logic:
  - primary: dark-v11
  - optional: WOS presentation style
- Add debug method to switch styles manually.
- Preserve building selection.
- Preserve outline/highlight logic.

Out:
- No Canvas work.
- No Glyph work.
- No Wall changes.
- No object replacement.

## Requirements

R1 — MapLab must visibly render map tiles/roads again.

R2 — Default style must be `mapbox://styles/mapbox/dark-v11` until WOS style is verified.

R3 — WOS presentation style remains available through debug:
`window.WOSMapLab.setStyle("wos")`
`window.WOSMapLab.setStyle("dark")`

R4 — Status bar must show active style:
- dark
- wos

R5 — If WOS style fails to render within 5 seconds, fall back to dark automatically.

R6 — Building selection must still work on fallback style.

## Acceptance Tests

T1 — MapLab visibly shows roads/map again.

T2 — Active style reports `dark`.

T3 — Manual switch to `wos` attempts WOS style.

T4 — Failed WOS style falls back to dark.

T5 — Selection still works.

T6 — No Wall/Canvas/Glyph changes.

## Required Report

- previous style
- restored default style
- WOS style fallback behavior
- files changed
- acceptance results