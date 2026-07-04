**[REVIEW] — Colorlab Projection Lab Roadmap**

This should be treated as a **new Colorlab module**, not a small UI add-on. The feature’s job is to turn palettes into **testable world-condition profiles**.

---

# Roadmap Outline

## Phase 0 — Doctrine + Scope Lock

Define the purpose of the system before building visuals.

**Goal:** prevent Projection Lab from becoming “pretty preview mode” without intelligence.

Core decisions:

- palettes represent **sampled conditions**, not absolute truth
- every palette can be tested through **Truth / Mood / Reference / Fiction**
- palette usefulness depends on **time, weather, depth, and runtime role**
- extracted colors remain raw data; Projection Lab produces interpretation

**Exit condition:** clear doctrine for what the lab is allowed to confirm.

---

## Phase 1 — Projection Lab MVP

Build the first usable preview surface.

**Goal:** select one palette and view it inside a reusable mini-map scene.

Required:

- new `Projection` tab/view
- selected palette header
- swatch strip
- one abstract mini-map scene
- mode toggle:
    - Truth
    - Mood
    - Reference
    - Fiction
- view toggle:
    - Flat
    - 2.5D
    - Split

**Exit condition:** one palette can visually audition across interpretation modes.

---

## Phase 2 — 2.5D Scene System

Add spatial depth, lighting, and shadow.

**Goal:** test whether a palette works as environmental light, not only flat color.

Required:

- extruded building blocks
- road/route depth
- water surface treatment
- light direction
- cast shadows
- building face/top differentiation
- glow and bloom hooks
- split-view comparison against flat mode

**Exit condition:** palette behavior can be judged across flat graphic use and 2.5D world use.

---

## Phase 3 — Time of Day Layer

Add environmental time states.

**Goal:** confirm when a palette performs best.

Required time presets:

- Dawn
- Day
- Dusk
- Night

Each preset should affect:

- ambient brightness
- contrast
- shadow length
- light temperature
- signage/glow strength
- map readability

**Exit condition:** palettes can be diagnosed by best time condition.

---

## Phase 4 — Weather Layer

Add atmospheric states.

**Goal:** test palettes under environmental modifiers.

Required weather presets:

- Clear
- Overcast
- Rain
- Fog / Mist

Each preset should affect:

- haze
- reflection
- saturation damping
- contrast softness
- water/pavement response
- glow diffusion

**Exit condition:** palettes can be diagnosed by best weather condition.

---

## Phase 5 — Palette Intelligence Report

Add structured interpretation output.

**Goal:** turn visual testing into usable metadata.

Each palette should receive:

- best mode
- best time
- best weather
- best view
- best runtime role
- location confidence
- mood confidence
- reference confidence
- fiction strength
- runtime risk
- recommended use
- avoid notes

**Exit condition:** Projection Lab produces actionable palette guidance.

---

## Phase 6 — Audio Preview Layer

Add lightweight sonic testing.

**Goal:** connect palette behavior to WOS music atmosphere without overcommitting to full composition.

Required:

- short preview loop or generated sample slot
- simple audio categories:
    - Ambient
    - Transit
    - Commercial
    - Cinematic
    - Arcade
    - Weather
- energy setting:
    - Low
    - Medium
    - High
- texture layer:
    - hum
    - rain
    - traffic
    - crowd
    - synth pad
    - percussion tick

**Exit condition:** palette can suggest a sonic environment, not just a visual one.

---

## Phase 7 — Export to WOS Runtime Profile

Convert Projection Lab output into runtime-readable data.

**Goal:** allow WOS to consume palette intelligence.

Export should include:

- raw palette colors
- role assignments
- best conditions
- mode suitability
- time suitability
- weather suitability
- 2.5D rendering preferences
- audio mood hints
- confidence scores
- runtime risks

**Exit condition:** WOS can use a palette as a controlled world-condition profile.

---

## Phase 8 — WOS Integration Trial

Test palettes against the actual WOS map/world system.

**Goal:** prove that Projection Lab guidance transfers into the real engine.

Required:

- import one exported palette profile
- apply to current dull/dark map
- test as mood layer
- test as fiction/event layer
- test as time-of-day modifier
- test as weather modifier
- compare against Projection Lab preview

**Exit condition:** Projection Lab becomes useful infrastructure, not isolated design tooling.

---

# Specs Needed — Checklist View Only

## Foundation Specs

- [ ]  `0524_COLORLAB_ProjectionLabDoctrine_v1.0.0.md`
- [ ]  `0524_COLORLAB_PaletteAuthorityModel_v1.0.0.md`
- [ ]  `0524_COLORLAB_PaletteRoleTaxonomy_v1.0.0.md`
- [ ]  `0524_COLORLAB_PaletteConditionModel_v1.0.0.md`

## UI / Experience Specs

- [ ]  `0524_COLORLAB_ProjectionLabUX_v1.0.0.md`
- [ ]  `0524_COLORLAB_ProjectionLabPreviewSurface_v1.0.0.md`
- [ ]  `0524_COLORLAB_ProjectionLabControls_v1.0.0.md`
- [ ]  `0524_COLORLAB_PaletteDiagnosticsPanel_v1.0.0.md`

## Rendering Specs

