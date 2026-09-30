# SUBWAY Architecture Map

Read this before any SUBWAY-related task. See [../README.md](../README.md) for
what this directory is. This page describes what's true now, not how it got
that way — it exists so future work doesn't repeat the recon already spent
establishing these facts.

## 1. Product/runtime role

SUBWAY is StudioRich's current primary MAP/navigation world: a live,
MTA-realtime-driven map of the NYC Subway, rendered inside `wall/` (a
separate, non-Vite JavaScript runtime — not the MUSIC Vite/React app; see
[../SYSTEMS.md](../SYSTEMS.md)'s MAP/SUBWAY entry).

**β0.1 PRODUCT CONVERGENCE: SUBWAY is now the default `wall/index.html`
entry mode.** A bare load (no `?mode=` param at all) activates
`MTASubwayMapLayer` exactly the same as an explicit `?mode=subway` —
previously a bare load opened only the older general LIVE MAP shell with
no subway-related fetch/render at all. Only an explicit OTHER mode (e.g.
`?mode=racetrack`) opts back out. This is a default-value change only, in
`wall/index.html`'s own boot script and `wall/main.js`'s `isSubwayMode`
Tilt-skip check — no new activation path, no duplicated
`MTASubwayMapLayer` logic.

SUBWAY evolved **additively** inside `wall/` on top of pre-existing MAP/World
infrastructure (Worlds, Orb, itinerary/routing, RACETRACK — see AGENTS.md's
"Protected MAPS / RACETRACK Infrastructure"). That older infrastructure is
still real, still live, and still shared — its existence does not mean it is
safe to delete, and none of it is superseded by SUBWAY. This page documents
only the SUBWAY-specific layers; it does not re-litigate or re-describe the
World/Orb/RACETRACK system, which has its own protected status in AGENTS.md.

SUBWAY itself has two, currently disconnected, halves:

- A **live runtime half**, entirely in `wall/systems/transit/` and
  `wall/systems/presentation/` — real-time MTA data, live train identity,
  Surface Map rendering, camera, HUD, and paint authoring. Canonical id
  minting for everything here: `wall/systems/transit/mtaSubwayIdentity.js`
  (`subway:stop:*` / `subway:complex:*` / `subway:route:*` / `subway:trip:*`
  / `subway:vehicle:*` — always derived from real MTA GTFS ids, never a
  display name).
- A **station-geometry authoring half**, entirely in `music/src/data/`,
  `music/src/logic/maps/`, and `music/src/ui/maps/StationGeometryEditor.tsx`
  — MUSIC-side, IndexedDB-backed, single-station-at-a-time plan-view
  authoring. **Verified this pass: nothing in `wall/` references
  `stationGeometry`/`StationGeometryData` — there is no bridge between the
  two halves today.** See §3, §8, §10.

## 2. Current major runtime layers

| Concern | Canonical owner | Notes |
|---|---|---|
| subway route/network data | `wall/systems/transit/mtaSubwayStaticAdapter.js` + `mtaSubwayIdentity.js` | normalized GTFS static, offline snapshot `wall/data/subway/mtaSubwayStaticSnapshot.json` |
| live train/GTFS state | `wall/systems/transit/mtaSubwayRealtimeAdapter.js` → `mtaSubwayTransitStore.js` → `SubwayLogicalRollingStockAuthority` | persistent logical train/consist/car identity (`sr-train-*`/`sr-consist-*`/`sr-car-*`) + truth-aware position; three truth classes: **observed** (raw feed) / **inferred** (this authority's own calc from observed + canonical shape geometry) / **logical** (persistent StudioRich identity, never the transient MTA `trip_id`) |
| Surface Map rendering | `wall/systems/presentation/mtaSubwayMapLayer.js` (v5.2.0) | 2D, `requestAnimationFrame`-driven, the current default live train+route rendering |
| Underground / Tunnel Vision (3D) | `wall/systems/presentation/subway3DTrainActorLayer.js` + `subway3DVisibilityPolicy.js` | Mapbox custom layer, multi-consist 3D presentation. **Dev-flag gated, OFF by default** (`?subway3d=1` URL param or localStorage; `_readDevFlag()` returns `dev_flag_disabled` otherwise) — real and tested, not a public default path. Architecture: "Renderer draws (`subway3DTrainActorLayer.js`) · Selector chooses (`subway3DVisibilityPolicy.js`, pure, no Mapbox) · Truth runtime knows (`SubwayLogicalRollingStockAuthority`)." |
| train rendering | 2D: `mtaSubwayMapLayer.js`. 3D: `subway3DTrainActorLayer.js`. Shared derived-presentation (both renderers read these, neither owns them): `subwayTrainMotionModel.js` (continuous position physics — fixes GTFS-RT's stop-to-stop teleport), `subwayTrainVisualState.js` (bearing/headsign, pure derivation, no persistence), `subwayTrainCarVisualAdapter.js` | never a second train identity system — both renderers read the one `SubwayLogicalRollingStockAuthority` |
| camera / Sunroof Camera | `wall/systems/presentation/subwayCameraSunroof.js` — **Status: experimental** | see §4 |
| station geometry | `music/src/data/stationGeometryTypes.ts`, `music/src/logic/maps/stationGeometry{45thStreet,53rdStreet,77thStreet,BayRidgeAv}Seed.ts` | MUSIC-side only; not bridged into `wall/` (§1) |
| station classification | `music/src/data/stationClassificationTypes.ts` | 4-axis grammar (topology / service pattern / structure / operational role) + `StationComponent`/`StationComplex` composition. **Types + composability tests only — no automatic classifier exists.** |
| station archetypes | `music/src/data/stationArchetypeTypes.ts`, `music/src/logic/maps/stationArchetypeInstantiate.ts` | two archetypes: `UG_SIDE_2TRACK_ARCHETYPE_ID`, `UG_SIDE_4TRACK_ARCHETYPE_ID` — reusable editable starting shells, never auto-applied to a real station, never bulk-generated |
| station seeds | same 4 seed files as "station geometry" above | individually-authored real stations, not archetype-generated; see §6/§7 |
| station editor | `music/src/ui/maps/StationGeometryEditor.tsx` | deliberately single-station (Bay Ridge Av / R42) V0; reached only via its own isolated `#stationGeometryEditor` hash route in `App.tsx` — **not** wired into MapsSection's station-library navigation (its own header: coupling to that library "would be new, unauthorized architectural coupling", since that library keys a different station identity — see §8) |
| station persistence/import/export | `music/src/data/stationGeometryStore.ts` | `MUSIC_STATION_GEOMETRY_DB` IndexedDB, keyed by `stationGeometry:<gtfsStopId>`; `isPlausibleStationGeometryData()` is a shape-only JSON-import guard, not a full schema validator |
| MAP presentation/HUD | `subwayStationHud.js` (public station HUD, replaced an older debug panel), `subwayLineRibbon.js` (line/ride context strip), `subwayItineraryRideHud.js` (boarding), `subwayPresentationSurface.js` (toggles the one `subway-presentation` body class) | all read already-canonical data; none derive a second copy of station/arrival/identity state |
| StudioRich paint surface | `wall/systems/presentation/subwayMapPaintSurface.js` | routes PAINT/PAN/UNDO + Art Supply selection to `Workspace`/`SurfaceDrawingRuntime` (`wall/engine/`) and Firestore `artworks` (`surfaceId: map:*`); reuses Blackbook's `window.SBE.ArtSupplies` — never a second supply set. See §8/§11 for the **second, separate** car-surface graffiti authoring path. |
| member/authoring gate | `STUDIO_RICH_OPERATOR_EMAILS` (`shared/member-identity`) + `firestore.rules`' `isStudioRichMapAuthor`/`isRestrictedAuthoringSurface` | already documented in [../SYSTEMS.md](../SYSTEMS.md) and [../OWNERSHIP.md](../OWNERSHIP.md) — not duplicated here |

## 3. World separation

```
Surface Map            wall/systems/presentation/mtaSubwayMapLayer.js
  owns: 2D live train + route rendering, always on
  does NOT own: 3D consist geometry, camera behavior, station interiors

Underground / Tunnel Vision (3D)
                        wall/systems/presentation/subway3DTrainActorLayer.js
                        + subway3DVisibilityPolicy.js
  owns: 3D train/consist presentation, per-train visibility/LOD decisions
  does NOT own: train truth/position (reads SubwayLogicalRollingStockAuthority
  + SubwayTrainMotionModel read-only), map projection state, station geometry
  dev-flag gated OFF by default — see §2

Station environments   music/src/ui/maps/StationGeometryEditor.tsx
                        + music/src/data|logic/maps/station* (MUSIC-side)
  owns: authored 2D plan-view platform/track/level geometry, single station
  does NOT own: any runtime rendering — zero wall/ consumer exists (§1)
```

`wall/systems/transit/subwayTrackStructureAuthority.js` classifies real track
segments (underground / elevated / at_grade / open_cut / embankment /
unknown) from the official NYC Subway Lines ROW_TYPE dataset, pre-joined
offline into `wall/data/subway/mtaSubwayTrackStructureSnapshot.json`. It is
real, real-sourced data — but **has no current consumers**: no
rendering, camera, altitude, or visibility system reads it yet (confirmed by
its own header's explicit scope boundary). This is the literal, currently
unwired seam where a future "does this train visually enter a tunnel"
decision belongs. **Do not let Surface Map rendering and Underground/3D
rendering merge into one code path without routing that decision through
this authority** — it is the one module positioned to arbitrate it once
wired; inventing a second track-structure classifier would duplicate real,
already-sourced data.

## 4. Camera authority

Canonical Subway camera chain:

```
MTA realtime evidence
  → SubwayLogicalRollingStockAuthority        (logical train + truth-aware position)
  → SubwayTrainMotionModel.buildMotionState   (continuous smooth position — POSITION AUTHORITY)
  → subwayCameraSunroof.js                    (camera target + bounded exponential damping)
  → MapboxViewportRuntime.setCamera           (canonical viewport wrapper — single jumpTo
                                                per frame, deliberately not easeTo, since
                                                this module supplies its own frame smoothing)
```

`subwayCameraSunroof.js` is **Status: experimental** (not yet promoted to
active) — it never re-derives trip topology, never mutates train/trip
identity, and never invents a second position authority; the train remains
positional authority. No replaced/legacy Subway-camera mechanism was found
predating it — treat its `experimental` status as real, not as evidence a
canonical replacement already exists elsewhere.

**Do not confuse with:**

- `wall/systems/camera/*` (`OccupantPOVCameraFramework`, `ActorCameraShotPresets`,
  `TransportScopedPOVAuthority`, `TerrainAwareActorCamera`, etc.) — a general,
  actor-agnostic POV camera framework shared by cars/buses/walkers/bikes/ferries
  (documented in `wall/systems/transit/README.md`'s 0605 series). Whether/how
  Subway riding relates to this framework's own `transit` transport profile is
  **UNRESOLVED — requires targeted verification** (that profile was built
  alongside the bus-camera series and its Subway applicability was not
  confirmed this pass).
- `wall/systems/transit/transitCameraTargeting.js` — a **bus**-specific
  camera-request layer (the 0605F bus series), not Subway.

## 5. Station model

Level stack (per `stationGeometryTypes.ts`'s `levels[]`/`connections[]`,
confirmed via the Bay Ridge Av seed's mezzanine + mezzanine↔platform
connection + crossover link):

```
surface
  ↓
mezzanine / fare-control level
  ↓
platform / track level
```

Vocabulary, as currently implemented:

- **Archetype** (`stationArchetypeTypes.ts`, `stationArchetypeInstantiate.ts`)
  — a reusable **editable starting model, not geographic truth**. Generates a
  labeled-`heuristic`-provenance `StationGeometryData` shell for a human to
  calibrate. Never a hidden source of truth, never auto-applied to a real
  station, never a step toward bulk generation. Three ship today:
  `UG_SIDE_2TRACK`, `UG_SIDE_4TRACK`, `UG_ISLAND_2TRACK` (STATION-06 — see
  §16) — `instantiateStationArchetype()` dispatches all three.
- **Seed** — an individually, directly-authored canonical geometry record for
  one specific real station. Not archetype-generated (Bay Ridge Av's own
  instantiate path has zero dependency on the archetype system). Four exist:
  45th Street, 53rd Street, 77th Street, Bay Ridge Av.
- **Station-specific geometry** — the resulting `StationGeometryData` record
  itself (`stationGeometry:<gtfsStopId>`), from either path.
- **Evidence/provenance** — every fact field carries a `Provenance`
  (source + confidence + note). `stationClassificationTypes.ts` deliberately
  reuses this exact shape for classification claims rather than inventing a
  second one.
- **Unresolved/resolved conflicts** — `StationGeometryData.evidenceConflicts[]`,
  an explicit array; conflicting evidence is recorded, never silently
  overwritten.

`stationClassificationTypes.ts` models `StationComponent` (one coherent
track/platform system, classified on 4 independent axes: topology / service
pattern / structure / operational role) composed into `StationComplex` (a
named station as one-or-more components plus real transfer relationships —
e.g. Union Square = two `ISLAND_4TRACK` components + one `SIDE_2TRACK`
component). **This is types + composability tests only — there is no
automatic classifier.** Every real classification today would have to be
hand-authored.

## 6. Bay Ridge Av calibration authority

Bay Ridge Av (R42, single-station complex 36, R line/4th Ave Line, Brooklyn)
is the current reference/calibration station — the only one carrying
platform-plan-level geometry. Its own seed file distinguishes evidence tiers
explicitly; do not promote any of the following past its actual tier:

| Tier | Facts | Source |
|---|---|---|
| Real, directly read | station coordinate | `wall/data/subway/mtaSubwayStaticSnapshot.json` (MTA GTFS static) |
| Real, computed (not hand-typed) | station orientation/bearing | derived from the same snapshot's real shape-geometry points via `computeBearingDeg()` |
| Externally sourced (reference) | topology — 2 side platforms, 2 running tracks, mezzanine, mezzanine↔platform connection, south-end crossover | Wikipedia, nycsubway.org |
| Externally sourced (survey) | platform-plan geometry — both platform footprints, both track centerlines | OpenStreetMap (a third, distinct source from the two above) |
| Explicitly labeled heuristic (never presented as fact) | altitude = 0 | street-level convention |
| Explicitly unresolved/unauthored | level elevations, mezzanine polygon, stair/crossover path geometry, entrances, wallSurfaces | not yet sourced — omitted, never defaulted into looking measured |

No field in this record is StudioRich-field-measured; "measured" here means
"real value read or computed from a named external source," always tagged
with which one via `Provenance.source`.

## 7. Additional station state

45th Street, 53rd Street, and 77th Street each have their own individually-
authored seed file, alongside Bay Ridge Av. **Their calibration depth
relative to Bay Ridge Av's multi-tier process (identity → topology →
platform-plan geometry, §6) was not verified this pass — UNRESOLVED, requires
targeted verification before assuming parity.** Do not assume any of the
three carries OpenStreetMap-sourced platform-plan geometry just because Bay
Ridge Av does.

No other real station has any `StationGeometryData` record. This is entirely
separate from `MTASubwayStationLibrary` (§8), which covers far more of the
live network but carries no plan/topology geometry at all.

## 8. Persistence and authority

```
station geometry (authored plan/topology)
  → music/src/data/stationGeometryStore.ts
  → MUSIC_STATION_GEOMETRY_DB (IndexedDB), keyed stationGeometry:<gtfsStopId>
  → browser-local only; JSON import/export via isPlausibleStationGeometryData()
  → NEVER synced to wall/ or Firestore

live transit state (train positions, arrivals, station identity/place)
  → wall/systems/transit/{SubwayLogicalRollingStockAuthority,
    MTASubwayStationLibrary, mtaSubwayTransitStore.js}
  → wall/'s own localStorage, entirely separate storage/identity space
    from the MUSIC-side geometry editor above

MAPS' own "Station Library" UI (MapsStationDetail.tsx, MapsStationsGrid.tsx)
  → music/src/maps/wallStationLibraryBridge.ts
  → reads/writes window.SBE.MTASubwayStationLibrary directly
  → "Wall remains the sole authority" (subwayStationLibraryTypes.ts's own
    header) — this is a real bridge, unlike the geometry editor above.
  → keys a DIFFERENT station identity (studioRichStationId) than
    StationGeometryEditor.tsx's stationGeometry:<gtfsStopId> records —
    the two "station" concepts do not resolve to each other

member-authored MAP paint (free drawing on the map surface)
  → subwayMapPaintSurface.js → Workspace/SurfaceDrawingRuntime (wall/engine)
  → Firestore artworks collection (surfaceId: map:*) + SurfacePersistence
    (wall/persistence/surfacePersistence.js, localStorage wos.surface.* cache)
  → gated by isStudioRichMapAuthor (see ../SYSTEMS.md, ../OWNERSHIP.md)

member-authored car-surface graffiti (separate, structured system)
  → SubwayArtworkAuthority (artwork record identity)
  → SubwayArtworkPlacementAuthority (append-only time-bound artwork↔surface
    placement history — covering/retiring never deletes a prior record)
  → SubwayCarSurfaceAuthority (persistent CarSurface identity per logical car;
    exterior_side_a/exterior_side_b/interior on every car, front/rear only on
    a consist's first/last car)
  → SubwayResidentGraffitiArtistAuthority (Resident artist identity/style/
    history — unrelated to Machine Life's own, narrower "resident" tag)
  → all wall/systems/transit/, all localStorage-backed, all DISTINCT storage
    keys/identity from the Firestore artworks path above — do not conflate
    the two authoring systems
```

**Explicit distinction:** runtime/live data (network-wide, `wall/`-owned,
localStorage) and authored station geometry (single-station-depth,
MUSIC-owned, IndexedDB) are two disjoint systems with zero current bridge.

## 9. Canonical / active / legacy / deprecated

| Item | Status | Note |
|---|---|---|
| `mtaSubwayMapLayer.js` (2D Surface rendering) | CANONICAL | current default live rendering |
| `SubwayLogicalRollingStockAuthority` | CANONICAL | sole live train truth/identity authority |
| `MTASubwayStationLibrary` | CANONICAL | sole live station place/identity authority |
| `mtaSubwayIdentity.js` | CANONICAL | sole canonical `subway:*` id minting |
| `subway3DTrainActorLayer.js` + `subway3DVisibilityPolicy.js` | ACTIVE | real, tested; dev-flag gated OFF by default — not yet the public path |
| `subwayCameraSunroof.js` | EXPERIMENTAL | own file status; not yet promoted to active |
| `SubwayTrackStructureAuthority` | ACTIVE, but DORMANT relative to rendering | real classified data, zero current consumers (§3) |
| Station-geometry/archetype/editor system (`music/src/data\|logic/maps/station*`, `StationGeometryEditor.tsx`) | EXPERIMENTAL, authoring-only | no bridge into `wall/` runtime (§1, §8) |
| `stationClassificationTypes.ts` | EXPERIMENTAL | types + tests only, no classifier |
| Pre-SUBWAY MAP/World infrastructure (Worlds, Orb, itinerary/RACETRACK, general `wall/engine` primitives) | ACTIVE (protected — see AGENTS.md) | predates SUBWAY; **not** deprecated merely for being older — still real, shared, load-bearing infrastructure |
| Member map-paint path (`subwayMapPaintSurface.js` → Firestore `artworks`) | ACTIVE | member-open, same boundary as Blackbook |
| Car-surface graffiti path (`SubwayArtworkAuthority` family) | ACTIVE | separate identity/storage from the map-paint path — see §8 |

## 10. Known remaining work

Architectural incompleteness only — not a feature backlog. No completion
percentage is recorded here because none is backed by an objective current
metric (see the separate, already-tracked network-classification coverage
work in `WOS-share/SUBWAY/` for that specific number, which is a different
axis — route/network classification, not this page's runtime/station-model
concerns).

- The station-geometry/archetype/editor system has **no bridge into `wall/`'s
  live SUBWAY runtime** — it is pure MUSIC-side authoring with zero runtime
  consumers today. The intended complete Surface / Tunnel / Station
  experience needs this bridge built before authored station geometry can
  ever render live.
- `SubwayTrackStructureAuthority`'s real track-structure classification has
  **zero current consumers** in rendering, camera, altitude, or visibility —
  the seam for deciding real Surface/Tunnel visual transitions is unwired.
- Underground/Tunnel 3D train presentation is real and tested but **dev-flag
  gated OFF by default** — not a public path.
- `subwayCameraSunroof.js` remains **Status: experimental**, not promoted.
- Station-level 3D/interior environments have **no rendering implementation
  at all** — the editor only authors 2D plan-view platform footprints; even
  Bay Ridge Av (the most-calibrated station) has no level elevations,
  mezzanine polygon, or stair/crossover path geometry (§6).
- `stationClassificationTypes.ts`'s 4-axis grammar has **no automatic
  classifier** — every real classification would have to be hand-authored.
- Only 4 stations have any authored geometry, and only 1 (Bay Ridge Av) is
  confirmed platform-plan-calibrated; the other 3's calibration depth is
  unverified (§7).

## 11. Integration boundaries

- **MEMBER IDENTITY** — `STUDIO_RICH_OPERATOR_EMAILS` gates StudioRich-
  operator-only Subway map authoring (`isStudioRichMapAuthor`/
  `isRestrictedAuthoringSurface`, `surfaceId: map:*`). Fully documented in
  [../SYSTEMS.md](../SYSTEMS.md) and [../OWNERSHIP.md](../OWNERSHIP.md); not
  duplicated here.
- **RADIO** — MAP/SUBWAY receives the canonical Channel through
  `music/src/member/radioChannelReceiverRuntime.ts` and
  `wall/systems/presentation/radioChannelHud.js` (LIVE, ON/OFF, local volume,
  Now Playing). The receiver delegates resolution and playback to existing
  RADIO logic and `DualDeckPlaybackEngine`; see [../radio/README.md](../radio/README.md).
  It belongs to the MAP document: navigation to BLACKBOOK ends that playback
  lifetime, and BLACKBOOK creates its own initially-OFF receiver. Separately,
  `nowPlayingHud.js` still consumes MUSIC's legacy local snapshot through
  `nowPlayingBroadcastBridge.ts`; it is not the Channel receiver/HUD.
- **WALL/paint** — two intentionally separate authoring systems exist (§8):
  general map paint (Firestore `artworks`) and structured car-surface
  graffiti (`SubwayArtworkAuthority` family, localStorage). Do not merge them
  without a deliberate migration decision.
- **Future station environments** — the MUSIC-side station-geometry/archetype
  system (§1, §5) is the clear intended data source for any future 3D station
  environment, once a bridge is built (§10). Do not invent a second
  station-geometry vocabulary inside `wall/` when one already exists in
  `music/`.

  **Architectural direction (not current implementation): station truth is
  independent from station representation.** The same structured
  `StationGeometryData` record is intended to eventually support multiple,
  independent presentations — Underground/Tunnel 3D, an inspectable 3D
  station view, a photorealistic/generated view, a BLACKBOOK surface/page,
  or a future realtime station experience — without any of those
  representations owning or forking the underlying geometry. Today, none of
  these consumers exist (§1, §10); this is a statement of intended direction
  for whoever eventually builds the bridge, not a claim that it's built.

## 12. STATION-01 — Station Cover V1 (Bay Ridge Av)

The first real, implemented station REPRESENTATION — deliberately reads a
DIFFERENT canonical truth source than the `StationGeometryData`/§5-§7
system above (which remains unbridged, see §10; Station Cover V1 does not
touch it at all).

```
Station Truth (existing, read-only)
  wall/data/subway/mtaSubwayStaticSnapshot.json
    .complexes[]  -- name, borough, routes[], lat/lon, gtfsStopIds[]
    .routes[]     -- shortName, longName, color, textColor
       ↓ fetch (same-origin: /wall-app/data/subway/mtaSubwayStaticSnapshot.json,
         real in both dev [proxy] and production [copy-wall-app-public])
music/src/logic/maps/stationTruth.ts
  resolveStationTruth(snapshot, gtfsStopId) -- pure lookup, never a fetch
  fetchStationTruth(gtfsStopId) -- the one IO wrapper
       ↓
music/src/logic/maps/stationCoverPresentation.ts
  deriveStationCoverDisplay(stationId, truth) -- pure state->display,
  same "logic vs. DOM adapter" split as memberAvatarPresentation.ts
       ↓
music/src/station/stationCoverRuntime.ts + music/station.html
  the actual Station Cover page (a new hosted-capable surface, alongside
  MAP and BLACKBOOK)
```

**Station Truth is independent from Station Representation, verified by
construction, not just stated as direction (unlike §11's own
`StationGeometryData` paragraph, which remains a stated-but-unbuilt
direction):** `stationTruth.ts` never fetches a second copy of station
name/routes/location — it reads the exact same file
`wall/systems/transit/mtaSubwayStaticAdapter.js` already treats as
canonical, by the exact same field names. No parallel station database,
no hard-coded Bay Ridge Av facts, no second identity scheme — the real
GTFS station-level stop id (`gtfsStopId`, e.g. `"R42"`) is the ONE
parameter Station Cover is built around; Bay Ridge Av is the first
instance, not a one-off page.

**Deliberately does NOT expose underground/elevated classification.**
`stationClassificationTypes.ts` has no automatic classifier and no
station (including Bay Ridge Av) has a hand-authored classification
record today (§5, §10) — `stationCoverPresentation.ts` has no field to
render one from, by construction, rather than by an ad hoc omission
check. A future batch that adds real, provenanced classification data
extends `StationTruth`/`StationCoverDisplay` then, not before.

**Hosted surface — MEMBER/RADIO ownership unchanged.** `music/station.html`
is a third HOME-hostable surface, added to `HomeRoute`
(`{surface:"station", stationId}`, `music/src/data/homeRouteTypes.ts`)
and `childUrl()`/`homeRoutes.ts` alongside `map`/`blackbook`, same
identity/readiness contract (`stationHomeSurface.ts`, modeled on
`blackbookHomeSurface.ts` — explicit query-based detection, `reportReady()`
once, `requestNavigateToMap()` delegates through HOME's own navigation
authority when hosted). Station Cover constructs NO `MemberIdentityAuthority`
and NO `RadioChannelReceiver` of its own — MEMBER (the persistent avatar,
`homeMemberAvatar.ts`) and RADIO (`homeRadioSession.ts`) both live
entirely in the persistent parent, outside every surface's own iframe, so
navigating MAP → STATION → MAP (or BLACKBOOK ↔ STATION) never reconstructs
either — verified by the same persistent-runtime-UUID/mount-count test
pattern `homeNavigation.test.ts` already uses for MAP ↔ BLACKBOOK.

**MAP entry (Phase 4 scope): one small, hosted-aware nav link, not a
general station-click system.** `wall/systems/presentation/subwayStationCoverNavLink.js`
(loaded in `wall/index.html` beside `subwayBlackbookNavLink.js`, same
exact pattern: a real `<a href="station.html?station=R42">` standalone,
intercepted via `HomeMapSurface.requestNavigate({surface:"station",
stationId:"R42"})` when hosted) is scoped to this batch's own calibration
station only. `subwayStationHud.js`'s existing, more complex per-station
hover/arrival interaction was deliberately NOT touched — general "click
any station to open its Cover" wiring is future work, not this batch.

**Public creative-space boundary: navigation contract only, never a
fake implementation.** No canonical station-associated public
drawing/creative-space surface exists yet (personal BLACKBOOK and
general MAP paint are the only two existing authoring surfaces, both
member-personal or general-map-wide — neither is station-specific public
space, see §8). Station Cover's own "Enter station creative space" action
is rendered as an honest, disabled, clearly-labeled placeholder — never
silently wired to BLACKBOOK, never a fake drawing surface. A future batch
that builds a real station-associated public creative space wires this
exact button; this batch intentionally goes no further.

**Visual scope: intentionally minimal.** Station name, route badge(s)
(color/label from the canonical routes table), borough (full name when
recognized, the raw code as a fallback, omitted only when truth supplies
none), and the two navigation actions above — nothing else. No photos, no
arrivals, no directions, no 3D, no promotional content.

## 13. STATION-02 — Live transit + directional line view + visual refinement

Extends V1 (§12) toward Station Cover's permanent role — MAP → STATION
COVER → {identity, line/service orientation, live arrivals, N/S context}
— without changing which system owns Station Truth. Station Cover still
consumes; it still never becomes a truth authority.

**Route symbol visual language.** `stationCoverPresentation.ts` gained
`hexToRgba()` and a `tintBackground` field on `StationCoverRouteBadge`,
derived from the SAME real route color already resolved in V1 (never a
second, hand-picked color). `stationCoverRuntime.ts`/`station.html` render
it as a circular outline (1.5px border, route-color glyph, ~10% opacity
interior fill) instead of V1's solid pill, with an optional
`prefers-reduced-motion`-respecting hover/focus "shine" — purely
presentational CSS, no new data dependency.

**Arrival display rule — implemented as pure logic, deliberately NOT
wired to a live feed.** New module `music/src/logic/maps/stationArrivalPresentation.ts`
(`selectStationArrivalRows(arrivals, direction)`) enforces the one real
business rule: maximum two upcoming arrivals per service, per direction,
nearest-first, with multiple simultaneous services each keeping their own
capped rows. Fully unit-tested (9 cases) against synthetic input.
`stationCoverRuntime.ts` currently calls it with an **empty arrival
array** and renders an honest "Live arrivals aren't available in this
view yet" note — see the STOP finding below for why.

**Northbound/Southbound.** `stationCoverRuntime.ts` holds a small local
`direction: "N" | "S"` UI state (default `"N"`) that drives which
capped-arrival set `selectStationArrivalRows` would show and which local-line
emphasis is shown. **Default rationale:** no directional entry-state
exists anywhere in the current navigation contract
(`{surface:"station", stationId}` carries no direction) — `"N"` is the
smallest deterministic default, not a derived one. A future batch adding
a real directional entry point (e.g. from an itinerary/destination
context) should replace this constant with that context rather than
building around it now, per the task's own explicit "don't block future
station-model N/S architecture" framing.

**Local line orientation — minimal, honest, not wired to real ordering.**
`stationCoverRuntime.ts` renders only the current station (a dot +
name) flanked by two dim dash placeholders — never a fabricated
neighboring station. See the second STOP finding below for why real
neighbors aren't shown.

### STOP finding 1 — live arrival authority is unreachable from Station Cover today

`wall/systems/transit/subwayArrivalIntelligence.js` is pure in the sense
of having no fetch/DOM/persistence of its own, but it reads from
`MTASubwayTransitStore`, a **live, in-memory object populated by
`mtaSubwayRealtimeAdapter.js`'s own polling inside `wall/`'s JS realm**.
Station Cover is a separately-hosted document (§12's "Hosted surface"
paragraph) — HOME's iframe surface-swap is a full document reload
(`frame.contentWindow.location.replace(...)`), which destroys MAP's
entire `wall/` runtime, including that live store, whenever Station
Cover (rather than MAP) is the mounted surface. There is today no
static/cross-document path to that data, unlike the static GTFS
snapshot §12 already established as safe to fetch directly.

**Recommended smallest resolution (not built this batch):** a
RADIO-01-style persistent live-transit session, owned by the persistent
HOME parent (outside any single surface's iframe, same shape as
`RadioChannelReceiver`/`homeRadioSession.ts`), exposing a
`getTransitSession()` bridge method on `window.StudioRichHome` that a
hosted Station Cover could read/subscribe to without needing `wall/`'s
own runtime alive. Scoped, not attempted here — no such persistent
session exists yet for transit data, and building one is a meaningfully
larger batch than a visual-refinement pass.

### STOP finding 2 — canonical station-ordering-along-a-route authority is absent/unreachable

**RESOLVED in STATION-03 — see §14.** `wall/systems/transit/subwayItineraryLegResolver.js`'s
`resolveLeg()` is the closest existing "ordering" logic, but it requires
an explicit origin+destination pair (an itinerary query, not a "what's
adjacent to this one station" query) and also depends on live `SBE`
globals scoped to `wall/`'s own JS realm — the same reachability problem
as Finding 1, not a separate one. No pure, static "given a route + a
station, what are its immediate neighbors" function existed anywhere in
the codebase at the time this finding was written.

**Resolution actually built (STATION-03):** a new pure shape-projection
module, `music/src/logic/maps/stationLineOrientation.ts`, operating on
the already-fetched static snapshot's `routes[].shapeIds`/`shapes{}`
polyline data (same file §12's `stationTruth.ts` already reads) —
exactly the approach predicted here, now real and tested. See §14 for
the full account, including why "longest shape by point count" (the
naive choice) is wrong and had to be replaced with a coverage heuristic.

**Both findings are reported per the task's own explicit STOP-condition
instructions, not treated as blockers for the rest of this batch.** The
UI shows an honest "not yet available" state for each rather than
inventing arrivals or neighboring stations; the display-rule logic
(`stationArrivalPresentation.ts`) is fully built and tested ahead of the
data becoming reachable, so wiring either resolution above requires no
further change to the arrival-selection or line-orientation rendering
logic — only a real data source behind each.

**Testing.** `stationArrivalPresentation.test.ts` (9 cases: cap-at-2,
multi-service, cross-service sort, direction filtering, eta-order vs.
array-order, due/minute formatting, empty-safe, three-simultaneous-services).
`stationCoverPresentation.test.ts` extended with `hexToRgba` coverage (2
cases) and a `tintBackground`-derives-from-the-same-color assertion.
Existing `homeNavigation.test.ts` MAP↔STATION mount/leave/runtime-UUID
coverage re-verified passing, unmodified — no navigation-contract change
this batch.

## 14. STATION-03 — MAP → Station Cover presentation boundary

Product decision: **MAP should feel like a map. STATION should feel like
a station.** Canonical hierarchy: MAP = geography/routes/live trains/
station selection/lightweight identity/drill-in. STATION COVER =
understand the selected station (detailed arrivals, N/S, local line
orientation). STATION MODEL (future, unbuilt) = inspect the physical
representation. Each level narrows scope while increasing detail — a
deeper level's information does not leak upward just because it exists.

### MAP presentation responsibility — BEFORE / AFTER

**BEFORE (STATION-01/02 era):** `wall/systems/presentation/subwayStationHud.js`
owned three DOM regions on station selection — `#subway-station-identity`
(neighborhood/name/line badges/YOUR TRIP boarding), `#subway-arrival-lane`
(up to two transient per-direction panels, several arrivals each, reading
`SubwayArrivalIntelligence.getArrivalsForStation()` directly), and
`#subway-radio-slot`. Selecting a station opened a detailed directional
arrival board directly over the geographic map.

**AFTER (STATION-03):** `subwayStationHud.js` owns `#subway-station-identity`
(unchanged: neighborhood/name/line badges/YOUR TRIP) and
`#subway-radio-slot` only. `#subway-arrival-lane` and its rendering
function (`_renderArrivalPanels`) are **removed** — not hidden, not
gated, deleted — along with the dead public `refreshArrivals()` method
(confirmed zero callers before removal) and the corresponding
`#subway-arrival-lane`/`.subway-arrival-panel*` CSS in `wall/styles.css`.
Selecting a station now shows only the lightweight identity card — the
same card that already existed, unchanged in content or layout. No new
"VIEW STATION" affordance was added to it: the existing always-visible
`subwayStationCoverNavLink.js` top-chrome pill ("BAY RIDGE AV STATION")
already provides an obvious, permanent route into Station Cover, and
duplicating it inside the identity card would violate this codebase's own
"never duplicate navigation/actions" doctrine.

**What was preserved vs. removed, explicitly:** `SubwayArrivalIntelligence`
itself — the data authority — is **completely untouched**: same file, same
public API (`getArrivalsForStation`, `getArrivalEvents`, `getDiagnostics`),
same `MTASubwayTransitStore` dependency, zero lines changed. Only the
**presentation** that read from it on MAP was deleted. YOUR TRIP (the
active-boarding-leg section inside the identity block) was deliberately
**kept** — it's a distinct, itinerary-scoped decision surface (an
in-progress boarding action), not a duplicate of the general per-direction
arrival board that was removed.

### Station Cover presentation responsibility — BEFORE / AFTER

**BEFORE (STATION-02):** identity + route badges + N/S toggle + arrival
rows (display rule fully built, but wired to an empty array — STOP
finding 1) + a minimal line-orientation marker (current station only,
dash placeholders either side, honest "not available" note — STOP
finding 2) + a dead "Enter station creative space — coming soon" button.

**AFTER (STATION-03):** identity + route badges + N/S toggle + arrival
rows (**unchanged** — still wired to an empty array; STOP finding 1 is
still open, see below) + **real local-line orientation** (real
previous/next station names either side of the current station, from
`stationLineOrientation.ts` — STOP finding 2 is now resolved) + the
obsolete creative-space button **removed entirely**, with no fake
destination in its place. Station Cover remains the sole canonical
location for detailed per-direction arrival presentation and local line
orientation — MAP does not duplicate either.

### Route-order authority (new)

`music/src/logic/maps/stationLineOrientation.ts` —
`resolveStationLineOrientation(snapshot, routeId, gtfsStopId)` — pure,
never fetches. Given a route's real GTFS `shapeIds` and the static
snapshot's `complexes[]` (already the exact same file `stationTruth.ts`
reads — no second/duplicated station database), it:

1. Picks the ONE shape among the route's `shapeIds` that passes within
   300m of the most real stations serving that route (a **coverage**
   heuristic). This was verified necessary against real data before
   writing the module: for the R line, the naive "pick the shape with
   the most points" choice selects a shape that misses Bay Ridge Av by
   2.4km (a partial-branch/express variant) — the coverage heuristic
   correctly selects the one shape that actually spans the whole route,
   placing every one of the 45 real R-served stations within ~140m.
2. Projects every real station serving that route onto the chosen shape
   (nearest-point-on-polyline, real haversine distance) and sorts by
   cumulative distance along it.
3. Returns the immediate previous/next real station names for the
   requested station — `null` on either side at a line terminus, `null`
   overall for any route/station this can't confidently resolve, never a
   fabricated or forced placement.

Verified against real data: Bay Ridge Av (R42) on the R line resolves to
`59 St` / `77 St`, the real MTA order — locked in as a test against the
actual `wall/data/subway/mtaSubwayStaticSnapshot.json` file, not a
synthetic fixture, alongside a full synthetic-fixture suite (11 cases:
ordering, both terminus edges, decoy-shape rejection, unknown route/
station, no-shapeIds, single-candidate, malformed snapshot, empty ids).

**Deliberately non-directional presentation.** The resolver's
previous/next ordering follows whichever direction the chosen GTFS shape
happens to be encoded in — real and consistent per shape, but not a
verified general N/S mapping (a shape's own point order isn't guaranteed
to correlate with `SubwayArrivalIntelligence`'s real `nyct.direction`
NORTH/SOUTH values without further, unverified cross-referencing).
Station Cover therefore renders both neighbors as plain flanking markers
(`59 ST · BAY RIDGE AV · 77 ST`), never claiming one side is "northbound"
— avoiding exactly the kind of fabricated-direction claim this codebase's
own `SubwayArrivalIntelligence` file header already warns against for
borough-bound labels.

### STOP finding 1 (live-arrival authority) — STILL OPEN, re-confirmed this batch

STATION-03's own product brief called for "the smallest clean shared/
persistent transit authority" (a `PERSISTENT STUDIO RICH HOST → LIVE
TRANSIT STATE → {MAP, STATION}` shape, explicitly modeled on RADIO-01).
This was investigated again this batch and **not built**, for a fact
this investigation surfaced that RADIO-01's own pattern doesn't actually
resolve here:

RADIO-01's persistent session (`homeRadioSession.ts`) works because its
underlying engine (`createRadioChannelReceiver()`) is a small, pure
MUSIC/TS module with no `wall/`-side counterpart — moving its
construction into the persistent HOME parent was simply choosing where
to instantiate a lightweight, portable engine. Live transit arrivals have
no equivalent portable engine: `SubwayArrivalIntelligence` reads from
`MTASubwayTransitStore`, which is populated by
`mtaSubwayRealtimeAdapter.js`'s own polling — both part of a large,
tightly-coupled `wall/`-only stack (`mtaSubwayIdentity.js`,
`mtaSubwayStaticAdapter.js`, `SubwayLogicalRollingStockAuthority`, and
more) that is itself part of this codebase's explicitly protected MAPS/
RACETRACK infrastructure (see `AGENTS.md`). And critically: `wall/`
itself is **not** the persistent parent in this architecture — it is
ALSO a hosted child surface (MAP), torn down by the exact same full-
document-reload surface-swap as Station Cover whenever MAP isn't the
mounted surface. There is currently no code, anywhere, that keeps any
`wall/` JS object alive outside MAP's own iframe.

Relocating (not duplicating — the task is explicit that there must be
exactly one engine) that entire realtime stack into the persistent HOME
parent would be a real, large, higher-risk architectural migration of
protected infrastructure — genuinely a separate, dedicated batch, not a
"smallest coherent" extension of this one. This finding is therefore
reported again, unchanged in substance, with the same recommended
resolution as before (a RADIO-01-*shaped* — not RADIO-01-*equivalent* —
persistent transit session, requiring the realtime stack itself to move,
not just a bridge method to be added).

Station Cover's arrival rows remain wired to an empty array with an
honest "not yet available" message, exactly as in STATION-02 — no fake
sharing, no fabricated data, no second polling engine built to work
around this.

## 15. STATION-04 — Mezzanine Drawer / MAP → Station Cover presentation consolidation

Introduces the **Mezzanine Drawer**: the consolidated station-information
layer between MAP and the future Platform. Product hierarchy: `MAP
(select station) → MEZZANINE DRAWER (explicit ENTER PLATFORM) → PLATFORM
(future, unbuilt)`. "MAP should feel like a map; STATION should feel
like a station" — MAP genuinely flexes into the space the drawer frees,
never a floating overlay.

### Layout mechanism — real CSS Grid, not a second drawer system

`wall/index.html`'s `.app-body` is already a 3-column CSS Grid
(`50px minmax(0,1fr) var(--inspector-width)`), and the active public
SUBWAY mode (`body.subway-public`) already collapses columns 1 and 3 to
`0` (`grid-template-columns: 0 minmax(0,1fr) 0 !important`). STATION-04
adds a 4th column, `var(--mezzanine-drawer-width)` (0 = closed), with a
new `#subway-mezzanine-drawer` grid item mirroring `#right-panel`'s own
established shape (`grid-column`, `width`/`min-width`/`max-width` all
driven by one CSS var, `transition`, an `opacity`/`pointer-events`
open-state gate). Opening/closing the drawer is therefore a real Grid
column resize — MAP's own `minmax(0,1fr)` column automatically reclaims
or cedes the space, with **no DOM reparenting of the map canvas, no
floating overlay, no `z-index` stacking**.

**Deliberately NOT `SBE.DrawerSystem`** (`wall/ui/drawerSystem.js`): that
system is an overlay/backdrop-based, closes-on-outside-click drawer built
for creator tools (Sampler/Library), and is explicitly suppressed
entirely in `body.subway-public` mode already (`#drawer-panel` is one of
the elements that mode's own CSS hides). It is architecturally the wrong
shape for "MAP flexes beside it, never floats over it" — reusing it would
have meant fighting its own backdrop/modal semantics, not adopting them.

**Resize + persistence.** `wall/systems/presentation/subwayMezzanineDrawer.js`
owns a real pointer-drag handle (315-540px clamp, 360px default),
persisted to `localStorage` and re-applied on the next `open()` (never
mid-drag — a resize always wins over a stale persisted value while the
drawer is open). **A real bug this module's own test suite caught before
merge:** the first implementation conflated "the user's preferred width"
with "the currently-rendered CSS var," so `close()` never actually
collapsed the grid column back to 0 — MAP silently never reclaimed the
space. Fixed by separating `_openWidth` (the preference, meaningful
whether open or closed) from the rendered CSS var (0 while closed,
`_openWidth` while open) — now covered by an explicit regression test
(`subwayMezzanineDrawer.tests.js`: "closing collapses the rendered CSS
grid-column width to 0").

**Resize sync.** After any width change, this module calls
`SBE.WorkspaceViewportSync.schedule()` — `wall/main.js`'s own
pre-existing, centralized, rAF-debounced resize scheduler (already
documented there as driving Mapbox's `map.resize()` after "drawer
open/close," among other triggers). `WorkspaceViewportSync` was a
private closure before this batch; STATION-04 exposes it on `SBE`
(one new line in `main.js`) specifically so this module could call the
existing mechanism instead of building a second one.

### Content — real reuse, not a second implementation

The drawer's content is a **same-origin iframe** pointing at
`../station.html?station=<gtfsStopId>&embedded=1` — the EXACT SAME page
and runtime (`stationCoverRuntime.ts`) Station Cover already built across
STATION-01/02/03, unmodified in substance. `?embedded=1` toggles two
purely presentational things (hide the standalone "← MAP" link; drop the
fixed `max-width`/large padding in favor of fluid, drawer-width-appropriate
spacing) — every other behavior (Station Truth fetch, route-badge
styling, N/S direction state, the arrival-rows display rule, real line
orientation via `stationLineOrientation.ts`) is identical in both modes.
`subwayMezzanineDrawer.js` itself owns zero station-information rendering
— it is a container only.

An **ENTER PLATFORM** action (disabled placeholder, same honest
"coming soon" pattern the old creative-space button used) replaces the
STATION-03-era "Enter station creative space" button, which represented
an obsolete model (Cover leading to a generic creative destination).
Platform itself does not exist yet — this batch's own explicit boundary.

### MAP cleanup — before/after ownership, element by element

| Element | Before STATION-04 | After STATION-04 |
|---|---|---|
| Station name / neighborhood / served-route badges | Rendered in `subwayStationHud.js`'s `#subway-station-identity` on every selection | **Moved** to the Mezzanine Drawer exclusively (`station.html`'s own presentation) — `identityEl` no longer renders any of this |
| Detailed per-direction arrival board | Already removed in STATION-03 (`#subway-arrival-lane`) | Unchanged — still Station Cover's job exclusively, now inside the drawer specifically |
| **YOUR TRIP** (active-boarding-leg BOARD action) | Rendered inside `#subway-station-identity`, alongside name/badges | **Retained, MAP-owned**, still inside `#subway-station-identity` — now the ONLY thing that element renders. Itinerary-scoped, live-action UI (`SubwayItineraryRideAuthority`, real BOARD clicks) — the same reachability class as live arrivals (§13's STOP finding 1), so it structurally CANNOT move into the drawer's separately-hosted iframe document. `identityEl` now stays empty/hidden except during an active boarding leg for the selected station |
| Local-line orientation | STATION-03: rendered in the drawer already (no MAP-side presentation existed) | Unchanged — drawer-only, per this batch's own explicit "not a MAP overlay" instruction |
| Dismiss timer (`isVisible()`, `hide()` auto-hide) | Started on every selection (name/badges/YOUR TRIP all shared one lifecycle) | Now only starts when YOUR TRIP is actually showing — nothing else lives in `identityEl` to auto-hide. `isVisible()`'s meaning narrowed accordingly (asserted explicitly in `subwayStationHud.tests.js`) |
| RADIO slot (`#subway-radio-slot`) | MAP-owned, untouched | **Unchanged**, MAP-owned |
| BLACKBOOK / Bay Ridge Av Station top-chrome nav links | MAP-owned, `position:fixed` | **Unchanged**, verified byte-identical `getBoundingClientRect()` before/after drawer open+close this batch — the BLACKBOOK-position invariant holds |
| Weather/clock HUD, global MAP chrome | MAP-owned, untouched | **Unchanged** |

**Known gap, intentionally deferred (not silently dropped) — RESOLVED in
STATION-04A, see §17.** `_buildLineBadge`'s click handler (previously
inside the now-removed identity badge row) was the ONLY production
trigger for `SubwayLineRibbon.showLineMode()` ("click a served route to
see its ordered station sequence in the left ribbon"). No replacement
trigger was added this batch — the drawer's route badges live in a
separate document and cannot call a `wall/`-realm function directly, and
forcing the badge row back into `identityEl` (mixed-purpose: partly
identity, partly a Line Mode trigger) would have re-blurred the exact
boundary this batch establishes. **Recommended smallest resolution:** a
small `postMessage` bridge from the drawer's own route-badge click
(inside `station.html`) to `subwayMezzanineDrawer.js`, which already owns
the same-origin iframe reference needed to receive it and call
`SBE.SubwayLineRibbon.showLineMode()` on MAP's side.

### Station Cover migration — reused / moved / superseded / retained

- **Reused, unmodified:** `stationTruth.ts`, `stationCoverPresentation.ts`
  (route-color glass-badge styling), `stationArrivalPresentation.ts`
  (max-2-per-service rule), `stationLineOrientation.ts` (real neighbor
  resolution), the entire `stationCoverRuntime.ts` render pipeline and
  N/S direction state. None of these were duplicated for the drawer —
  the drawer's iframe loads the literal same page.
- **Moved (presentation-layer only):** the MAP-side identity card
  content (name/neighborhood/badges) — this was already Station Cover's
  own job since STATION-01/02; STATION-04 just removes MAP's redundant
  parallel copy of it.
- **Superseded (not deleted):** the STATION-03 "Enter station creative
  space" placeholder → ENTER PLATFORM. The old button's underlying
  intent (an honest, disabled, future-facing action) is preserved
  exactly — only its label/destination changed.
- **Retained, unmodified:** `music/station.html` remains independently
  reachable as a standalone, full-page HOME surface
  (`{surface:"station", stationId}`) — useful for a direct/shareable link
  to a station's page outside of MAP context. **RESOLVED in STATION-04A
  — see §17:** the redundant `subwayStationCoverNavLink.js` top-chrome
  pill this section originally flagged for evaluation has since been
  retired.

### Forward-architecture constraint — verified, not just stated

No station-topology types were touched this batch — `stationGeometryTypes.ts`,
`stationArchetypeTypes.ts`, `stationClassificationTypes.ts`, and Bay Ridge
Av's own side-platform arrangement are all untouched. The drawer's only
structural assumption about a station is the one `StationTruth` already
encodes (a `gtfsStopId` with zero or more served routes) — nothing about
platform count, configuration, or arrangement is encoded anywhere in this
batch's code, satisfying this batch's own explicit "do not encode Bay
Ridge Av's side-platform arrangement" constraint by simply never
introducing any topology concept to begin with.

### Testing

`subwayMezzanineDrawer.tests.js` (new, 29 cases): width contract/clamping,
real DOM wiring, open/close lifecycle (including the close-collapses-to-0
regression test above), same-station re-open doesn't reload the iframe,
different-station open updates it, persisted-width round-trip.
`subwayStationHud.tests.js` updated (42 cases, was 43 — §10's now-dead
neighborhood-resolution tests removed, not just left stale): §8/§9
reassigned to assert identity content is ABSENT from `identityEl` and
present in the drawer instead; §13/§14 dismiss-timer coverage moved into
the real boarding-active (YOUR TRIP) scenario, the only context where a
timer now runs. `subwayCameraSunroof.tests.js`'s own §23 regression check
updated to match `isVisible()`'s narrowed meaning. Full hand-rolled
`wall/` regression sweep re-run clean: `subwayPresentationSurfaceTests`,
`subwayArrivalIntelligenceTests`, `subwayItineraryLegResolverTests`,
`subwayItineraryRideAuthorityTests`, `subwayItineraryRideHudTests`,
`mtaSubwayMapLayerTests`, `subwayLineRibbonTests` — zero failures.
MUSIC/Vite suite (1442 tests) unaffected — no logic module was modified,
only `station.html`'s own embedded-mode CSS/markup and
`stationCoverRuntime.ts`'s embedded-mode branch.

## 16. STATION-06 — Station Base Truth extension (island platforms, trackside walls)

Implements the smallest extension the STATION-05 recon
(`../proposals/STATION_05_BASE_TRUTH_RECON.md`, kept as the historical
design record — this section is the promoted, current-state truth). Both
new fields are additive and optional; every existing real seed (Bay Ridge
Av, 45th St, 53rd St, 77th St) and the two pre-existing archetypes are
byte-identical to before this batch wherever they don't set the new
fields (verified by regression test, not just asserted).

**New fields on `stationGeometryTypes.ts`:**

- `StationTrackCenterline.platformSide?: "A" | "B"` (new `PlatformSide`
  type) — which of a platform's (potentially several) track-facing edges
  a track sits on. Deliberately structural, never a direction: not
  "northbound"/"southbound", not screen-relative "left"/"right". Omitted
  for every side-platform station (`platformId` alone is already
  unambiguous there — a side platform has exactly one track-facing
  edge); required only to distinguish an island platform's two edges
  from each other.
- `StationWallSurface.adjacentTrackId?: string` — the track a wall
  faces, for a trackside surface with NO adjacent passenger platform
  (e.g. an island station's outer walls, or a wall between two express
  tracks). Confirms passenger accessibility and observable/writable-
  surface status are genuinely separate properties, per this batch's own
  brief — a wall can be a real, inspectable/writable surface
  (`suitableForArt`) while facing a track no rider can stand beside.

**`UG_ISLAND_2TRACK` — the first island archetype**
(`stationArchetypeUndergroundIsland2Track.ts`), mirroring
`UG_SIDE_2TRACK`'s own module structure/discipline exactly (same guard-
clause style, same heuristic-only provenance, same non-goals). Produces:
ONE island platform (`config: "island"`, previously unexercised by any
archetype — STATION-05's own recon confirmed no island archetype
existed) flanked by exactly two tracks, one per edge
(`platformSide: "A"`/`"B"`), and one shared mezzanine↔platform
connection (`relatedPlatformId` genuinely inapplicable here — there's
only one platform to disambiguate from). Parameterization is
deliberately NOT a mirror of `UG_SIDE_2TRACK`'s own shape: a side
station's tracks are the given (platforms build outward from them); an
island station's ONE platform is the given (tracks build outward from
its two edges) — a real physical difference between the two archetypes,
not an arbitrary renaming.

**`instantiateStationArchetype()` dispatch repair.** Previously routed
only `UG_SIDE_2TRACK` — `UG_SIDE_4TRACK` existed as its own archetype but
both real 4-track seeds (45th St, 53rd St) had to bypass this function
entirely and call `deriveUndergroundSide4TrackGeometry` directly,
hand-assembling the `StationGeometryData` envelope themselves (both
seeds' own file headers called this "a real, separate design decision
not yet made"). Now dispatches all three archetypes by `archetypeId`;
every existing `UG_SIDE_2TRACK` caller is unaffected (regression-tested).

**Synthetic 4-track island contract validation** (`stationGeometryFourTrackIslandContract.test.ts`)
— NOT a production `UG_ISLAND_4TRACK` archetype (explicitly out of this
batch's scope). A hand-built `StationGeometryData` fragment proving the
extended contract represents `WALL | LOCAL | ISLAND | EXPRESS | EXPRESS
| ISLAND | LOCAL | WALL`: two independent island platforms, each
relating to its own two adjacent tracks (one local, one express) via
`platformId` + `platformSide`, with the two outer walls identifying
their adjacent outer track via `adjacentTrackId` — and, by construction
of `StationWallSurface`'s own type, structurally unable to also claim a
passenger platform (there is no `platformId` field on a wall at all, not
merely an unpopulated one).

**Door-side derivation — structurally supported, not implemented.**
`track → platformId → platformSide → physical edge` is demonstrated
end-to-end in tests (both the synthetic island fixture and the real
`UG_SIDE_4TRACK` archetype's bypass tracks, which correctly derive "no
platform, no doors" via `platformId: null`). The demonstration helper is
test-only, never exported from production code, and returns the same
structural `PlatformSide` the Base Truth already carries — never a
literal left/right or a hardcoded northbound/southbound assumption.
Converting `platformSide` into an actual screen/world-space direction
remains explicit future presentation-layer work (a computation from the
station's real `orientationDeg` + platform footprint), not built here.

**Explicitly not done this batch** (per its own scope boundary): no
generic Platform renderer, no Detail/Overview UI, no real island station
seed, no train movement, no doors, no live-arrival migration, no 3D
Station Editor work, no `SubwayLineRibbon.showLineMode()` corrective
bridge, no retirement of the floating "BAY RIDGE AV STATION" pill — the
latter two remain open STATION-04 follow-up items, tracked for a
separate corrective batch, unchanged by this one.

**Testing.** `stationArchetypeUndergroundIsland2Track.test.ts` (new, 27
cases: structure, track-offset symmetry, parametric predictability,
provenance discipline, clearance validation, non-overlap, guard clauses,
`instantiateStationArchetype` wiring, regression against the two side
archetypes and the real Bay Ridge Av seed).
`stationGeometryFourTrackIslandContract.test.ts` (new, 9 cases: the
synthetic 4-track island proof plus the door-side derivation
demonstration). `stationArchetypeUndergroundSide4Track.test.ts` extended
(+4 cases: the dispatch-repair proof). `stationClassificationTypes.test.ts`'s
own STATION-05-era "no island archetype was added" guard updated to
assert the new, correct reality. Full relevant suite (station geometry +
archetype + classification + service-pattern-refinement): 253/253
passing. Broader `music/src/logic/maps/` + `src/data/` + `src/ui/maps/`
sweep: 505/505 passing. Full combined MUSIC suite: 3903/3910 passing (7
pre-existing skips, 11 pre-existing unrelated `trainingExclusionExport`
failures from a missing `WOS-share/SUNO` fixture — untouched by this
batch). Typecheck and lint clean on every touched file.

### Recommendation for the next Platform implementation boundary

The extended Base Truth is now proven end-to-end for both validation
axes (side vs. island, 2-track vs. 4-track) but still entirely
data/logic-layer — no renderer exists yet. The next batch should build
the smallest thing that reads this Base Truth and draws something real
(even a flat, schematic 2D plan of one station's tracks/platforms/walls,
reusing `stationGeometryCoordinates.ts`'s existing station-local↔geographic
math), deliberately BEFORE attempting the Detail/Overview Platform UI
described in STATION-04/05's own future-context sections. Building the
full Platform UI directly against an unrendered Base Truth would risk
discovering representation gaps only after a much larger investment; a
minimal renderer proves the contract is sufficient for real drawing, the
same way this batch's synthetic island fixture proved it sufficient for
relationship queries.

## 17. STATION-04A — Mezzanine Drawer corrective batch

Closes two items STATION-04 explicitly deferred, plus a route-badge
layout defect found in review (drawer route badges could overflow/crowd
at narrow widths or high service counts, with no wrapping rule).

**Route badge wrapping — layout-width-driven, never station-specific.**
`.station-cover-routes` (`music/station.html`) gained `flex-wrap: wrap`;
each `.station-route-badge` gained `flex-shrink: 0`. Route symbols keep
their canonical circular geometry (verified: every badge stays exactly
square, uniform size, across Bay Ridge Av/1 route, Canal St/7 routes,
Times Sq-42 St–Port Authority/11 resolvable routes, at all three widths)
— wrapping onto additional rows is the only thing allowed to give, and
it is a pure function of available width (no per-station or per-route-
count branch anywhere in the code). Long station names
(`.station-cover-name`) wrap via default block text flow plus
`overflow-wrap: break-word`. Local-line-orientation neighbor labels
(`.station-line-mark--dim`) gained `min-width: 0` (the standard flexbox
fix — a flex item's default min-width is its own content's natural
width, which silently defeats wrapping/ellipsis otherwise) plus
`overflow: hidden; text-overflow: ellipsis`, with the full real name
preserved in a `title` attribute; the current-station label
(`--current`) gained `min-width: 0` and wraps rather than truncating,
since it's the page's primary label.

**`subwayStationCoverNavLink.js` retired.** No longer loaded by
`wall/index.html` (script tag removed); the source file is kept, not
deleted, with its own header updated to explain why. `music/station.html`
remains fully reachable standalone and via the HOME `{surface:"station"}`
route — only the redundant, hardcoded-to-Bay-Ridge-Av, always-visible
top-chrome trigger is gone. BLACKBOOK's own nav link position was
verified byte-identical before/after this removal (the position
invariant holds — nothing else occupied the freed vertical slot, nothing
needed to shift).

**`SubwayLineRibbon.showLineMode()` restored via `postMessage`.** Exactly
the mechanism §15 already recommended: `stationCoverRuntime.ts`'s route
badges become clickable/keyboard-operable (`role="button"`, `tabindex`,
Enter/Space) ONLY when embedded (`isEmbedded`), posting
`{type:"stationCover:showLineMode", routeId}` to `window.parent` at the
real, same-origin target. `subwayMezzanineDrawer.js` — which already
owns the one real reference to its own iframe's `contentWindow` — adds a
`window` `message` listener that validates BOTH `event.origin` (same-
origin) AND `event.source` (must be exactly this drawer's own iframe
window, never any other same-origin frame) before calling
`SBE.SubwayLineRibbon.showLineMode('subway:route:' + routeId)` — the
same canonical-id convention the original, removed click handler used.
Verified live end-to-end: clicking (and Enter-key-activating) a route
badge inside the embedded drawer moves the real Ribbon from `collapsed`
to `line` mode. The standalone page sends no message at all
(`window.parent === window` there) and its badges carry no interactive
attributes.

**Testing.** `subwayMezzanineDrawerTests` (wall/, hand-rolled) extended
with the message-handling contract (+7 cases): valid message resolves to
the correct canonical route id; wrong origin, wrong source window, wrong
message type, empty/missing routeId, and null data are all independently
verified to be ignored, never partially handled. Live-verified: all
three named stations (Bay Ridge Av/1 route, Canal St/7 routes, Times
Sq-42 St–Port Authority/11 resolvable routes) at all three widths
(315px/360px/540px) — route badges never deform/shrink/hide, always
uniform circles; long neighbor names ellipsis-truncate with a real
`title` fallback; long station names wrap without escaping the drawer;
the retired pill is absent from the DOM and its module isn't even
loaded; BLACKBOOK position unchanged; the `showLineMode` round-trip
works by click and by keyboard. Full hand-rolled `wall/` regression
sweep (`subwayMezzanineDrawerTests`, `subwayLineRibbonTests`,
`subwayPresentationSurfaceTests`) clean. MUSIC/Vite suite: 3903/3910
(7 pre-existing skips, 11 pre-existing unrelated `trainingExclusionExport`
failures from a missing `WOS-share/SUNO` fixture, untouched by this
batch) — typecheck and lint clean on every touched file. One
pre-existing, environment-dependent `subwayStationHudTests` YOUR TRIP/
BOARD failure pair was observed (depends on a live train matching a
synthetic scenario at the moment the suite runs) — confirmed unrelated:
this batch touched no file `subwayStationHudTests` exercises.

This batch touched no Station Base Truth, archetype, Platform-rendering,
train-movement, door, realtime-transit-authority, or 3D-editor code —
presentation-layer only, exactly as scoped.
