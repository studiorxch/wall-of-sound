---
layout: spec

title: "WOS Maritime Recovery Roadmap"
date: 2026-05-27
doc_id: "0527A_WOS_MaritimeRecoveryRoadmap_v1.0.0"
version: "1.0.0"

project: "Wall of Sound"
system: "WOS"

domain: "rendering"
component: "maritime_recovery_roadmap"

type: "recovery-roadmap"
status: "review"
stage: "REVIEW"
freeze_decision: "REVIEW"

priority: "high"
risk: "high"
classification: "interpretation-layer"

summary: "Defines the visible-results recovery roadmap for the WOS maritime layer. This roadmap freezes non-visible wake and hidden authority work until Mapbox style transfer, vessel readability, AIS precision, 2.5D presentation, and visible atmosphere presets materially improve screenshots and runtime output."

doctrine:
  - "2D owns truth"
  - "2.5D owns presentation"
  - "Visible output before hidden authority"
  - "Readability over invisible sophistication"
  - "Atmosphere must improve the world, not mute it"

depends_on:
  - "README"
  - "WOS_Naming_Doctrine"
  - "SurfaceChannelDoctrine"
  - "Mapbox geographic substrate"
  - "AISRuntime"
  - "MarineRenderer"

enables:
  - "0527B_WOS_MapboxStyleTransferAudit_v1.0.0_BUILD"
  - "0527C_WOS_VesselReplacementPass_v1.0.0_BUILD"
  - "0527D_WOS_2_5DVesselPresentationPass_v1.0.0_BUILD"
  - "0527E_WOS_AISPrecisionPass_v1.0.0_BUILD"
  - "0527F_WOS_HarborAtmospherePresetPass_v1.0.0_BUILD"

tags:
  - "maritime"
  - "mapbox"
  - "vessels"
  - "ais"
  - "2.5d"
  - "atmosphere"
  - "visible-results"
---

# 🚦 SPEC STAGE

Stage: **[REVIEW]**  
Freeze Decision: **REVIEW**  
Action: **Recover visible maritime output before adding any new hidden systems.**

# 0527A_WOS_MaritimeRecoveryRoadmap_v1.0.0_REVIEW

## Purpose

This roadmap corrects the current maritime development failure mode:

```text
Too much invisible system work.
Not enough visible improvement.
```

The maritime layer must now prioritize screenshot-observable progress:

- Mapbox Studio style must visibly carry into WOS.
- Vessel classes must be readable without hover.
- 2.5D presentation must make boats feel spatially grounded.
- AIS class resolution must stop collapsing into mystery blue boats.
- Atmosphere must visibly improve the world without destroying base map readability.

Wake experimentation is frozen until the above problems materially improve.

---

# 🧠 Core Recovery Doctrine

## Visible Output First

Any maritime task must now answer:

```text
Can this be seen in the next screenshot or video capture?
```

If not, it is deferred.

## No More Hidden Authority Before Visual Repair

Do not create new doctrine, authority layers, invisible registries, or wake memory systems until the following are demonstrably fixed:

1. Mapbox style transfer clarity
2. Vessel class readability
3. 2.5D grounding
4. AIS identity precision
5. Visible atmosphere presets

## Wake Freeze

No new wake work is allowed until vessels and Mapbox style visibly improve.

Allowed:

- Disable wakes entirely.
- Keep one simple close-range active wake for hero vessels only.

Forbidden:

- WaterMemory expansion
- wake history systems
- invisible wake continuity logic
- wake authority specs
- wake polish before vessel readability

---

# 🛑 Phase 0 — Stop the Bleeding

## Goal

Turn off anything visually hurting the build.

## Required Actions

- Disable `WaterMemory` completely.
- Disable wake experiments by default.
- Keep only simple active wakes for close/hero vessels, or turn wakes off entirely.
- Stop writing hidden authority specs until visible output improves.
- Remove or disable any scrim, haze, overlay, wake, or post-process layer that makes the Mapbox base harder to evaluate.

## Success Criteria

```text
The map looks cleaner immediately.
```

## Verification

