# Spatial Spraypaint V0.6.3 Current Status

Date: 2026-09-14

Status: PARTIAL — the V0.6.2 tool-contact/cursor work and the V0.6.3 continuous wet-run, contextual Flow/Viscosity, complete manufacturer palettes, Drip Mop fidelity, and Clean Chisel work are implemented. Mop drip attachment and Clear behavior are stable. The full automated suite, TypeScript, production build, and available current-host Physical/browser workflows pass. Physical Hand behavior remains a MacBook gate.

Baseline: V0.6.1 commit `59e909e46455f41e4a9627698c5541feab951c15`, with the approved uncommitted V0.6.2 working state treated as the V0.6.3 starting point.

## Preserved Architecture And Scope

The authoritative mark path remains:

```text
Physical or Hand input
→ selected Tool
→ shared canonical Wall-space stroke
→ selected Tool renderer
→ Wall
```

For wet tools the renderer now delegates material state through:

```text
Mop / Drip Mop contact body
→ deterministic wet reservoir / paint load
→ contextual Flow + Viscosity authority
→ drip trigger authority
→ connected gravity run
```

Pan, edge motion, view transforms, history, recording, and input selection remain outside Tool material authority. Spray deposition is unchanged. Performer segmentation remains preserved in isolated modules with no primary runtime entry point.

No Tool family, Waveformer, surface material, shell redesign, Spray-plume calibration, or performer rendering was added.

## V0.6.2 Contact And Cursor Foundation Preserved

- Mop and Drip Mop use a circular reservoir/contact footprint at their initial point and every deposited endpoint, producing rounded starts, ends, and joined wet bodies while retaining edge streaks and paint load.
- Chisel uses bounded, sorted continuity polygons and does not allow a zero-motion seed to establish a false movement direction. The first real segment owns its start geometry, eliminating the reproduced triangular/splintered start artifact while preserving movement-derived broad/narrow response and intentional corners.
- Clean Chisel is an additional contextual Marker/Nib variant, not a new Tool. It retains movement-derived chisel geometry while using a fuller narrow edge, more restrained direction response, and a finite rounded contact cap for cleaner, less-frayed endpoints. The original Chisel remains available.
- One `DrawingCursor` authority serves Physical and Hand input. It resolves from selected Tool, Cap/Nib, current size, orientation, and Wall zoom.
- Spray cursor coverage is derived from `SprayCapProfile.cursorFootprint`, which remains layered over the existing canonical Cap deposition preset rather than duplicating Spray authority.
- Round, Mop, and Drip Mop cursors are circular contact previews. Chisel uses the renderer's nib-angle constant and aspect. Drips are not predicted in the cursor.
- Cursor dimensions scale in exact proportion to Wall zoom at 25%, 50%, 100%, 200%, and 400%.
- The cursor is a DOM-only overlay outside the persistent paint canvas and final composite, so it is neither painted nor recorded.

## Hand Responsiveness Investigation

The measured code path showed two smoothing stages after MediaPipe results: the Hand tracker applied the established 65/35 coordinate filter, then canonical deposition passed through `StrokeSmoother` and `AdaptiveCurveReconstructor`. The old Hand cursor consumed the first filtered coordinate, even though it was updated directly from the MediaPipe callback and was not waiting for the render loop.

V0.6.3 preserves the reliability and deposited-mark path but separates its outputs:

```text
latest valid mirrored fingertip → raw/recent AIM CURSOR
65/35 retained tracker filter → stroke smoothing/reconstruction → DEPOSITED STROKE
```

This removes the known application-side cursor filter delay without weakening short-gap protection, tracking-quality evidence, edge-driven motion, Pan authority, or canonical mark stability. Actual end-to-end camera/MediaPipe latency and perceived improvement require the MacBook camera.

## Continuous Wet Runs

The beaded-drip root cause was the progressive renderer depositing independently round-capped, width-changing line segments. Even when adjacent center points met, overlapping round caps and changing radii could read as a dotted chain.

Wet runs now use deterministic connected strip geometry:

- every run resolves ordered center/left/right cross-sections along a gravity-positive quadratic path;
- neighboring cross-sections share the same deterministic boundary;
- live growth fills the strip between the previous and current progress values;
- replay fills one continuous swept polygon rather than a sequence of bead-like stroke stamps;
- width tapers continuously from reservoir stem to tip;
- an origin pool attaches the run to the parent wet mark;
- a bounded optional terminal bulb is part of the same run model; and
- legacy non-Mop Spray drips retain their existing restrained line path.

Generated origin, width, length, bend, duration, taper, pool, and terminal-bulb state is stored with canonical history and cloned defensively for deterministic replay, Undo, Clear, and Clear restoration.

The primary visual calibration set for the final fidelity pass is the user-supplied black-door photograph `b4163c1f042d0033ee9bf59faa5f8621.jpg`, the black-on-white `kr-interview-4.jpg`, the white-on-black `Costello5sm.jpg`, and the red prototype screenshot. Together they establish direction rather than literal brand simulation: a smooth round-nib body feeding substantial attached, mostly vertical, long gravity channels. To move toward those references, consecutive wet-contact widths now converge through a bounded deterministic response instead of following every point's load/velocity change immediately. The renderer draws one round start and one round final contact rather than stamping a full disc at every wet sample; intermediate body continuity comes from swept ribbons and bounded joins. Drip Mop stems and retained tips are thicker, taper is less extreme, average and exceptional runs are longer, lateral bend is reduced, origin pools no longer form oversized body knots, and simultaneous channels are more selective. This avoids the red example's lumpy stitched body and thin antenna/tentacle silhouettes without changing Spray.

## Mop Versus Drip Mop

Mop remains the everyday wet marker: broad round contact, moderate load gain, later threshold, longer cooldown, moderate stem width/length, and occasional meaningful runs.

Drip Mop owns intentionally excessive wet delivery: higher initial/load gain, earlier threshold, faster dwell response, shorter cooldown, wider stems and origin pools, much longer mean/range, occasional extra-long runs, and deterministic multiple origins when load supports them.

Fast movement drains reservoir load. Slow movement and dwell increase it. Gravity remains positive-downward authority; horizontal bend is bounded relative to run length. Other marker variants never enter `WetPaintAccumulator`, and Spray's established `DripAccumulator` parameters were not globally amplified.

## Final Marker Fidelity Repair

The remaining screenshot defects were traced to four separate construction details and corrected without changing Spray deposition:

- full contact circles at intermediate Mop samples had already been removed; Mop and Drip Mop now also receive a higher curve-corner tolerance and bounded direction response so sparse curved input reconstructs as one fluid band rather than visibly angular ribbon sections;
- wet origins now use per-variant underside offset and contact-span authority, keeping their pools below and within the parent mark instead of creating a small top/side extrusion;
- progressive connected-run sections now use one stable opacity, preventing darker/lighter seams from reading as dashed internal construction where sections or runs overlap; and
- Drip Mop retains its improved width, opacity, long-run range, restrained bend, and less-extreme taper.

Clean Chisel is unchanged. A separate `Drippy Chisel` contextual variant reuses its clean movement-derived chisel geometry while entering the same `WetPaintAccumulator` authority. Its load, threshold, width, length, and cooldown profile is deliberately restrained below Drip Mop. It remains a Paint Marker variant rather than a new Tool family.

Marker-family size is now discrete and repeatable. `MarkerWidthPresets` owns XS/S/M/L/XL wall-unit values independently for Round, Chisel, Clean Chisel, Drippy Chisel, Mop, and Drip Mop. The chosen width is retained per variant, recorded in canonical stroke metadata, and resolved through the same renderer geometry used by the cursor. The continuous Settings size slider is now Spray-only and hidden for Paint Marker; the compact Marker/Nib chooser owns marker widths.

## Contextual Flow And Viscosity Authority

`WetPaintControls` supplies a small physically named data authority:

