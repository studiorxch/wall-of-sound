# Spatial Spraypaint V0.9 Current Status

Date: 2026-09-17

Status: COMPLETE — Flair moved onto the real, accessible cap path. Every Flair build pass since Tool Taxonomy (V0.7) validated exclusively against `track-marks`, a cap with no cap-picker entry — a hidden/internal cap no real user, on iPad or otherwise, could ever select. This pass removes `track-marks` from Flair's eligible-cap set entirely and rewires the whole system (start-position reset, size envelope, distance-driven modulation, continuity resampling, output/density/mist coupling, Brush Studio controls) onto **Pink Dot Fat** and **New York Fat** — two real, visible entries in the normal cap picker. Each keeps its own cap identity and its own render path (Pink Dot Fat's dual-plume renderer, New York Fat's generic concentric-pass/line renderer) — Flair is a modulation layer on top of each cap's existing physics, never a re-route through Track Marks' renderer. Live-verified end-to-end using ONLY the real, visible cap picker and Brush Studio UI — no hidden buttons, no debug window hooks. 601/601 tests pass, TypeScript clean, production build clean.

Baseline: V0.8.7 commit `b0bc28b`/`77562f9` (mist rebalance — the last Track-Marks-validated pass).

## The Report

"Stop working on Track Marks. The user cannot access it." Every prior pass's live verification (V0.8 through V0.8.7) had secretly been testing against a cap the shipped UI never exposes — confirmed directly in this pass by inspecting `index.html`'s cap-picker markup, which has no `track-marks` button (only Brush Studio's own internal cap list shows it, labeled "Digital Effect"). Before any iPad testing could mean anything, Flair had to move onto a cap path a real user, and a real iPad session, can actually reach.

## The Move

**Single source of truth for eligibility** (`FlairCurves.ts`):

```ts
const FLAIR_ELIGIBLE_CAP_IDS = new Set(["pink-dot-fat", "new-york-fat"]);
export function isFlairEligibleCap(capId: string): boolean {
  return FLAIR_ELIGIBLE_CAP_IDS.has(capId);
}
```

Every one of the eight `capId === "track-marks"` runtime gates scattered across `FlairCurves.ts`, `FlairContinuity.ts`, `main.ts`, and `BrushStudio.ts` now calls this single function instead of hand-checking a cap id — the eligible set can never drift between call sites again. `track-marks` was removed from the set outright, not merely deprioritized: `isFlairEligibleCap("track-marks")` is `false`, so it no longer reaches any Flair code path anywhere in the app, live paint or Brush Studio alike.

**Field/function renames** (main.ts, BrushStudio.ts, FlairContinuity.ts — private/internal only, no public API changed): `trackMarksFlairMode` → `activeFlairMode`, `trackMarksFlairDistance01` → `activeFlairDistance01`, `trackMarksFlairOutputMultiplier` → `activeFlairOutputMultiplier`, `trackMarksFlairBloom01` → `activeFlairBloom01`, `getTrackMarksFlairMode`/`setTrackMarksFlairMode` → `getActiveFlairMode`/`setActiveFlairMode`, `cycleTrackMarksFlairMode` → `cycleActiveFlairMode`, `resetTrackMarksFlairForNewStroke` → `resetActiveFlairForNewStroke`, `applyTrackMarksFlairStartSize` → `applyActiveFlairStartSize`, `adjustTrackMarksFlairDistance` → `adjustActiveFlairDistance`, `resampleTrackMarksFlairSegment` → `resampleFlairSegment`, `renderTrackMarksFlairPreview` → `renderFlairPreview`. These fields are a single "whichever eligible cap is currently selected" pointer, not per-cap memory — switching between Pink Dot Fat and New York Fat keeps whatever Flair mode is set, exactly matching every prior pass's single-cap behavior, just now spanning two real caps instead of one hidden one.

**Not touched**: `applyPencilTrackMarksMapping` stays gated to the literal string `"track-marks"` and is therefore now fully inert (a no-op for every real cap) — its own doc explicitly states it exists to keep Pencil tilt from ever moving Pink Dot's `sprayAngle` control, a deliberate exclusion this pass had no reason to revisit. Left as dead code rather than repurposed, since Pencil coverage/tilt mapping was not named in this brief's eight requirements.

## Why This Just Works: `getFlairSizeDefaults` Was Already Cap-Relative

No new size math was needed. `getFlairSizeDefaults(mode, capBaseRadius, tier)` has computed each cap's envelope from ITS OWN `baseRadius` since V0.8.5 — Track Marks (42) was never hard-coded into the ratio math, only into the eligibility gate. `getFlairCapTier` now maps both Pink Dot Fat and New York Fat to `"fat"` (both are genuinely Fat-family caps per `SprayCapPreset.family`), so each gets its own absolute envelope automatically:

- **Pink Dot Fat** (`baseRadius` 42): `4 → 76` wall units
- **New York Fat** (`baseRadius` 32): `3 → 58` wall units

Requirement 3 ("Pink Dot and NY Fat need their own min/max Flair envelopes") and requirement 4 ("do not let either cap start at its maximum width") were satisfied by wiring, not new math — `getFlairStartPositionDefault(mode) = "min"` for every real mode (V0.8.5) applies automatically to whichever eligible cap is selected.

## Each Cap Keeps Its Own Identity

Flair never routes either cap through Track Marks' renderer. `DrawingToolRenderer.renderSegment` always calls `SprayBrushEngine.renderSegment` with the SELECTED cap's own preset (density-coupled via `applyFlairDensityToCap`, unchanged mechanism from V0.8.6/V0.8.7) — which cap's actual deposition code runs is entirely decided by `SprayCapPreset.depositionShape`, never by Flair:

- **Pink Dot Fat** (`depositionShape: "plume"`): renders through `resolvePinkDotDualPlume`/`renderPinkDotStochasticOuterField` — its own stochastic dab-based atmosphere. `applyFlairDensityToCap`'s `particleCount` reduction directly shrinks `totalCandidates` in that field (`Math.round(180 * cap.particleCount / 26)`), so Flair's bloom-driven "fewer particles, more veil" response reaches Pink Dot Fat through the SAME mechanism its own baseline density already uses — not a bolted-on override.
- **New York Fat** (`depositionShape: "line"`): renders through the generic concentric-pass core loop + `renderHalo` + `renderOverspray` — completely different code from Pink Dot Fat's plume renderer. `applyFlairDensityToCap`'s `coreOpacity`/`coreDensity`/`edgeFalloff`/`particleCount`/`particleOpacity` fields all feed this path too (the `plumeMistOpacity`/`plumeMistRadius`/`plumeRingOpacity` fields are simply inert here, since `resolvePinkDotDualPlume` is never called for a non-plume shape — harmless, not a bug).

## Live Verification

Run entirely through the real, visible UI: the toolbar cap picker (which has genuine buttons for both caps, confirmed by reading `index.html`) and Brush Studio's own Mode dropdown — no hidden cap-picker button, no `window.__app` debug hook, no synthetic cap selection of any kind. Only the actual stroke gesture (mouse-down/move/up) was dispatched programmatically, exactly as every prior live-verification pass in this project has done to simulate drawing.

- **Pink Dot Fat, selected via the real cap picker**: Brush Studio's FLAIR section appeared (previously it never did for this cap). Set Mode → Wall via the real dropdown. Envelope readout: `Starts at / Opens to: 4 → 76 wall units`. A full-range live stroke (screenshotted) shows Pink Dot Fat's own dabbed/dotted identity clearly visible near the thin start, opening into a soft, translucent, continuous mass — never a Track Marks rail look.
- **New York Fat, selected via the real cap picker**: FLAIR section appeared with its own distinct envelope: `Starts at / Opens to: 3 → 58 wall units`. A full-range live stroke (screenshotted) shows a thin-to-wide taper through New York Fat's own line/concentric-pass rendering, softening and lightening as it widens.
- **Density/bloom coupling, pixel-measured on both live strokes** (red-channel intensity, 300px scan width):
  - Pink Dot Fat: `spanWidth` 14→15→23→30→40→55→94 px; `denseCoreFraction` (solid/opaque cross-section) 0.71→0.80→0.83→0.83→0.80→0.25→0.20.
  - New York Fat: `spanWidth` 8→11→17→25→29→28 px; `denseCoreFraction` 0.75→0.82→0.53→0.60→0.21→0→0.
  - Both confirm the same coupled response verified for Track Marks in V0.8.6/V0.8.7 now genuinely reaches both real caps through their own distinct render paths.
- **Flair OFF regression, both caps, via the real Mode dropdown set back to Off**: Pink Dot Fat and New York Fat both screenshotted painting their exact known pre-Flair canonical look — uniform width, no taper, normal density. No code path difference from before this pass for the off state.
- **Track Marks confirmed inert**: selected via Brush Studio's own internal cap list (the only place it remains clickable — it still has no toolbar cap-picker button). Its panel now shows NO FLAIR section at all — goes straight from the preview canvas to SHAPE/PAINT, satisfying requirement 8 ("expose Flair controls only where reachable") in the other direction: it is removed from the one place it never should have been reachable at all.

## Runtime Path Summary

| | Pink Dot Fat | New York Fat |
|---|---|---|
| `isFlairEligibleCap` | `true` | `true` |
| `depositionShape` | `"plume"` (dual-plume/stochastic) | `"line"` (generic concentric-pass) |
| Flair min/max (Wall) | 4 → 76 wall units | 3 → 58 wall units |
| Start position default | `"min"` (thin) | `"min"` (thin) |
| Output/density coupling | Yes — `applyFlairOutputToPoint` + `applyFlairDensityToCap`, both gated by `isFlairEligibleCap` | Yes — same functions, same gate |
| Renders through Track Marks' code | No — own `SprayCapPreset`, own `depositionShape` branch | No — own `SprayCapPreset`, own `depositionShape` branch |

## Tests

601/601 passing. Every test previously exercising `"track-marks"` as the ACTIVE Flair path was rewritten to use `"pink-dot-fat"` (and, where the brief specifically calls for proving both real caps are wired, `"new-york-fat"` too) — `FlairCurves.test.ts`, `FlairContinuity.test.ts`, `FlairProperties.test.ts`. Every "other caps are unaffected" test now explicitly includes `track-marks` in its ineligible-cap list, locking in that it stays byte-identical going forward. Two tests that exercised leak-isolation between two DIFFERENT cap ids (`per-brush session modifications do not leak`, `drops an entirely-empty brush entry`) were caught and fixed to use Pink Dot Fat and New York Fat as the two distinct caps, rather than collapsing to the same id, which would have silently stopped testing the thing they were named for.

## Files

Modified: `src/FlairCurves.ts` (`isFlairEligibleCap`, `getFlairCapTier`/`applyFlairOutputToPoint`/`applyFlairDensityToCap` gates), `src/FlairCurves.test.ts` (rewritten for the new eligible set), `src/FlairContinuity.ts` (`resampleFlairSegment` rename, `isFlairEligibleCap` gate), `src/FlairContinuity.test.ts` (rewritten), `src/FlairProperties.test.ts` (rewritten, two leak tests fixed), `src/main.ts` (field/function renames, gate updates), `src/BrushStudio.ts` (`isFlairEligibleCap` gates, dep renames), `src/BrushPreview.ts` (`renderFlairPreview` rename).

No changes to `SprayCapPresets.ts`, `SprayCapProfile.ts`, `SprayBrushEngine.ts`, `index.html`, or any cap's own canonical physics.

## Commit

(pending — see next commit)
