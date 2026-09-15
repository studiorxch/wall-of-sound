# Spray Cap Visual Audit — V0.6.3

Date: 2026-09-15

Status: DOCUMENTATION ONLY. No runtime code, presets, or UI were modified to produce this audit. It is the canonical inventory of every currently defined Spray cap plus every currently identified (not yet built) future cap-output archetype, as of commit `31fc282` (`feat: Spray cap personalities — Pink Dot halo, fixed-axis Calligraphy overspray, Wiggly Needle`).

## Sources used

- `src/SprayCapPresets.ts` — `SPRAY_CAP_PRESETS` (13 entries) and `resolveSprayDynamics`.
- `src/SprayCapProfile.ts` — `CAP_PROFILE_DETAILS` (coneShape, edge/overspray/output character, orientation behavior, calibration notes, `nominalWidthRange`).
- `src/main.ts` — how `baseRadius` actually reaches a live stroke.
- `0911_SPATIAL_SPRAYPAINT_V0.6.3_CURRENT.md` — prior audit findings ("V0.6 Visual Calibration Pass", "Throwie Fill Deposition V1", "V1.1 — Spatial Correctness Fix", "Spray Cap Personality + Specialty Cap Correction").
- Commit `31fc282` and its live-verification results (Pink Dot vs New York Fat dwell dots, Calligraphy zigzag, Needle vs Wiggly Needle drag, Throwie Fill overlap).
- `SprayCapPresets.test.ts` / `SprayCapProfile.test.ts` / `SprayBrushEngine.test.ts` for what is actually regression-locked today.

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
- **Current visual strengths:** reads as a controlled, usable tag/outline line; live-verified (commit `31fc282`) as the sharp-edged, even-density baseline against which Pink Dot Fat's new halo now reads as clearly distinct.
- **Known visual defects:** none newly identified; no dedicated photo-matched calibration has been run against it specifically.
- **Target behavior:** keep as the controlled baseline fat cap; current evidence indicates no change.
- **Exact next calibration test:** side-by-side outline/tag stroke against a real NY-Fat reference photo at matched apparent width, to move PROVISIONAL → VERIFIED or surface a defect.

### 2. Pink Dot Fat
- **ID:** `pink-dot-fat` · **Family:** fat
- **Classification:** NEEDS CALIBRATION (mechanism added this pass; explicitly physically unverified — see Preserved Distinctions)
- **Physical vs. digital:** represents the real "Pink Dot" loaded-cap category. Core+halo mechanism newly added in commit `31fc282`; not measured against a real Pink Dot photo/video for radius/opacity accuracy.
- **Documented width/range:** 34–54 (unmeasured).
- **Digital Wall-space width:** `baseRadius` 42.
- **Dot profile:** `coreDensity` 1.46, `coreOpacity` 0.34 (both highest of the fat family) plus `haloRadius` 2.4× resolved radius, `haloOpacity` 0.05 per draw (accumulates with dwell) — the defining core+halo bloom.
- **Moving stroke profile:** `endpointBehavior` "punchy", `accumulationRate` 1.38 (highest of the fat family) — builds density fastest.
- **Core/body character:** loaded center, strong dot personality — now structurally distinct from New York Fat (separate halo mechanism), not just denser.
- **Edge character:** `edgeFalloff` 0.76 (softer pass-to-pass expansion) plus the halo's own soft gradient boundary.
- **Overspray character:** wide/pronounced (`particleCount` 26, `particleSpread` 1.2, `splatterProbability` 0.14).
- **Motion/speed response:** lower than New York Fat (`velocityResponse` 0.42) — stays denser at speed, consistent with a "loaded" character.
- **Orientation behavior:** symmetric round.
- **Dwell behavior:** halo redrawn at the same point strengthens the center and widens the visible soft field, purely via ordinary compositing — live-verified (dwell dot materially larger/denser than a quick tap).
- **Drip status:** `dripTendency` 0.72 — highest of the fat family.
- **Current visual strengths:** live-verified (commit `31fc282`) core+halo bloom is now structurally distinguishable from New York Fat's hard-edged disc at similar nominal width — resolves this task's core complaint at the mechanism level.
- **Known visual defects:** `haloRadius`/`haloOpacity` magnitudes were chosen by screenshot judgment against supplied reference photos, not measured — may be over- or under-scaled relative to a real Pink Dot's atmospheric spread.
- **Target behavior:** dense/hot center, softer atmospheric outer ring, visibly larger mist field, dwell strengthens center — mechanism present; magnitude unverified.
- **Exact next calibration test:** stationary-dot side-by-side against the supplied Pink Dot reference photo at matched scale to tune `haloRadius`/`haloOpacity` numerically, plus a moving-stroke pass to confirm the halo doesn't overwhelm line legibility at tag speed.

