# wall/systems/transit

Transit (road-pivot) feed infrastructure for Wall of Sound.

## 0604G — MTA Bus Feed Source Inventory (inventory-only)

Establishes the bounded source contract for bringing **live MTA bus vehicle
positions** onto the Wall — **without** fetching, decoding, rendering, or
mutating `ActorRuntime`. This is the foundation the realtime adapter (0604H)
consumes.

### Files

| File | Exposes | Role |
|---|---|---|
| `mtaBusFeedConfig.js` | `SBE.MTABusFeedConfig` | Single bounded config: endpoints, cadence/stale/disabled constants, `apiKeyStorageKey`, failure-reason vocabulary. No secrets committed. |
| `mtaBusFeedSourceInventory.js` | `SBE.MTABusFeedSourceInventory` | Source list, primary-source accessor, local API-key plumbing, fetch-readiness contract. |

### Canonical source id

```
mta_bus_gtfs_rt_vehicle_positions
```

(Identifies the actual feed **category** — vehicle positions — not the broad
`mta_bus_gtfs_rt`.)

### Public API — `SBE.MTABusFeedSourceInventory`

```
start()                  // metadata registration only — no fetch
stop()
getState()
getSources()
getPrimarySource()
getSourceRegistryEntry()
getReadiness()           // { sourceRegistered, configured, apiKeyPresent,
                         //   vehiclePositionsUrlPresent, canAttemptFetch, lastError }
hasApiKey()
setApiKey(key)           // localStorage: wos.mtaBusTime.apiKey
clearApiKey()
maskedApiKey()           // "****abcd" — never the full secret
```

### Debug (`_wos.debug.worldActors`)

```
mtaBusFeedInventoryState()
mtaBusFeedSources()
mtaBusFeedReadiness()
mtaBusSetApiKey('<key>')   // prints masked confirmation only
mtaBusClearApiKey()
```

### API key handling

No key is ever committed or hardcoded. For local development, store it via the
runtime setter (`mtaBusSetApiKey`) which writes `localStorage['wos.mtaBusTime.apiKey']`,
or inject it through a backend env var if a GTFS-RT protobuf proxy is used.
Debug output is always masked (`****abcd`).

### Hard boundary (0604G)

Does **not**: fetch, decode protobuf, render, upsert to WSL, mutate
`ActorRuntime` / `ActorSourceRegistry` (frozen) / AIS, add Mapbox sources or
layers, change asset assignments, or touch any maritime module.

### Constants (baselines, not permanent doctrine)

```
MTA_BUS_REFRESH_CADENCE_MS = 15000
MTA_BUS_STALE_AFTER_MS     = 45000
MTA_BUS_DISABLED_AFTER_MS  = 180000
```

## 0604H — MTA Bus Realtime Adapter (fetch/decode only)

Fetches the GTFS-RT Vehicle Positions feed, decodes it, and exposes **raw bus
rows**. Creates no actors and renders nothing.

### Files

| File | Exposes | Role |
|---|---|---|
| `vendor/gtfsRealtimeBindings.js` | `SBE.GTFSRealtimeBindings` | Dependency-free minimal GTFS-Realtime protobuf decoder (`transit_realtime.FeedMessage.decode(bytes)`). Decodes only VehiclePosition fields; prefers a host binding if present. |
| `mtaBusRealtimeAdapter.js` | `SBE.MTABusRealtimeAdapter` | Readiness-gated fetch + decode → raw rows. |

### Public API — `SBE.MTABusRealtimeAdapter`

```
start({poll?})   // manual by default; poll:true uses config.refreshCadenceMs
stop()
isRunning()
fetchOnce()      // Promise<{ ok, rowsAdded, failureReason, decodedEntityCount, rejectedEntityCount }>
getState()
getRows()        // raw MtaBusRealtimeRow[] — no actor ids / no asset ids / no payloads
getStats()
clearRows()
setDebug(on)
```

### Raw row contract

```
{ sourceId:'mta_bus_gtfs_rt_vehicle_positions', vehicleId, tripId|null, routeId|null,
  latitude, longitude, bearing|null, speedMps|null, timestampUtcMs, occupancyStatus|null, rawEntityId }
```

### Debug (`_wos.debug.worldActors`)

```
mtaBusAdapterState()
mtaBusFetchOnce()     // returns the Promise; logs result (never prints the key)
mtaBusRows(limit)
mtaBusStats()
mtaBusClearRows()
```

### Manual proof

```
mtaBusSetApiKey('<key>') → mtaBusFeedReadiness() → mtaBusFetchOnce() → mtaBusRows(10) → mtaBusStats()
```
Raw live rows appear; no actors created; no buses visible.

### Failure reasons

Only `SBE.MTABusFeedConfig.FAILURE_REASONS` strings are used: readiness-false →
`not_configured`/`api_key_missing`, network exception → `network_error`, non-2xx →
`http_error`, 429 → `rate_limited`, decode throw → `decode_failed`, zero entities →
`empty_feed`, stale newest timestamp → `stale_feed`. Missing `routeId` is a
per-row warning/rejection count, never a whole-fetch failure.

### Hard boundary (0604H)

No actor creation, no ActorRuntime/TruthActorRuntime/WSL upserts, no Mapbox
sources/layers, no asset assignment, no styling/motion/viewport filtering, no
AIS/marine/Citi Bike/subway/Studio touch.

## 0604I — MTA Bus Actor Bridge (truth-only)

Converts adapter rows into canonical `vehicle.bus` truth actors via
`SBE.TruthActorRuntime.upsertActor`. The first point where live MTA bus data
becomes WOS world truth. Creates no render payloads, assigns no assets.

### File → `SBE.MTABusActorBridge`

```
start() / stop() / isActive()
syncFromAdapter()      // reads SBE.MTABusRealtimeAdapter.getRows()
syncRows(rows)         // → { ok, rows, accepted, rejected, actorCount }
getState() / getStats()
getActorIds()          // only bridge-created bus actor ids
clearBusActors()       // removes ONLY those ids (AIS/Citi Bike/debug untouched)
setEnabled(on) / setDebug(on)
```