- Screenshot before/after with all maritime visual effects disabled.
- Confirm no WaterMemory drawing path executes by default.
- Confirm wakes are off unless explicitly enabled by debug flag.

---

# 🗺 Phase 1 — Mapbox Style Transfer Audit

## Goal

Prove why Mapbox Studio styles are not visually carrying over.

## Required Tasks

- Verify the exact Mapbox style URL loaded at runtime.
- Confirm the Mapbox Studio style is published.
- Add console command to print current style ID, style name, and layer list.
- Add `cleanMapboxMode` that disables all WOS overlays, scrims, atmosphere, and vessel rendering.
- Re-enable WOS layers one at a time to identify what is muting or overriding the style.

## Required Debug Commands

```js
_wos.mapbox.printStyleInfo()
_wos.mapbox.enableCleanMode()
_wos.mapbox.disableCleanMode()
_wos.mapbox.listVisibleLayers()
_wos.mapbox.auditOverlayInterference()
```

## Success Criteria

```text
The Mapbox Studio style is clearly visible inside WOS.
```

## Build Spec

```text
0527B_WOS_MapboxStyleTransferAudit_v1.0.0_BUILD
```

---

# 🚢 Phase 2 — Vessel Replacement Pass

## Goal

Replace same-blue boat pills with readable vessel classes.

## Required Vessel Classes

Minimum readable classes:

- Cargo
- Ferry
- Tug
- Tanker
- Passenger
- Recreational

## Required Tasks

- Add a strong class color palette.
- Fix dot-to-vessel scaling transition.
- Use procedural vessel topology only where zoom supports it.
- Add debug mode showing:
  - raw AIS class
  - resolved WOS class
  - render tier
  - confidence level
- Ensure far vessels stay simple but are not all identical.
- Ensure close vessels have shape differentiation, not just color differentiation.

## Render Tier Rule

```text
Far zoom: symbolic dot / minimal glyph
Mid zoom: class-colored vessel marker
Close zoom: procedural class topology
Hero zoom: 2.5D vessel presentation
```

## Success Criteria

```text
Screenshot test: at least 4 vessel types can be identified without hovering.
```

## Build Spec

```text
0527C_WOS_VesselReplacementPass_v1.0.0_BUILD
```

---

# 🧊 Phase 3 — 2.5D Presentation Pass

## Goal

Make boats feel like they occupy the world instead of sitting on top of the map.

## Required Tasks

- Add shadow offset based on zoom and heading.
- Add waterline grounding.
- Add hull highlight/deck layer.
- Add perspective compression at distance.
- Add near-vessel tilt/extrusion only at close zoom.
- Keep far vessels quiet and readable.

## Presentation Boundary

2.5D may change:

- shadow
- highlight
- scale presentation
- tilt impression
- deck layering
- atmospheric grounding

2.5D must not change:

- AIS truth
- vessel position
- heading truth
- class identity
- runtime continuity state

## Success Criteria

```text
Close boats feel spatial; far boats stay quiet.
```

## Build Spec

```text
0527D_WOS_2_5DVesselPresentationPass_v1.0.0_BUILD
```

---

# 📡 Phase 4 — AIS Precision Pass

## Goal

Stop guessing vessel identity visually.

## Required Tasks

- Audit AIS class mapping.
- Log unknown/unmapped class values.
- Map cruise, passenger, container, barge, pilot, sailing, yacht, ferry, tug, tanker, and cargo properly.
- Add confidence levels:
  - `confirmed`
  - `inferred`
  - `fallback`
- Build hover/debug card showing:
  - raw AIS type
  - normalized AIS type
  - resolved WOS class
  - confidence
  - reason

## Unknown Class Rule

Unknown vessels may remain generic only when AIS data is genuinely unknown or unmapped.

They must not silently collapse into the same blue visual treatment as confirmed vessels.

## Success Criteria

```text
No mystery blue boats unless AIS data is genuinely unknown.
```

## Build Spec

```text
0527E_WOS_AISPrecisionPass_v1.0.0_BUILD
```

---

# 🌫 Phase 5 — Controlled Atmosphere Pass

## Goal

Atmosphere becomes visible but not destructive.

## Required Tasks