### 3. Astro Fat
- **ID:** `astro-fat` · **Family:** fat
- **Classification:** PROVISIONAL
- **Physical vs. digital:** represents a real high-output "Astro"-class cap. "Not yet matched to a physical Astro cap at measured distance" (calibration notes).
- **Documented width/range:** 48–78 (widest of all caps; unmeasured).
- **Digital Wall-space width:** `baseRadius` 62 (largest of all caps).
- **Dot profile:** `coreDensity` 1.28, `coreOpacity` 0.3, no halo — same mechanism as New York Fat, scaled up.
- **Moving stroke profile:** highest `particleCount` of all caps (38), `particleSpread` 1.34, `flowRate` 1.56 — aggressive/high-output plume by design.
- **Core/body character:** very broad/high-output; strong fill usefulness per target.
- **Edge character:** soft (`edgeFalloff` 0.64 — lowest of the fat family, most pass-to-pass softening).
- **Overspray character:** wide, `splatterProbability` 0.18.
- **Motion/speed response:** least speed-sensitive of the fat family (`velocityResponse` 0.36) — stays aggressive regardless of movement.
- **Orientation behavior:** symmetric round.
- **Dwell behavior:** no halo; dwell saturates the (already large) core.
- **Drip status:** `dripTendency` 0.66 — second-highest of the fat family.
- **Current visual strengths:** numerically the most differentiated fat cap from New York Fat (radius, particle count, flow all clearly higher).
- **Known visual defects:** no dedicated photo comparison against a real Astro cap has been run.
- **Target behavior:** "very broad/high-output, strong fill usefulness, larger plume/aggressive output" — numerically aligned already; not yet visually confirmed against Astro-specific reference.
- **Exact next calibration test:** Astro Fat vs. New York Fat side-by-side moving-stroke and fill-sweep comparison (explicitly called for by this task's live calibration sheet; not yet run as a dedicated live test).

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
- **Dot profile:** `coreDensity` 1.2 (highest of the thin family), `coreOpacity` 0.38 (highest of the thin family), `stationaryDotBehavior` "loaded" (shared only with Pink Dot Fat among all 13).
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

### 9. Calligraphy / Transversal
- **ID:** `calligraphy` · **Family:** specialty
- **Classification:** NEEDS CALIBRATION
- **Physical vs. digital:** represents a real rectangular/slot-outlet transversal cap. This task's new physical reference states the real cap uses a rectangular/slot-like outlet; the current implementation is a width-modulated line-stroke approximation, not a true rectangular footprint.
- **Documented width/range:** 14–34 (unmeasured).
- **Digital Wall-space width:** `baseRadius` 25.
- **Dot profile:** `coreDensity` 1.02, `coreOpacity` 0.33, `anisotropy` 0.32 — the only cap below 1, defining its elongated identity.
- **Moving stroke profile:** `coneShape` "fan" (unique among all caps) — core width now varies by travel angle relative to a fixed axis (`TRANSVERSAL_AXIS_ANGLE`, matching the Marker Chisel's own nib-angle convention).
- **Core/body character:** direction-dependent width — wide crossing the axis, narrow along it — chisel-nib-like, not a uniform line.
- **Edge character:** balanced (`edgeFalloff` 0.74).
- **Overspray character:** as of commit `31fc282`, anchored to the fixed axis via `resolveOverspraySquashAngle` instead of rotating with travel — the specific fix for the "rotating ribbon" complaint.
- **Motion/speed response:** medium (`velocityResponse` 0.72).
- **Orientation behavior:** `orientationBehavior` "fixed-transversal" — the only cap with this designation; orientation stays constant regardless of travel direction (both core width and, as of this pass, overspray).
- **Dwell behavior:** settled; no halo.
- **Drip status:** `dripTendency` 0.22.
- **Current visual strengths:** live-verified this pass — a zigzag stroke reads as one coherent chisel-like sweep with no visible plume rotation; direction-dependent width (parallel = narrow, perpendicular = wide) reconfirmed live, matching standard broad-nib calligraphy-pen physics.
- **Known visual defects:** the deposition footprint is still a width-modulated **round-capped line stroke**, not a true rectangular/slot polygon — a genuine chisel nib leaves a parallelogram with slanted ends at the fixed axis angle when traveling diagonally; the current approximation only varies perpendicular width, so a diagonal stroke's end caps stay round/butt rather than slanted. Transversal's own configurable rotation control does not exist yet — still one shared cap identity with a fixed axis (see Unassigned Archetypes #3–4).
- **Target behavior:** rectangular/elongated deposition footprint, fixed orientation, default angled axis, broad when crossing / narrow when aligned, no wiggle — width/orientation/no-wiggle now hold; true rectangular-footprint geometry does not yet exist.
- **Exact next calibration test:** a diagonal-travel stroke inspected specifically for end-cap shape (slanted parallelogram vs. round/butt) against the new rectangular-outlet reference sketch, to decide whether a true polygon-footprint renderer is warranted or the line-stroke approximation is visually sufficient.

### 10. Needle
- **ID:** `needle` · **Family:** specialty
- **Classification:** NEEDS CALIBRATION (per this task's explicit instruction — supersedes the prior pass's "no change needed" finding)
- **Physical vs. digital:** represents the real "Needle" ultra-fine, high-pressure cap category.
- **Documented width/range:** 3–10 (tied narrowest with Wiggly Needle; unmeasured).
- **Digital Wall-space width:** `baseRadius` 5.
- **Dot profile:** `coreDensity` 1.58 (highest of all 13 caps), `coreOpacity` 0.42 (highest of all 13 caps), no halo.
- **Moving stroke profile:** `particleSpread` 2.05 (highest of all caps, by a wide margin), `splatterProbability` 0.24 (second-highest of all caps), `edgeFalloff` 0.92 (highest of all caps — most pass-to-pass expansion), `jitter` 0.12, `endpointBehavior` "raw".
- **Core/body character:** extremely concentrated core (highest density/opacity of any cap) surrounded by the widest, splatteriest overspray field of any cap.
- **Edge character:** raw.
- **Overspray character:** splattery, very wide.
- **Motion/speed response:** high (`velocityResponse` 0.9).
- **Orientation behavior:** symmetric.
- **Dwell behavior:** "loaded" stationary dot.
- **Drip status:** `dripTendency` 0.94 — highest of all caps (matches Wiggly Needle, its numeric twin).
- **Current visual strengths:** a genuinely hot, concentrated core — highest `coreDensity`/`coreOpacity` in the set. The "jet" character is present at the core level.
- **Known visual defects:** the combination of maximal `edgeFalloff` (0.92) and maximal `particleSpread` (2.05) means both the core's own multi-pass expansion and its overspray push outward aggressively — very likely what reads as "fuzzy" rather than a tight concentrated jet. This task explicitly flags Needle as needing correction away from that fuzzy read.
- **Target behavior:** a tighter, more concentrated jet character — reduced edge expansion and/or narrower particle spread while preserving the hot core, without merging into Wiggly Needle's separate wander behavior.
- **Exact next calibration test:** Needle vs. a "Concentrated Needle Jet" candidate (see Unassigned Archetypes #6) side by side at matched width, varying `edgeFalloff` and `particleSpread` in isolation first, to identify which one actually drives the fuzzy read before touching both at once.

### 11. Wiggly Needle
- **ID:** `wiggly-needle` · **Family:** specialty
- **Classification:** DIGITAL EFFECT
- **Physical vs. digital:** StudioRich digital specialty behavior — not a physical-cap target. Its deposition numbers are Needle's, byte-for-byte (same fork discipline as Fuzz Fat), so any physical-calibration work on Needle should be explicitly mirrored here or explicitly forked away — see Preserved Distinctions.
- **Documented width/range:** 3–10 (identical display text to Needle; unmeasured).
- **Digital Wall-space width:** `baseRadius` 5.
- **Dot profile:** identical to Needle's (same `coreDensity`/`coreOpacity`, no halo) — the wiggle only affects the *drawn path*, not the dot itself: at zero travel distance there is no defined travel angle, so a pure dwell dot is presently indistinguishable from Needle's.
- **Moving stroke profile:** same core/overspray numbers as Needle, plus a deterministic perpendicular lateral offset — amplitude 0.6× resolved radius, frequency 0.02 rad/ms against each point's own stored timestamp.
- **Core/body character:** identical to Needle's (whatever Needle's fuzzy-vs.-jet state is, Wiggly Needle inherits it directly, by design).
- **Edge character:** same as Needle (raw).
- **Overspray character:** same as Needle (splattery, wide).
- **Motion/speed response:** same as Needle (0.9).
- **Orientation behavior:** specialty oscillating — the only cap in this category by *behavior*. **Note:** the code's `orientationBehavior` enum (`SprayCapProfile.ts`) currently only distinguishes `"symmetric" | "fixed-transversal"`; Wiggly Needle's `CAP_PROFILE_DETAILS` entry is technically `"symmetric"` even though its actual behavior oscillates. This is a taxonomy gap, not a bug — nothing currently branches on this value for Wiggly Needle specifically — but it means the code's own metadata cannot yet distinguish "oscillating" from "symmetric" the way this audit's requested ORIENTATION taxonomy (symmetric / fixed elongated / rotated elongated / specialty oscillating) can.
- **Dwell behavior:** same as Needle (no distinct wiggle behavior at zero distance).
- **Drip status:** 0.94, same as Needle.
- **Current visual strengths:** live-verified this pass — a straight drag reads as a clean, smooth, bounded sine wave, clearly distinct from Needle's straight line at identical settings; deterministic (timestamp-driven, not `Math.random`), so it replays identically.
- **Known visual defects:** none against its own target; it directly inherits whatever "fuzzy" defect Needle has, since the deposition numbers are shared.
- **Target behavior:** narrow output, intentionally oscillating/wavering trajectory, expressive instability — met at the mechanism level; amplitude/frequency were chosen by screenshot judgment, not tuned against any reference.
- **Exact next calibration test:** once Needle's own core/overspray correction is done, explicitly decide whether to mirror that fix into Wiggly Needle or intentionally fork it — do not let the two silently diverge or silently stay coupled without a decision. Separately, check amplitude/frequency at real hand-drawing speed for "expressive but controlled" vs. "distractingly jittery."

### 12. Soft / Fade
- **ID:** `soft-fade` · **Family:** specialty
- **Classification:** VERIFIED
- **Physical vs. digital:** no single named real cap maps to this as cleanly as the others — `LEGACY_CAP_ALIASES` maps both `"soft"` and `"dust-fog"` to this id, suggesting it represents a general low-pressure/dust-cap-style diffuse output rather than one specific named physical cap. Audited against real reference photos in the prior pass and found already correct.
- **Documented width/range:** 34–68 (unmeasured).
- **Digital Wall-space width:** `baseRadius` 50.
- **Dot profile:** `coreDensity` 0.36 (lowest of all 13 caps), `coreOpacity` 0.13 (lowest of all 13 caps), no halo — weak center by design.
- **Moving stroke profile:** `particleCount` 42 (highest of all 13 caps), `particleSpread` 1.6, `particleOpacity` 0.14 (low) — broad, misty, low-density field rather than a dense core.
- **Core/body character:** weak center, broad mist — matches prior audit language "broad/diffuse."
- **Edge character:** soft (`edgeFalloff` 0.28 — lowest of all 13 caps, i.e. the most pass-to-pass spread/softening).
- **Overspray character:** wide, high particle count, low per-particle opacity — genuinely diffuse rather than a fat cap with blur.
- **Motion/speed response:** `velocityResponse` 0.82.
- **Orientation behavior:** symmetric.
- **Dwell behavior:** settled, gradual accumulation (matches target, confirmed already correct).
- **Drip status:** `dripTendency` 0.04 — lowest of all 13 caps (a diffuse mist cap shouldn't drip).
- **Current visual strengths:** confirmed by direct photo audit — "clearly different from a fat cap with blur," matches target already, no changes made.
- **Known visual defects:** none identified.
- **Target behavior:** no change.
- **Exact next calibration test:** none required unless new reference evidence emerges.

### 13. Fuzz Fat
- **ID:** `fuzz-fat` · **Family:** specialty
- **Classification:** DIGITAL EFFECT
- **Physical vs. digital:** explicitly not a physical-cap target — a permanent StudioRich digital effect, forked verbatim from German/Hardcore Fat's pre-calibration numbers specifically so German/Hardcore Fat could later be recalibrated toward a real reference without disturbing this effect.
- **Documented width/range:** 28–50 (identical text to German/Hardcore Fat, inherited from the fork; unmeasured).
- **Digital Wall-space width:** `baseRadius` 38 (identical to German/Hardcore Fat).
- **Dot profile:** identical to German/Hardcore Fat's (`coreDensity` 1.06, `coreOpacity` 0.27, no halo).
- **Moving stroke profile:** identical to German/Hardcore Fat's (`edgeFalloff` 0.54, `jitter` 0.18, `splatterProbability` 0.28 — highest of all 13 caps, `endpointBehavior` "raw").
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

---

## Unassigned / future output archetypes

None of the following correspond to a confirmed physical cap. They are named here as identified behavioral targets only, per the reference evidence and gaps surfaced by this and prior passes — **do not claim a specific physical-cap correspondence for any of these until real reference evidence supports it.**

1. **Ring / Donut** — a hollow ring/donut-shaped deposition (dense ring, lighter or empty center) instead of a filled dot. No current mechanism produces this — every cap's core is a filled stroke/dot. Would need either an inverse-alpha center mask or a stroked (unfilled) ring drawn per point. Not started.

2. **Dry / Streak** — an under-loaded/dry-cap output: streaky, broken, textured coverage with visible gaps, rather than the continuous coverage every current cap produces. Closer to a real cap running low on paint or held too far from the surface. Would need a texture/gap mechanism (e.g. probabilistic per-pass alpha dropout or a noise-masked core) that doesn't exist in the engine today. Not started.

3. **Rounded Oval Calligraphy** — an elongated-but-*rounded* (oval, not rectangular) fixed-orientation footprint. Worth naming explicitly because it may already be closer to what the *current* Calligraphy cap effectively produces today (a width-modulated round-capped line reads more "oval" than "rectangular") — flagged here as a decision point: is today's Calligraphy actually this archetype under a different name, or should it become archetype #4 below and this stay a distinct, softer alternative?

4. **Rectangular / Slot Transversal** — the true rectangular/slot-outlet footprint described in this task's new physical reference: fixed orientation, slanted-parallelogram end caps on diagonal travel, sharp rectangular corners rather than round ones. Does not exist yet. Current Calligraphy is a round-capped-line approximation of this target (see cap #9 above).

5. **Loaded Dot / Halo (as a general trait)** — generalizing Pink Dot Fat's new `haloRadius`/`haloOpacity` mechanism as a trait any cap could opt into, not just Pink Dot Fat. The mechanism exists in the engine now (`SprayBrushEngine.renderHalo`); it is not yet exposed as an independent, reusable trait beyond the one cap it was built for.

6. **Concentrated Needle Jet** — a corrected Needle variant with the same hot, dense core but a much tighter edge/overspray field (lower `edgeFalloff`, narrower `particleSpread`) than today's Needle. The direct target of Needle's P0 correction item (see queue below); listed as its own archetype because the corrected result may end up warranting a distinct identity from both "fixed Needle" and "Wiggly Needle," depending on how much the correction changes its character.

---

## Preserved distinctions (explicit, do not blur)

- **Fuzz Fat** is a StudioRich digital effect and must not be overwritten by German/Hardcore Fat calibration — enforced today by `SprayCapPresets.test.ts`'s byte-identical fork test, which must keep passing through any future German/Hardcore Fat recalibration.
- **Calligraphy** should trend toward stable elongated output, not wiggle — the fixed-axis core width (prior pass) and fixed-axis overspray (commit `31fc282`) both hold today; the remaining gap is footprint shape (line-stroke approximation vs. true rectangular polygon), not orientation stability.
- **Transversal** should eventually be treated as the orientation/rotation-capable variation of this elongated family — does not exist as a separate identity yet; Calligraphy currently has one shared fixed axis with no rotation control.
- **Needle** currently requires correction away from fuzzy behavior — flagged NEEDS CALIBRATION above (cap #10), P0 in the queue below.
- **Wiggly Needle** is a separate intentional specialty behavior and a future Waveformer candidate — its deposition numbers are shared with Needle today by deliberate fork, not by accident; a decision is needed on whether Needle's upcoming correction should be mirrored into it.
- **Pink Dot** now has core+halo behavior but remains physically unverified — mechanism-complete (cap #2 above), magnitude unverified against a real reference.
- **Throwie Fill mode** is usage/deposition behavior (`ToolStrokeStyle.fillMode`, `SprayBrushEngine.fillLocalSaturation`), not a cap identity — it layers on top of whichever cap is active and is unaffected by this audit or by any cap-personality work above it.

---

## Prioritized calibration queue

### P0 (as directed)
1. **Needle correction** — reduce the fuzzy read (see cap #10) without disturbing Wiggly Needle's shared numbers without a decision.
2. **Calligraphy split/correction** — resolve the Rounded-Oval-vs-Rectangular-Slot question (archetypes #3–4) and decide whether a true polygon footprint is warranted.
3. **Ring archetype** — no current mechanism; earliest of the wholly-new archetypes to scope.
4. **Dry/Streak archetype** — no current mechanism; second new archetype to scope.
5. **Astro / New York Fat / German-Hardcore differentiation** — Astro-vs-NY-Fat live comparison is overdue (never run as a dedicated test); German/Hardcore is blocked on reference evidence acquisition specifically.

### P1
- **Pink Dot halo physical calibration** — tune `haloRadius`/`haloOpacity` magnitude against a real loaded-dot reference once available (cap #2's exact next test).
- **Thin-cap family differentiation pass** — Lego Thin / Universal Thin / Level 1 vs. New York Thin's already-verified baseline (caps #5–7's shared next test).
- **Transversal configurable rotation control** — the deferred item from commit `31fc282`; needs a new cap identity plus a minimal UI control.
- **Wiggly Needle fork-or-mirror decision** — must be made explicitly once Needle's P0 correction lands, not left implicit.

### P2
- **Loaded Dot/Halo as a general reusable trait** (archetype #5) — speculative until a second cap besides Pink Dot Fat is identified as needing it.
- **German/Hardcore Fat full numeric recalibration** — sits at P2 not for lack of importance but because it is blocked on reference-evidence acquisition and cannot be worked further right now regardless of priority.
- **Waveformer audio-modulation mapping for Wiggly Needle** — explicitly out of scope until Waveformer itself exists.
- **True physical (cm/inch) width calibration across every cap** — blocked on real measurement data for the entire set, not just one cap.