### Actor upsert

`actorType: 'vehicle.bus'`, `sourceEntityId: vehicleId`, `ttlMs: MTA_BUS_STALE_AFTER_MS`
(45s), `label: 'MTA Bus ' + routeId` (→ `'MTA Bus'` when route null), metadata
`{ system:'mta', mode:'bus', routeId, tripId, vehicleId, occupancyStatus,
rawEntityId, sourceRowTimestampMs, truthClass:'observed', presentationEligible:true }`.

### Rejection vocabulary (bridge-local, distinct from feed FAILURE_REASONS)

`missing_vehicle_id · missing_coordinates · invalid_coordinates ·
invalid_timestamp · wrong_source_id · actor_runtime_unavailable ·
adapter_unavailable · upsert_failed · disabled`. Missing `routeId/tripId/bearing/
speed/occupancy` are **never** rejection causes.

### Debug (`_wos.debug.worldActors`)

```
mtaBusActorBridgeState() / mtaBusActorBridgeSync() / mtaBusActorBridgeStats()
mtaBusActorBridgeActors() / mtaBusActorBridgeClear() / mtaBusActorBridgeEnable(on)
```

### Truth vs presentation (important)

> Truth may be dense. Presentation must be selective.

The bridge writes **truth only** — it never calls WSL, ARA, the LOD policy,
Mapbox, or asset assignment itself. Whether a bus becomes *visible* is governed
entirely by the existing presentation pipeline (ActorRenderAuthority + LOD
policy), which today has **no `vehicle.bus` profile** — so buses stay
truth-only and unrendered until **0604J** introduces a bus visual fallback with
a visibility budget. The bridge tracks the actor ids it created so
`clearBusActors()` is precisely scoped.

### Manual proof

```
mtaBusSetApiKey('<key>') → mtaBusFetchOnce() → mtaBusRows()
→ mtaBusActorBridgeSync() → mtaBusActorBridgeState() → list()
```
`vehicle.bus` actors exist in TruthActorRuntime; no buses visible yet.

## 0604J — Bus Visual Fallback Renderer (bounded, altitude-aware)

First visible buses. Selects a bounded subset of `vehicle.bus` truth actors and
upserts simple fallback shapes into WSL — **presentation only**, no truth/asset/
Mapbox mutation. Reuses the existing WSL `city-bus` silhouette builder (sets
`silhouetteClass:'city-bus'`), so **no WSL change is needed**.

### File → `SBE.BusVisualFallbackRenderer`

```
start({intervalMs?}) / stop() / isActive()
renderOnce() / clear()
setEnabled(on) / setDebug(on)
setMaxVisible(count) / setViewportPaddingPx(px)
getState() / getSelectionState() / getRenderedIds()
```

### Selection (in order)

`vehicle.bus` → valid lat/lng → presentation-eligible → not stale
(`MTA_BUS_STALE_AFTER_MS`/45s) → inside viewport+padding (default 160px) → fits
altitude budget. Priority when over budget: **viewport-center distance →
freshness → actor id** (deterministic). Scan cap: 6000 actors.

### Altitude budgets (zoom proxy)

| profile | zoom | budget | scale | variant |
|---|---|---|---|---|
| low | ≥15.5 | 120 | 1.00 | `fallback_bus_low` |
| city | ≥12 | 300 | 0.72 | `fallback_bus_city` |
| regional | ≥9 | 500 | 0.38 | `fallback_bus_dot` |
| cruise | <9 | **0** | — | — (deferred aggregate field) |

### WSL payload

`id:'bus_fallback:'+actorId`, `actorType:'vehicle.bus'`, `silhouetteClass:'city-bus'`,
`variant`, `source:'mta-bus-fallback'`, base `scale`, `metadata.{routeId,vehicleId,
truthClass:'observed',altitudeProfile}`. The renderer tracks its own ids so
`clear()` removes **only** `bus_fallback:*` payloads (hero/traffic/AIS untouched).

### Debug (`_wos.debug.worldActors`)

```
busFallbackStart() / busFallbackStop() / busFallbackRenderOnce() / busFallbackClear()
busFallbackState() / busFallbackSelection() / busFallbackMaxVisible(n) / busFallbackDebug(on)
busLiveProof()   // fetchOnce → bridgeSync → renderOnce, combined report
```

### Manual proof

```
mtaBusSetApiKey('<key>') → mtaBusFetchOnce() → mtaBusActorBridgeSync()
→ busFallbackStart() → busFallbackRenderOnce() → busFallbackState()
```
Bounded live MTA buses appear on Wall. `getState()` explains zero-render causes
(no truth / no map / no WSL / outside viewport / stale / cruise budget 0).

## 0604K — Bus Presentation Selector (selection authority)

Extracts "which buses render now" from the renderer into a dedicated, read-only
authority. **Renderer draws · Selector chooses · Truth runtime knows.** Writes
selector-local state only — never WSL/truth/Mapbox/assets/Studio.

### File → `SBE.BusPresentationSelector`

```
start() / stop() / isActive()
select() / selectFromActors(actors)        // → BusPresentationSelection
getState() / getLastSelection() / getRejectSummary()
setEnabled(on) / setDebug(on)
setRouteFocus(routeIds) / clearRouteFocus()
setMaxVisible(profile, count) / setViewportPaddingPx(px) / setReadinessPaddingPx(px)
```

### Selection output

`{ ok, profile, budget, selectedActors[], readyActors[], counts{...}, zeroRenderReason }`
where each candidate carries `screenX/Y`, `distanceToViewportCenterPx`,
`freshnessMs`, `score`, `selectionReason`.

### Viewport zones

- **Visible** (padding 160px) → eligible to render.
- **Readiness buffer** (padding 600px, outside visible) → returned in
  `readyActors` (not rendered) to avoid visual starvation during camera moves.
- Outside both → `viewportRejected`.

### Scoring (deterministic, normalized 0..1)

