# Spatial Spraypaint V0.10.5 Current Status

Date: 2026-09-17

Status: COMPLETE — moved Hand Tracking into the `...` menu as a secondary input-mode toggle, widened the zoom stepper to 7 values, and added a wall grid-line style setting (dotted default, solid alternative, saved preference persisted). 609/609 tests pass (1 new), TypeScript clean, production build clean.

Baseline: V0.10.4 commit `8fa981d`/`0773d6e` (minimal stepped zoom selector).

## 1. Hand Tracking moved into the `...` menu

**Removed**: the permanent `#hand-input` (✋) icon button from the bottom bar's `#input-island`, which previously sat beside the music/player island — its own CSS rule was removed too.

**Added**: a `Hand Tracking` toggle row inside `#more-menu`, as the first item, above `Record`:
```
Hand Tracking   Off
Record
─────────────
Settings
```
No section headings (the old `Session`/`Configuration` `.more-section-label` rows were removed — a plain divider (`.more-menu-separator`) now sits between `Record` and `Settings` instead). The row shows the live `Off`/`On` state via a `.more-item-value` span (green when on), matching the visual language of the rest of the menu, not a duplicate hand-status icon — the existing `#input-status` chip in the bottom bar (READY / CAMERA ON / etc.) is untouched and remains the only tracking-status indicator outside the menu.

**Preserved exactly**: `selectInputMode()`, `handleHandTrackingResult`, `handleHandTrackingDiagnostics`, the whole `HandTracker`/MediaPipe pipeline, and `updateInputModeUi`'s physical/hand state sync — only the DOM ids they target changed (`hand-input` → `hand-tracking-toggle`), no behavioral logic touched. Clicking the toggle calls the same `selectInputMode(this.inputMode === "spatial" ? "mouse" : "spatial")` as before and closes the menu afterward (matching `Record`'s existing click-then-close pattern).

The menu still opens anchored to the `...` button via V0.10.3's `positionMoreMenu()` (untouched) — no mid-screen popover positioning was introduced.

## 2. Zoom stepper widened to 7 values

`resolveZoomStepWindow`'s default `windowSize` changed from 5 to 7. At 100% zoom this now shows `25/50/75/100/125/150/200` — 25% and 200% both included around the 100% default, per spec. The windowing/clamping logic itself (`src/WallView.ts`) is unchanged; only the default window size differs. Boundary clamping still holds: at the low end the window still can't go below `WALL_ZOOM_PRESETS[0]` (25%), and at the high end it still can't exceed `WALL_ZOOM_PRESETS[8]` (400%).

## 3. Grid style setting (dotted default, solid alternative)

This is a net-new setting — no wall grid-line style option previously existed anywhere in the codebase (confirmed by search before implementing). Added minimally, scoped to just this one line-rendering detail:

- `SettingsState.ts`: new `GridStyle = "solid" | "dotted"` type, `gridStyle` field on `SettingsState` (default `"dotted"`), `{ type: "grid-style", value }` action/reducer case. Pure and unit-tested like the rest of the module.
- `main.ts`: `renderWallBackground()`'s grid-line stroke now calls `ctx.setLineDash(...)` based on `this.settings.gridStyle` — `[]` for solid (unchanged prior look), `[1/zoom, 5/zoom]` for dotted. Nothing else in the wall-background renderer changed (spacing, color, opacity, transform all untouched).
- New `Grid style` row in the Settings panel (a plain `<select>`, Dotted/Solid), next to the existing `Wall surface` row.
- **Persistence**: since no setting in this app persisted before, a minimal, single-purpose `localStorage` read/write was added just for this one preference (`loadSavedGridStyle()`/`saveGridStyle()` in `main.ts`, both try/catch-guarded so a private-browsing/quota failure degrades to the in-memory default rather than throwing). `SettingsState.ts` itself stays localStorage-free and fully pure/testable — the initial state is composed in `main.ts` as `{ ...INITIAL_SETTINGS_STATE, gridStyle: loadSavedGridStyle() }`, so a fresh session with nothing saved still gets the "dotted" pure default, and a saved value overrides it at startup.

## Live Verification

- **Bottom bar**: screenshotted before/after — the ✋ icon is gone; only profile + music remain on the left.
- **`...` menu**: screenshotted open — matches the requested mockup exactly (`Hand Tracking Off`, `Record`, divider, `Settings`, no headings), anchored to the `...` button (V0.10.3 positioning untouched).
- **Toggle behavior**: clicked `Hand Tracking` — state flipped to `On` (green) with the aria-label updating to "Currently on, Hand tracking active"; clicked again — cleanly back to `Off`. (The camera itself errors in this sandboxed browser with no webcam grant — pre-existing behavior, confirmed unrelated to this change: `updateTrackingOverlay`'s diagnostics-driven auto-open of Settings on tracking error already existed before this pass.)
- **Zoom stepper**: opened the popover at 100% — confirmed exactly 7 marks, `200/150/125/100/75/50/25`, 100% centered and bulleted, no scrolling.
- **Grid style default**: cleared `localStorage`, reloaded — `#grid-style` read back `"dotted"`.
- **Grid style persistence**: switched to `Solid` via the select (dispatched a real `change` event), confirmed `localStorage` held `"solid"`; reloaded the page — `#grid-style` still read `"solid"`, confirming the saved preference wins over the fresh default.

## Tests / Typecheck / Build

`npx vitest run`: 609/609 passing (1 new: grid-style default + reducer independence in `SettingsState.test.ts`; the 5 existing `resolveZoomStepWindow` tests were updated in-place for the new 7-value window rather than left stale). `npx tsc --noEmit`: clean. `npx vite build`: clean.

## Files Changed

- `index.html`: removed `#hand-input` button + its CSS rule; `#more-menu` markup simplified (no section labels, new `Hand Tracking` row + separator, new CSS for `.more-item-value`/`.more-menu-separator`); `#input-island` no longer contains the hand button; new `Grid style` settings row.
- `src/main.ts`: `hand-tracking-toggle` wiring (replaces `hand-input`); `updateInputModeUi` now targets the new toggle and syncs its status text; `resolveZoomStepWindow` import used with default `windowSize` now 7; new `GRID_STYLE_STORAGE_KEY`/`loadSavedGridStyle`/`saveGridStyle` helpers; `renderWallBackground()` sets line dash from `this.settings.gridStyle`; `updateSettingsUi()` syncs the new select.
- `src/WallView.ts`: `resolveZoomStepWindow`'s default `windowSize` changed from 5 to 7 (no other logic change).
- `src/WallView.test.ts`: existing window tests updated for the 7-value default.
- `src/SettingsState.ts`: new `GridStyle` type, `gridStyle` field, `grid-style` action/reducer case.
- `src/SettingsState.test.ts`: new test for the grid-style default and reducer.

No renderer changes beyond the single `setLineDash(...)` call gated on the new setting; no physics, brush, stroke, or drip logic touched.

## Commit

`3077d60` — "feat: Spatial Spraypaint V0.10.5 -- Hand Tracking into ... menu, 7-value zoom stepper, grid style setting"