- **Flow** maps to paint delivery, dwell buildup, trigger threshold, and run width.
- **Viscosity** maps to trigger resistance, stem width, run length, and gravity/fall duration.

The controls appear only inside the existing Marker/Nib chooser when Mop or Drip Mop is selected. Defaults are Balanced / Balanced. This keeps the persistent shell unchanged and prevents wet calibration from affecting Spray, Round, Chisel, Wall view, or history.

Direct threshold, length, width, and dwell knobs are not separately exposed in V0.6.3; their authority is already represented by the two compact physical controls and can be extended later without a second wet model.

## Mop Geometry Layer Separation

The final failure-reference pass corrected the architectural source of the bone/spiky body, circular drip nodes, and repeated run bands without changing Spray or Chisel:

- Mop and Drip Mop base marks are now one constant-width round-nib tube. Preset size and Mop variant determine base width; reservoir load and travel speed do not modify that base geometry.
- Each base stroke has one round start cap, continuous filled ribbon segments, bounded round joins, and one round end cap. Ordinary travel no longer receives wet edge streaks or repeated wet stamps.
- Wet contact is a separate overlay. Only stationary high-load contact can add a small local swelling; drip-origin swelling is owned by the drip geometry rather than the base tube.
- Mop drip origins are a flared first section of the connected gravity strip, not a circular pool stamp. The flare narrows smoothly into the stem while remaining attached inside the stroke edge.
- Growing Mop drips are redrawn as one continuous transient strip on a dedicated overlay canvas, then committed once when complete. This prevents frame-by-frame translucent strip edges from accumulating as periodic horizontal bands while keeping the final composite recordable.
- A deterministic gradient begins at opaque stroke color and eases into the configured drip opacity. Existing rounded terminal bulbs and occasional stored kinks remain intact.
- Drippy Chisel retains its previously verified attached origin behavior unchanged. Width presets, mixed-tool history, Undo/Clear restoration, Physical/Hand routing, navigation, recording, and Spray deposition also remain unchanged.

## Calibration Color Palette

The Color button remains the sole compact entry point. Its temporary popover now contains:

- canonical current palette and current color state;
- StudioRich's existing 11 prototype swatches;
- the complete supplied 256-entry Montana Gold manufacturer palette;
- the complete supplied 257-entry BLACK 400ML manufacturer palette;
- a current-color indicator; and
- up to six recent, deduplicated colors.

Palette switching changes only palette state; it preserves current Tool, current Color, view, and history. Supplied manufacturer labels, codes, duplicate values, and aliases remain distinct entries. Color remains stored per canonical stroke, so mixed-color wet marks replay and restore exactly.

The canonical extracted manufacturer data is tracked inside the Spatial Spraypaint prototype. Runtime does not depend on private WOS-share files. Manufacturer palette integration is stable and should remain untouched for now.

## Spray Cap Identity Compatibility Rule

Each canonical stroke stores its Spray cap as a `SprayCapId` string (`ToolStrokeStyle.variantId`), not a snapshot of the numeric preset. Replay, pan, zoom, and Undo all re-resolve `getSprayCapProfile(variantId)` live against whatever preset data currently exists for that ID. There is currently no artwork persistence (no localStorage, save, or export), so this has no live effect today, but the moment persistence/export/Surface-ID attachment exists, this becomes load-bearing.

**Standing rule:** once artwork persistence/save/export exists, rendering behavior referenced by a canonical cap ID must never be silently mutated in place. A behavior change forks or versions the ID (or uses explicit migration/alias logic) rather than redefining an existing ID's numbers underneath already-referenced artwork. `LEGACY_CAP_ALIASES` in `SprayCapPresets.ts` is the existing mechanism for keeping old short-hand IDs pointed at the correct canonical entry through a rename.

First application of this rule: the pre-calibration `german-fat` preset's fuzzy/hairy/dry-brush digital behavior was forked verbatim into a new permanent `fuzz-fat` ("Fuzz Fat") specialty/effect cap before any physical recalibration of `german-fat` toward the real German/Hardcore Fat cap. `german-fat`'s numbers remain free to be recalibrated later without disturbing `fuzz-fat`.

This rule applies identically to `MarkerVariantId`. The V0.6 preset-browser pass relabeled all six existing marker variants for display (e.g. `chisel` now shows as "Chisel · Classic", `mop` as "Mop · Balanced") without touching any `MarkerVariantId` value, `MARKER_VARIANTS[...].id`, or render geometry — a pure presentation change, safe under this rule because the id a canonical stroke stores never changed. Any future rename that needs to change an id itself (not just its label) must follow the same fork-or-alias discipline already established for Spray caps.

## V0.6 Preset Browser (Spray + Marker)

Both the Spray cap chooser and the Marker/Mop chooser became visual preset browsers: each row now renders a real deterministic preview (via `BrushPreview.ts`, which drives the same `SprayBrushEngine`/`PaintMarkerEngine` used for live drawing against a fixed synthetic stroke — never a hand-drawn fake), grouped under family section headers (Spray: Fat/Thin/Specialty, from the existing `SprayCapPreset.family`; Marker: Round/Chisel/Mop, a new presentation-only grouping of the six existing variant ids). Spray rows also show each cap's existing `nominalWidthRange` labeled explicitly as "digital baseline" — no physical (cm/inch) calibration data exists anywhere in this repo to show instead, so none was fabricated; the metadata is purely descriptive and is never read by `resolveSprayDynamics`, which only ever consumes `deposition.baseRadius`.

**Deliberately deferred, not attempted:** the deeper ask of making every Marker preset (not just `drippy-chisel`/`mop`/`drip-mop`) capable of wet accumulation and dripping via shared Flow/Accumulation/Hardness/Drip-tendency dimensions. The engine currently gates this in two separate hardcoded places — `isWetMarkerVariant` in `WetPaintModel.ts`, and the mop-only check inside `PaintMarkerEngine.renderWetContactOverlay`/`renderSegment` — and generalizing both together, for presets (`round`, `chisel`, `clean-chisel`) that have never been wet, needs dedicated before/after visual verification beyond what one pass can responsibly cover alongside the physically-verified-Mop freeze. Left as its own future bounded step.

**Also deferred:** Spray drips from over-accumulation/dwell. Current Spray deposition is pointermove-driven only (no continuous emission while the pointer is stationary), so there is no dwell signal to threshold against yet — the same prerequisite gap identified in the prior UI-friction audit. Not hacked around.

## V0.6 Visual Calibration Pass (Against Real Reference Photos)

Audited against two supplied real-world graffiti photos (a bubble throwie, a red/white handstyle) rather than assumption. Confirmed Fuzz Fat and German/Hardcore Fat unaffected (verified — no diff to their preset entries).