`0.50·centerProximity + 0.20·freshness + 0.15·routeFocus + 0.10·movement
(speed>0.5) + 0.05·routeKnown`; tie-break **actorId ascending**. Route focus is
**soft** (boost only, no strict exclusion). Stopped buses are never rejected.

### Zero-render vocabulary

`disabled · actor_runtime_unavailable · map_unavailable · no_bus_truth ·
no_valid_bus_coordinates · all_buses_stale · all_buses_outside_viewport ·
cruise_profile_individual_buses_disabled · budget_zero · unknown`. Every empty
result is explained.

### 0604J integration

`BusVisualFallbackRenderer.renderOnce()` now calls `BusPresentationSelector.select()`
when present and renders only `selection.selectedActors` (internal selection
remains as a compatibility fallback). The renderer still owns payload
construction, `upsertVehicle`, `clear()`, and id tracking.

### Debug (`_wos.debug.worldActors`)

```
busSelectorStart/Stop/State/Select/Last/Rejects
busSelectorRouteFocus(ids) / busSelectorClearRouteFocus()
busSelectorViewportPadding(px) / busSelectorReadinessPadding(px)
```

### Manual proof

```
mtaBusSetApiKey('<key>') → busLiveProof() → busSelectorState()
→ busSelectorSelect() → busFallbackSelection()
```

## 0604L — Bus Debug Label Pass (debug infrastructure)

Debug-only labels for live buses — observability, camera targeting, and
addressability for future Hero/Graffiti/Sponsored buses. **Labels are debug
infrastructure, not presentation:** the world stays fully readable with labels
off. Single transparent canvas overlay (no DOM-per-bus, no Mapbox source/layer).
Attaches **only** to `BusPresentationSelector.select().selectedActors` — never
runs its own actor scan, never mutates truth/selector/renderer/WSL/Mapbox.

### File → `SBE.BusDebugLabelPass`

```
start() / stop() / isActive()
renderOnce() / clear()
setEnabled(on) / setDebug(on)
setMode(mode) / setMaxLabels(count)
getState() / getVisibleLabels()
followRoute(id) / followVehicle(id) / clearFollow()
```

### Modes

`off · route (M15) · vehicle (7564) · route_vehicle (M15 • 7564) ·
technical (route / vehicle / m·s⁻¹ / age)`.

### Altitude + budget

Labels appear at **low/city only** (never regional/cruise). Budgets:
low 40, city 20, regional 0, cruise 0; `setMaxLabels` caps further. Labels follow
selector ordering and never exceed visible bus count.

### Follow helpers

`_wos.debug.worldActors.followBusRoute("M15")` / `followBusVehicle("7564")` /
`clearBusFollow()` — highlights the matching label(s) and reports coordinates.
Camera control is deferred. This makes each bus individually addressable
(foundation for Hero/Graffiti/Sponsored/Event buses) while preserving real route,
movement, and telemetry.

### Debug (`_wos.debug.worldActors`)

```
busLabelStart/Stop/RenderOnce/Mode(mode)/MaxLabels(n)/State/busLabels/busLabelClear
followBusRoute(id) / followBusVehicle(id) / clearBusFollow()
```

## 0604M — Bus Asset Pack (fleet hierarchy)

Replaces the single generic `city-bus` block with a recognizable fleet of
distinct silhouettes — while preserving real route / telemetry / movement /
vehicle identity. Classification is read-only and cached.

### File → `SBE.BusAssetResolver`

```
getAssetClass(actor)          // → 'standard'|'articulated'|'express'|'shuttle'|'special'
getPresentationProfile(actor) // → cached frozen profile { assetClass, silhouetteClass, variant, scale, paletteRef, accent }
getProfileForClass(cls) / listClasses() / getStats() / clearCache()
```

### Classes (route heuristic, NYC-MTA)

| class | silhouette | route rule |
|---|---|---|
| standard | `bus-standard` | default local |
| articulated | `bus-articulated` | SBS / `+` suffix (e.g. `M15+`, `B44 SBS`) |
| express | `bus-express` | `BxM`/`BM`/`QM`/`SIM`/`X##` (e.g. `BxM1`, `X27`) |
| shuttle | `bus-shuttle` | route contains "shuttle" |
| special | `bus-standard` (×1.05) | **reserved** — only via `metadata.busClass='special'` (Hero/Sponsored/Event hook) |

### WSL silhouettes (additive)

Added `bus-standard / bus-articulated / bus-express / bus-shuttle` builders to the
WSL silhouette dispatch (the original `city-bus` builder is untouched).
Articulated renders two body segments + accordion joint; express is sleeker with
darker glass; shuttle is short; each carries a class-coloured accent strip.

### Renderer integration

`busVisualFallbackRenderer` now consults `BusAssetResolver.getPresentationProfile(actor)`
to set per-bus `silhouetteClass`/`variant`/`scale`/`paletteRef` (falls back to
`city-bus` if the resolver is absent). Payload metadata gains `busAssetClass`.

### Debug (`_wos.debug.transit`)

```
getBusAssetStats()           // resolved counts by class + route-cache size
inspectBusAsset(vehicleId)   // class + profile + route + position for one bus
listBusClasses()             // all class profiles
```

### Performance

Class-level frozen profile singletons (no per-actor allocation); route→class
memoized; stable assignments; 500+ bus support.

## 0605A — Transit Presence Pass (atmosphere)

Makes selected buses feel present — screen-space headlight/taillight/class-accent
glow + subtle motion streaks. **Presence is not physics:** it decorates the buses
the selector already chose, never interpolates or moves them. Single transparent
canvas overlay (no DOM-per-bus, no Mapbox source/layer). Reads selector + resolver
only; writes nothing but its own canvas/state.

### File → `SBE.TransitPresencePass`

```
start({intervalMs?}) / stop() / isActive()
renderOnce() / clear()
setEnabled(on) / setDebug(on)
setPreset(name) / getPreset()
setIntensity(0..1) / setMaxCues(count)
getState() / getRenderedCues()
```

### Cue types by altitude

| profile | cues | budget |
|---|---|---|
| low | headlight, taillight, class_accent, motion_streak (speed>0.5) | 80 |
| city | same, compact | 160 |
| regional | `regional_light` only (no streak) | 260 |
| cruise | none (`cruiseRejected`) | 0 |