- [ ]  `0524_COLORLAB_FlatMapProjectionRenderer_v1.0.0.md`
- [ ]  `0524_COLORLAB_2_5DProjectionRenderer_v1.0.0.md`
- [ ]  `0524_COLORLAB_LightShadowModel_v1.0.0.md`
- [ ]  `0524_COLORLAB_SurfaceMaterialMapping_v1.0.0.md`

## Interpretation Mode Specs

- [ ]  `0524_COLORLAB_TruthProjectionMode_v1.0.0.md`
- [ ]  `0524_COLORLAB_MoodProjectionMode_v1.0.0.md`
- [ ]  `0524_COLORLAB_ReferenceProjectionMode_v1.0.0.md`
- [ ]  `0524_COLORLAB_FictionProjectionMode_v1.0.0.md`

## Time / Weather Specs

- [ ]  `0524_COLORLAB_TimeOfDayProjection_v1.0.0.md`
- [ ]  `0524_COLORLAB_WeatherProjection_v1.0.0.md`
- [ ]  `0524_COLORLAB_AtmosphericModifiers_v1.0.0.md`
- [ ]  `0524_COLORLAB_ConditionMatrix_v1.0.0.md`

## Intelligence Specs

- [ ]  `0524_COLORLAB_PaletteIntelligenceReport_v1.0.0.md`
- [ ]  `0524_COLORLAB_PaletteConfidenceScoring_v1.0.0.md`
- [ ]  `0524_COLORLAB_RuntimeRiskClassification_v1.0.0.md`
- [ ]  `0524_COLORLAB_PaletteRecommendationEngine_v1.0.0.md`

## Audio Specs

- [ ]  `0524_COLORLAB_AudioPreviewLayer_v1.0.0.md`
- [ ]  `0524_COLORLAB_PaletteSoundHints_v1.0.0.md`
- [ ]  `0524_COLORLAB_AudioMoodTaxonomy_v1.0.0.md`

## Export / Integration Specs

- [ ]  `0524_COLORLAB_PaletteRuntimeProfileExport_v1.0.0.md`
- [ ]  `0524_WOS_ColorRuntimeProfileImport_v1.0.0.md`
- [ ]  `0524_WOS_MapPaletteApplicationRules_v1.0.0.md`
- [ ]  `0524_WOS_ProjectionLabIntegrationTrial_v1.0.0.md`

---

# Recommended Build Order

## Build Batch 1 — Minimum Useful Lab

- [x]  [[0524_COLORLAB_ProjectionLabDoctrine_v1.0.0]]
- [x]  0524_COLORLAB_ProjectionOutputGovernance_v1.0.0.md
- [ ]  `0524_COLORLAB_ProjectionLabUX_v1.0.0.md`
- [ ]  `0524_COLORLAB_ProjectionLabPreviewSurface_v1.0.0.md`
- [ ]  `0524_COLORLAB_FlatMapProjectionRenderer_v1.0.0.md`
- [ ]  `0524_COLORLAB_TruthProjectionMode_v1.0.0.md`
- [ ]  `0524_COLORLAB_MoodProjectionMode_v1.0.0.md`

## Build Batch 2 — Depth + Conditions

- [ ]  `0524_COLORLAB_2_5DProjectionRenderer_v1.0.0.md`
- [ ]  `0524_COLORLAB_LightShadowModel_v1.0.0.md`
- [ ]  `0524_COLORLAB_TimeOfDayProjection_v1.0.0.md`
- [ ]  `0524_COLORLAB_WeatherProjection_v1.0.0.md`

## Build Batch 3 — Intelligence

- [ ]  `0524_COLORLAB_PaletteIntelligenceReport_v1.0.0.md`
- [ ]  `0524_COLORLAB_PaletteConfidenceScoring_v1.0.0.md`
- [ ]  `0524_COLORLAB_RuntimeRiskClassification_v1.0.0.md`
- [ ]  `0524_COLORLAB_PaletteRecommendationEngine_v1.0.0.md`

## Build Batch 4 — Sound + WOS Bridge

- [ ]  `0524_COLORLAB_AudioPreviewLayer_v1.0.0.md`
- [ ]  `0524_COLORLAB_PaletteSoundHints_v1.0.0.md`
- [ ]  `0524_COLORLAB_PaletteRuntimeProfileExport_v1.0.0.md`
- [ ]  `0524_WOS_ColorRuntimeProfileImport_v1.0.0.md`

---

# Practical Reduction

You do **not** need all specs immediately.

For the first buildable version, I would only create these:

- [ ]  `0524_COLORLAB_ProjectionLabDoctrine_v1.0.0.md`
- [ ]  `0524_COLORLAB_ProjectionLabUX_v1.0.0.md`
- [ ]  `0524_COLORLAB_ProjectionLabPreviewSurface_v1.0.0.md`
- [ ]  `0524_COLORLAB_2_5DProjectionRenderer_v1.0.0.md`
- [ ]  `0524_COLORLAB_TimeWeatherProjectionControls_v1.0.0.md`
- [ ]  `0524_COLORLAB_PaletteIntelligenceReport_v1.0.0.md`

That gives you the right balance: **doctrine, experience, rendering, conditions, intelligence.**