**Fixed — Calligraphy/Transversal directional width.** `SprayCapProfile.orientationBehavior: "fixed-transversal"` was declared for this cap but never wired to core-stroke width — the cap only ever thinned uniformly regardless of stroke direction, unlike a real transversal nozzle. `SprayBrushEngine.ts` now varies the core line width by the angle between travel direction and a fixed `TRANSVERSAL_AXIS_ANGLE` (matching the Marker Chisel's own nib angle for one shared StudioRich convention), so a calligraphy stroke now reads visibly wide or thin depending on direction, not just uniformly thin. Gated on `anisotropy < 1`, which today is true only for `calligraphy` — every other cap (including Fuzz Fat and German-Fat) is numerically untouched. Overspray's anisotropy remains travel-relative (unchanged) — a known minor inconsistency with the now-fixed core width, left for a future pass since the core line is the dominant visual element.

**Diagnosed and explicitly NOT hacked — throwie-fill pass buildup.** A single continuous fat-cap stroke already reads ~95%+ opaque before a second fill pass ever happens, leaving no visible headroom for "repeated passes build cumulative coverage" the way both reference photos show. Root cause, confirmed mathematically and by two live experiments (a moderate real parameter change, and a calculated aggressive case): the current per-segment alpha-compositing model draws many heavily-overlapping stamps along a single stroke's own path (segment spacing is a fraction of the cap radius), and `1-(1-a)^N` asymptotically saturates near 1.0 for any reasonable per-segment alpha once N is in the dozens — confirmed even at 9% per-segment alpha with 46 segments (≈98.7% final), and even a synthetic 35%-alpha/8-segment case (≈96.8%). Widening deposit spacing enough to leave real headroom would require stamps sparse enough to look visibly gappy/dotted, unacceptable for tag/outline legibility. This is a genuine architecture-level prerequisite — a per-pixel local-saturation ceiling, or a deliberately different "fill mode" deposition cadence separate from "line mode" — not a parameter-tuning problem. A tuning attempt (widened Spray-only deposit spacing + reduced fat-cap `accumulationRate`) was built, tested, found ineffective for the stated goal, and fully reverted rather than shipped as an unverified partial change. Left deferred for its own dedicated pass.

**Audited, no change needed:** thin-cap tag/outline (New York Thin) already reads as a confident, controlled line with appropriately soft aerosol edge and low overspray — matches the target already. Soft/Fade already reads as intended (broad/diffuse) — no changes made. Needle was audited here too and judged acceptable at the time; a later pass (see "Needle Correction + Calligraphy Split (P0)" below) found this judgment wrong on closer visual-audit evidence and corrected it — left here unedited as an honest record of the earlier (superseded) conclusion.

## Throwie Fill Deposition V1 — Resolves The Prior Throwie-Fill Deferral

Implements the previously-deferred per-stroke opacity ceiling, as an explicit opt-in **Fill mode** toggle — not a global Spray change, and not a new cap identity ("a cap is still a cap; Fill describes how it is being used").

**Activation:** a "Fill mode (throwie)" checkbox in the Cap chooser's Spray property controls (`SettingsState.fillModeEnabled`, default off — normal Spray/tag/outline behavior is provably byte-identical whether the field is absent, `false`, or the setting has never been touched). Stored per-stroke in `RecordedStroke`, so replay/Undo/Clear reproduce exactly which strokes were fill-mode.

**Mechanism (spatially-local, corrected — see V1.1 below for why):** `SprayBrushEngine` tracks per-stroke saturation keyed by a coarse grid cell (`fillLocalSaturation: Map<string, number>`, cell size scaled to the cap's own radius; cleared in `beginStroke()`, called from `DrawingToolRenderer.beginStroke` — already invoked once per gesture for both live drawing and replay). While Fill mode is on, every individual draw call (every `corePasses` sub-layer, not just once per segment — corePasses stack on each other too) looks up ITS OWN cell's saturation, computes what its nominal contribution would move that cell's uncapped virtual saturation to, remaps into `[0, FILL_MODE_CORE_CEILING]` (0.45), and solves for the alpha needed to move the canvas exactly there. A brand-new stroke clears the whole map and composites normally on top of the canvas, so separate sweeps still accumulate via completely ordinary compositing — only a single stroke's own internal density, LOCATION BY LOCATION, is capped.

**Live-verified calibration matrix:** one sweep reads clearly translucent/textured; two separate sweeps over the same path are visibly more solid than one; four sweeps more solid still while still showing a graduated, textured core (never flat); a fast back-and-forth throwie-style pass shows visible directional banding/ribbing; a normal outline stroke with Fill mode off stays fully dense, confirming zero leakage into ordinary Spray behavior.

### V1.1 — Spatial Correctness Fix

The first V1 implementation used a single scalar per stroke (not per location) — audited and found to fail exactly as suspected: a long single sweep faded to literally zero alpha by its own far end, painting a fresh never-touched area later in the same continuous gesture got zero coverage (the global scalar had already "spent" its budget on earlier painting elsewhere), and a second traversal of a continuous back-and-forth pass contributed nothing extra (confirmed by dedicated failing tests before any fix was written). Replaced with the grid-cell map described above. Live-verified via synthetic continuous `PointerEvent` sequences (pointerdown → many pointermoves, no pointerup in between) directly on `#composite-canvas`: a true back-and-forth fill with no pointer release shows even density across its full width with no fade-out, and painting a distant untouched region within the same unreleased gesture receives coverage matching the first region, not a starved remainder. Real-time delays between dispatched events were necessary for the test to be representative — synthetic events fired with no delay were coalesced by the app's own interaction throttling in a way that doesn't reflect real drawing.

Deliberately not attempted (still matches "do not overbuild"): true per-pixel resolution (grid cells, not pixels — fine enough for the throwie-fill use case, verified visually), automatic back-and-forth detection, any physical paint simulation.

## Spray Cap Personality + Specialty Cap Correction

Audited against new real-reference photos (Pink Dot / loaded-dot halo bloom, fat-cap dot grids, a Calligraphy/Transversal chisel-nib sketch, a wiggly/oscillating line, tag examples) for whether each cap reads as a recognizable output *personality*, not just a different width.

**Root cause of "still too similar":** two caps (New York Fat, Pink Dot Fat) had genuinely different core/particle numbers but no structurally different DOT PROFILE mechanism — both rendered as the same core-line-plus-speckle model at different sizes, so a loaded-dot bloom couldn't read as distinct from a blurred fat dot. Separately, Calligraphy's core width direction was already fixed (prior pass), but its overspray plume's anisotropic squash still rotated with travel direction (`renderOverspray`'s `angle` parameter was always the travel angle, even for the fixed-transversal cap) — a real, confirmed cause of the reported "rotating ribbon"/"wiggle" impression, independent of the width fix.

**Halo/loaded-dot mechanism (new, minimal):** `SprayCapPreset` gained `haloRadius`/`haloOpacity` (0 for every existing cap). When nonzero, `SprayBrushEngine.renderHalo` draws one `createRadialGradient` bloom (dense center fading to transparent) at each segment's endpoints, beneath the core — a continuous soft field, structurally distinct from overspray's speckled particles. Pink Dot Fat is the only cap given a halo (`haloRadius: 2.4`, `haloOpacity: 0.05`), on top of its already-denser core (`coreDensity`/`coreOpacity` already exceeded New York Fat's). No new dwell/time tracking: a stationary dwell (repeated near-zero-distance segments) strengthens the center purely through ordinary source-over compositing, the same mechanism the rest of the engine already relies on. New York Fat, Astro Fat, German/Hardcore Fat, Soft/Fade, and all thin caps keep `haloRadius: 0` — audited and left alone, since no new reference evidence justified changing their numbers (German/Hardcore Fat in particular stays untouched per the existing Fuzz-Fat-fork rule; no dedicated German-cap reference photo exists yet).

**Calligraphy/Transversal — fixed-axis overspray:** `resolveOverspraySquashAngle(anisotropy, travelAngle)` (exported, pure) now selects `TRANSVERSAL_AXIS_ANGLE` for directional caps (anisotropy < 1) and travel angle otherwise. `renderSegment` passes this resolved angle into `renderOverspray` instead of raw travel angle. Core width behavior (from the prior pass) is unchanged and was re-verified live: travel parallel to the fixed axis reads narrow, travel perpendicular reads wide — real chisel-nib physics. The fix specifically stops the overspray plume from rotating with every turn; a zigzag stroke now reads as one coherent chisel sweep rather than a spinning ribbon. Transversal's own configurable rotation control (section 4 of the brief) was audited and deliberately deferred: it would need a new `SprayCapId` plus a new angle control in the cap chooser, and this pass's UI-shell-preservation constraint made that the wrong scope to add alongside a correctness fix — left as a clearly-bounded next step, not hacked in.

**Wiggly Needle — new specialty identity:** forked verbatim from Needle's deposition numbers (same fork discipline as Fuzz Fat/German Fat), adding only `wiggleAmplitude`/`wiggleFrequency` (both 0 on every other cap, including Needle itself, which is unchanged). `renderSegment` computes a perpendicular lateral offset — `dynamics.radius * cap.wiggleAmplitude`, modulated by `Math.sin(point.timestamp * cap.wiggleFrequency)` — applied only to the drawn path (core line, overspray, halo), never to the velocity/dynamics math, so it reproduces identically on replay (driven by each point's own stored timestamp, not `Math.random`). Live-verified: a straight drag with Needle stays a straight line; the same drag with Wiggly Needle shows a smooth, bounded sine wander. Full audio-modulation (Waveformer mapping wiggle amplitude/frequency to sound) was explicitly not built — the constants are fixed, and this is documented as a future Waveformer target, matching the brief's own instruction not to implement audio modulation yet.

**Soft/Fade, Astro Fat, thin-cap family:** audited, left numerically unchanged — already read as intended per the prior pass, and no new reference evidence in this pass targeted them specifically. Per doctrine, differences were not fabricated without evidence.

**Preview requirement:** `BrushPreview.buildPreviewPoints` now appends a brief real dwell (a few near-zero-distance repeat points) after the existing moving sweep, through the same live engine call used everywhere else — never a separate fake "dot" drawing. This makes halo bloom and wiggle character visible in the cap chooser's small thumbnails, not just in a full-canvas stroke.

Live-verified in the current-host browser: Pink Dot Fat's dwell dot shows a clearly denser center plus a soft surrounding halo ring; New York Fat's dwell dot stays a sharp-edged, even-density disc with no bleed — directly comparable side by side. Calligraphy's zigzag reads as one continuous chisel-like sweep with no rotating-ribbon artifact. Wiggly Needle's drag shows a clean sine wander next to Needle's straight line. Throwie Fill mode was re-verified after these changes (its own cellKey computation now reads from the wiggle-adjusted draw position rather than raw input position, a no-op for every cap except Wiggly Needle): a partially-overlapping back-and-forth fill still shows visibly denser coverage where passes overlap and lighter-but-present coverage in fresh-but-painted territory, with no fade-to-zero.

## Needle Correction + Calligraphy Split (P0)

Fixes the two P0 misrepresentations named by the Spray Cap Visual Audit (`0915_SPRAY_CAP_VISUAL_AUDIT_V0.6.3.md`): Needle read as a fuzzy spray rather than a concentrated jet, and Calligraphy was still fundamentally a round-capped width-modulated line rather than a genuinely shaped nozzle output.

**Needle — root cause corrected, not just narrowed.** `edgeFalloff` is inversely related to pass-to-pass core bloom (`edgeExpansion = 1 + passRatio*(1-edgeFalloff)*0.72`), so Needle's old 0.92 (the highest of any cap) actually gave it one of the *tightest* cores already — the core was never the problem. The actual fuzziness driver was overspray: `particleSpread` 2.05 (the widest of any cap by a large margin) combined with `particleOpacity` 0.3 (the highest) and `particleCount` 15 produced a wide, visible mist cloud around an otherwise hot core. Corrected, using only the fields the brief asked to audit: `particleSpread` 2.05→0.65, `particleOpacity` 0.3→0.16, `particleCount` 15→9, `coreOpacity` 0.42→0.48 (hotter, not weaker), `edgeFalloff` 0.92→0.94 (marginally tighter still), `endpointBehavior` "raw"→"tapered" (no longer sharing Fuzz Fat/German Fat's raw-cap identity). `splatterProbability` (0.24) was deliberately left untouched — with the mist now sparse, its occasional larger fleck reads as an authentic sputter rather than contributing to a fuzzy cloud, matching the brief's "optional sparse sputter only if it helps authenticity." `jitter`, `velocityResponse`, `dripTendency`, `flowRate`, `accumulationRate` are untouched — not in the audited field list and not identified as causes. `wiggleAmplitude` stays 0: normal Needle still does not wiggle.