### Presets

`clean` (soft dots, no streak) · `night_city` (default) · `cyan_infra` (cool/cyan)
· `debug_bright` (loud, diagnostic) · `off` (renders nothing). Class accent comes
from `BusAssetResolver.getPresentationProfile(actor).accent`; articulated gets a
longer light span, express sleeker/brighter, shuttle tighter. Freshness fades
alpha (full <15s, fade 15–45s). Intensity clamps 0..1.

### Debug (`_wos.debug.worldActors`)

```
transitPresenceStart/Stop/RenderOnce/Clear/State
transitPresencePreset(name) / transitPresenceIntensity(v) / transitPresenceMaxCues(n) / transitPresenceDebug(on)
busPresenceProof()   // busLiveProof() → transitPresenceRenderOnce(), combined report
```

## 0605B — Bus Motion Smoothing (presentation-only continuity)

Solves GTFS-RT teleport ("jump/pause/jump"). Interpolates a **presentation
position** between ~15s truth updates so buses move continuously. **Motion
continuity is presentation, never truth** — never mutates actor coords,
TruthActorRuntime, WSL, Mapbox, selector, resolver, or presence. Local cache only.

### File → `SBE.BusMotionSmoothing`

```
start() / stop() / isActive()
observe(actor)                      // ingest a truth update (no mutation)
getPresentationPosition(actorId)    // → { lng, lat, smoothed, profile } | null
clear() / setEnabled(on) / setDebug(on)
getState() / getStats() / inspect(actorId)
```

### Model

Critically-damped lerp (`SMOOTHING_FACTOR 0.12`, no spring/overshoot) toward a
dead-reckoned target `truth + velocity·min(elapsed, 3s)`. Velocity estimated from
the last two truth updates (lives only here). Beyond 3s → freeze. Stale >45s →
**snap to truth** (no ghost motion).

### Altitude

| profile | behavior |
|---|---|
| low / city | full smoothing |
| regional | reduced (×0.5) |
| cruise | disabled (snap to truth) |

### Integration

- **Renderer** (`busVisualFallbackRenderer`): `observe(actor)` then renders
  `getPresentationPosition(actorId)` (falls back to truth coords if absent/disabled).
- **Presence** (`transitPresencePass`): projects cues at the smoothed position so
  glows/streaks track continuous motion. Presence never smooths itself.
- **Selector** stays the authority — selection is unchanged; only coordinates
  become presentation coordinates.

### Debug (`_wos.debug.worldActors`)

```
busMotionStart/Stop/State/Stats/Inspect(actorId)/Enable(on)/Debug(on)/Clear
```

## 0605C — Transit Livery Hooks (presentation skins)

The safe presentation hook where future StudioRich / graffiti / sponsored / event
/ holiday / debug wraps attach — **without fake vehicle truth**. "Actor truth says
*what* the vehicle is; livery says *how* it's dressed." Read-only to the world;
in-memory assignment cache (optional dev-only localStorage). **Draws nothing yet.**

### File → `SBE.TransitLiveryHooks`

```
start() / stop() / isActive()
resolveForActor(actor) / resolveForVehicle(id) / resolveForRoute(id)
assignVehicle(id,key) / assignRoute(id,key) / assignClass(cls,key)
clearVehicle/Route/Class(...) / clearAll()
listAssignments() / listLiveries() / getLivery(key) / getState() / getStats()
setEnabled(on) / setDebug(on)
```

### Liveries (frozen registry)

`default_mta · studiorich_cyan · graffiti_test · sponsored_blank · event_gold ·
holiday_red · debug_magenta` (debugOnly). Each carries `paletteRef / wrapKey /
surfaceTag / accent / roofAccent / sidePanelAccent / category`. graffiti/sponsored
are **placeholders** — no graffiti/ads drawn.

### Resolution priority

`vehicle > route > class > special > default`. `metadata.busClass:'special'` →
`event_gold` (source `special`). Invalid livery keys are rejected
(`invalidLiveryRejects`). Constant-time lookups; safe `default_mta` fallback.

### Integration

- **Renderer**: WSL payload metadata gains `liveryKey / liveryCategory /
  liverySource / wrapKey / surfaceTag`; `paletteRef = livery.paletteRef || asset`.
- **Presence**: livery `accent` subtly tints the class-accent cue (no ad/graffiti
  drawing). Both safe when the hook is absent.

### Debug (`_wos.debug.transit`)

```
liveryState() / liveryStats() / listTransitLiveries() / listTransitLiveryAssignments()
assignBusLivery(id,key) / assignRouteLivery(id,key) / assignBusClassLivery(cls,key)
clearBusLivery/clearRouteLivery/clearBusClassLivery(...) / clearAllTransitLiveries()
inspectBusLivery(id)
```
Aliases (`_wos.debug.worldActors`): `busLivery(id,key)`, `routeLivery(id,key)`.

## 0605D — Cruise Movement Field (far-altitude aggregate)

Fills the cruise/regional visual gap: where individual buses are intentionally
**not** drawn, this aggregates dense live bus truth into tiny screen-space
movement pulses ("citywide transit pulse"). Not a vehicle renderer, not a map
layer — a presentation-only far-view field. Reads truth directly (the selector
returns 0 individuals at cruise) but mutates nothing.

### File → `SBE.CruiseMovementField`

```
start({intervalMs?}) / stop() / isActive()
renderOnce() / clear()
setEnabled(on) / setDebug(on) / setPreset(name) / getPreset()
setIntensity(0..1) / setMaxCells(n) / setCellSizePx(px)
getState() / getCells() / getRenderedPulses()
```

### Aggregation

Scans `TruthActorRuntime.listActors()` (cap 6000) → filters valid/fresh/in-bounds
buses → bins into `96px` screen cells → `intensity = density·0.45 + movement·0.35
+ freshness·0.20` (clamped 0..1). Pulses kept by **intensity → newest → cellId**.

### Altitude + budget

