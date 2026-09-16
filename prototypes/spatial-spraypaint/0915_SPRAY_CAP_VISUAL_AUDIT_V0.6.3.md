# Spray Cap Visual Audit — V0.6.3

Date: 2026-09-15

Status: Originally documentation-only as of commit `31fc282`. **Updated (still same date) after the P0 build that followed this audit** — Needle correction and the Calligraphy→Oval/Rectangular split are now implemented; this revision reflects the 16-cap inventory that resulted. It is the canonical inventory of every currently defined Spray cap plus every currently identified (not yet built) future cap-output archetype.

## Sources used

- `src/SprayCapPresets.ts` — `SPRAY_CAP_PRESETS` (16 entries) and `resolveSprayDynamics`.
- `src/SprayCapProfile.ts` — `CAP_PROFILE_DETAILS` (coneShape, edge/overspray/output character, orientation behavior, calibration notes, `nominalWidthRange`).
- `src/SprayBrushEngine.ts` — `resolveShapedStampGeometry`/`shapedStampWidthAlongTravel`/`drawShapedStamp` (Oval Calligraphy / Rectangular Transversal), `resolveRingProfile`/`drawRingStamp` (Ring/Donut), `resolveStreakGate`/`renderStreakCore` (Dry/Streak), and `resolvePinkDotDualPlume`/`renderPinkDotDualPlume`/`renderPinkDotInnerCore`/`renderPinkDotOuterField`/`resolvePinkDotOuterFieldStops`/`resolvePinkDotOuterFieldBands`/`resolvePinkDotDwellScale`/`resolveMouseSprayInput` (Pink Dot Fat's dual-plume — see its own section below).
- `src/main.ts` — how `baseRadius` actually reaches a live stroke.
- `0911_SPATIAL_SPRAYPAINT_V0.6.3_CURRENT.md` — prior audit findings, including "Needle Correction + Calligraphy Split (P0)", "Brush Studio V1", and "Ring/Donut + Dry/Streak Output Archetypes".
- Commit `31fc282` (cap personalities), the Needle/Calligraphy P0 build, Brush Studio V1, and the Ring/Donut + Dry/Streak P0 build — all live-verified in-browser.
- `SprayCapPresets.test.ts` / `SprayCapProfile.test.ts` / `SprayBrushEngine.test.ts` / `BrushPreview.test.ts` / `BrushProperties.test.ts` / `BrushStudio.test.ts` / `CustomBrush.test.ts` / `DrawingCursor.test.ts` / `CalibrationBench.test.ts` for what is actually regression-locked today.
- `src/CalibrationBench.ts` / `src/SprayCapCalibrationStatus.ts` — the Spray Cap Calibration Bench V1 (see its own section below) and the classification lookup mirroring this doc's own "Classification:" lines per cap.

## Classification legend

- **VERIFIED** — audited against a real reference photo/video and found to already match the target, or otherwise confirmed correct; no outstanding defect.
- **PROVISIONAL** — has a coherent, internally-consistent digital baseline and (where relevant) reads as distinct from sibling caps, but has not yet been checked against real reference evidence.
- **NEEDS CALIBRATION** — has been checked against reference evidence and found to differ from the target, or is explicitly flagged by the current task brief as needing correction.
- **DIGITAL EFFECT** — not a physical-cap target at all; an intentional StudioRich-authored specialty behavior.

No cap in this repo has been measured against a real cap in physical units (cm/inch). "VERIFIED" below means *visually* verified against a reference photo, never physically measured — see the width/provenance note below.

## How width actually works today (read before using any width number below)

Two separate, independently-authored numbers exist per cap, plus one live mechanism:

- **`nominalWidthRange` (min–max)** — from `SprayCapProfile.ts`, shown as display text in the cap-chooser row (e.g. "24–42 · digital baseline"). Purely descriptive. Authored by hand per cap, **not derived from `baseRadius`** (the two don't even track each other numerically — e.g. New York Fat's `baseRadius` is 32 but its displayed range is 24–42). Never read by any rendering code. **No physical (cm/inch) measurement exists anywhere in this repo for any cap** — "digital baseline" is the honest label.
- **`baseRadius`** — the cap's actual default live Wall-space radius. Selecting a cap sets `this.baseRadius = cap.baseRadius` in `main.ts` (`.cap-choice` click handler), and this value flows into every live stroke's `point.width` unless the user has an explicit "Spray size override" active (the Settings radius slider; "Use cap default" clears the override and returns to `cap.baseRadius`). So `baseRadius` **is** the cap's live identity for width — distinct from the cosmetic `nominalWidthRange` text next to it in the chooser.
- **`resolveSprayDynamics(preset, velocity, radius)`** — the `radius` argument here is the live `point.width` described above (ultimately traceable back to `baseRadius` or the override), not `preset.baseRadius` read directly inside the function. `resolveSprayDynamics` itself never references `baseRadius`.

Below, "documented width/range" quotes `nominalWidthRange` (display-only, unmeasured); "digital Wall-space width" quotes `baseRadius` (the actual live default).

---

## Current caps

### 1. New York Fat
- **ID:** `new-york-fat` · **Family:** fat
- **Classification:** PROVISIONAL
- **Physical vs. digital:** represents the real, widely-recognized "NY Fat" cap category. Digital baseline only — "physical width, distance, and paint-brand trials remain pending" (calibration notes).
- **Documented width/range:** 24–42 (digital-baseline display only, unmeasured).
- **Digital Wall-space width:** `baseRadius` 32.
- **Dot profile:** `coreDensity` 1.14, `coreOpacity` 0.29, no halo (`haloRadius` 0) — even, moderately dense disc, no bloom.
- **Moving stroke profile:** `corePasses` ≈2 at default velocity, `edgeFalloff` 0.7 (moderate softening), `anisotropy` 1 (symmetric).
- **Core/body character:** comparatively controlled broad line; `accumulationRate` 1.16 (mid-pack) — builds solidly without Pink Dot Fat's aggressive saturation.
- **Edge character:** balanced.
- **Overspray character:** balanced/restrained (`particleCount` 18, `particleOpacity` 0.25, `splatterProbability` 0.08).
- **Motion/speed response:** moderate (`velocityResponse` 0.58).
- **Orientation behavior:** symmetric round.
- **Dwell behavior:** no halo; dwell simply deepens the core toward saturation via ordinary compositing (no ceiling outside Fill mode).
- **Drip status:** `dripTendency` 0.48 — mid-pack among fat caps.
- **Fill default:** ON (`defaultFillMode: true`) — the characteristic fat-cap workflow; dense outline behavior remains one manual toggle away (Fill OFF), a per-brush session modification, not a preset change.
- **Current visual strengths:** reads as a controlled, usable tag/outline line; live-verified (commit `31fc282`) as the sharp-edged, even-density baseline against which Pink Dot Fat's new halo now reads as clearly distinct; re-audited this pass as the reference baseline that Astro Fat was differentiated away from — left numerically unchanged (values re-confirmed exact via a dedicated regression test).
- **Known visual defects:** none newly identified; no dedicated photo-matched calibration has been run against it specifically.
- **Target behavior:** keep as the controlled baseline fat cap; current evidence indicates no change.
- **Exact next calibration test:** side-by-side outline/tag stroke against a real NY-Fat reference photo at matched apparent width, to move PROVISIONAL → VERIFIED or surface a defect.

### 2. Pink Dot Fat
- **ID:** `pink-dot-fat` · **Family:** fat
- **Classification:** NEEDS CALIBRATION (dual-plume rework, an outer-field/dwell refinement pass, then a true-radial-minimum correction pass; explicitly physically unverified — see Preserved Distinctions)
- **Physical vs. digital:** represents the real "Pink Dot" loaded-cap category. The stationary dot was already reading well after the prior "unified plume" pass, but live testing of a **moving** stroke regressed: bullseye identity weakened, lines read lumpy/scalloped, joints/endpoints could visibly disconnect — root cause was the core itself being stamped as discrete dab-gated circles rather than drawn as a continuous stroke. The dual-plume pass fixed that with two coordinated CONTINUOUS layers of one cap. A refinement pass then fixed endpoint bulges and a flat-tube outer layer. A further correction pass found the outer field's radial profile still had no genuine gap — the shell-based density field could raise density but never dip it — and replaced it with a true four-zone radial minimum (see below).
- **Documented width/range:** 34–54 (unmeasured).
- **Digital Wall-space width:** `baseRadius` 42 (unchanged).
- **Deposition mechanism:** `depositionShape: "plume"` — exclusive to this cap. `SprayBrushEngine.resolvePinkDotDualPlume` resolves ONE state, `{ inner, outer }`, from the cap's own fields plus the same canonical, input-neutral `SprayInputState` (`sprayAngle`/`sprayDistance`/`sprayOutput` — mouse V1 maps into this via `resolveMouseSprayInput`, unchanged). `inner` (`radius`/`opacity`/`density`/`falloff`/`anisotropy`) is drawn by `renderPinkDotInnerCore` as a normal continuous multi-pass stroked line, never gated by travel distance. `outer` (`ringRadius`/`ringThickness`/`ringOpacity`/`mistRadius`/`mistOpacity`/`anisotropy`) is drawn by `renderPinkDotOuterField`, which branches on whether the pointer is genuinely stationary (`useDwellStamp`, gated on BOTH accumulated real dwell time and `point.velocity`, immune to curve-smoothing sub-sampling noise): a true dwell stamps ONE `createRadialGradient` circle with a real four-zone alpha profile — core-edge → a strictly suppressed MOAT minimum → a ring peak → a fading mist (`resolvePinkDotOuterFieldStops`) — evaluated natively per-pixel by the canvas, so the moat is a genuine mathematical dip, not blur. A moving segment instead sweeps the ring/mist zones as two OFFSET PARALLEL bands at a fixed perpendicular distance from the path (`resolvePinkDotOuterFieldBands`), leaving the moat itself unpainted — sweeping the SAME gradient repeatedly along a path was tried first and rejected: overlapping disks fill the moat back in. Overspray's own particle spread also carries a matching perpendicular-corridor exclusion (`renderOverspray`'s `minSpreadRadius`) so speckle can't refill the gap either. The `plumeDabSpacing` field remains deleted — continuity still doesn't depend on a spacing threshold.
- **Dot profile:** `coreDensity` 1.46, `coreOpacity` 0.34 (both highest of the fat family, unchanged — core physics untouched by this pass) plus `plumeRingRadius` 1.7× / `plumeRingThickness` 0.55 / `plumeRingOpacity` 0.24, and `plumeMistRadius` 2.6× / `plumeMistOpacity` 0.07 for the outer atmosphere. Seven `plume*` fields total (down from eight — `plumeDabSpacing` removed).
- **Distance response:** `plumeDistanceGain` 0.85 (unchanged magnitude, reused semantics) — now applies structurally ONLY to the outer ring/mist; the inner core's radius is the plain resolved Size with zero extra gain. This guarantees outer grows faster than inner by construction, not by tuning: near-wall (small Size) → suppressed toward a clean hot dot/line; pulled back (large Size) → pronounced center+ring+mist bloom while the core stays proportionally smaller.
- **Angle + velocity flare, coherent across both layers:** `plumeFlareStrength` 0.55 drives `flareFactor = max(angleFactor, velocityFactor)`, unchanged. The outer layer gets the full flare strength; the inner core gets half (`PLUME_INNER_FLARE_RATIO = 0.5`) — the line body stays more controlled/circular while the atmosphere flares more freely, both from one shared value so they never desync. Angle alone can still flare a perfectly **stationary** dwell. Live-verified: a 0°-vs-45° horizontal line comparison shows the flared line uniformly and visibly narrower across its entire length, not just at one point.
- **Moving stroke profile:** `endpointBehavior` "punchy", `accumulationRate` 1.38 (highest of the fat family, unchanged) — builds density fastest; inner core's own endpoint taper is unchanged from the generic core convention.
- **Core/body character:** loaded center, strong dot personality — structurally distinct from New York Fat, and now genuinely continuous on a moving stroke (no dab-stamp lumpiness in the line body itself, the specific defect this pass targets).
- **Edge character:** `edgeFalloff` 0.76 (softer pass-to-pass expansion), unchanged, still governs the core's own soft multi-pass edge.
- **Overspray character:** wide/pronounced (`particleCount` 26, `particleSpread` 1.2, `splatterProbability` 0.14) — base values untouched, but its flare orientation is now explicitly coupled to the outer layer's own anisotropy (bypassing the fixed-transversal-axis branch built for Calligraphy-style caps) so speckle texture stays coherent with the envelope it sits on.
- **Motion/speed response:** lower than New York Fat (`velocityResponse` 0.42) — stays denser at speed. A live slow-vs-fast comparison at the same length shows the slow line reading fuller/denser and the fast line reading visibly lighter/thinner, both remaining continuous with no broken spacing.
- **Orientation behavior:** symmetric at rest; inner and outer elongate together under angle or velocity, sharing one flareFactor.
- **Dwell behavior:** genuinely dwell-driven. `resolvePinkDotDwellScale`, fed by engine-tracked real elapsed stationary time (`pinkDotDwellMs`), scales both layers' size together for a near-zero-distance point: a floor of ~0.22 at 0ms (a bare click, or the instant real movement stops) ramps linearly to full size by 900ms. Separately, WHICH outer-field technique renders (stamp vs. offset rails) requires both accumulated dwell time and low `point.velocity` together, so a slow-but-genuinely-moving stroke — whose curve-smoothing pipeline can subdivide it into segments individually shorter than the plain distance gate — never gets misclassified as a dwell and stamped repeatedly along its own length.
- **Drip status:** `dripTendency` 0.72 — highest of the fat family.
- **Fill default:** ON (`defaultFillMode: true`) — same fat-cap workflow default as New York/Astro/German Fat; Fill OFF remains a per-brush manual toggle for dense outline work. Fill's ceiling mechanism applies ONLY to the inner core, exactly as it did to the old generic core loop — the outer atmosphere is never ceiling-limited, which is what makes overlapping passes read as dusty buildup rather than a flat bar.
- **Current visual strengths:** live-verified across the full required matrix at default size, confirmed with direct pixel sampling (the gap reads as only a few percent contrast against a compressed screenshot, so visual inspection alone under-detects it): a stationary dwell dot shows a clear four-zone bullseye (also confirmed visually at 400% wall-scale zoom); a slow moving line's perpendicular cross-section drops to background level in the moat on both sides of the core before rising at the ring and fading through the mist; a 0°/45° flare comparison narrows the whole four-zone structure together with the moat still intact; a continuous cursive-style squiggle (curves, tight loops, reversals) keeps the core line connected throughout with no interruption; three overlapping back-and-forth Fill passes still build denser coverage without flattening into a bucket fill; click-drag-immediately and drag-release-immediately both stay small with no oversized bulb.
- **Known visual defects:** all plume field magnitudes were carried forward unchanged from earlier passes' judgment calls, not re-measured; core physics (`coreDensity`/`coreOpacity`/etc.) remain screenshot-judgment baseline from the original commit. Distance's outer-grows-faster-than-inner response was proven via 4 dedicated unit tests rather than live mouse simulation, since `sprayDistance` is driven by hand-tracking depth in this build, not a desktop mouse control. The radial zone boundaries (`RADIAL_CORE_END_T`/`RADIAL_MOAT_END_T`/`RADIAL_RING_END_T` at 0.35/0.55/0.8) and the moat suppression ratio were set by judgment/live pixel-level verification, not measured against reference footage.
- **Target behavior:** near-wall → clean hot dot/line; pulled back → center + clear outer ring + mist, outer expanding faster than inner; oblique/moving → elliptical flare coherent across inner+outer, inner more restrained; overlapping strokes → dusty layered fill from the outer atmosphere, not a flat bar; moving line stays continuous through corners, reversals, and loops with no scalloping or disconnected joints; stationary AND moving both show a genuine dense-core → dark-gap → bright-ring → fading-mist structure, not a fuzzy solid circle or a flat haze. All achieved this pass; magnitude still unverified against physical measurement.
- **Exact next calibration test:** side-by-side comparison against the reference footage's own near/far/oblique/overlap moments (ideally in the Calibration Bench once it supports video reference import — see its own "Known limitations" note) to tune the plume field magnitudes and the radial zone boundaries, plus a stationary-dot photo-matched pass to tune the core's own base values.

### 3. Astro Fat
- **ID:** `astro-fat` · **Family:** fat
- **Classification:** PROVISIONAL (corrected V2 this pass; still digital-baseline, not physically verified)
- **Physical vs. digital:** represents a real high-output "Astro"-class cap. "Not yet matched to a physical Astro cap at measured distance" (calibration notes).
- **Documented width/range:** 48–78 (widest of all caps; unmeasured).
- **Digital Wall-space width:** `baseRadius` 62 (largest of all caps, unchanged this pass).
- **Dot profile (corrected):** `coreDensity` 1.4 (was 1.28), `coreOpacity` 0.36 (was 0.3), no halo — resolved core opacity now ~1.5x New York Fat's at matched default velocity (was ~1.09x, barely distinguishable per unit area despite the 2x radius).
- **Moving stroke profile (corrected):** `particleCount` 46 (was 38, highest of all caps), `particleSpread` 1.55 (was 1.34, kept below Soft/Fade's 1.6 so the two "big broad" caps stay distinguishable by core character), `flowRate` 1.65 (was 1.56), `accumulationRate` 1.5 (was 1.3), `particleOpacity` 0.32 (was 0.27), `edgeFalloff` 0.56 (was 0.64 — softer pass-to-pass expansion, broader bloom via the existing overspray/core mechanism, no halo or ring field added), `endpointBehavior` "punchy" (was "settled" — matches New York Fat's, now distinct), `jitter`/`splatterProbability`/`dripTendency`/`velocityResponse`/`baseRadius` unchanged (not in the audited field list).
- **Core/body character:** very broad/high-output; strong fill usefulness per target; now measurably hotter than New York Fat's, not just wider.
- **Edge character:** soft (`edgeFalloff` 0.56 — lowest of the fat family, most pass-to-pass softening).
- **Overspray character:** wide, `splatterProbability` 0.18 (unchanged; stays well below Fuzz Fat's raw/splattery numbers).
- **Motion/speed response:** least speed-sensitive of the fat family (`velocityResponse` 0.36, unchanged) — stays aggressive regardless of movement.
- **Orientation behavior:** symmetric round.
- **Dwell behavior:** no halo; dwell saturates the (already large, now denser) core — live-verified longer dwell reads visibly more diffuse-edged than New York Fat's at any dwell length.
- **Drip status:** `dripTendency` 0.66 — second-highest of the fat family (unchanged).
- **Fill default:** ON (`defaultFillMode: true`) — same fat-cap workflow default as New York/Pink Dot/German Fat; Fill OFF remains a per-brush manual toggle for dense outline work.
- **Current visual strengths:** live-verified (this pass) as visibly and behaviorally distinct from New York Fat at every tested dwell length and stroke speed — genuine soft atmospheric bloom extending past a denser core, thicker line with visible speckle bleed, three-pass Fill sweep reads denser than one pass while staying bounded (ceiling mechanism unaffected, confirmed by test). No longer reads as "New York Fat scaled up."
- **Known visual defects:** no dedicated photo comparison against a real Astro cap has been run; magnitude of the correction was set by resolved-value ratios and live screenshot judgment, not a physical reference.
- **Target behavior:** "very broad/high-output, strong fill usefulness, larger plume/aggressive output, more pronounced dwell/load character" — now both numerically and visually distinct from New York Fat; still not visually confirmed against an Astro-specific physical reference.
- **Exact next calibration test:** side-by-side outline/tag stroke against a real Astro-class reference photo at matched apparent width, to move PROVISIONAL → VERIFIED or surface a defect. The New York Fat vs. Astro Fat differentiation gap itself is now resolved (see cap #1 and the calibration queue).

### 4. German / Hardcore Fat
- **ID:** `german-fat` · **Family:** fat
- **Classification:** NEEDS CALIBRATION
- **Physical vs. digital:** represents the real "German/Hardcore" cap category. Current numbers are the pre-calibration baseline Fuzz Fat was forked from — never designed as a calibration target, just a placeholder starting point.
- **Documented width/range:** 28–50 (identical display text to Fuzz Fat, inherited from the fork; unmeasured).
- **Digital Wall-space width:** `baseRadius` 38 (identical to Fuzz Fat).
- **Dot profile:** `coreDensity` 1.06 (lowest of the fat family), `coreOpacity` 0.27, no halo.
- **Moving stroke profile:** `edgeFalloff` 0.54 (lowest/rawest of the fat family), `jitter` 0.18 (highest of the fat family), `splatterProbability` 0.28 (highest of all caps, tied with Fuzz Fat), `endpointBehavior` "raw".
- **Core/body character:** raw/splattery by the numbers — currently **numerically identical** to Fuzz Fat, a digital fuzzy/dry-brush effect, not a real German/Hardcore reference.
- **Edge character:** raw.
- **Overspray character:** splattery, wide (`particleSpread` 1.42).
- **Motion/speed response:** highest of the fat family (`velocityResponse` 0.68).
- **Orientation behavior:** symmetric round.
- **Dwell behavior:** no halo; standard core saturation.
- **Drip status:** `dripTendency` 0.5.
- **Fill default:** ON (`defaultFillMode: true`) — same fat-cap workflow default as New York/Pink Dot/Astro Fat. **Note:** Fuzz Fat, the byte-for-byte rendering fork of this cap, deliberately keeps `defaultFillMode: false` — a documented, intentional usage-mode exception to the fork (every other field remains byte-identical between the two; see `SprayCapPresets.test.ts`'s updated fork test and the "Preserved distinctions" note below).
- **Current visual strengths:** none claimed — explicitly awaiting real reference evidence before any recalibration.
- **Known visual defects:** currently indistinguishable in character from Fuzz Fat (same numbers) — its "fuzzy/dry-brush" read is an inherited placeholder from before the Fuzz Fat fork, not a considered German-cap target.
- **Target behavior:** "tune only against real reference evidence; do not overwrite with Fuzz Fat behavior" — recalibrate independently once real German/Hardcore reference photos exist; Fuzz Fat stays frozen regardless of what happens here.
- **Exact next calibration test:** blocked on evidence — obtain/confirm a real German/Hardcore Fat reference photo or video before any numeric change; cannot proceed further under "do not claim physical calibration where evidence is insufficient."

### 5. Lego Thin
- **ID:** `lego-thin` · **Family:** thin
- **Classification:** PROVISIONAL
- **Physical vs. digital:** represents the real "Lego" thin-cap category. No dedicated evidence pass run.
- **Documented width/range:** 10–19 (unmeasured).
- **Digital Wall-space width:** `baseRadius` 14.
- **Dot profile:** `coreDensity` 1.08, `coreOpacity` 0.35 (higher than New York Fat's), no halo — tight, controlled dot (`stationaryDotBehavior` "tight").
- **Moving stroke profile:** `edgeFalloff` 0.84 (crisp), `particleCount` 8 (low), `particleOpacity` 0.22.
- **Core/body character:** controlled, dense-for-its-size (`fadeBehavior` "dense").
- **Edge character:** hard/crisp.
- **Overspray character:** restrained (`splatterProbability` 0.03).
- **Motion/speed response:** high (`velocityResponse` 0.92), typical of thin caps.
- **Orientation behavior:** symmetric.
- **Dwell behavior:** tight dot, no halo, no special growth.
- **Drip status:** `dripTendency` 0.18.
- **Current visual strengths:** crisp, controlled line per the numbers — a plausible "confident thin cap" character.
- **Known visual defects:** not compared against its thin-family siblings in a dedicated live pass; "more than radius" differentiation (task requirement) unverified for this cap specifically.
- **Target behavior:** distinct edge crispness/density/taper from siblings where evidence supports it — not yet audited against photos.
- **Exact next calibration test:** Lego Thin vs. Universal Thin vs. New York Thin, same live matrix (slow/fast/curved/start-stop) at matched nominal width, checked against any available real thin-cap reference photo.

### 6. Universal Thin
- **ID:** `universal-thin` · **Family:** thin
- **Classification:** PROVISIONAL
- **Physical vs. digital:** represents a real general-purpose thin-cap category. No dedicated evidence pass run.
- **Documented width/range:** 8–16 (unmeasured).
- **Digital Wall-space width:** `baseRadius` 11.
- **Dot profile:** `coreDensity` 0.92 (lowest of the thin family), `coreOpacity` 0.32, tight.
- **Moving stroke profile:** `velocityResponse` 1 (maximum, tied with Level 1) — tapers most aggressively.
- **Core/body character:** balanced (`fadeBehavior` "balanced" — between Lego Thin's "dense" and Level 1's minimal output).
- **Edge character:** balanced.
- **Overspray character:** restrained, `particleOpacity` 0.2 (lowest of the thin family).
- **Motion/speed response:** maximal.
- **Orientation behavior:** symmetric.
- **Dwell behavior:** tight, no halo.
- **Drip status:** `dripTendency` 0.12 (low).
- **Current visual strengths:** general-purpose baseline, sits numerically between Lego Thin and Level 1.
- **Known visual defects:** not distinctly audited; risk of reading as "just a smaller Lego Thin" without dedicated differentiation evidence.
- **Target behavior:** differentiate via edge crispness/density/taper only where evidence supports it — none gathered yet.
- **Exact next calibration test:** same three-way thin-cap comparison as Lego Thin above.

### 7. Level 1 / Skinny Cream
- **ID:** `level-1` · **Family:** thin
- **Classification:** PROVISIONAL
- **Physical vs. digital:** represents the real "Skinny"/"Level 1" ultra-thin cap category. No dedicated evidence pass run.
- **Documented width/range:** 4–9 (narrowest of all caps; unmeasured).
- **Digital Wall-space width:** `baseRadius` 6 (smallest of all caps).
- **Dot profile:** `coreDensity` 0.84 (lowest of all caps), `coreOpacity` 0.3, tight, `particleCount` 4 (lowest of all caps).
- **Moving stroke profile:** `velocityResponse` 1 (max, tied with Universal Thin), `jitter` 0.03 (lowest of all caps — most stable line).
- **Core/body character:** dense-for-its-size but minimal in absolute output (low `outputVolume`).
- **Edge character:** hard.
- **Overspray character:** most restrained of all caps (`splatterProbability` 0.01).
- **Motion/speed response:** high.
- **Orientation behavior:** symmetric.
- **Dwell behavior:** tight, minimal.
- **Drip status:** `dripTendency` 0.06 — second-lowest of all caps (only Soft/Fade's 0.04 is lower).
- **Current visual strengths:** numerically the cleanest, lowest-noise cap in the set — a plausible "detail liner" character.
- **Known visual defects:** not audited against a real Skinny Cream reference; risk of under-differentiation from Universal Thin at typical UI sizes, since the gap is only in the lowest-magnitude numbers.
- **Target behavior:** most restrained/crisp of the thin family — numerically consistent already, needs visual confirmation.
- **Exact next calibration test:** same three-/four-way thin-cap comparison, specifically checking whether Level 1 reads as visibly "finer/cleaner" than Universal Thin at matched apparent width, not just smaller.

### 8. New York Thin
- **ID:** `new-york-thin` · **Family:** thin
- **Classification:** VERIFIED
- **Physical vs. digital:** represents the real "NY Thin" cap category. Explicitly audited against real reference photos in the prior "V0.6 Visual Calibration Pass" and found already correct — the one thin cap with a completed evidence-based check.
- **Documented width/range:** 6–14 (unmeasured).
- **Digital Wall-space width:** `baseRadius` 9.
- **Dot profile:** `coreDensity` 1.2 (highest of the thin family), `coreOpacity` 0.38 (highest of the thin family), `stationaryDotBehavior` "loaded" (shared only with Pink Dot Fat among all 14).
- **Moving stroke profile:** `velocityResponse` 0.86, `endpointBehavior` "punchy".
- **Core/body character:** confident, controlled line — directly the language of the prior audit finding.
- **Edge character:** hard, with "appropriately soft aerosol edge" per audit language (`edgeFalloff` 0.82).
- **Overspray character:** restrained, low.
- **Motion/speed response:** high.
- **Orientation behavior:** symmetric.
- **Dwell behavior:** "loaded" — punchier stationary dot than its thin siblings.
- **Drip status:** `dripTendency` 0.16.
- **Current visual strengths:** confirmed by direct photo audit — "reads as a confident, controlled line with appropriately soft aerosol edge and low overspray — matches the target already."
- **Known visual defects:** none identified.
- **Target behavior:** no change — already matches reference.
- **Exact next calibration test:** none required unless new reference evidence emerges; optional re-confirmation only if a future thin-cap differentiation pass touches shared code paths.

### 9. Oval Calligraphy
- **ID:** `calligraphy` (unchanged — see Compatibility note below) · **Family:** specialty
- **Classification:** NEEDS CALIBRATION (the specific "round-capped line, not a real footprint" defect is now RESOLVED at the mechanism level; magnitude/shape ratios remain unverified against a real reference — see below)
- **Physical vs. digital:** represents the softer/rounder half of a real rectangular/slot-outlet transversal cap family. As of the P0 build, genuinely stamped as an elongated **oval**, not a width-modulated line.
- **Documented width/range:** 14–34 (unmeasured).
- **Digital Wall-space width:** `baseRadius` 25.
- **Dot profile:** `coreDensity` 1.02, `coreOpacity` 0.33, `anisotropy` 0.32, `depositionShape` "oval" — a genuine ellipse stamp (`ctx.ellipse`), not a line.
- **Moving stroke profile:** `coneShape` "fan" — core deposition is now `resolveShapedStampGeometry("oval", scale)`: a fixed-rotation ellipse (half-length ≈1.3×radius, half-width ≈0.55×radius, aspect ratio ≈2.4) stamped at both segment endpoints, tiling into a continuous swept band. The wide/narrow response is a geometric consequence of sweeping this fixed shape, not a separately-computed line-width multiplier.
- **Core/body character:** direction-dependent width via real shape geometry — wide crossing the axis, narrow along it — chisel-nib-like, softer and rounder than its Rectangular Transversal sibling.
- **Edge character:** balanced (`edgeFalloff` 0.74) — the softer of the two transversal caps.
- **Overspray character:** anchored to the fixed axis via `resolveOverspraySquashAngle` (unchanged from commit `31fc282`).
- **Motion/speed response:** medium (`velocityResponse` 0.72).
- **Orientation behavior:** `orientationBehavior` "fixed-transversal" — `resolveShapedStampGeometry` takes **no travel-angle input at all**, so the shape's rotation cannot follow the stroke tangent by construction, not just by convention.
- **Dwell behavior:** settled; no halo.
- **Drip status:** `dripTendency` 0.22.
- **Current visual strengths:** live-verified in the P0 build — horizontal/vertical/diagonal/loop matrix shows thin-parallel/thick-perpendicular width with a smooth, rounded, soft-edged loop outline and zero rotation-with-stroke artifact across every direction change.
- **Known visual defects:** the oval's exact aspect ratio (2.4, i.e. length:width ≈1.3:0.55) was chosen by screenshot judgment against the supplied references, not measured or derived from the reference photo's actual proportions.
- **Target behavior:** elongated oval footprint, rounded ends, fixed stable angle, softer/smoother character, no wiggle — all now hold at the mechanism level; magnitude unverified.
- **Exact next calibration test:** side-by-side against the rectangular-outlet reference sketch to judge whether 2.4:1 is the right aspect ratio for "oval," or should shift closer to/further from Rectangular Transversal's 3.9:1.

### 10. Rectangular Transversal
- **ID:** `transversal-slot` (new canonical id, added in the P0 build — never overwrote `calligraphy`) · **Family:** specialty
- **Classification:** NEEDS CALIBRATION (new cap; mechanism-complete, magnitude/shape unverified against a real reference)
- **Physical vs. digital:** represents the harder-edged, more mechanical half of the real rectangular/slot-outlet transversal cap family described in the P0 brief's new physical reference.
- **Documented width/range:** 14–34 (same range text as Oval Calligraphy — shares its `baseRadius`/scale family; unmeasured).
- **Digital Wall-space width:** `baseRadius` 25.
- **Dot profile:** `coreDensity` 1.02, `coreOpacity` 0.33, `anisotropy` 0.22 (lower than Oval's 0.32 — a stronger overspray squash too), `depositionShape` "slot" — a rotated rounded-rectangle path (`translate`+`rotate`+`arcTo` corners), not an ellipse and not a line.
- **Moving stroke profile:** `resolveShapedStampGeometry("slot", scale)`: half-length ≈1.55×radius, half-width ≈0.4×radius (aspect ratio ≈3.9 — more elongated than Oval's 2.4), plus a small softened corner radius (≈0.22×half-width) "for aerosol realism" per the brief, without reading as an oval.
- **Core/body character:** stronger side definition, more obvious wide/narrow contrast than Oval Calligraphy — confirmed both mathematically (`shapedStampWidthAlongTravel`'s swing ratio is larger for slot than oval) and visually (live-verified loop shows a visibly more angular/faceted outline than Oval's smooth roundness).
- **Edge character:** hard (`edgeFalloff` 0.85, vs. Oval's 0.74) — reads more mechanical/nozzle-like, per "should read more like a spray chisel/slot nozzle."
- **Overspray character:** anchored to the fixed axis (same mechanism as Oval), with a stronger squash from the lower `anisotropy`.
- **Motion/speed response:** medium (`velocityResponse` 0.72, same as Oval).
- **Orientation behavior:** `orientationBehavior` "fixed-transversal" — same no-travel-angle-input geometry guarantee as Oval Calligraphy.
- **Dwell behavior:** settled; no halo.
- **Drip status:** `dripTendency` 0.22 (same as Oval).
- **Current visual strengths:** live-verified in the P0 build — same directional matrix as Oval shows the same fixed-axis stability, with a visibly flatter/harder-edged, more contrasty result.
- **Known visual defects:** the slot's corner radius, aspect ratio, and `edgeFalloff` bump were all chosen by judgment, not measured against the reference photo's actual slot-outlet proportions. A genuine chisel nib traveling diagonally would show slanted-parallelogram end caps; this stamped-rounded-rect approach approximates that better than the old line-stroke did, but the corner rounding softens the true sharp-rectangular character somewhat.
- **Target behavior:** flatter rectangular/slot-like footprint, stronger side definition, more obvious wide/narrow contrast, stable fixed orientation, no automatic rotation with path tangent, no wiggle — all now hold at the mechanism level; exact proportions unverified.
- **Exact next calibration test:** diagonal-travel stroke inspected specifically for end-cap shape against the rectangular-outlet reference sketch, and a direct side-by-side with Oval Calligraphy at matched width to judge whether the contrast difference reads as intended at real drawing scale.

**Compatibility note (both caps above):** per the P0 brief's own suggested strategy, `calligraphy` was never renamed or forked — it keeps its exact id, only its display name changed ("Calligraphy / Transversal" → "Oval Calligraphy") and its rendering mechanism changed in place (line → oval stamp). This is safe under the Standing Rule in the checkpoint doc specifically because no artwork persistence exists yet (the same reasoning already used for german-fat's pre-fork numbers). `transversal-slot` is an entirely new id, additive only. `getSprayCapPreset("calligraphy")` continues to resolve correctly; no alias table changes were needed.

### 11. Needle
- **ID:** `needle` · **Family:** specialty
- **Classification:** NEEDS CALIBRATION (the specific "fuzzy" defect is now RESOLVED — corrected in the P0 build; exact magnitude unverified against a real reference)
- **Physical vs. digital:** represents the real "Needle" ultra-fine, high-pressure cap category.
- **Documented width/range:** 3–10 (tied narrowest with Wiggly Needle; unmeasured).
- **Digital Wall-space width:** `baseRadius` 5.
- **Dot profile:** `coreDensity` 1.58 (highest of all 16 caps, unchanged), `coreOpacity` 0.48 (raised from 0.42 — hotter, highest of all 16 caps), no halo.
- **Moving stroke profile (corrected):** `particleSpread` 0.65 (was 2.05, the widest of any cap — now one of the *tightest*), `particleOpacity` 0.16 (was 0.3, the highest — now well below New York Fat's 0.25), `particleCount` 9 (was 15), `edgeFalloff` 0.94 (was 0.92 — already near-tightest by this formula, nudged tighter still), `endpointBehavior` "tapered" (was "raw" — no longer shares Fuzz Fat/German Fat's identity), `jitter`/`velocityResponse`/`splatterProbability`/`dripTendency`/`flowRate`/`accumulationRate` unchanged (not in the audited field list, not identified as causes).
- **Core/body character:** extremely concentrated core (highest density/opacity of any cap) now paired with a genuinely tight, sparse overspray field — a real "pinline jet," not a hot core drowned in mist.
- **Edge character:** hard (was raw) — refined, not rough.
- **Overspray character:** restrained (was splattery) — sparse, faint specks read as authentic occasional sputter (`splatterProbability` 0.24 unchanged) rather than a bold cloud.
- **Motion/speed response:** high (`velocityResponse` 0.9, unchanged — audited, judged already correct).
- **Orientation behavior:** symmetric. Does **not** wiggle (`wiggleAmplitude` 0) — explicit requirement, unaffected by this correction.
- **Dwell behavior:** "loaded" stationary dot — still hot, no longer surrounded by a wide mist halo.
- **Drip status:** `dripTendency` 0.94 — highest of all caps (matches Wiggly Needle, its numeric twin), unchanged.
- **Root cause finding (corrects this audit's own earlier diagnosis):** `edgeFalloff` is *inversely* related to pass-to-pass core bloom (`edgeExpansion = 1 + passRatio*(1-edgeFalloff)*0.72`), so the old 0.92 value actually gave Needle one of the *tightest* cores already — the core was never the problem, contrary to this document's original (superseded) analysis. The actual fuzziness driver was overspray: `particleSpread` 2.05 (widest of any cap) × `particleOpacity` 0.3 (highest of any cap) × `particleCount` 15 produced a visible wide mist cloud around an already-hot core.
- **Current visual strengths:** live-verified in the P0 build — a drag reads as a tight, clean line with minimal visible mist, a clear departure from the old wide fuzzy halo. Distinct from Fuzz Fat (no longer shares "raw" endpoint identity; hotter core, tighter spread) and from Soft/Fade (opposite personality: hot/tight vs. weak/diffuse) — both confirmed by dedicated tests.
- **Known visual defects:** the corrected magnitudes (how tight, how hot) were chosen by screenshot judgment against the supplied references, not measured.
- **Target behavior:** concentrated pinline jet, tight dense core, much lower bloom, minimal mist compared with normal thin caps, optional sparse sputter, clean straight behavior — now holds at the mechanism level.
- **Exact next calibration test:** side-by-side against a real Needle reference photo/video to confirm the corrected magnitude (not just direction) is right — is 0.65 particleSpread too tight, too loose, or about right relative to a real high-pressure jet's actual mist?

### 12. Wiggly Needle
- **ID:** `wiggly-needle` · **Family:** specialty
- **Classification:** DIGITAL EFFECT
- **Physical vs. digital:** StudioRich digital specialty behavior — not a physical-cap target. Its deposition numbers are the *corrected* Needle's, byte-for-byte (re-forked in the P0 build specifically so it wouldn't silently retain the old fuzzy numbers — see Preserved Distinctions and the checkpoint doc).
- **Documented width/range:** 3–10 (identical display text to Needle; unmeasured).
- **Digital Wall-space width:** `baseRadius` 5.
- **Dot profile:** identical to corrected Needle's (same `coreDensity` 1.58/`coreOpacity` 0.48, no halo) — the wiggle only affects the *drawn path*, not the dot itself: at zero travel distance there is no defined travel angle, so a pure dwell dot is byte-identical to Needle's (confirmed by a dedicated test).
- **Moving stroke profile:** same corrected core/overspray numbers as Needle (tight `particleSpread` 0.65, faint `particleOpacity` 0.16, `particleCount` 9), plus a deterministic perpendicular lateral offset — amplitude 0.6× resolved radius, frequency 0.02 rad/ms against each point's own stored timestamp.
- **Core/body character:** identical to corrected Needle's — a clean, tight jet, now wandering instead of straight, not the old fuzzy cloud with a wiggle on top.
- **Edge character:** same as corrected Needle (hard/tapered, not raw).
- **Overspray character:** same as corrected Needle (restrained, tight).
- **Motion/speed response:** same as Needle (0.9).
- **Orientation behavior:** specialty oscillating — the only cap in this category by *behavior*. **Note:** the code's `orientationBehavior` enum (`SprayCapProfile.ts`) currently only distinguishes `"symmetric" | "fixed-transversal"`; Wiggly Needle's `CAP_PROFILE_DETAILS` entry is technically `"symmetric"` even though its actual behavior oscillates. This is a taxonomy gap, not a bug — nothing currently branches on this value for Wiggly Needle specifically — but it means the code's own metadata cannot yet distinguish "oscillating" from "symmetric" the way this audit's requested ORIENTATION taxonomy (symmetric / fixed elongated / rotated elongated / specialty oscillating) can.
- **Dwell behavior:** same as Needle (no distinct wiggle behavior at zero distance).
- **Drip status:** 0.94, same as Needle.
- **Current visual strengths:** live-verified in the P0 build (via timed synthetic pointer dispatch, since a single fast automated drag doesn't advance real elapsed time enough for the sine wave's phase to show) — reads as a smooth, bounded wave with the same tight, clean character as corrected Needle, clearly distinct from both the straight Needle line and the old fuzzy baseline.
- **Known visual defects:** none against its own target; wiggle amplitude/frequency remain judgment calls, not tuned against any reference.
- **Target behavior:** narrow output, intentionally oscillating/wavering trajectory, expressive instability, inheriting the corrected (not fuzzy) Needle personality — now holds fully.
- **Exact next calibration test:** amplitude/frequency checked at real hand-drawing speed for "expressive but controlled" vs. "distractingly jittery," now that the underlying deposition character is correct.

### 13. Soft / Fade
- **ID:** `soft-fade` · **Family:** specialty
- **Classification:** VERIFIED
- **Physical vs. digital:** no single named real cap maps to this as cleanly as the others — `LEGACY_CAP_ALIASES` maps both `"soft"` and `"dust-fog"` to this id, suggesting it represents a general low-pressure/dust-cap-style diffuse output rather than one specific named physical cap. Audited against real reference photos in the prior pass and found already correct.
- **Documented width/range:** 34–68 (unmeasured).
- **Digital Wall-space width:** `baseRadius` 50.
- **Dot profile:** `coreDensity` 0.36 (lowest of all 16 caps), `coreOpacity` 0.13 (lowest of all 16 caps), no halo — weak center by design.
- **Moving stroke profile:** `particleCount` 42 (highest of all 16 caps), `particleSpread` 1.6, `particleOpacity` 0.14 (low) — broad, misty, low-density field rather than a dense core.
- **Core/body character:** weak center, broad mist — matches prior audit language "broad/diffuse."
- **Edge character:** soft (`edgeFalloff` 0.28 — lowest of all 16 caps, i.e. the most pass-to-pass spread/softening).
- **Overspray character:** wide, high particle count, low per-particle opacity — genuinely diffuse rather than a fat cap with blur.
- **Motion/speed response:** `velocityResponse` 0.82.
- **Orientation behavior:** symmetric.
- **Dwell behavior:** settled, gradual accumulation (matches target, confirmed already correct).
- **Drip status:** `dripTendency` 0.04 — lowest of all 16 caps (a diffuse mist cap shouldn't drip).
- **Current visual strengths:** confirmed by direct photo audit — "clearly different from a fat cap with blur," matches target already, no changes made.
- **Known visual defects:** none identified.
- **Target behavior:** no change.
- **Exact next calibration test:** none required unless new reference evidence emerges.

### 14. Fuzz Fat
- **ID:** `fuzz-fat` · **Family:** specialty
- **Classification:** DIGITAL EFFECT
- **Physical vs. digital:** explicitly not a physical-cap target — a permanent StudioRich digital effect, forked verbatim from German/Hardcore Fat's pre-calibration numbers specifically so German/Hardcore Fat could later be recalibrated toward a real reference without disturbing this effect.
- **Documented width/range:** 28–50 (identical text to German/Hardcore Fat, inherited from the fork; unmeasured).
- **Digital Wall-space width:** `baseRadius` 38 (identical to German/Hardcore Fat).
- **Dot profile:** identical to German/Hardcore Fat's (`coreDensity` 1.06, `coreOpacity` 0.27, no halo).
- **Moving stroke profile:** identical to German/Hardcore Fat's (`edgeFalloff` 0.54, `jitter` 0.18, `splatterProbability` 0.28 — highest of all 16 caps, `endpointBehavior` "raw").
- **Core/body character:** fuzzy/hairy/dry-brush texture — its defining, intentional character.
- **Edge character:** raw.
- **Overspray character:** splattery, highest `splatterProbability` of any cap.
- **Motion/speed response:** 0.68.
- **Orientation behavior:** symmetric.
- **Dwell behavior:** standard core saturation, no halo.
- **Drip status:** 0.5.
- **Current visual strengths:** preserved byte-identical to German/Hardcore Fat's pre-fork numbers, verified by a dedicated automated test (`forks fuzz-fat from german-fat's exact current numeric behavior`) that still passes after this pass's cap-personality additions — untouched by the new halo/wiggle fields (both 0 on both caps).
- **Known visual defects:** none — not a correction target; any "fuzzy" quality is intentional.
- **Target behavior:** preserve exactly; must never be overwritten by German/Hardcore Fat recalibration.
- **Exact next calibration test:** none — regression-only. Any future German/Hardcore Fat recalibration should re-run the existing Fuzz-Fat-byte-identical test as its own gate.

### 15. Ring / Donut
- **ID:** `ring-donut` · **Family:** specialty
- **Classification:** DIGITAL EFFECT
- **Physical vs. digital:** StudioRich digital output archetype — explicitly not assigned to any confirmed physical cap. `depositionShape` "ring".
- **Documented width/range:** 36–62 (unmeasured).
- **Digital Wall-space width:** `baseRadius` 40.
- **Dot profile:** `ringRadius` 1.15× resolved radius, `ringThickness` 0.4× ring radius, `ringOpacity` 0.4 (peak, at the band), `centerOpacity` 0.05 (faint mist, dead center) — a real annular gradient (`SprayBrushEngine.resolveRingProfile`: center → near-zero moat → peak ring band → soft fading tail), not a blurred dot or Pink Dot with more halo. `haloRadius` 0 — the ring fields are this cap's own halo-equivalent mechanism, not a second stacked one.
- **Moving stroke profile:** the ring gradient is stamped at both segment endpoints per corePass (same pattern as `renderHalo`/the oval-slot stamps), so a moving stroke tiles into a continuous ringed/rimmed tube rather than collapsing into a solid fat line.
- **Core/body character:** hollow structure — lower center density, raised ring band, soft outer bloom. Loaded-cap-scale `coreDensity`/`accumulationRate`/`dripTendency`, similar territory to Pink Dot Fat, but structurally distinct (see below).
- **Edge character:** soft (`edgeFalloff` 0.7) plus the ring gradient's own soft outer tail.
- **Overspray character:** balanced (`particleCount` 20, `particleSpread` 1.15).
- **Motion/speed response:** `velocityResponse` 0.5.
- **Orientation behavior:** symmetric — the ring itself has no directional axis, unlike Oval/Rectangular Transversal.
- **Dwell behavior:** repeated dwell strengthens the ring band through ordinary source-over compositing (same no-new-state-tracking approach as halo) — live-verified: a longer dwell reads as a denser, more saturated ring than a quick tap, both clearly hollow.
- **Drip status:** `dripTendency` 0.5.
- **Current visual strengths:** live-verified — a four-way stationary-dot comparison (Ring/Donut, Pink Dot Fat, New York Fat, Soft/Fade) shows Ring/Donut as the only one with a visibly darker/hollow center inside a denser outer band; the other three are solid-filled (with or without an external halo) or diffuse with no ring structure at all.
- **Known visual defects:** none identified against its own target; the moving-stroke "ringed plume" character is present but reads more like a rimmed tube than a strongly hollow line at typical interpolation spacing — the hollow structure is clearest on dots/short dwells, per the brief's own emphasis ("dot/dwell personality emphasized").
- **Target behavior:** lower center density, stronger ring/annular band, soft outer bloom, optional faint center mist — holds for stationary/short-dwell output; moving-stroke hollowness is present but softer.
- **Exact next calibration test:** `ringRadius`/`ringThickness`/`ringOpacity` magnitude checked against a real donut-shaped/loaded-ring reference once one exists; a moving-stroke pass specifically judged for whether the hollow character should read more strongly at speed.

### 16. Dry / Streak
- **ID:** `dry-streak` · **Family:** specialty
- **Classification:** DIGITAL EFFECT
- **Physical vs. digital:** StudioRich digital output archetype — explicitly not assigned to any confirmed physical cap. `depositionShape` "streak".
- **Documented width/range:** 28–48 (unmeasured).
- **Digital Wall-space width:** `baseRadius` 34.
- **Dot profile:** `streakLanes` 5 — the concentric-pass core is replaced entirely by 5 parallel deterministic lanes (`SprayBrushEngine.renderStreakCore`), each independently gated on/off via `resolveStreakGate` (pure trig on resolved radius, lane index, and stroke-direction-projected position — no `Math.random`).
- **Moving stroke profile:** lanes spread perpendicular to the CURRENT travel angle (recomputed every segment, so the pattern re-orients with the stroke rather than sitting on a fixed world-space grid); each lane's gate is a smooth periodic function that dips fully to zero (a real gap, not just lower opacity) with a fixed per-lane phase offset so lanes gap out at different points along the stroke (the "ribbing"), not all together.
- **Core/body character:** directional broken coverage with internal striation — near-New-York-Fat-strength numbers (`coreOpacity` 0.34, `edgeFalloff` 0.66), deliberately NOT Fuzz Fat's raw/splattery numbers (`jitter` 0.05 vs. Fuzz Fat's 0.18, `splatterProbability` 0.06 vs. 0.28) — the texture comes entirely from the deterministic lane/gate mechanism, not randomness.
- **Edge character:** raw (`endpointBehavior` "raw" — sharp, dry-feeling lane ends).
- **Overspray character:** restrained (`particleCount` 14, low `splatterProbability`) — texture is carried by the lanes, not the overspray.
- **Motion/speed response:** `velocityResponse` 0.62.
- **Orientation behavior:** symmetric core-wise, but the lane pattern itself is direction-coherent by construction (see above) — a distinct sense of "orientation" from Oval/Rectangular Transversal's fixed-axis anisotropy.
- **Dwell behavior:** a stationary dwell reads as a small cluster of gated lane dots rather than a filled disc — not the primary intended use (this is fundamentally a moving-stroke archetype).
- **Drip status:** `dripTendency` 0.14 — low, consistent with a "dry" cap.
- **Current visual strengths:** live-verified — a three-way stroke comparison (Dry/Streak, Fuzz Fat, New York Fat) shows Dry/Streak as coherent chevron-like directional ribbing, structurally distinct from Fuzz Fat's random jittery/splattery texture and New York Fat's flat solid fill. Throwie Fill interaction confirmed: one sweep stays visibly broken/textured, three back-and-forth passes read denser while ribbing stays visible (never flattens to solid) — spatial-local Fill correctness unaffected (same ceiling math, called per-lane instead of per-pass).
- **Known visual defects:** none identified against its own target; all magnitude constants (cycle length, phase step, gate sharpness, lane spread) were tuned by screenshot judgment, not measurement.
- **Target behavior:** directional streaks/ribbing, visible gaps, broken coverage, coherent with stroke direction, repeated passes build naturally — holds at the mechanism level.
- **Exact next calibration test:** lane count/cycle-length/gate-sharpness checked against a real dry-cap or worn-nozzle reference once one exists; a dedicated Fill-mode throwie-fill session to judge whether the ribbing reads as "useful texture" or "distracting" at real tag/throwie scale.

---

## Unassigned / future output archetypes

None of the following correspond to a confirmed physical cap. They are named here as identified behavioral targets only, per the reference evidence and gaps surfaced by this and prior passes — **do not claim a specific physical-cap correspondence for any of these until real reference evidence supports it.**

1. ~~Ring / Donut~~ — **RESOLVED, now built** as cap #15, "Ring / Donut" (`ring-donut` id, `depositionShape: "ring"`). No longer a future archetype.

2. ~~Dry / Streak~~ — **RESOLVED, now built** as cap #16, "Dry / Streak" (`dry-streak` id, `depositionShape: "streak"`). No longer a future archetype.

3. ~~Rounded Oval Calligraphy~~ — **RESOLVED, now built** as cap #9, "Oval Calligraphy" (`calligraphy` id, `depositionShape: "oval"`). No longer a future archetype.

4. ~~Rectangular / Slot Transversal~~ — **RESOLVED, now built** as cap #10, "Rectangular Transversal" (new `transversal-slot` id, `depositionShape: "slot"`). No longer a future archetype.

5. **Loaded Dot / Halo (as a general trait)** — generalizing Pink Dot Fat's `haloRadius`/`haloOpacity` mechanism as a trait any cap could opt into, not just Pink Dot Fat. The mechanism exists in the engine now (`SprayBrushEngine.renderHalo`); it is not yet exposed as an independent, reusable trait beyond the one cap it was built for. Still open.

6. ~~Concentrated Needle Jet~~ — **RESOLVED, now built** directly into cap #11, "Needle" itself (not a separate identity — the corrected Needle *is* the concentrated jet). No separate archetype needed.

---

## Preserved distinctions (explicit, do not blur)

- **Fuzz Fat** is a StudioRich digital effect and must not be overwritten by German/Hardcore Fat calibration — enforced today by `SprayCapPresets.test.ts`'s byte-identical fork test, which must keep passing through any future German/Hardcore Fat recalibration. Untouched by the P0 build (still numerically identical to German/Hardcore Fat, confirmed passing). **One deliberate, documented exception as of the Fat-caps-default-to-Fill build:** `defaultFillMode` now differs (German/Hardcore Fat `true`, Fuzz Fat stays `false`) — a usage-mode divergence, not a rendering-physics one; the fork test was updated to exclude that one field from the byte-identical comparison while asserting the divergence explicitly. Every other field remains byte-identical.
- **Calligraphy trends toward stable elongated output, not wiggle** — now holds via genuine shape geometry (`resolveShapedStampGeometry` takes no travel-angle input at all), not just a fixed-axis width multiplier. Split into Oval Calligraphy (`calligraphy` id, softer/rounder) and Rectangular Transversal (`transversal-slot` id, harder/more contrasty) — see caps #9–10.
- **Transversal is now its own identity** (`transversal-slot`, "Rectangular Transversal") with a real shape distinction from Oval Calligraphy — the orientation/rotation-capable *control* (letting a user pick a different fixed axis, not just choose between Oval and Slot shapes) still does not exist; remains P1.
- **Needle no longer requires correction away from fuzzy behavior** — corrected in the P0 build (cap #11); root cause was overspray spread/opacity/count, not the core. Still needs physical-magnitude verification, but the reported defect is resolved.
- **Wiggly Needle is a separate intentional specialty behavior and a future Waveformer candidate** — re-forked from the *corrected* Needle in the same P0 build (verified byte-identical to Needle at zero travel distance), so it does not silently retain the old fuzzy personality.
- **Pink Dot** now uses a dedicated dual-plume mechanism (`depositionShape: "plume"`, cap #2 above) — one resolver (`resolvePinkDotDualPlume`) returns two coordinated CONTINUOUS layers, an inner core line and an outer atmosphere sheath, replacing the prior pass's dab-gated whole-plume-stamp architecture (which had regressed to lumpy/scalloped on a moving stroke). Distance-sensitive/angle-flared/center-plus-ring behavior all still apply, with distance and flare now split explicitly between the two layers (outer grows/flares more than inner) rather than moving together as one stamp. Remains physically unverified in exact magnitude. Core/overspray base physics (`coreDensity`/`coreOpacity`/`particleCount`/etc.) are untouched by this pass.
- **The generic halo mechanism** (`haloRadius`/`haloOpacity`/`haloDistanceGain`/`haloFlareAnisotropy`/`haloDabSpacing`/`haloRingBias`) is now 0 on every cap, including Pink Dot — retired from active use, but preserved as tested, dormant infrastructure (see the P2 "Loaded Dot/Halo as a general reusable trait" item below), not deleted.
- **Throwie Fill mode** is usage/deposition behavior (`ToolStrokeStyle.fillMode`, `SprayBrushEngine.fillLocalSaturation`), not a cap identity — it layers on top of whichever cap is active and remains unaffected; re-verified live after this build's changes (a partially-overlapping fill still shows denser overlap regions and lighter-but-present fresh territory, no fade-to-zero). **`defaultFillMode` (the per-preset field New York Fat/Pink Dot Fat/Astro Fat/German Hardcore Fat now set to `true`) only changes what a freshly-selected brush's Fill toggle starts at — it is a brush-authored starting POINT for a session/per-brush property, still fully user-togglable, never a separate cap identity or a change to the Fill algorithm itself.** Fat-cap default workflow is now FILL ON (characteristic partial-deposition/build-up read); dense solid-outline use remains available by manually switching Fill OFF, which is stored as a per-brush session modification exactly like Size/Coverage already were.
- **Ring/Donut and Dry/Streak are digital-effect output archetypes, not physical-cap identities** — classified alongside Fuzz Fat and Wiggly Needle (`CustomBrush.classifyBuiltInSprayCap`), never assigned to a real cap until reference evidence supports it. Both are live-verified structurally distinct from their nearest existing-cap neighbors (see caps #15–16).

---

## Spray Cap Calibration Bench V1 (infrastructure, not a calibration pass)

Every "magnitude unverified against a real reference" note throughout this doc now has a dedicated tool: Brush Studio's "Calibrate…" action opens a Left/Right side-by-side comparison of the real `SprayBrushEngine` output for any two Spray caps, across a fixed deterministic ten-sample matrix (quick dot, short/long dwell, slow/fast straight, curve, start/stop, Fill one-sweep, Fill three-pass, diagonal). It supports Native width (each cap's own `baseRadius` — shows raw size difference) and Matched Width (`min` of the two selected `baseRadius` values, Bench-local only, never written back to a preset) so size and deposition-character differences can be judged separately. A property readout and a percentage difference table (real field values only, no subjective wording) sit alongside the matrix, along with each cap's classification from this doc (surfaced, never promoted by the Bench itself) and an eight-field session-only reference-notes area for logging observations against a real photo once one is available.

This is the physical-reference workflow every "Exact next calibration test" line below now has infrastructure for: open the Bench, put the digital cap on one side, describe the reference photo/video in the notes fields on the other, and use the matrix + difference table to judge the gap. It does not itself move any cap from PROVISIONAL/NEEDS CALIBRATION to VERIFIED — that stays a human decision, made after an actual reference comparison, updated in both `SprayCapCalibrationStatus.ts` and this doc together.

First live proof: Astro Fat vs. New York Fat (see cap #3 / #1 above) in both Native and Matched Width — confirmed the P0 differentiation work above survives width normalization (Astro's hotter core and softer bloom stay visible even at New York Fat's own 32-unit size), not just a raw-size difference. See `0911_SPATIAL_SPRAYPAINT_V0.6.3_CURRENT.md`'s "Spray Cap Calibration Bench V1" section for full build detail. German/Hardcore Fat was not touched by this build; the Bench makes it directly comparable the moment reference evidence arrives, per this doc's own P2 item below.

## Prioritized calibration queue

### P0 (as directed)
1. ~~**Needle correction**~~ — **DONE.** See cap #11; root cause corrected (overspray, not core), Wiggly Needle re-forked from the corrected result.
2. ~~**Calligraphy split/correction**~~ — **DONE.** Split into Oval Calligraphy (cap #9) and Rectangular Transversal (cap #10), both with genuine fixed-orientation shape geometry, not a line-width trick.
3. ~~**Ring archetype**~~ — **DONE.** See cap #15, "Ring / Donut" — a genuine annular gradient mechanism (`resolveRingProfile`), live-verified structurally distinct from Pink Dot/New York Fat/Soft-Fade.
4. ~~**Dry/Streak archetype**~~ — **DONE.** See cap #16, "Dry / Streak" — deterministic multi-lane gated core (`resolveStreakGate`), live-verified structurally distinct from Fuzz Fat and normal fat caps, Fill-mode interaction confirmed.
5. ~~**Astro / New York Fat differentiation**~~ — **DONE.** Astro Fat's `coreDensity`/`coreOpacity`/`flowRate`/`accumulationRate`/`particleCount`/`particleSpread`/`particleOpacity`/`edgeFalloff`/`endpointBehavior` corrected (see cap #3); New York Fat left unchanged as the reference baseline (see cap #1); live-verified visibly and behaviorally distinct at every tested dwell length, stroke speed, and Fill sweep. **German/Hardcore Fat differentiation remains explicitly blocked** on reference-evidence acquisition — no change this pass, still the top remaining open item within this line.
6. ~~**Calibration Bench V1**~~ — **DONE.** See the "Spray Cap Calibration Bench V1 (infrastructure)" section above — a deterministic Left/Right comparison tool (Native + Matched Width, property/difference readout, classification display, session-only reference notes, text snapshot) reached from Brush Studio's "Calibrate…" action. Infrastructure only — moves no cap's classification and retunes nothing; first live proof run against Astro Fat vs. New York Fat. German/Hardcore Fat untouched, now directly comparable via the Bench the moment reference evidence arrives.
7. ~~**Pink Dot Fat correction**~~ — **DONE (superseded by item 8 below).** Original halo-only correction: distance-sensitive/oblique-flared/dab-spaced/center+ring against physical reference footage.
8. ~~**Pink Dot Fat unified plume**~~ — **DONE (superseded by item 9 below).** See item 9 — a moving stroke read as two independent systems (generic core stroke + separately-timed halo) even after item 7's correction; replaced with `depositionShape: "plume"`, a dedicated mechanism resolving core+ring+mist together from one state (`resolvePinkDotPlume`) and drawing them as one dab-spaced stamp. Adds an input-neutral simulated spray-angle control (Brush Studio "Spray Angle" property + live Alt+scroll-wheel shortcut) so flare can be tested on desktop; angle and velocity both drive elongation, the stronger one wins.
9. ~~**Pink Dot Fat dual-plume**~~ — **DONE (refined by item 10 below).** See cap #2 above — the unified-plume stamp from item 8 still read as lumpy/scalloped on a moving line, because it stamped the whole plume (core included) at dab-gated intervals rather than drawing it continuously. Replaced with `resolvePinkDotDualPlume`, one resolver returning two coordinated CONTINUOUS layers (inner core, outer atmosphere), both drawn every segment with no gating at all — `plumeDabSpacing` removed entirely. Distance response now applies structurally only to the outer layer (outer grows faster than inner by construction); flare applies to both layers from one shared factor, outer full-strength, inner at half. Fill-ceiling stays core-only, unchanged convention. Live-verified full required matrix (dot, short/long line, slow/fast, zigzag, loop, reversal, 0°/45° angle, one/three Fill sweeps) at default size: clean bullseye, continuous lines through every joint type, coherent whole-plume flare, dusty Fill buildup with no flat-bar or scalloped-sausage read. Core/overspray base physics untouched; every other cap regression-tested unaffected.
10. ~~**Pink Dot Fat dual-plume refinement — outer field + dwell-driven endpoints**~~ — **DONE (corrected by item 11 below).** See cap #2 above — item 9's outer layer still read as a second smooth translucent tube (two flat, uniform-opacity bands), and any near-zero-distance point (a bare click, an immediate release) deposited a full-size bulb regardless of real dwell time. Added real dwell-time tracking (`pinkDotDwellMs`, `resolvePinkDotDwellScale`): a near-zero-distance segment ramps from a ~0.22 floor to full size over 900ms of genuine stationary time, resetting instantly on real movement. The outer-field density-shell mechanism from this item was itself superseded by item 11.
11. ~~**Pink Dot Fat true radial density minimum — explicit core/gap/outer-ring**~~ — **DONE.** See cap #2 above — human visual review found item 10's outer field still read as "dense core → fuzzy edge → continuous haze": its concentric solid-disk shells could raise density but never dip it, since a disk of radius R always covers everything from 0 to R. Replaced with a genuine four-zone radial profile (`resolvePinkDotOuterFieldStops`) for a true stationary dwell — core-edge → a strictly suppressed moat minimum → a ring peak → a fading mist, evaluated per-pixel by a `createRadialGradient` so the moat is a real mathematical dip. A first attempt at sweeping that SAME gradient repeatedly along a moving path failed too (overlapping disks fill the moat back in, confirmed by a fully flat live pixel trace) — fixed with `resolvePinkDotOuterFieldBands`, sweeping the ring/mist zones as two offset parallel strokes at a fixed perpendicular distance from the path instead, leaving the moat genuinely unpainted. Overspray's own particle spread got a matching perpendicular-corridor exclusion so stray speckle can't refill the gap either. Which technique renders required gating on BOTH accumulated dwell time and `point.velocity` together, since raw per-segment distance alone misclassified genuine slow continuous movement (subdivided finely by curve smoothing) as one long dwell. Live pixel sampling (not just visual screenshot inspection) confirmed the moat now drops to background level on a moving line, and a 400%-zoom stationary dot shows an unmistakable bullseye. 439/439 tests passing.

### P1
- Every "magnitude verification" item below can now be run through the Calibration Bench (Left = the digital cap, Right = whichever built-in cap is the nearest useful comparison, reference notes logged alongside) — the Bench does not replace acquiring the reference evidence itself, only the comparison workflow once it exists.
- **Pink Dot plume physical calibration** — tune the core's own base values, the seven `plume*` fields (ring/mist radius-thickness-opacity, distance gain, flare strength), the dwell-ramp duration, AND the radial zone boundaries (`RADIAL_CORE_END_T`/`RADIAL_MOAT_END_T`/`RADIAL_RING_END_T`, the moat suppression ratio) against a real loaded-dot reference at multiple distances/angles/speeds/dwell-lengths once available (cap #2's exact next test).
- **Thin-cap family differentiation pass** — Lego Thin / Universal Thin / Level 1 vs. New York Thin's already-verified baseline (caps #5–7's shared next test).
- **Oval vs. Rectangular Transversal magnitude verification** — both caps' aspect ratios (2.4 vs. 3.9) and Rectangular's corner radius were judgment calls; check against the reference sketch's actual proportions.
- **Needle's corrected magnitude verification** — direction is now right (tight, hot); exact numbers (how tight, how hot) are still a judgment call pending a real Needle reference.
- **Transversal configurable rotation control** — a genuinely new item now: letting a user pick a different fixed axis (not just choose Oval vs. Slot shape). Needs a UI control beyond this build's scope.
- **Ring/Donut and Dry/Streak magnitude verification** — every numeric constant in both (ring radius/thickness/opacity, streak lane count/cycle length/phase step/gate sharpness) was a judgment call against the target description, not a reference photo; neither archetype has one yet.

### P2
- **Loaded Dot/Halo as a general reusable trait** (archetype #5) — speculative until a second cap besides Pink Dot Fat is identified as needing it.
- **German/Hardcore Fat full numeric recalibration** — sits at P2 not for lack of importance but because it is blocked on reference-evidence acquisition and cannot be worked further right now regardless of priority.
- **Waveformer audio-modulation mapping for Wiggly Needle** — explicitly out of scope until Waveformer itself exists.
- **True physical (cm/inch) width calibration across every cap** — blocked on real measurement data for the entire set, not just one cap.