- Rebuild atmosphere around explicit presets, not hidden math.
- Add 3–5 visible presets.
- Each preset must visibly affect:
  - map
  - boats
  - lights
  - overlays
- Presets must be switchable in one click or one console command.
- No invisible atmosphere systems until visible presets are proven.

## Required Presets

Minimum preset set:

```text
Clear Night
Cold Dawn
Fog Harbor
Sodium Rain
Broadcast Failure
```

## Required Debug Commands

```js
_wos.atmosphere.setPreset("clear-night")
_wos.atmosphere.setPreset("cold-dawn")
_wos.atmosphere.setPreset("fog-harbor")
_wos.atmosphere.setPreset("sodium-rain")
_wos.atmosphere.setPreset("broadcast-failure")
_wos.atmosphere.printPresetState()
```

## Success Criteria

```text
Changing preset visibly changes the world in one click.
```

## Build Spec

```text
0527F_WOS_HarborAtmospherePresetPass_v1.0.0_BUILD
```

---

# 🧭 Required Build Order

Build in this exact order:

```text
1. 0527B_WOS_MapboxStyleTransferAudit_v1.0.0_BUILD
2. 0527C_WOS_VesselReplacementPass_v1.0.0_BUILD
3. 0527D_WOS_2_5DVesselPresentationPass_v1.0.0_BUILD
4. 0527E_WOS_AISPrecisionPass_v1.0.0_BUILD
5. 0527F_WOS_HarborAtmospherePresetPass_v1.0.0_BUILD
```

Do not reorder unless a blocking runtime error prevents progress.

---

# 🔒 Active Freeze Rules

## Frozen Until Further Notice

- WaterMemory
- wake persistence
- wake memory trails
- wake authority specs
- hidden atmosphere math
- new doctrine-only specs
- invisible continuity refinements that do not improve screenshots

## Allowed Immediately

- visual cleanup
- Mapbox audit tools
- vessel class styling
- AIS class mapping audit
- 2.5D presentation improvements
- explicit atmosphere presets
- screenshot-based validation

---

# 🧪 Validation Checklist

- [ ] WaterMemory is disabled by default.
- [ ] Wake experiments are disabled by default.
- [ ] Clean Mapbox mode shows the base style clearly.
- [ ] Console can print active Mapbox style URL / ID / layer list.
- [ ] WOS overlays can be re-enabled one at a time.
- [ ] Vessel classes use visibly distinct color and shape logic.
- [ ] At least 4 vessel types are recognizable without hover.
- [ ] Dot-to-vessel transition scales correctly by zoom.
- [ ] Close vessels have shadow, waterline, highlight, and deck structure.
- [ ] Far vessels remain quiet and readable.
- [ ] AIS unknown values are logged.
- [ ] Hover/debug card shows raw AIS type to resolved WOS class.
- [ ] Atmosphere presets visibly change the world in one click.
- [ ] No new wake work has been added.
- [ ] No hidden authority spec has displaced visible recovery work.

---

# 🚫 Non-Goals

This roadmap does not authorize:

- new wake systems
- new WaterMemory work
- advanced harbor weather simulation
- new maritime constitutional doctrine
- gameplay reward systems
- boat watching economy mechanics
- full 3D vessel rendering
- shader-heavy atmosphere systems
- speculative long-range maritime expansion

---

# 📚 Canonical References

- `README.md`
- `WOS_Naming_Doctrine.md`
- `0522_WOS_SurfaceChannelDoctrine_v1.1.0.md`
- `WOS_ConstitutionalSpecTemplate_v2.0.1.md`

---

# 💬 Implementation Notes

This roadmap is intentionally corrective.

It exists because the maritime layer has accumulated too much invisible complexity while visible output remained too close to the original same-blue vessel map.

The next implementation work must be judged by:

```text
Does the next screenshot look better?
```

If the answer is no, the task is not currently priority work.

---

# ✅ Build Readiness

Status: **[REVIEW]**

Decision:

```text
Review this roadmap, then proceed directly into 0527B Mapbox Style Transfer Audit.
```

Do not freeze this roadmap until it reflects the visible-results recovery order accurately.