**Wiggly Needle — re-forked from the corrected Needle.** Every deposition field mirrors the corrected Needle exactly (verified by a test asserting the two render byte-identically at zero travel distance, where no wiggle offset yet applies); only `wiggleAmplitude`/`wiggleFrequency` differ. This was a deliberate re-fork, not an automatic inheritance — the two presets are independent entries in `SPRAY_CAP_PRESETS`, so without this explicit update Wiggly Needle would have silently kept the old fuzzy numbers forever.

**Calligraphy split into two specialty identities, per Part 4/5 of the brief's own suggested strategy.** The existing `calligraphy` id is preserved exactly (no persisted artwork exists yet to protect, so — like german-fat's pre-fork numbers — its rendering mechanism can safely change in place; see the Standing Rule above), redisplayed as **"Oval Calligraphy."** A new, separate canonical id, `transversal-slot` ("Rectangular Transversal"), was added rather than overwriting anything. Both get a new `SprayCapPreset.depositionShape: "line" | "oval" | "slot"` field (`"line"` for all 12 other caps, unchanged behavior).

**True shaped deposition, not another line-width trick.** `SprayBrushEngine` gained `resolveShapedStampGeometry` (pure: cap shape + resolved radius → `{halfLength, halfWidth, rotation, cornerRadius}`, with **no travel-angle input at all** — the shape literally cannot rotate with the stroke because nothing feeds it a travel angle) and a `drawShapedStamp` renderer: `"oval"` draws one native `ctx.ellipse(...)` per stamp; `"slot"` draws a rotated rounded-rectangle path (`translate`+`rotate`+`moveTo`/`lineTo`/`arcTo`). Stamped at both segment endpoints (mirroring `renderHalo`'s existing pattern), tiling into a continuous swept band under the app's existing fine interpolation spacing — the same assumption the old line-stroke path already relied on. The wide/narrow directional response is now a **pure consequence of sweeping a fixed-rotation shape through space** (proven by `shapedStampWidthAlongTravel`, the standard ellipse/rect support-width-in-a-direction formula) rather than a separately-computed line-width multiplier — this replaces, not layers onto, the old `directionalAnisotropy` mechanism for these two caps (which stays exactly as before for every other cap). Fill mode's cellKey now reads the same wiggle-adjusted draw position it already did — no change needed, since neither shaped cap uses wiggle.

**Oval vs. Slot differentiation:** Oval uses `OVAL_STAMP_LENGTH_RATIO`/`WIDTH_RATIO` (1.3/0.55 × resolved radius — aspect ratio ≈2.4); Slot uses more elongated ratios (1.55/0.4 — aspect ratio ≈3.9) plus a softened corner radius, a harder `edgeFalloff` (0.85 vs. Oval's 0.74), slightly lower `jitter` (0.03 vs. 0.04), and a lower `anisotropy` (0.22 vs. 0.32, strengthening its overspray squash too) — "more obvious wide/narrow contrast... reads more like a spray chisel/slot nozzle" per the brief, achieved primarily through shape geometry, not just parameter tuning.

**Live-verified in the current-host browser:** Needle's drag reads as a tight, clean line with minimal visible mist — a clear departure from the old wide fuzzy halo. Wiggly Needle (tested via timed synthetic pointer dispatch, since a single fast automated drag doesn't advance real elapsed time enough for the sine wave's phase to show) reads as a smooth, bounded wave with the same tight, clean character as corrected Needle — not fuzzy. Oval Calligraphy's horizontal/vertical/diagonal/loop matrix shows thin-parallel/thick-perpendicular width response with smooth, rounded, soft-edged loop geometry and zero rotation-with-stroke artifact. Rectangular Transversal's identical matrix shows the same fixed-axis stability but reads flatter and harder-edged, with a visibly more angular/faceted loop outline than Oval's smooth roundness — the intended stronger contrast. Pink Dot Fat's halo and a New York Fat Fill-mode back-and-forth overlap were re-checked and remain unaffected. No console errors throughout.

**Files:** `SprayCapPresets.ts`, `SprayCapProfile.ts`, `SprayBrushEngine.ts`, `index.html`, plus `SprayCapPresets.test.ts`, `SprayCapProfile.test.ts`, `SprayBrushEngine.test.ts`, `BrushPreview.test.ts`, `DrawingCursor.test.ts` (one assertion updated: Needle's cursor no longer inflates past base size now that `particleSpread` is below the `coverageScale` clamp floor — an accurate reflection of its tighter mist, not a regression).

**Still provisional / not claimed as physically verified:** Needle's corrected magnitudes (how tight, how hot) were chosen by screenshot judgment against the supplied references, not measured. Oval vs. Slot's exact aspect-ratio numbers (2.4 vs. 3.9) are likewise judgment calls, not derived from the rectangular-outlet reference photo's actual proportions. Transversal's own configurable rotation control (letting the user pick a different fixed axis, not just Oval-vs-Slot shape) remains unimplemented — still a real specialty concept, still deferred, now carried forward against `transversal-slot` specifically rather than a single combined `calligraphy` id.

## Brush Studio V1

Turns the tall scrolling Mode/Brush popover into the beginning of a professional Brush Studio, addressing the recurring UX defect that tool/brush context disappeared as soon as the user scrolled to reach Size/Coverage/Fill controls.

**Model.** TOOL → BRUSH/PRESET → PROPERTIES, with PRESET DEFAULT → SESSION/USER MODIFICATION → EFFECTIVE VALUE underneath. New pure module `BrushProperties.ts` owns this for Spray: `SprayPropertyOverride` (`size`/`coverage`/`fillMode`), a `SprayOverrideStore` keyed **per brush id** (not global), `resolveEffectiveSprayStyle(preset, override)`, and `resetSprayProperty`/`resetSprayBrush`. `SettingsState.sprayOverrides` replaces the old flat `radiusOverride`/`coverageOverride`/`fillModeEnabled` fields, which applied globally and silently carried over when switching caps — exactly the "changing Fill mutates other brushes" defect this corrects. The existing compact chooser's Size/Coverage/Fill sliders were migrated onto this same store (one override model app-wide, not two).

**Fill mode is now a brush property.** `SprayCapPreset.defaultFillMode: boolean` — every current cap keeps it `false` (byte-identical default behavior; no new cap physics), but the field now exists so a future fill-oriented cap could default it `true` without touching the fill engine. The Throwie Fill deposition algorithm itself (`fillLocalSaturation`, the grid-cell ceiling) is completely untouched — only what a freshly-selected brush's Fill toggle starts at changed.

**Three-region layout** (`#brush-studio-overlay` in `index.html`, opened via a new "Edit Brush →" action at the bottom of the existing compact chooser): TOOL (left, static Spray/Marker buttons, never scrolls) | BRUSHES (middle, independently `overflow-y:auto`, grouped Fat/Thin/Specialty for Spray and Round/Chisel/Mop for Marker, same groups as the compact chooser) | PROPERTIES (right, its own header — brush name, provenance badge, live preview — pinned above an independently-scrolling property list). The compact popover is untouched and remains the fast normal-painting path; Brush Studio is the advanced action.

**Single source of truth.** The compact chooser's three selection handlers (`.tool-choice`/`.cap-choice`/`.marker-choice`) were factored into shared `App` methods (`applyToolSelection`/`applySprayCapSelection`/`applyMarkerSelection`, each taking a `closeChoosers` flag) that both UIs call — Brush Studio can never drift from the live paint selection. Reusing the existing `.tool-choice` class for Brush Studio's own Tool column buttons means they get click-wiring and selected-state sync for free from code that already existed (`bindControls()`'s init-time listener, `updateToolUi()`'s sync loop) — zero new code for "Tool selection remains persistent."

**Live preview.** New `BrushPreview.renderSprayBrushStudioPreview`/`renderMarkerBrushStudioPreview`, still the real `SprayBrushEngine`/`PaintMarkerEngine`, fed a richer deterministic composition (`buildStudioPreviewPoints`: straight segment, steep diagonal, curve, dwell tail — the same shape manually verified live for Oval/Rectangular Transversal's wide/narrow contrast) and the brush's live effective size/coverage/fillMode, so property edits update the preview immediately.

**Property panel V1.** GENERAL (Size, Coverage, Fill mode) is the only genuinely editable surface — sliders/checkbox writing through `sprayOverrides`, with a "modified" dot + inline Reset when a property diverges from its preset default, plus a brush-level "Reset brush". SHAPE/PAINT/MOTION (deposition shape, aspect ratio, core density/opacity, edge falloff, overspray amount/spread, halo radius/opacity, velocity response, wiggle amplitude/frequency) are real-runtime-value **readouts**, not a second stateful override surface — "exposed" means surfaced for transparency, not necessarily made independently editable in this pass, per "do not expose every internal engine constant immediately." Marker exposes Size (writing through the existing per-variant `markerWidths`, unchanged) plus read-only Tip (material, drip tendency); Marker has no override-store or duplication in V1.

**Classification.** New `CustomBrush.ts` module: `BrushProvenance = "physical-reference" | "digital-effect" | "custom-studio-brush"`. Every built-in cap's provenance mirrors the Visual Audit's own "physical vs. digital" field (Fuzz Fat and Wiggly Needle are `digital-effect`; the other 12 are `physical-reference`) — a plain lookup table, not a new field on `SprayCapPreset`, so the closed preset union stays untouched. Custom brush ids always carry a `custom:spray:` prefix, making provenance derivable from the id alone via `classifySprayCapId`.

**Custom brush foundation.** `duplicateSprayBrush(source, name)` shallow-copies a full deposition preset (built-in or already-custom) into a new custom id — never mutates the source, verified by dedicated tests. Wired into Brush Studio's "Duplicate brush…" action (native `window.prompt` for the name — no custom modal built for this V1). Duplicated brushes appear in a trailing "Custom" group in the brush list, are fully live-previewable with their own editable Size/Coverage/Fill, and are renameable (`renameCustomSprayBrush`, not yet wired to a UI control). **Deliberately not done:** painting on the Wall with a custom brush. `DrawingToolSelection.sprayCapId` stays the closed `SprayCapId` union on purpose — widening it, or teaching the render pipeline to resolve a preset object instead of an id lookup, is real integration work with a real risk of silently painting with the wrong cap (`getSprayCapPreset` falls back to New York Fat for any unrecognized id) if rushed. Brush Studio shows an explicit note ("Custom brushes preview live here. Painting with them on the Wall is a follow-up integration step") rather than attempting a shortcut. The custom registry itself (`CustomSprayBrushRegistry`) is session-local, in-memory only — no persistence exists, matching "if persistence architecture is not ready, do not hack local persistence."

**Live-verified in the current-host browser:** opened Brush Studio; the Tool column stayed visible throughout every subsequent action. Switched Fat→Specialty caps (New York Fat, Pink Dot Fat, Oval Calligraphy, Rectangular Transversal, Needle) without closing the editor — Shape group correctly read "oval"/2.36:1 and "slot"/3.88:1 respectively, live preview updated each time. Dragged the Size slider — preview updated immediately, a "modified" dot and per-property Reset appeared, "Reset brush" went from disabled to enabled; Reset restored the default and cleared both indicators. Toggled Fill mode the same way. Scrolled the property list — the brush name/provenance badge and preview canvas stayed fixed while GENERAL scrolled out and PAINT/MOTION scrolled in, with the Tool and Brush columns completely unaffected — the specific defect this build targets, confirmed gone. Switched to Marker: brush list swapped to Round/Chisel/Mop, properties swapped to Size + Tip, Reset/Duplicate correctly disabled. Selected Mop, saw its own wet-material preview and values. Returned to Spray: prior selection (Needle) was still showing, confirming coherent state across tool switches. Duplicated a brush end-to-end (name prompt mocked for automation): a "My Custom Jet" entry appeared in a new Custom group, auto-selected, badge reading "Custom brush," values inherited exactly, the painting-integration note visible. **Found and fixed one real bug during verification:** the Duplicate button stayed disabled after visiting Marker and returning to Spray, because `renderMarkerProperties` disabled it but `renderSprayProperties` never explicitly re-enabled it — fixed before commit. Closed the Studio and confirmed ordinary painting, Pink Dot's halo, and a Fill-mode back-and-forth overlap all still render exactly as before. No console errors at any point.

**Files:** new `BrushProperties.ts`, `BrushStudio.ts`, `CustomBrush.ts` (+ their tests); `SprayCapPresets.ts` (`defaultFillMode` field, all 14 entries `false`); `SettingsState.ts`/`SettingsState.test.ts` (override model replaced); `BrushPreview.ts`/`BrushPreview.test.ts` (studio preview functions); `index.html` (Brush Studio markup + CSS, "Edit Brush" entry point); `main.ts` (shared selection methods, controller wiring).

**What remains deferred, explicitly:** painting-on-Wall integration for custom brushes (see above); custom brush persistence (in-memory only, cleared on reload); Marker brush duplication; Transversal's own configurable-rotation control (still just Oval-vs-Slot shape, not a user-adjustable axis). Ring/Donut and Dry/Streak archetypes — deferred by that pass, now implemented below.

## Ring/Donut + Dry/Streak Output Archetypes

Implements the next two P0 visual-cap items from the Visual Audit's "Unassigned / future output archetypes" list, as StudioRich digital brushes — explicitly **not** physical-cap identities, classified `digital-effect` like Fuzz Fat and Wiggly Needle.

**Ring/Donut — a genuine annular structure.** New `SprayCapPreset.depositionShape: "ring"` and four new fields (`ringRadius`, `ringThickness`, `ringOpacity`, `centerOpacity`). `SprayBrushEngine.resolveRingProfile` (pure) builds a real multi-stop radial-gradient profile — center mist, a near-zero "moat," a raised peak at the ring band, a soft outer-bloom tail to zero — deliberately with `centerOpacity` (0.05) far below `ringOpacity` (0.4), so it reads as hollow rather than a blurred dot with extra halo. Stamped at both segment endpoints inside the existing corePasses loop (same pattern as `renderHalo`/the oval-slot stamps), so a moving stroke tiles into a ringed plume rather than collapsing into a solid fat line. `haloRadius` stays 0 — the ring fields are this cap's halo-equivalent, not a second stacked radial mechanism. No `Math.random` involved in the profile itself (deterministic by construction).

**Dry/Streak — deterministic directional lanes and gaps.** New `depositionShape: "streak"` and one new field, `streakLanes` (5). `SprayBrushEngine.renderStreakCore` replaces the concentric-pass core entirely with parallel lanes spread across the stroke width (perpendicular offset from the current travel angle, so orientation follows the stroke); each lane's visibility is gated by `resolveStreakGate` — a pure function of resolved radius, lane index, and the segment's position **projected onto the current travel angle** (`alongTravel`), with a fixed per-lane phase offset so lanes gap out at different points (the "ribbing") rather than all together. Zero `Math.random` in the gate itself — gaps are pure position-derived trig, so they replay identically and are never confused with Fuzz Fat's random-jitter raggedness. Reuses the exact same Fill-mode ceiling math as every other cap, called once per lane instead of once per pass, so "spatial-local Fill correctness" and "repeated sweeps accumulate" both hold unchanged — live-verified: one Fill-mode sweep stays visibly broken/textured, three back-and-forth passes read denser while the ribbing stays visible (never flattens to solid).

**Defaults.** Both `defaultFillMode: false` — Ring/Donut because dot/dwell personality is the point (per the brief); Dry/Streak because a genuinely dry cap should feel deliberately under-loaded per single stroke, with Fill mode as the explicit opt-in for throwie-style repeated-pass buildup, same as any other cap.

**Distinctness — live-verified.** A four-way stationary-dwell-dot comparison (Ring/Donut, Pink Dot Fat, New York Fat, Soft/Fade) shows Ring/Donut as the only one with a visibly hollow/darker center inside a denser outer band — Pink Dot's dot is solid-filled with an external halo, New York Fat is a flat even disc, Soft/Fade is diffuse with no ring structure at all. A three-way stroke comparison (Dry/Streak, Fuzz Fat, New York Fat) shows Dry/Streak's coherent chevron-like directional ribbing against Fuzz Fat's random jittery/splattery texture and New York Fat's flat solid fill — structurally distinct mechanisms, not tuned variations of each other.

**Brush Studio integration.** Both appear automatically in the Specialty group (Brush Studio's brush list is built dynamically from `SPRAY_CAP_PRESETS`, so no Studio-specific wiring was needed) with a `digital-effect` provenance badge, a live preview through the real engine, and the same GENERAL/SHAPE/PAINT/MOTION property panel every other Spray cap gets — `depositionShape` reads "ring"/"streak" in the SHAPE readout. Also added as two new rows in the compact chooser's Specialty group (`index.html`), matching how every prior new cap in this session was exposed there, so they're paintable outside Brush Studio too — both are ordinary (non-custom) `SprayCapId` union members, so `applySprayCapSelection` wires them into live painting exactly like any built-in cap.

**Still visually provisional, not physically verified:** every numeric choice (ring radius/thickness/opacity ratios, streak lane count, cycle length, phase step, gate sharpness) was tuned by screenshot judgment against the target *description*, not against any specific reference photo — because none exists yet for either archetype; they remain intentionally unassigned to any real physical cap per the Visual Audit's own doctrine ("do not claim a specific physical-cap correspondence until real reference evidence supports it").

**Files:** `SprayCapPresets.ts` (2 new fields groups + 2 new presets), `SprayCapProfile.ts` (2 new `coneShape` values — "annular", "banded" — + 2 new profile entries), `SprayBrushEngine.ts` (`resolveRingProfile`, `resolveStreakGate`, `drawRingStamp`, `renderStreakCore`), `CustomBrush.ts` (provenance entries), `index.html` (2 new compact-chooser rows), plus tests across `SprayBrushEngine.test.ts`, `SprayCapPresets.test.ts`, `SprayCapProfile.test.ts`, `CustomBrush.test.ts`, `BrushStudio.test.ts`, `BrushPreview.test.ts`, `BrushProperties.test.ts`.

## Astro Fat vs. New York Fat Differentiation

Fixes the next queued P0 item: Astro Fat read as "New York Fat scaled up with more speckles," not a distinct personality, despite already having a much larger `baseRadius`.

**Root cause, confirmed numerically before touching anything.** At matched default velocity, the old numbers resolved to a core opacity only ~9% denser than New York Fat's (0.394 vs 0.432) despite Astro's radius being ~2x New York Fat's — nearly all of the per-unit-area qualities (`coreOpacity`, `particleOpacity`) were within a few percent of each other; only `particleCount` (2.1x) and raw radius meaningfully differed. `endpointBehavior` was identically `"settled"` on both, so even the dwell/start character matched.

**Correction, within the audited field list only.** `coreDensity` 1.28→1.4, `coreOpacity` 0.3→0.36, `flowRate` 1.56→1.65, `accumulationRate` 1.3→1.5 (together: resolved core opacity now ~1.5x New York Fat's, plus one additional `corePasses` at default velocity — a real, visible difference, not a rounding change). `edgeFalloff` 0.64→0.56 (softer pass-to-pass expansion — a genuine "broader bloom" via the existing core/overspray mechanism, not a halo or ring field; both stay 0 on Astro Fat, so it can never duplicate Pink Dot Fat's or Ring/Donut's bloom identity). `particleCount` 38→46, `particleSpread` 1.34→1.55, `particleOpacity` 0.27→0.32 (wider, denser atmospheric footprint — kept below Soft/Fade's `particleSpread` of 1.6 so the two "big broad" caps stay distinguishable by their opposite core character: Astro's resolved core opacity is now ~7x Soft/Fade's, confirmed by test). `endpointBehavior` `"settled"`→`"punchy"` (forceful dwell/start character, distinct from New York Fat). **New York Fat itself was not touched** — the prior audit already rated it PROVISIONAL with "current evidence indicates no change," and the deficiency was entirely on Astro's side; a dedicated test now locks New York Fat's exact values as a regression guard. `baseRadius`, `jitter`, `splatterProbability`, `dripTendency`, `velocityResponse` are untouched — not in the audited field list, and `velocityResponse` in particular was already a good existing differentiator (Astro stays aggressive regardless of speed).

**Live-verified.** Side-by-side quick-dot/short-dwell/long-dwell comparison: New York Fat stays small, controlled, and evenly filled at every dwell length; Astro Fat is visibly larger with a genuine soft atmospheric bloom extending past its solid core, growing noticeably more diffuse-edged with longer dwell. A slow-line comparison shows New York Fat as a thin, crisp, even band and Astro Fat as a much thicker band with visible speckle bleed beyond its edges — a qualitative edge-character difference, not just width. Fill-mode sweep and three-pass repeat on Astro Fat: one sweep reads translucent/textured, three back-and-forth passes read denser while staying bounded (never flattens to solid) — the existing ceiling mechanism applies unchanged, confirmed by a dedicated test. Brush Studio's PAINT readout confirmed both caps' new/unchanged values display correctly with zero Brush Studio code changes (the panel is fully data-driven from the preset).

**Classification:** both remain PROVISIONAL — digital-baseline only, not physically verified. German/Hardcore Fat remains explicitly untouched and blocked on reference-evidence acquisition, per the brief.

**Files:** `SprayCapPresets.ts` (Astro Fat numeric correction only), `SprayCapProfile.ts` (Astro Fat calibration notes), plus tests in `SprayCapPresets.test.ts` and `SprayBrushEngine.test.ts`.

## Spray Cap Calibration Bench V1

Ad hoc wall scribbles stopped being sufficient once Spray accumulated enough distinct behaviors (Ring/Donut, Dry/Streak, Halo, shaped stamps) to compare — this adds dedicated calibration/authoring infrastructure, not another cap-tuning pass. It never retunes any preset.

**What it is.** A side-by-side Left/Right comparison view inside Brush Studio, reached via a new "Calibrate…" action next to Reset/Duplicate on the selected Spray brush's panel (disabled on the Marker tab — V1 is Spray-focused, matching the brief). Either side can be switched to any built-in or custom Spray brush without leaving the Bench. Both sides render through the real `SprayBrushEngine` — no fake preview imagery anywhere in this feature.

**The deterministic matrix.** Ten fixed samples (A. Quick dot, B. Short dwell, C. Long dwell, D. Slow straight, E. Fast straight, F. Curve, G. Start/stop, H. Fill — one sweep, I. Fill — three passes, J. Diagonal) render identically-timed, identically-positioned strokes for both caps — only the resolved radius fed to the engine differs. Fill samples reuse the exact same `fillLocalSaturation` ceiling mechanism as every other Fill stroke (Start/stop uses three genuinely separate `beginStroke()` sessions so real endpoint behavior shows at each cut; Fill — three passes replays the identical sweep across three separate released strokes, matching how repeated Fill passes already compose elsewhere in the app).

**Native vs. Matched Width.** Native renders each cap at its own `baseRadius` — "Astro is physically much bigger." Matched Width renders both at `min(leftPreset.baseRadius, rightPreset.baseRadius)` — "at equal apparent size, does Astro still read hotter/broader?" Matched Width is Bench-local only: it is computed at render time and never writes back to `SPRAY_CAP_PRESETS` or any preset object (a dedicated test suite proves no preset is ever mutated by any Bench operation, including repeated open/switch/close cycles).

**Property readout and difference summary.** A merged side-by-side table of the real preset fields relevant to visual comparison (size, core density/opacity, edge falloff, overspray amount/spread/opacity, flow/accumulation rate, velocity response, endpoint behavior, shape, halo/ring/streak fields only where the cap actually has them, Fill default), plus a compact percentage-difference row per numeric field and a plain Left-vs-Right pairing for categorical fields (endpoint behavior, deposition shape). Every number is a real computed difference — the Bench never emits a subjective judgement like "more authentic."

**Calibration status.** Each side shows its classification (VERIFIED / PROVISIONAL / NEEDS CALIBRATION / DIGITAL EFFECT) from a new hand-maintained lookup (`SprayCapCalibrationStatus.ts`) mirroring the Visual Audit doc's own per-cap "Classification:" line. The Bench only displays this — it has no logic path that promotes a cap's status; that stays a human decision made after real physical-reference comparison, updated in both places by hand.

**Reference-evidence area.** Eight session-only text fields (source description, observed dot shape, observed line character, apparent width, overspray notes, dwell notes, confidence, calibration conclusions) for notes while comparing against a real reference. In-memory only, like the Custom Brush registry — no persistence of any kind, and no image-attachment mechanism yet (see Known Limitations).

**Snapshot.** "Copy Calibration Snapshot" copies a plain-text summary (cap names, width mode, classification, every difference row, any filled-in notes) to the clipboard. A composited PNG of all twenty sample canvases plus both side panels was judged too invasive for V1 given this codebase's existing patterns (no multi-canvas compositing/export utility exists anywhere else in the app yet) — deferred, not attempted; the text snapshot covers the same informational content.

**Astro Fat vs. New York Fat, first live proof.** Native mode: Astro Fat visibly larger with genuine atmospheric bloom past its core at every dwell length; New York Fat stays small and controlled. Matched Width: both render at New York Fat's own 32 wall units, and Astro Fat's hotter/denser core and softer edge stay clearly visible — confirming the differentiation work in the section above survives width normalization, not just raw size. Switching the Right side live to Pink Dot Fat updated the whole matrix/readout/status without leaving the Bench, and returning to New York Fat and Native mode reproduced the exact original comparison — no preset drift across the session.

**German/Hardcore Fat.** Untouched. The Bench makes it directly comparable against any other cap the moment real reference evidence arrives; no parameters were changed this pass.

**Files:** `CalibrationBench.ts` (new — pure matrix/width/readout/diff/snapshot logic), `CalibrationBench.test.ts` (new), `SprayCapCalibrationStatus.ts` (new — classification lookup), `CalibrationBenchController.ts` (new — thin DOM controller, live-verified only per this codebase's established BrushStudio split), `BrushStudio.ts` (new `openCalibrationBench` dep + "Calibrate…" button wiring, disabled on Marker), `main.ts` (controller wiring, Escape-key routing), `index.html` (new overlay markup + `.calibration-bench-*` CSS, reusing `.brush-studio-overlay`/`.island`/button/select language, no app-shell redesign).

**Known limitations / next step.** No image/PNG snapshot export and no reference-photo import yet — both explicitly deferred rather than half-built; a future pass could add a dedicated multi-canvas capture utility if repeated manual comparison against photos proves the bottleneck. Matched Width's target is always `min(left, right)` with no manual override input in V1 — sufficient for every comparison run so far, but a numeric override could be added if a specific calibration session needs a width outside that range.

## Stable Mop Attachment And Clear Authority

The latest Mop attachment work is complete and physically verified:

- dot: PASS;
- horizontal: PASS;
- vertical: PASS;
- rising diagonal: PASS;
- descending diagonal: PASS; and
- circle: PASS.

Active and completed Mop drips are composited beneath the opaque Mop body/wet contact. A short hidden underlap lets the body mask the attachment while preserving the existing visible run, origin, length, width, bend, rounded tip, gradient, timing, frequency, and deterministic replay.

The Clear defect introduced by the persistent drip-underlay layer was fixed in commit `5a170f1550f837c386bb3d6fb7aafd8465a00158`. One authoritative Clear path now resets:

- the main body/wet-contact canvas;
- the persistent `wetDripCanvas` underlay;
- the active wet-drip overlay; and
- retained active drip renderer state.

Undo continues to restore the pre-Clear canonical history through replay. Mop rendering and drip attachment are now **FROZEN** unless a new physical defect appears.

## Lighting Observation

MacBook field testing continues to show that a neutral/white ring light near the camera/working volume materially improves Hand/Spray tracking compared with colored lighting observed so far. Lighting remains an external performance variable, not a product hardware requirement, and this checkpoint does not retune Hand reliability around it.

## Automated Verification

- Focused Clear/Mop tests: PASS — 46/46.
- Final `npm test`: PASS — 36 test files, 226/226 tests.
- Final `npm run build`: PASS — TypeScript and Vite production build; 44 modules transformed.

Coverage includes a load/speed-independent Mop base tube, sparse dwell-only wet swelling, flared node-free Mop origins, continuous transient full-strip redraw, opaque-to-drip gradient transition, connected deterministic kink geometry, retained rounded tips, Flow and Viscosity mapping, Mop/Drip Mop differentiation, dwell/load gain, speed drain, multiple origins, restrained non-Mop routing, mixed-color wet history, exact Clear restoration, palette/recent-color state, shared cursor geometry, all required zoom scales, raw Hand aim separation, Chisel initialization/contact, corner bounds, and all retained navigation/input/audio/recording/composition tests.

## Current-Host Browser Validation

Passed in the current in-app browser with Physical input where automation permits:

- V0.6.3 loaded in the preserved compact shell with no console warnings or errors;
- straight and curved Drip Mop travel rendered as a clean, constant-width round-nib tube with smooth joins and clean rounded contact ends;
- a controlled High/Runny Drip Mop dwell emitted a long gravity run from a subtle flared edge shoulder with no circular origin node and no visible horizontal construction bands;
- Color opened one 238px temporary surface rather than a persistent strip;
- StudioRich, 12-color Montana fallback, and 12-color BLACK fallback palette states switched successfully;
- repeated dark/light/saturated selections updated the cursor and active marks, while two recent colors persisted;
- Flow and Viscosity appeared only for Mop/Drip Mop inside the Marker/Nib chooser and accepted High/Runny and Balanced/Balanced calibration states;
- Mop showed a large round cursor, circular dot, rounded start/end, broad wet body, and retained edge character;
- Drip Mop showed a materially larger circular contact/body than Mop;
- the reference-calibrated Drip Mop pass produced visually smooth curved and straight continuous round-contact bodies without the red screenshot's point-to-point circular knots;
- XS/S/M/L/XL marker presets switched repeatably, the chosen XL Drip Mop cursor resolved from the same renderer footprint, and the continuous Settings slider remained hidden for Paint Marker;
- Drippy Chisel appeared as a separate contextual variant, exposed wet Flow/Viscosity controls, and retained a clean Chisel body;
- Chisel horizontal, vertical, and diagonal live samples reproduced the original false-corner splinter, then passed after the zero-motion direction fix with clean starts/ends;
- Clean Chisel appeared as a compact contextual Marker/Nib choice and produced clean finite horizontal/diagonal endpoints without visible fraying;
- New York Fat Spray, Round Marker, Mop, and Drip Mop created a mixed-color Wall;
- keyboard Undo removed the latest mixed-color stroke;
- Clear disabled Clear while retaining Undo, and one Undo restored the prior colored Wall;
- wheel/two-axis Pan changed both Wall offsets;
- Quick Zoom changed 100% to 200% and restored the exact prior zoom and pan state;
- cursor geometry scaled exactly at 25%, 100%, and 400% in live DOM measurements (17.479px, 69.916px, and 279.664px for the same Drip Mop contact); and
- recording entered and exited the active state around a Physical mark without an application error.

The browser automation surface compresses pointer timing. It produced one controlled High/Runny Mop run suitable for checking attachment, origin shape, gradient continuity, and band-free rendering, but it is not evidence for human dwell timing or natural drip frequency. Those timing judgments, Drippy Chisel frequency, and Hand behavior remain MacBook checks. Modified-wheel zoom and held-Space Pan were also not re-proven through this pass; their retained deterministic suites pass. No local soundtrack file was loaded, so existing music mixing is regression-tested but not newly live-claimed.

## MacBook Manual Validation Checklist

After committing, push and pull before testing.

1. With Physical input, compare Mop and Drip Mop at the same color, size, Balanced Flow, and Balanced Viscosity.
2. For each, draw slow, fast, horizontal, and vertical marks; hold short and long dwells at several points.
3. Confirm Mop produces moderate connected runs and Drip Mop produces visibly wider, longer, more frequent, and occasionally very long runs.
4. Confirm every run remains attached to its wet body, tapers continuously, follows gravity, and never becomes a string of beads.
5. Compare the result directly with the supplied black-door reference: body continuity, substantial origin width, predominantly vertical fall, long connected runs, and the absence of antenna/tentacle artifacts.
6. Compare original Chisel and Clean Chisel with horizontal, vertical, diagonal, loop, and sharp-turn samples; confirm Clean Chisel ends are visibly less frayed.
7. Test Drippy Chisel at every width with short/long dwell; confirm the clean chisel body is preserved and runs remain materially more restrained than Drip Mop.
8. Switch every Marker variant through XS/S/M/L/XL, confirm repeatability after switching away/back, and compare the cursor footprint with deposited width at several Wall scales.
9. Set Flow Low/Balanced/High while holding Viscosity constant; confirm delivery, buildup, trigger ease, and width increase coherently.
10. Set Viscosity Thick/Balanced/Runny while holding Flow constant; confirm thick is wider/slower/shorter and runny is narrower/faster/longer.
11. Verify multiple Drip Mop origins under high load and that faster movement reduces accumulation.
12. Switch repeatedly among dark, light, and saturated colors; overlap wet marks and inspect opacity, pooling, edge softness, and continuous-run visibility.
13. Verify current color, recent colors, and the complete manufacturer palette labels/codes; manufacturer integration is stable and should remain unchanged.
14. Verify Spray, Round, all Chisels, Mop, and Drip Mop cursor size/color/shape alignment at several Wall scales.
15. With Hand input and a neutral/white ring light, compare the raw aim cursor's responsiveness with the stabilized deposited stroke during fast movement.
16. Confirm Hand short-gap protection, tracking-quality warning, edge-driven motion, pinch paint, Pan recovery, and sensor-only camera privacy remain intact.
17. Repeat Mop/Drip Mop slow, fast, and dwell tests with Hand; compare continuous-run behavior against Physical.
18. Exercise mixed-color Undo, Clear, Undo Clear, resize replay, Pan, zoom, edge continuation, soundtrack, and recording; verify exact colors and wet runs survive.
19. Confirm the final WebM contains the Wall composite and mixed audio, and inspect the console for warnings/errors.

## Known Limitations And Deferred Work

- Physical Hand responsiveness, camera cadence, and tool feel require MacBook validation.
- Human-timed live dwell, long-run frequency, and KRINK-like subjective fidelity remain unverified; V0.6.3 is a deterministic digital wet model, not a measured paint-brand simulation.
- Chisel click-only dots are deferred until a direction-aware tap-contact policy can avoid reintroducing false start splinters.
- Flow and Viscosity are session calibration state and are not yet persisted as user settings; generated wet state itself is fully recorded for replay.
- CLEAN / RAW / GRITTY is a documented future nib/mark-condition axis only.
- V0.6.4 is reserved for Spray Plume + Opacity Calibration: density, edge falloff, opacity curve, radial distribution, overspray, distance/output response, stationary dots, fill/outline utility, blending, and detail precision.
- Surface materials, paint chemistry/drying, Pencil pressure/tilt, Waveformer, Sticker, Roller, Fire Extinguisher, Black Book, collaboration, and shell redesign remain deferred.

## Likely Next Spatial Drawing Priorities

1. Toolbox/UI flow planning.
2. Spray Cap Calibration V1.
3. Throwie-oriented testing: fill, outline, highlight, shadow, opacity, and width.
4. Spatial/reactive spray audio experiment.
5. iPad / Apple Pencil input evaluation.
6. Waveformer later, after Spray behavior is mature.

Next safe step: preserve the frozen Mop and manufacturer-palette checkpoints while planning the toolbox/UI flow and Spray Cap Calibration V1.
