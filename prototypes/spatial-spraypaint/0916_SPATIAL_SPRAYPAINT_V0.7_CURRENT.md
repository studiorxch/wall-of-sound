# Spatial Spraypaint V0.7 Current Status

Date: 2026-09-16

Status: COMPLETE — Tool Taxonomy + Flair Classification pass. Classification, naming, parameter grouping, and schema only. No spray geometry, deposition math, Pink Dot rendering, Track Marks rendering, drip physics, or cap behavior changed. Full automated suite, TypeScript, and production build pass; production bundle hash (`index-euWLlZNh.js`) is byte-identical to V0.6.4, confirming the new module is pure schema and enters no runtime import path.

Baseline: V0.6.4 commit `4a8fe34` (Pink Dot cleanup + distance flare V1).

## Purpose

Before further Pink Dot rendering work, formalize the tool system: define the three tool families the product is organizing around, define Flair as a reusable expressive layer distinct from any cap or medium, define surface context as routing metadata, define parameter groups for future pro controls, and seed the future Ink/Gonzo family's names without building a renderer for it.

## New Module: `ToolTaxonomy.ts`

A pure classification/schema module — no other file imports from it yet, and it imports only read-only data from `SprayCapPresets.ts` and `SprayCapCalibrationStatus.ts`. Deliberately named to avoid colliding with two other pre-existing "family" concepts in this codebase: `SprayCapPreset.family` (physical form factor — fat/thin/specialty) and `DrawingToolDefinition.family` (renderer engine — aerosol/marker). The new `ToolFamilyId` is a third, orthogonal axis: what authenticity claim a tool makes.

**A. Physical Graffiti** (`ToolFamilyId: "physical-graffiti"`) — real-cap-inspired tools. Registry members: New York Fat, Pink Dot Fat, Astro Fat, German/Hardcore Fat, Lego Thin, Universal Thin, Level 1/Skinny Cream, New York Thin, Oval Calligraphy, Rectangular Transversal, Needle, Soft/Fade. (The brief's own initial-member list also named Pocket, Pro Cap, and Flame Super Fine as future Physical Graffiti members — these are not yet registry entries and were not invented here; only caps already in `SPRAY_CAP_PRESETS` are classified.)

**B. Experimental / Creative Caps** (`"experimental-creative"`) — StudioRich-native/effect caps, never presented as simulations of a real commercial cap. Registry members: Track Marks, Fuzz Fat, Ring/Donut, Dry/Streak, Wiggly Needle.

**C. Ink / Gonzo / Expressive Drawing** (`"ink-gonzo-expressive"`) — seed names only, per the brief: Scratch Pen, Savage Brush, Splatter Nib, Gonzo Letterer (`INK_GONZO_PRESET_SEEDS`). Each carries `status: "seed-name-only"` and is deliberately **not** a `SprayCapId` member, not added to `SPRAY_CAP_PRESETS`, and not resolvable through `getSprayCapPreset` (a dedicated test proves `getSprayCapPreset(seedId)` always falls back to the default cap rather than matching). No renderer, engine field, or UI entry was built for this family.

**Correctness invariant, tested:** every cap already classified `DIGITAL_EFFECT` in `SprayCapCalibrationStatus.ts` is `experimental-creative` here, and no `physical-graffiti` cap is `DIGITAL_EFFECT` — the two independent hand-maintained registries agree everywhere they overlap, so effect caps can't silently read as physical.

## Flair (`FlairModeId`)

Not a cap, not a medium — an expressive modulation layer between input and canonical tool state. Four modes defined with name/description/classification: `off` (neutral, no modulation beyond the tool's normal behavior), `wall` (physical — stronger distance-to-surface relationship, broader flare envelope, slower transitions; the intended home for hand-tracking or the existing mouse Z-distance simulation from the prior Flare V1 build), `blackbook` (physical — tighter envelope, quicker response, more controlled calligraphic behavior), `wild` (explicitly `expressive-digital`, never physical — permits exaggerated thick/thin transitions beyond realistic spray-can behavior). Schema only: no control reads or writes a `FlairModeId` anywhere yet, and the existing Flare V1 Alt+drag Z-control is unaffected and untouched.

## Surface Context (`SurfaceContextId`)

`wall` / `blackbook` / `neutral`, documented explicitly as metadata/routing authority only — does not hard-code any screen-position-to-distance mapping and does not touch cap physics.

## Canonical Architecture (documented, not wired)

```text
Input
→ Surface Context
→ Flair / Expressive Mapping
→ Canonical Tool State
→ Tool / Cap Renderer
```

`CanonicalSprayState` (`x, y, distance, angle, output, velocity, dwell`) is defined as the target shape a cap renderer should eventually receive, so that no renderer ever needs to know whether input came from mouse, Pencil, hand tracking, or future hardware. Schema/documentation only — `SprayBrushEngine.ts` and `main.ts` do not construct or consume this type, and nothing about the existing input→render path changed.

## Parameter Groups

Metadata-only groupings for future pro controls, over existing fields — no new engine state, no new UI. `SPRAY_PARAMETER_GROUPS`: Size, Coverage, Flair, Texture, Drip. `INK_PARAMETER_GROUPS`: Nib Width, Dryness, Jitter, Splatter, Taper (all explicitly noted as "not yet wired to any renderer," since the Ink/Gonzo engine doesn't exist).

## Tests

19 new focused tests in `ToolTaxonomy.test.ts`, plus the full existing 454-test suite, all passing (473 total): existing `SprayCapId` list and order unchanged; every id classified exactly once; `getSprayCapPreset` still resolves every existing id to its unchanged preset (with explicit spot-checks on Pink Dot Fat's `coreOpacity`/`plumeStochasticStationary` and Track Marks' `plumeStochasticStationary`, the two fields most recently touched); Track Marks classified `experimental-creative`; Pink Dot Fat classified `physical-graffiti` + `NEEDS_CALIBRATION` (never `DIGITAL_EFFECT`); every known digital-effect cap classified `experimental-creative` and the reverse-consistency check across both registries; every Ink/Gonzo seed id is disjoint from `SprayCapId` and safely falls back through `getSprayCapPreset`; Flair mode and Surface Context enums cover exactly their four/three defined values with correct classifications; parameter group keys match the brief's named groups exactly.

## Scope Discipline

Per the brief's explicit "Do not" list — none of the following changed in this pass: Pink Dot retuning, Track Marks rendering, `SprayBrushEngine` geometry, drip behavior, cap dimensions, Fill behavior, Pencil support, Hand support, toolbar redesign, or any existing persistent `SprayCapId`/`MarkerVariantId` value. No structural blocker was hit — the existing `SprayCapPreset.family`/calibration-status split already left a clean seam for a third orthogonal classification axis to sit beside them without touching either.

## Files

New: `src/ToolTaxonomy.ts`, `src/ToolTaxonomy.test.ts`. No other files touched.

## Commit

`4d5c47c` — "feat: Spatial Spraypaint tool taxonomy — Physical Graffiti / Experimental Creative / Ink Gonzo Expressive families, Flair modes, surface context, parameter groups"