| profile | zoom | draws | cell budget |
|---|---|---|---|
| low / city | ≥12 | nothing (`off_profile_low_city`) | 0 |
| regional | ≥9 | aggregate (+ tiny individuals elsewhere) | 80 |
| cruise | <9 | aggregate only | 160 |

### Presets

`clean · night_grid` (default) `· cyan_infra · debug_heat · off`. Density pulse +
optional direction tick (when `movingCount>0`) + deterministic per-cell shimmer
(seeded by cellId hash — no per-frame random). Explicit `zeroFieldReason` always
explains an empty field.

### Debug (`_wos.debug.worldActors`)

```
cruiseFieldStart/Stop/RenderOnce/Clear/State/Cells/Pulses
cruiseFieldPreset(name)/Intensity(v)/MaxCells(n)/CellSize(px)/Debug(on)
cruiseTransitProof()   // busLiveProof() → cruiseFieldRenderOnce()
```

## 0605E — Transit Assignment Authority (world direction)

The first intentional assignment layer: lets WOS say **"this bus matters."**
Thousands of buses, one becomes *Night Owl / Hero / StudioRich / Graffiti / Event*
— while staying real, live, telemetry-driven, truthful. Assignment is
**presentation authority, not truth**: assignment-cache writes only.

### File → `SBE.TransitAssignmentAuthority`

```
start() / stop() / isActive()
assignVehicle/assignRoute/assignActor(id, assignment)
unassignVehicle/Route/Actor(id) / clearAll()
resolve(actor)                       // actor > vehicle > route > none
assignHeroBus(id,label) / assignRandomHeroBus() / assignNearestHeroBus()
clearHeroBus() / getHeroBus() / isHeroVehicle(id)
listAssignments() / getAssignment(id) / listTypes()
getState() / getStats() / setEnabled(on) / setDebug(on)
```

### Types & resolution

`hero · event · studio · sponsored · graffiti · holiday · debug · custom`.
Resolution by **scope** (actor > vehicle > route > none). **One active hero** at a
time (re-assign replaces the previous). Optional dev-only localStorage. Assignment
*suggests* a livery (`metadata.liveryKey`); the livery authority decides.

### Integration (all presentation-only, capped)

- **Renderer**: WSL payload metadata gains `assignmentType / assignmentLabel / assignmentId`.
- **Presence**: hero buses get a **≤15%** alpha boost (no particles/beams).
- **Cruise field**: cells containing a hero bus get a **≤5%** intensity bias — the
  aggregate stays truthful.

### Debug (`_wos.debug.transit`)

```
assignHeroBus(id,label) / assignRandomHeroBus() / assignNearestHeroBus()
clearHeroBus() / getHeroBus()
assignTransitVehicle(id,asg) / assignTransitRoute(id,asg)
listTransitAssignments() / inspectTransitAssignment(id)
transitAssignmentState() / transitAssignmentStats() / clearAllTransitAssignments()
```

## 0605F — Transit Camera Targeting (camera requests)

0605E made WOS say "this bus matters"; 0605F makes the **camera care**. A presentation
camera-request layer (not a camera engine): resolves a target and submits safe requests
to an existing camera/viewport authority, else returns `camera_unavailable`. **A bus
follow is not a car follow** — buses stop, dwell, jump, go stale, disappear, and the
camera respects that.

### File → `SBE.TransitCameraTargeting`

```
start/stop/isActive
followHeroBus() / followVehicle(id) / followRoute(id) / followActor(id)
jumpToTarget() / frameTarget() / orbitTarget() / clearTarget()
getTarget() / getTargetActor() / getTargetPosition()
renderOnce() / tick()
getState() / getStats()
setEnabled/setDebug/setMode(mode)/setDwellHoldMs/setStaleHoldMs/setCorrectionEase
```

### Bus-aware behavior

| condition | camera |
|---|---|
| moving | follow smoothly (prefers smoothed presentation pos) |
| stopped (`speed<0.5`) | `dwelling` — hold composition, never clear |
| stale (>45s) | `stale_hold` — hold last known, then `lost` after `staleHoldMs` (15s) |
| disappeared | `lost` — stop follow safely |
| telemetry jump (>120m) | ease correction (`correctionEase` 1800ms), no panic snap |

Modes `off/follow/frame/orbit/inspect` (orbit degrades to frame when unsupported).
Route follow picks one representative bus: **selector-selected → nearest center →
freshest → actorId** (deterministic; retarget ≥30s). Camera submit priority:
`ViewportAuthority → AttentionGeography → Mapbox easeTo/flyTo`. `jumpToTarget()` may
fly aggressively. Default follow cadence 1000ms (not render-frame).

### Debug (`_wos.debug.transit`)

