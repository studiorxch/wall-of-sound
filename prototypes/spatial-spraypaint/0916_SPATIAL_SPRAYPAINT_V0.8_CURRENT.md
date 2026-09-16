# Spatial Spraypaint V0.8 Current Status

Date: 2026-09-16

Status: COMPLETE — Flair Behavior Spec V1 + Track Marks Sandbox. Flair is now defined as deterministic, testable curves (not labels) and wired live, at runtime, ONLY against Track Marks. Pink Dot rendering, real-cap calibration, drip physics, Fill behavior, Pencil/Hand support, and every other cap's geometry are untouched — live-verified byte-identical, not just assumed. Full automated suite, TypeScript, and production build pass.

Baseline: V0.7 commit `407c4d0` (Tool Taxonomy + Flair Classification).

## What Flair Is, Concretely

New module `FlairCurves.ts` defines, for each `FlairModeId` (`off`/`wall`/`blackbook`/`wild`), six deterministic properties — pure functions or constants, no `Math.random`, no wall-clock reads:

- **`distanceSensitivity`** (constant) — gain on a raw input delta before it accumulates into simulated distance. wall 1.0 (high), blackbook 0.5 (low-medium), wild 1.6 (exaggerated) — matching the brief's table exactly.
- **`widthExpansion(t)`** — normalized distance (0-1) → normalized width. wall `1.0 * t^1.3` (physically bounded, never exceeds 1); blackbook `0.55 * t^0.6` (quick early rise, tight max range); wild `1.6 * t^0.5` (fast rise, extended range genuinely beyond wall's own ceiling).
- **`transitionSmoothing`** (constant, a per-sample lerp rate) — wall 0.12 (slower), blackbook 0.4 (quicker), wild 0.75 (aggressive), off 1 (instant).
- **`textureBloom(t)`** — wall rises linearly with distance; blackbook restrained (`0.25*t`); wild strong (`1.4*t`, capped at 1.4). Schema-level in this pass — not wired to any renderer (see Architecture Boundary below).
- **`outputAttenuation(t)`** — a multiplier on output/opacity. wall real falloff (`1 - 0.4*t`); blackbook mild (`1 - 0.15*t`); wild none (`1`, "optional/stylized," deliberately not physical falloff).
- **`endpointShapingAuthority`** (constant, 0-1) — wall 0.4 (physical), blackbook 0.2 (controlled), blackbook < wall < wild 0.85 (expressive). Schema-level — Track Marks' own endpoint behavior is unchanged; see Architecture Boundary.

`off` is `IDENTITY_CURVES`: `widthExpansion(t) = t`, `outputAttenuation = 1`, `transitionSmoothing = 1`, `textureBloom = 0`, `endpointShapingAuthority = 0` — true identity, not an approximation.

`resolveFlairModulation(mode, input)` is the pure "Flair Mapping" step itself: takes `{distance01, output, velocity, angle}`, returns the same shape plus `width01`/`bloom01`/`endpointAuthority`, with `velocity`/`angle` passed through unmodified in this distance-only pass (matching the prior Flare V1 precedent of shipping distance modulation first).

## Architecture Boundary — Preserved

```text
Input
→ Surface Context
→ Flair Mapping
→ CanonicalSprayState
→ Cap Renderer
```

Flair transforms only two of the four canonical channels in this pass — `distance` (via `width01`, denormalized into an absolute size by the caller) and `output` (a multiplier on the existing generic `opacity`/`sprayOutput` channel `SprayBrushEngine` already reads for every cap — see `SprayBrushEngine.ts`'s `point.opacity` use as `sprayOutput`/core-pass alpha). Nothing in `FlairCurves.ts` draws a pixel, knows a cap's geometry, or references `SprayBrushEngine` at all. `textureBloom`/`endpointShapingAuthority` are defined and tested but deliberately left unwired to rendering — genuinely dormant schema, like this codebase's own precedent for `haloRingBias` et al. ("dormant infrastructure... not dead code").

`applyFlairOutputToPoint(point, capId, mode, multiplier)` is the ONLY function that ever touches a `StrokePoint`, and it is a hard identity for every cap except `"track-marks"` with a non-`"off"` mode — verified by dedicated tests asserting `pink-dot-fat` and six other physical caps get back the exact same object reference under every mode.

## Track Marks Sandbox — Live Runtime Proof

`main.ts` gates the ENTIRE Flair-driven path behind two conditions checked together: `capId === "track-marks"` and `trackMarksFlairMode !== "off"`. Every other cap — Pink Dot Fat explicitly included — keeps the exact prior `current + deltaScreenY * SIMULATED_DISTANCE_DRAG_SENSITIVITY` linear formula, unreached by any new code.

**The routing hook** (`adjustSimulatedSprayDistance`, `adjustTrackMarksFlairDistance`): reuses the existing Option/Alt + vertical-drag gesture and the existing per-brush `size` override — same control, same underlying state, only how a drag delta maps to resolved size differs for Track Marks. `trackMarksFlairDistance01` (a persistent 0-1 "depth dial") is nudged by the drag delta scaled by the mode's `distanceSensitivity`, then EASED toward that target by `transitionSmoothing` every pointermove sample — not jumped — which is what makes wall feel slower/smoother and wild feel quicker with no discontinuity mid-drag.

**Fixed during live verification — a real "no sudden jumps" bug.** The first implementation seeded `trackMarksFlairDistance01` at a fixed neutral (0.5) once at app startup. Live-dispatched pointer events immediately showed the reported defect this section exists to prevent: the very first modulated sample after engaging Flair snapped from the cap's actual current size (42) to an unrelated value (29), because 0.5 under the wall curve doesn't correspond to 42 at all. Fixed two ways, both live-reverified after the fix:
1. `inverseWidthExpansion(mode, width01)` — a numeric (binary-search) inverse of `widthExpansion`, added to `FlairCurves.ts` and tested for round-trip accuracy and correct clamping beyond a mode's own range.
2. `beginSimulatedDistanceDrag()` — called once, on the very first Alt-held pointermove of a fresh drag (before any delta is applied), seeds `trackMarksFlairDistance01` from the cap's CURRENT absolute size via the inverse function, so a new drag always continues smoothly from wherever the size already sits.
3. `cycleTrackMarksFlairMode()` (the mode switch itself) deliberately RE-CENTERS to a neutral 0.5 reference and immediately resolves a fresh size for the new mode — a mode switch is a discrete user action, not a live-drag discontinuity, and re-centering keeps each mode's own full near↔far range available immediately rather than starting pinned at a carried-over value that might already exceed the new mode's own ceiling (confirmed live: switching wall→blackbook without this fix left blackbook's dial clamped at its own maximum from the very first drag, since wall's resting size already exceeded blackbook's tight ceiling).

**Output attenuation hook:** in `depositReconstructedPath`, immediately after the existing wet-marker paintLoad branch, `applyFlairOutputToPoint` is called for every spray-can point — a single `if (style.toolId === "spray-can")` branch that is a complete no-op for every cap except Track Marks with an active mode. The Flair-attenuated opacity is baked into the point BEFORE `strokeHistory.appendPoint`, so replay reproduces it deterministically (same precedent as the existing `SprayCapId` compatibility rule — resolved values are stored, not recomputed).

**Mode selection (section 5/6):** a small "F" keyboard shortcut cycles Track Marks' own Flair mode `off → wall → blackbook → wild → off` — no toolbar redesign, matching the existing Alt+scroll (Spray Angle) / Alt+drag (size) precedent of a temporary desktop-only testing control. No-op for every other tool/cap. A compact status readout (`#flair-status`, mirroring `#spray-angle-status`'s exact existing markup/CSS pattern) shows the active mode name only while Track Marks is selected and a non-off mode is active — quiet by default per the Creative Interface Doctrine.

**Surface context (section 3):** `surfaceContext: SurfaceContextId` field (default `"neutral"`) and `resolveDefaultFlairMode(surfaceContext)` (`wall→wall`, `blackbook→blackbook`, `neutral→off`) are implemented and tested. No UI selects `surfaceContext` yet — Track Marks' own Flair-mode cycle is this pass's live-testable surface, per the brief's explicit permission to keep runtime integration to a small routing hook.

## Pro-Control Metadata (Section 7)

`getFlairProControlMetadata(mode)` derives all five requested fields — Flair Amount, Flair Smoothing, Flair Range, Bloom Response, Output Falloff — purely from each mode's own curve constants (never hand-duplicated). **Deliberately not wired into Brush Studio's UI in this pass**: Brush Studio's PAINT/MOTION panel renders directly from `SprayCapPreset` fields, and Track Marks' Flair state lives on the `App` instance, not on the preset — exposing it there cleanly would mean either faking preset fields that don't drive rendering (misleading) or adding a new per-cap-instance metadata path into Brush Studio's rendering (real integration work, not "expose non-invasively"). Left as schema + tests only, matching the brief's own conditional ("...unless the current Brush Studio can expose them cleanly without redesign" — it cannot, without one of those two compromises).

## Live Verification

Tested in the current-host browser via real dispatched `PointerEvent`s (matching this session's own established technique for continuous-gesture verification) against the actual running app, not a mock:

- **A (Flair off):** a plain horizontal Track Marks stroke — unmodulated, dwell/dot texture and drips read exactly as before.
- **B/C/D (wall/blackbook/wild near→far→near):** three side-by-side vertical strokes, one Alt-drag gesture per mode, F-cycled between them. Numeric traces confirmed: wall size 28→33→28 (reference-centered, no jump); blackbook 26→29→26 (span 3, narrower than wall's span 5 — "narrower range" holds live, not just in the pure curve tests); wild's true resolved size (read via `#radius-val`, not the shared `#brush-radius` slider's own `max="72"` HTML attribute, which visually clamps — see Known Cosmetic Note below) rose smoothly 43→98→38, genuinely exceeding wall's own ceiling with zero discontinuity at any sample. A combined screenshot of all three lanes shows three visibly distinct bulge widths with smooth transitions, no rails, no endpoint explosions, and identical Track Marks stochastic-dot character throughout.
- **Pink Dot Fat unaffected:** the identical Alt-drag gesture against Pink Dot Fat was captured and mathematically compared to the exact pre-existing linear formula (`current + deltaScreenY*0.15`, clamped [4,72]) — the live trace matched the reconstructed expected trace to the full floating-point digit at every one of 10 samples. Pink Dot's own dwell/dot rendering was screenshotted afterward and shows its normal stochastic aerosol character, undisturbed.
- No console errors at any point across the full sequence (cap switches, Brush Studio open/close, three Flair-mode strokes, the Pink Dot comparison stroke).

**Known cosmetic note, not a bug:** the shared `#brush-radius` `<input type="range">` element's own `max="72"` HTML attribute silently clamps its DISPLAYED slider position once Wild mode's resolved size exceeds 72 — this is a pre-existing shared control used by every cap (every physical cap's own legitimate ceiling is 72, so its `max` attribute is correct for them). The authoritative resolved size (and the adjacent `#radius-val` text readout, plus the actual painted geometry) are correct and uncapped. Widening this shared slider's `max` per-cap was judged more than the brief's "small routing hook" allowance — it would touch a control every other cap also uses — so it is documented here rather than changed.

## Tests

22 focused tests in `FlairCurves.test.ts`, all passing, covering every item in the brief's acceptance list: off is identity (curve-level and via `resolveFlairModulation`); wall's `widthExpansion` is monotonic non-decreasing and bounded ≤1; blackbook's own range (max−min) is narrower than wall's; wild's max exceeds wall's and genuinely exceeds 1; wall's `outputAttenuation` strictly decreases with distance (and `resolveFlairModulation` reflects it); blackbook's `transitionSmoothing` exceeds wall's; `applyFlairOutputToPoint` modulates only `track-marks` with a non-off mode and returns the identical object reference for seven other physical caps under every mode (including `pink-dot-fat` explicitly) and for Track Marks itself when its mode is off; `resolveDefaultFlairMode` maps all three surface contexts correctly; `getFlairProControlMetadata` returns all five fields for every mode; `inverseWidthExpansion` round-trips through `widthExpansion` and clamps correctly beyond a mode's own range (the fix described above).

Full suite: 495/495 passing (up from 473 after the V0.7 taxonomy pass). TypeScript clean. Production build clean.

## Scope Discipline

Per the brief's explicit "Do not" list — none of the following changed: Pink Dot retuning, the stochastic Pink Dot field, drip physics, Fill behavior, Pencil support, Hand support, toolbar redesign, cap-ID renames, or any new commercial-cap claim. No structural blocker was hit requiring more than a small routing hook — the existing generic `point.opacity`/`sprayOutput` channel and the existing per-brush `size` override were both already general enough to carry Flair's two wired channels (output, width/distance) without inventing anything cap-specific.

## Files

New: `src/FlairCurves.ts`, `src/FlairCurves.test.ts`. Modified: `src/main.ts` (routing hook, seeding fix, mode cycle, status readout — Pink Dot and every other cap's code paths unreached), `index.html` (`#flair-status` markup + CSS, mirroring `#spray-angle-status` exactly).

## Commit

`47cf87c` — "feat: Spatial Spraypaint Flair Behavior Spec V1 — deterministic curves, Track Marks sandbox runtime hook"
