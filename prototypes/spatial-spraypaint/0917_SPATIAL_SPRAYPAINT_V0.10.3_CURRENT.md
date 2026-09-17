# Spatial Spraypaint V0.10.3 Current Status

Date: 2026-09-17

Status: COMPLETE — `...` menu anchoring. Narrowly scoped positioning fix only: the `#more-toggle` (`...`) button itself is untouched (same DOM position, same markup), and no other popover (`mode-chooser`, `color-chooser`, `scale-chooser`) was touched. Menu contents, Record/Settings/Hand Tracker placement, and every other UI element are unchanged. 603/603 tests pass, TypeScript clean, production build clean.

Baseline: V0.10.2 commit `5de48db`/`2bf0c99` (marker + spray control reduction).

## The Problem

`#more-menu` shared the generic `.tool-popover` rule (`position:absolute; left:50%; bottom:72px; transform:translateX(-50%)`) with every other popover — centered over the whole bottom bar, not anchored to the `...` button that actually opens it. On any layout where `#more-toggle` (the trailing, right-most control) wasn't near the horizontal center, the menu visually detached from its trigger.

## The Fix

**CSS** (`index.html`): `#more-menu` now overrides the shared centering with `position:fixed; left:auto; right:auto; top:auto; bottom:auto; transform:none` — an id selector beats the `.tool-popover` class rule with no `!important` needed. All actual positioning now comes from inline styles set by JS.

**JS** (`main.ts`, new `positionMoreMenu()`): computes the menu's position from `#more-toggle`'s live `getBoundingClientRect()` every time the menu opens:
- **Default anchor**: right-aligned to the button's own right edge, opening upward with a 10px gap above the button — "immediately above ... the button," never centered.
- **Horizontal flip**: if right-aligning would push the menu's left edge past an 8px viewport margin (narrow/iPad-portrait layouts), it flips to left-aligned on the button's own left edge instead.
- **Vertical flip**: if opening upward would push the menu's top edge past that same margin (very short viewports), it flips to opening downward, below the button, instead.
- Both checks are independent and computed from the menu's actual rendered size (`offsetWidth`/`offsetHeight`) each time, not assumed or hard-coded.
- **Reflow**: `initResize`'s existing `resize` handler now also calls `positionMoreMenu()` whenever the menu is currently open, so rotating an iPad or any viewport change keeps it attached rather than drifting to a stale position.

## Live Verification

- **Desktop viewport**: opened the menu — `getBoundingClientRect()` confirms the menu's right edge exactly matches the button's right edge (`rightDiff: 0`) with an exact 10px gap above it (screenshotted).
- **Resize while open** (750×735 desktop): re-measured after a live `resize` dispatch — same `rightDiff: 0`, `gap: 10`, confirming the reflow handler keeps it attached.
- **iPad-portrait-narrow (375×812)**: menu stayed right-aligned and attached, still no overlap with the centered Spray/Record controls (screenshotted).
- **Forced vertical-flip test** (375×150, an extreme case to prove the flip logic, not a realistic device size): confirmed the menu switched from opening above (`openedAbove: true`) to opening below the button (`openedBelow: true`) once there was no longer room above — the flip only engages when actually needed, not always.
- **Regression check**: reloaded fresh and confirmed `#more-toggle`'s own position, and the `mode-chooser` (Spray/Marker) popover's existing centered behavior, are both completely unchanged (screenshotted) — this pass touched only `#more-menu`'s own positioning.

## Tests / Typecheck / Build

`npx vitest run`: 603/603 passing, unchanged — this is DOM positioning logic (`getBoundingClientRect`/inline style writes), not app logic, so no test needed updating. `npx tsc --noEmit`: clean. `npx vite build`: clean.

## Files Changed

- `index.html`: `#more-menu` CSS override (`position:fixed`, cancels the shared `.tool-popover` centering).
- `src/main.ts`: new `positionMoreMenu()` method; called from `toggleToolChooser` when the menu opens and from `initResize`'s handler when the menu is open during a resize.

No changes to menu contents, `#more-toggle` itself, Record/Settings/Hand Tracker placement, or any other popover.

## Commit

`2cd7a22` — "fix: Spatial Spraypaint -- anchor the ... menu to its own button instead of centering it"
