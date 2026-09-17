# Spatial Spraypaint V0.10.4 Current Status

Date: 2026-09-17

Status: COMPLETE — replaced the large 9-button percentage grid (`#scale-chooser`) with a minimal, stepped, non-scrolling zoom selector. 608/608 tests pass (5 new), TypeScript clean, production build clean.

Baseline: V0.10.3 commit `2cd7a22`/`128ce66` (`...` menu anchoring).

## The Brief

Replace the zoom grid with a minimal stepped selector:
```
-
-
• 100
-
-
```
Requirements: current zoom always visible; surrounding marks are discrete steps; tap/click a mark jumps directly to it; hover/focus reveals the percentage for non-active marks; no large percentage-button grid; no slider thumb/track; no scrolling panel; compact enough to sit beside the zoom control; touch-friendly; preserve existing zoom range/stepping; 100% stays the obvious default; percentage labels not all permanently visible.

## The Approach

**Windowing (`src/WallView.ts`)**: added a pure `resolveZoomStepWindow(zoom, presets = WALL_ZOOM_PRESETS, windowSize = 5)` function. Rather than showing all 9 values in `WALL_ZOOM_PRESETS`, it returns a fixed 5-item window centered on whichever preset is nearest the live zoom, clamped at either end of the array so the window is always exactly 5 items near the boundaries (`[0.25,0.5,0.75,1,1.25]` at the low end, `[1.25,1.5,2,3,4]` at the high end). The full 9-preset array and its values are completely untouched — this is display-only windowing, satisfying "preserve the existing zoom range and stepping logic unless a small normalization is required." `currentSlotIndex` tracks the nearest preset's slot (for highlighting), independent of whether the live zoom exactly equals a preset (wheel/pinch zoom rarely does).

**Markup (`index.html`)**: `#scale-chooser` no longer hard-codes 9 `.scale-choice` buttons. It now contains an empty `#zoom-stepper` container (populated by JS each render) plus a small `Reset` button that still resets pan+zoom to origin — kept as a separate, minimal affordance since it does something the stepper doesn't (also clears pan), and nothing in the brief said to remove it.

**Rendering (`src/main.ts`, new `renderZoomStepper()`)**: called from `updateNavigationUi()` (so it stays live from wheel/pinch/any zoom source, not just clicks), it calls `resolveZoomStepWindow(this.wallView.zoom)` and builds 5 `.zoom-mark` buttons, highest at the top. The current slot renders as a small filled dot + always-visible percentage (`formatZoomPercentage`, so it reflects the *actual* live zoom, not just the nearest preset's value); every other slot renders as a quiet horizontal dash with its percentage in a `.zoom-mark-label` span that's hidden by default and shown only via `:hover`/`:focus-visible` CSS. Clicking a non-current mark calls the existing `setZoomLevel(step)` directly (no drag, no intermediate state) and closes the popover.

**CSS**: `.zoom-mark` marks are small (38×22px) vertically-stacked flex items with generous click area for touch; no track/thumb/range-input anywhere. `#scale-chooser` switched from the old wrapping grid layout to a narrow vertical column, `max-width` unconstrained (no longer needs the wide grid's `min(400px, ...)`).

## What Was Removed

- The 9 static `.scale-choice[data-zoom]` buttons and their `aria-pressed`/`selected` sync loop in `updateNavigationUi`.
- The corresponding click-wiring block in `main.ts` (`document.querySelectorAll(".scale-choice[data-zoom]")...`).
- The old `.scale-choice`/`#scale-chooser` grid CSS (`flex-wrap`, `max-width:min(400px,...)`, per-button padding).

## What Was Preserved

- `WALL_ZOOM_PRESETS`, `MIN_ZOOM`, `MAX_ZOOM`, `clampZoom`, `applyZoomAroundPoint`, `formatZoomPercentage` — completely untouched.
- `#scale-control` (the pill button showing e.g. "100%") — untouched, still opens the popover.
- `setZoomLevel`, `resetView`, `toggleToolChooser`, `closeToolChoosers` — untouched, reused as-is.
- Wheel-zoom and pinch-zoom paths — untouched; the stepper is purely a rendering/interaction layer on top of the same `WallViewState`.
- The `#scale-reset` "reset pan+zoom to origin" affordance — kept, relabeled to a plain `Reset` button since the percentage is no longer needed in its label (the stepper already shows 100% as the obvious neutral default).

## Live Verification

- **Desktop**: opened the popover at 100% zoom — confirmed exact ASCII-mockup visual language: dash, dash, filled-dot "100%", dash, dash, vertically stacked, no slider/track/thumb (screenshotted).
- **Direct jump**: clicked the 150% mark — confirmed `#scale-control`'s live aria-label updated to "Current scale 150%" immediately (no drag), and the popover closed.
- **Window re-centers**: reopened the popover after jumping to 150% — confirmed the window re-centered symmetrically around it (`300/200/150/125/100`), still exactly 5 marks (screenshotted).
- **Hover reveal**: hovered the non-active "300%" mark — confirmed its percentage label appeared only on hover, while the other non-active marks stayed as quiet dashes (screenshotted, zoomed crop).
- **Reset**: clicked `Reset` — confirmed it still returns zoom to 100% (and pan to origin, via unchanged `resetView()`).
- **Tablet viewport (768×1024)**: confirmed the stepper stays compact, positioned directly beside `#scale-control`, no layout breakage, no scrolling container (screenshotted).
- **Regression check**: `#scale-control`'s own click-to-open behavior, `#mode-chooser`, `#more-menu`, and `#color-chooser` popovers untouched.

## Tests / Typecheck / Build

`npx vitest run`: 608/608 passing (5 new tests added directly on `resolveZoomStepWindow`: symmetric window at 100%, low-boundary clamp, high-boundary clamp, non-exact-zoom centering, short-preset-array passthrough). `npx tsc --noEmit`: clean. `npx vite build`: clean.

## Files Changed

- `src/WallView.ts`: new `ZoomStepWindow` interface, `resolveZoomStepWindow()`, `nearestPresetIndex()` (pure, no side effects).
- `src/WallView.test.ts`: 5 new tests for `resolveZoomStepWindow`.
- `index.html`: `#scale-chooser` markup replaced (empty `#zoom-stepper` + `Reset` button); new `.zoom-mark`/`#zoom-stepper` CSS; old `.scale-choice`/wide-grid CSS removed.
- `src/main.ts`: new `renderZoomStepper()` method; removed old `.scale-choice[data-zoom]` click-wiring and sync loop; `updateNavigationUi()` now calls `renderZoomStepper()`.

No changes to `#scale-control` itself, wheel/pinch zoom logic, or any other popover.

## Commit

`8fa981d` — "feat: Spatial Spraypaint V0.10.4 -- minimal stepped zoom selector, replace percentage grid"