```
transitCameraStart/Stop/State/Stats
followHeroBus() / followBusVehicle(id) / followBusRoute(id) / followBusActor(id)
jumpToTransitTarget() / frameTransitTarget() / orbitTransitTarget() / clearTransitCameraTarget()
getTransitCameraTarget() / getTransitCameraPosition() / transitCameraMode(m) / transitCameraTick()
```
Aliases (`_wos.debug.worldActors`, prefixed to avoid 0604L's label-follow):
`cameraFollowHero/cameraFollowVehicle/cameraFollowRoute/clearBusFollowCamera`.

## 0605G — Articulated Bus Presentation Pass

Two-segment articulation for bendy buses (SBS / `+` routes). Front = truth anchor +
heading authority; rear segment + accordion joint are **derived presentation
positions** from heading history (no route geometry, no physics — visual, not
simulated). Applies **only** to `busAssetClass === 'articulated'`.

### File → `SBE.ArticulatedBusPresentationPass`

```
start/stop/isActive
observe(actor)                  // updates derived state (articulated only)
getPresentationState(actorId)   // → { front, rear, joint, bendAngleDeg, simplified, profile }
clear() / getState() / getStats() / setEnabled(on) / setDebug(on)
```

### Model

`bendAngleDeg` from front-heading vs a lagged trail-heading (clamped ±32°,
`BEND_SMOOTHING_FACTOR 0.15`). Rear lags 18m behind along the bent trail heading;
joint at the midpoint. Cache cap 2000.

### Altitude

low/city → full two-segment; **regional → single silhouette** (rear collapses to
front, `simplified:true`); **cruise → disabled** (aggregate field only).

### Integration

- **WSL** (additive): `bus-articulated-front / -joint / -rear` segment builders
  (`articulationBendDeg` rotates the part). The original `bus-articulated` block is
  untouched.
- **Renderer**: observes articulated buses, passes `articulationBendDeg` +
  `rearLng/rearLat` + `articulationSimplified` into payload metadata. Standard /
  express / shuttle get no articulation.

### Debug (`_wos.debug.transit`)

```
articulatedState(actorId) / articulatedStats() / articulatedEnable(on) / articulatedDebug(on)
```

### 0605G.1 — Articulated Bus Live Bend Update (WSL patch)

Closes the live-update gap: WSL rebuilds meshes only on definition change, so bend
was stale between rebuilds. Now WSL applies **bend-only** changes via a per-upsert
**transform hook** (Strategy C) — rotating the named pivot groups without a rebuild.

- WSL `_buildBusClassMesh` articulated branch tags parts (`userData.part =
  front/joint/rear`) and puts rear+joint in **pivot groups at origin**; group
  carries `userData.articulated / articulationBendDeg / articulationSimplified /
  articulationParts`.
- `_applyArticulationLiveUpdate(mesh, v)` runs every upsert after transform:
  `joint.rotation.z = bendRad·0.5`, `rear.rotation.z = bendRad`. Skips
  non-articulated meshes and sub-epsilon changes (`ARTICULATION_BEND_EPSILON_DEG
  0.5`); `articulationSimplified` collapses bend to 0 (single readable silhouette).
- WSL `getArticulationLiveState()` / `getArticulationMeshDebug(id)`; WSL bumped to
  **1.33.0**.
- Debug (`_wos.debug.transit`): `articulatedLiveState()`, `articulatedLiveInspect(id)`.

No truth/selector/smoothing/assignment/camera/Mapbox mutation — mesh-local
transforms only, only the affected `bus_fallback:*` mesh updated, no new RAF/scan.

## 0605H — Transit Stop/Dwell Cue Pass

Makes stopped buses read as **intentional transit behavior**, not frozen telemetry.
**Dwell is behavior, not failure**: moving→motion cues (0605A), stopped→dwell cues
(here), stale→degraded, lost→released. Subtle canvas cues over the selector's
`selectedActors` only.

### File → `SBE.TransitStopDwellCuePass`

```
start({intervalMs?}) / stop() / isActive()
renderOnce() / clear()
setEnabled/setDebug / setPreset(name)/getPreset() / setIntensity(0..1)/setMaxCues(n)
getState() / getRenderedCues() / getStats()
```

### Cues & classification

Dwelling when `speedMps < 0.5` and not stale (or camera target reports `dwelling`
with missing speed). Cue types: **pause_halo** (pulsing ring), **door_light**
(curb-side hint, no passenger/door sim), **dwell_tick** (debug blink), **target_hold**
(only the camera-followed dwelling bus — reads 0605F state, never calls it). Moving
buses → `movingRejected` (no motion streak duplication — that's 0605A).

### Altitude + budget

low full (80) · city compact (120) · **regional/cruise off** (0). `setMaxCues`
caps further; never exceeds selected bus count.

### Presets

`clean · night_city` (default) `· debug_bright · off`. Intensity clamps 0..1.
Single transparent overlay, cue data computed headlessly.

### Debug (`_wos.debug.transit`)

```
transitDwellStart/Stop/RenderOnce/Clear/State/Stats/Cues
transitDwellPreset(name)/Intensity(v)/Debug(on)
busDwellProof()   // busLiveProof() → presence renderOnce → dwell renderOnce
```

## 0605I — Actor Camera Shot Presets (`wall/systems/camera/`)

Reusable, **actor-agnostic** camera language. Targeting (0605F) answers *what* we
follow; shot presets answer *how* we view it. Works for cars, buses, boats, bikes,
**and future walkers** with no framework change. Lives outside transit at
`wall/systems/camera/actorCameraShotPresets.js`.

### → `SBE.ActorCameraShotPresets`

```
setShot(id)/getShot() · nextShot()/previousShot() · listShots()/getShotDef(id)
applyShot(id) · getState()/getStats() · setEnabled/setDebug
```

27 shots in 4 families: **external** (follow/lead/chase/side/top/civic/orbit),
**pov** (windshield/windows/bumpers/roof), **transit** (bus windows/door/roof/
articulated joint), **walker** (head/shoulder/street). `applyShot` reads the
target position+heading from `TransitCameraTargeting`, forms an offset/pitch/
bearing-framed camera request, and submits via `ViewportAuthority →
AttentionGeography → Mapbox easeTo/flyTo` (else `camera_unavailable`). POV = virtual
camera anchor only (no interiors). Reads targeting only — never mutates it, truth,
selector, smoothing, or Mapbox style.

### Debug (`_wos.debug.camera`)

```
listShots() · setShot(id) · applyShot(id) · nextShot()/previousShot()
cameraShotState() · cameraShotStats()
```

## 0605K — Terrain-Aware Actor Camera (`wall/systems/camera/`)

Makes 0605I's camera shots **ride Mapbox terrain** instead of floating over a flat
abstraction — so windshield/POV views rise with hill crests, reveal skylines, and
never clip below the ground. A request-enhancement layer: one request in, one
enhanced request out. Terrain is presentation context — mutates no actor/route/
targeting/shot/WSL/Mapbox-style state.

### → `SBE.TerrainAwareActorCamera`

```
start/stop/isActive
enhanceRequest(request)               // adds terrain/grade/clearance/pitch fields
sampleTerrain(lng,lat) / sampleGrade(lng,lat,heading)
setMinClearanceMeters/setGradeSmoothing/setPitchCompensation
getState()/getStats()/clearCache() · setEnabled/setDebug
```

- **Clearance**: `cameraElevationM = max(terrain + 1.5m, terrain + offsetZ)` —
  POV never below ground.
- **Grade**: samples terrain ±12m along heading → `gradeDeg`; **pitch
  compensation** (×0.35, ≤8°) graded per shot — windshield/front 1.0, side 0.4,
  rear 0.25, roof 0.15, **external 0** (no overcorrect). Smoothed (0.18) against
  noisy samples.
- **Exaggeration-aware** (`queryTerrainElevation({exaggerated:true})` → fallback),
  terrain-sample cache capped at 1000 (null elevations never cached, so transient
  unavailability can't poison it). Safe passthrough when disabled / no terrain API
  / map unavailable.

Wired into `ActorCameraShotPresets.applyShot()` (calls `enhanceRequest` before
submit; 0605I works unchanged if 0605K is absent).

### Debug (`_wos.debug.camera`)

```
terrainCameraState/Stats · terrainCameraSample(lng,lat) · terrainCameraGrade(lng,lat,heading)
terrainCameraEnable(on)/Debug(on) · terrainCameraClearCache() · terrainCameraProof()
```

### 0605K.1 — Camera Shot Selector UI (CAM dropdown bridge)

Exposes the 0605I/0605K shot presets in the existing **CAM dropdown** (Drive mode,
`traversalControlDeck.js`) so windshield/side/rear/bus-front/street-level views are
testable without console work. **UI triggers camera language; it does not own
camera logic.**

- Legacy modes (`follow/lead/side/high/hide_actor`) still route to
  `HeroVehicleRuntime.setCameraPreset`; the 6 shot ids route to
  `ActorCameraShotPresets.applyShot(id)` (→ terrain-enhanced via 0605K).
- Grouped `optgroup`s: Legacy · POV (windshield/left/right/rear) · Transit
  (bus_front_window) · Walker (street_level) · Actor (hide_actor). Values are the
  canonical 0605I shot ids; labels human-readable.
- `SBE.CameraShotSelectorUI`: `getState() / options() / setShot(id) / isShotId(id)`.
  No-target / camera-unavailable / shot-presets-unavailable handled without crash.
- Debug (`_wos.debug.camera`): `cameraShotSelectorState() / cameraShotSelectorOptions()
  / cameraShotSelectorSet(id)` + `cameraWindshieldProof/cameraSideWindowProof/
  cameraRearWindowProof`.

## 0605L — Occupant POV Camera Framework (`wall/systems/camera/`)

Canonical occupant **anchors** — answers only *"where is the viewer sitting?"*
(`Occupancy → Anchor → Lens → Presentation`; this owns the Anchor stage only — no
lens/framing/cinematic). Actor-agnostic: cars, buses, walkers, bikes, ferries, and
future classes. Pure resolver, mutates nothing.

### → `SBE.OccupantPOVCameraFramework`

```
resolveAnchor(actor, anchorId)   // → { ok, anchorId, vehicleClass, offset{x,y,z}, heightM, lng, lat, headingDeg }
vehicleClassOf(actor) · listAnchors() · getAnchorOffset(id) · getProfile(class) · getState()
```

11 canonical anchors with actor-local offsets (x=right, y=forward, z=up, metres):
driver_seat/front_passenger/rear_seat, windshield/left/right/rear_window_view,
bus_front_window, walker_head, bike_rider, ferry_passenger. `resolveAnchor`
classifies the actor (car/bus/walker/bike/ferry), picks the offset (or the class
default when no anchorId), and resolves the world **eye position** by projecting
the planar offset along the actor heading. Unknown anchor → `ok:false`. No-coords
actor → offset returned, world `lng/lat` null. **No lens/framing fields** — that's
0605I/0605K.

### Debug (`_wos.debug.camera`)

```
occupantAnchors() · occupantResolve(actor?, anchorId) · occupantProfile(class)
```

## 0605M — Occupant Camera Modes (runtime POV bridge)

Turns 0605L anchors into **selectable, visible** occupant modes:
`actor target → occupant anchor (0605L) → camera request → terrain enhance (0605K)
→ viewport`, owned per-frame until disengaged. *"Occupancy before lens"* — the mode
adds only a view direction (forward/left/right/rear) + pitch/zoom; no FOV/interiors.

### → `SBE.OccupantCameraModes`

```
applyMode(modeId) / reapply() / setMode(id) / getMode() / listModes() / getModeDef(id)
start/stop/isActive/disengage · setEnabled/setDebug · getState()/getStats()
```

11 modes: driver · passenger · rear_seat · left_window · right_window · rear_window
· bus_front · bus_passenger · walker_head · bike_rider · ferry_passenger. Bearing:
forward=heading, left=−90, right=+90, rear=+180. Target resolution = transit target
→ hero car (mirrors repaired 0605I). **Occupant modes supersede shot presets** (they
disengage `ActorCameraShotPresets` first); engagement claims `ViewportAuthority` and
runs a per-frame `jumpTo` loop — `HeroVehicleRuntime` yields while active.

### UI + Debug

CAM dropdown gains an **Occupant** optgroup (the 8 occupant-exclusive modes; the
3 window modes route through the existing POV options, supersede-priority). Debug
(`_wos.debug.camera`): `occupantModes / occupantModeState / occupantModeStats /
occupantMode(id) / occupantModeApply(id) / occupantModeDisengage / occupantModeReapply`
+ `driverPOVProof / passengerPOVProof / rearSeatPOVProof / busFrontPOVProof /
walkerPOVProof / bikePOVProof / ferryPOVProof`.

## 0605N — Transport-Scoped POV Authority (`wall/systems/camera/`)

Untangles the camera dropdown: **Transport Mode → Actor Class → View Family
(internal/external) → Anchor/Rig → Look Direction**. Each transport exposes only
its valid viewpoints; front/left/right/rear are one shared direction vocabulary.

### → `SBE.TransportScopedPOVAuthority`

```
setTransportMode / getTransportMode · setViewFamily / getViewFamily
setLookDirection / getLookDirection · setInternalView / getInternalView · setExternalView / getExternalView
getAvailableInternalViews(mode?) · getAvailableExternalViews(mode?) · getAvailableLookDirections(mode?, family?)
applyCurrentView() · applyView({ transportMode, family, internalViewId, externalViewId, lookDirection })
getProfiles() / getProfile(id) · getState() / getStats() · setEnabled / setDebug
```

6 transport profiles (flight/drive/walk/bike/transit/ferry) with `actorClass`,
scoped `internalViews` / `externalViews` / `lookDirections`, speed profile.
**Internal** = occupant anchor (0605L) + look direction → routed via
`OccupantCameraModes.applyView` (terrain-enhanced). **External** = legacy
`HeroVehicleRuntime` preset, explicitly `external_legacy` (real rigs deferred to
0605P), never touching occupant anchors. Scoping rules: switch transport resets
invalid views to defaults; look persists when valid; internal/external state
remembered separately; flight `cockpit` reports `unsupported_internal_view` until
an anchor exists.

### 0605M extension

`OccupantCameraModes` gains `applyInternalView(anchorId, lookDirection)` +
`applyView({internalViewId, lookDirection})` so any seat anchor can look
front/left/right/rear (bearing offset 0/−90/+90/180) — seat stays fixed, only the
view bearing changes.

### UI

CAM dropdown rescoped to **External · Internal POV · Look** groups (drive-scoped),
routed through the authority. Impossible combinations (Drive→Bus Passenger, etc.)
no longer appear; legacy follow/lead/side/high live only under External.

### Debug (`_wos.debug.camera`)

```
transportPOVState / transportPOVProfiles · transportPOVSetTransport(mode) / SetFamily / SetInternal / SetExternal / SetLook · transportPOVApply()
drivePOVProof / transitPOVProof / walkPOVProof / bikePOVProof / ferryPOVProof / externalCameraProof
```

## 0605O — Camera Lens Control Pass (`wall/systems/camera/`)

Answers *"how does the camera see?"* — lens/framing layered onto a resolved camera
request. Anchor = where you sit (0605L); look = where you face (0605N); **lens =
how you see**. Pure transform: request in → profile + trims → adjusted request out.
Resolves nothing, submits nothing (except debug proofs). Order: anchor → look →
**lens** → terrain → submit.

### → `SBE.CameraLensControlPass`

```
setLensProfile(id)/getLensProfile()/listLensProfiles()/getLensProfileDef(id)
applyLens(request) · previewLens(request, id) · suggestProfileForRequest(request)
setAutoProfileEnabled(on)/getAutoProfileEnabled()
setZoomTrim/setPitchTrim/setBearingTrim/setRollTrim/setCompositionBias/resetTrims
setEnabled/setDebug · getState()/getStats()
```

10 profiles: wide · normal · telephoto · cinematic · surveillance · dashcam ·
helmetcam · bus_window · ferry_deck · drone_observer (each = zoom/pitch/bearing/
roll deltas + composition bias + fovHint + clamps). **Auto** (default) suggests by
context: drive→dashcam, transit→bus_window, walk/bike→helmetcam, ferry→ferry_deck,
external drone/high→drone_observer, external follow/lead/side→cinematic, else
normal. Additive runtime trims (clamped) on top; final clamps zoom 0–22, pitch
0–85, bearing 0–360, roll −45..45. Invalid requests pass through safely.

### Integration

`OccupantCameraModes` runs `applyLens(req)` **before** terrain enhancement in both
compose paths — internal POV requests now carry `lensApplied/lensProfileId/fovHint/
original*`. Drive feels like dashcam, walk/bike wider, transit higher/broader,
ferry preserves horizon — anchors stay fixed.

### UI + Debug

Compact **Lens** selector beside CAM (Auto/Wide/Normal/Telephoto/Dashcam/Helmet/
Bus/Ferry/Drone); trims stay debug-first. `_wos.debug.camera`: `lensState/lensStats/
lensProfiles/lensProfile(id)/lensAuto(on)/lensZoomTrim/lensPitchTrim/lensBearingTrim/
lensRollTrim/lensCompositionBias/lensResetTrims/lensPreview(id)` + `lensDriveProof/
lensBikeProof/lensWalkProof/lensBusProof/lensFerryProof`.

### 0605O.1 — True Internal POV projection (fix)

**Root cause:** Mapbox `center` is the *look-at* target, not the camera eye — so
setting `center = occupant anchor` made the camera orbit the actor (the full car
stayed visible). Fixed with an internal-POV projection path in `OccupantCameraModes`:

- Internal requests are flagged `povInternal` and carry `eyeLng/eyeLat/eyeHeightM`
  + `viewBearing`.
- `_submitInternalPOV` places the **eye at the anchor** and looks toward a target
  **ahead** along the view bearing — via Mapbox **FreeCamera** (`setFreeCameraOptions`:
  eye position at `terrain + eyeHeight`, `lookAtPoint` ~1000 m ahead) when
  available, else a forward-centred high-pitch `jumpTo` fallback (center ~80 m
  ahead). The viewport now looks *from* the seat, not at the car.
- **Actor mesh hidden** while internal POV is engaged (`HeroVehicleRenderer.setHidden`),
  restored on disengage — a real in-car view doesn't show the exterior.
- **External views unchanged**: still `center = actor`, actor shown (filming it).
  Switching Internal ↔ External visibly toggles actor hidden/shown.

Verified: Driver/Front looks forward (no full car, actor hidden), Driver/Left
looks out left from the same seat, Driver/Rear looks backward; External/Follow
still shows the car.

**0605P formalization:** internal requests now also carry `lookTargetLng/lookTargetLat`;
`OccupantCameraModes.getState()` exposes `kind`, `actorHidden`, and `projectionPath`
(`freecamera` | `fallback_center_ahead` | `null`) so the projection path is
verifiable. Rules enforced: internal never centers on the anchor; internal hides
the occupied actor; external is unchanged (actor visible); lens/terrain never mask
projection (projection is solved first); no actor/anchor/transport/Mapbox mutation.

### Next

- `0605P` external camera rigs · Foreground Anchor Pass · Camera Motion Texture.
