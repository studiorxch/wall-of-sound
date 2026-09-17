# Spatial Spraypaint V0.10.1 Current Status

Date: 2026-09-17

Status: COMPLETE — Compact Drawing Controls. Continuation of the V0.10 UI Reset, narrowly scoped to control density and wording only. No rendering, Flair behavior, cap physics, marker physics, or Pencil work touched. 602/602 tests pass, TypeScript clean, production build clean.

Baseline: V0.10 commit `3619b07`/`345f6d5` (UI Reset — tool browser, Brush Studio, color defaults, marker consolidation).

## The Problem

The normal Spray controls carried redundant status rows: `Size · 32` followed by a full-width `Using cap default` button; `Spray coverage override · 100%` followed by a full-width `Using full coverage` button; and a permanent two-line Fill-mode explanation (`caps one sweep's build-up; lift and sweep again for fuller coverage`) taking up panel space regardless of whether anyone needed it. Combined with the cap-browsing list living in the same scroll container as these controls, reaching Size/Coverage/Fill/Edit Brush could require scrolling past the entire cap catalog first.

## The Fix

**One dense row per control** (`index.html`, `.compact-slider-row`): label, slider, value, and a small inline reset icon (↺) that only exists in the layout — via `[hidden]`, not just visually suppressed — while that specific value is actually overridden from the cap's own default. Nothing to reset, nothing shown; per the brief's own rule, "If a value is default, the control itself is enough."

```
Size        [slider] 32
Coverage    [slider] 100%
Fill        [checkbox]

Edit Brush →
```

- `Spray coverage override` → `Coverage`.
- `Using cap default` / `Using full coverage` — removed outright, not shortened. The reset icon's own presence/absence already communicates "customized or not"; a text explanation of that state was the redundancy being asked to go.
- The Fill-mode explanatory copy (`caps one sweep's build-up...`) moved to a `title` tooltip on the Fill row itself — still reachable (hover/long-press), no longer permanently occupying panel space.

**Decoupled the cap list from the controls** (`index.html`): the browsable Spray-cap list (Fat/Thin/Specialty, currently 15 caps) is now its own scrollable sub-region (`#cap-list-scroll`, `max-height: min(260px, calc(100vh - 380px))`), separate from `#spray-property-controls`. Previously the WHOLE popover (`#mode-chooser`) scrolled as one block, so reaching Size/Coverage/Fill/Edit Brush depended on how far down the cap list the user happened to be scrolled. Now the list scrolls internally when it's long enough to need it, while Size/Coverage/Fill/Edit Brush always sit visible below it, unscrolled — this is what the acceptance criteria's "no vertical scroll" is actually checking: the controls, not the browsable catalog, must always be in view together.

**Reset icon sizing**: 30×30px, matching this app's own existing `.icon-button` touch-target convention (38×38 for primary icon buttons; 30×30 for this secondary, only-sometimes-visible affordance) — not shrunk to the point of being an unreliable touch target on iPad.

## Live Verification

Screenshotted, Spray tool, New York Fat selected: `Size` (slider + `32`), `Coverage` (slider + `100%`), `Fill` (checkbox), `Edit Brush →` all visible simultaneously with zero vertical scroll on the controls region. No `Using cap default`/`Using full coverage` rows. No `override` wording anywhere in the normal panel.

Confirmed the reset affordance's actual behavior, not just its default-hidden state: dragged the Size slider to `50` — the ↺ icon appeared inline next to Size (and only Size; Coverage's icon stayed hidden), and the toolbar chip's customization badge (from V0.10) correctly lit up with `Custom`. Clicked the icon — reverted to the cap default, icon disappeared again.

Repeated for Marker (Round Marker selected): `WIDTH · 28` + five size-preset buttons + `Edit Brush →`, all visible with no scroll — this panel was already compact from V0.10's marker consolidation and needed no further changes, confirmed unaffected by this pass's CSS edits.

## Tests / Typecheck / Build

`npx vitest run`: 602/602 passing, unchanged from baseline — this pass touched no logic, only DOM structure/CSS and display-string assembly (`textContent`/`toggleAttribute`), so no test needed updating. `npx tsc --noEmit`: clean. `npx vite build`: clean (`dist/index.html` 51.62kB, up slightly from V0.10's 49.98kB — the new per-row markup (separate label/value/reset spans) is marginally more verbose than the old two-line stack, a deliberate tradeoff for the denser layout; `dist/assets/index-*.js` unchanged, confirming zero JS-logic drift).

## Files Changed

- `index.html`: compact per-row markup for Size/Coverage (label + slider + value + inline reset), Fill row's explanatory copy moved to a `title` tooltip, `#cap-list-scroll` wrapper added around the browsable cap list with its own bounded scroll, `#mode-chooser`'s own scroll/max-height removed in favor of the sub-region's, new `.compact-slider-row`/`.compact-slider-label`/`.compact-slider-value`/`.compact-reset` CSS.
- `src/main.ts`: `updateRadiusUi`/`updateCoverageUi` — reset buttons now toggle `hidden` instead of writing `"Using cap default"`/`"Use cap default"` text; `coverage-val` now includes the `%` itself (previously static markup after the element).

No changes to `SprayBrushEngine.ts`, `PaintMarkerEngine.ts`, `WetPaintModel.ts`, `FlairCurves.ts`, `FlairContinuity.ts`, `FlairProperties.ts`, `PencilInput.ts`, `BrushStudio.ts`, `ColorPalette.ts`, or any physics/rendering file.

## Commit

`09a22ce` — "feat: Spatial Spraypaint V0.10.1 -- compact Spray/Marker drawing controls, no vertical scroll"
