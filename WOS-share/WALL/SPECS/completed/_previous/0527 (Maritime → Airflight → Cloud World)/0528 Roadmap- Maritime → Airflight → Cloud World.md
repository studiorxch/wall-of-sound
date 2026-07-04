

## Phase 0 — Lock current win

**Goal:** preserve Mapbox fix.

- [x] StudioRich Mapbox style loads by default.
- [x] Clean mode remains available.
- [x] No wake/WaterMemory regression.
- Save before/after screenshots.

**Success:** map style consistently matches Studio preview.

---

## Phase 1 — Maritime visible closeout

**Goal:** make harbor presence believable enough to support planes.

Build:

- [ ] vessel class silhouettes: barge, ferry, tug, tanker, cargo
- distance scaling: dot → dash → silhouette → topology
- shallow tilt rendering for boats
- water-only placement guard
- bridge / terminal / Statue of Liberty context anchors

**Success:** harbor reads as NYC infrastructure, not blue pills.

---

## Phase 2 — Multi-layer map compositor

**Goal:** discover what visual layers WOS can actually use.

Add toggle/mix controls for:

- [ ] StudioRich vector map
- [ ] satellite
- satellite-streets
- [x] 3D buildings
- [ ] WOS overlays
- [ ] cloud/weather overlay test

Support:

- opacity
- blend mode
- synced grid view
- single-view composite mode

**Success:** you can compare vector / satellite / 3D / overlays side-by-side.

---

## Phase 3 — Aircraft bootstrap

**Goal:** make planes visibly meaningful fast.

Build:

- [ ] airports: JFK, LGA, EWR
- [ ] takeoff / landing routes
- [ ] altitude state: ground → climb → cruise → descent
- [ ] plane scaling by altitude
- [ ] aircraft shadows near ground
- [ ] runway-origin movement

**Success:** planes visibly take off and scale into airspace.

---

## Phase 4 — Altitude-aware world renderer

**Goal:** camera altitude changes the world language.

Low altitude:

- boats detailed
- buildings strong
- shadows visible

Mid altitude:

- vessels simplify
- trains/routes emphasized
- city grid dominates

High altitude:

- districts flatten
- lights/clouds dominate
- aircraft routes become primary

**Success:** flying changes how the world is drawn.

---

## Phase 5 — Cloud / atmosphere layer

**Goal:** clouds become visible world infrastructure.

Build:

- cloud sheets above map
- opacity by altitude
- soft shadows over city/water
- weather bands
- aircraft passing through cloud layers
- preset tests: clear, low cloud, fog bank, storm shelf

**Success:** flight reveals weather as a layer, not just a filter.

---

## Recommended build order

```
0527C_WOS_VesselReplacementPass_v1.0.0_BUILD0527D_WOS_Maritime2_5DContextPass_v1.0.0_BUILD0527E_WOS_MapLayerCompositor_v1.0.0_BUILD0528A_WOS_AirflightRuntimeBootstrap_v1.0.0_BUILD0528B_WOS_AltitudeAwareWorldRenderer_v1.0.0_BUILD0528C_WOS_CloudAtmosphereLayer_v1.0.0_BUILD
```

Core target:

```
NYC infrastructure world:boats belowtrains throughplanes aboveclouds wrapping everything
```