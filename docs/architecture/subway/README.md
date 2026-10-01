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

## 18. STATION-07 — generic station topology renderer proof

Introduces a real, reusable topology-rendering authority — the bridge
between Station Base Truth (§16) and any future Platform renderer. Two
layers, deliberately separate:

```
Station Base Truth (StationGeometryData: platforms / trackCenterlines / wallSurfaces)
        ↓
topology projection — INTERPRETATION ONLY
  stationTopologyProjection.ts: projectStationTopology()
  reads real fields (platformId, platformSide, config, physicalRole/role,
  adjacentTrackId), decides what a "lane" is and where it sits (by real
  footprint/localPoints/localPolygon Y position) — produces a plain,
  ordered StationTopologyModel. No archetype identity anywhere in its
  input type or its logic.
        ↓
visual renderer — DRAWING ONLY
  stationTopologySvgRenderer.ts: renderStationTopologySvg()
  reads ONLY a StationTopologyModel — no StationGeometryData, no
  provenance, no archetype identity (it has no access to either). Branches
  only on a lane's own `kind`/`config`/`hasPlatform`.
```

**Ownership split, explicit:** the projection layer owns INTERPRETING
Base Truth into a renderer-agnostic shape; the SVG layer owns DRAWING
that shape and nothing else. Neither layer, nor
`stationTopologyDebugRuntime.ts` (the debug page that calls them), ever
branches on `archetypeId` — verified both by type (`StationTopologyInput`
has no `archetypeId` field) and by test (`stationTopologyProjection.test.ts`'s
own "archetype-blind contract" — a hand-built input structurally
identical to a real archetype's output produces byte-identical projection
output).

**Reuse, not parallel coordinate math.** `LocalPoint2D`/`LocalPoint3D`
are imported directly from `stationGeometryTypes.ts`, never redefined.
`stationGeometryCoordinates.ts` (geographic ↔ station-local-meter
conversion) is deliberately NOT used here — this proof operates entirely
within the station-local frame a `StationGeometryData` record is already
expressed in; there is no geographic coordinate anywhere in this
pipeline, so importing that module would have been new, unnecessary
coupling, not reuse.

**Four-track island contract fixture extracted, not duplicated.**
STATION-06's own synthetic `stationGeometryFourTrackIslandContract.test.ts`
fixture now lives in `stationGeometryFourTrackIslandContractFixture.ts`
(platforms/tracks/walls as named exports), imported by both the original
contract test (unchanged assertions, still 9/9 passing) and the debug
runtime's `ISLAND_4_TEST` fixture — one definition, two consumers, per
this codebase's own "never a second, drifting copy" doctrine. Still NOT
a production archetype — no `UG_ISLAND_4TRACK` was added.

**Debug inspection — dev tooling only, never product navigation.**
`music/station-topology-debug.html` + `stationTopologyDebugRuntime.ts`,
modeled on `StationGeometryEditor.tsx`'s own "isolated route, no coupling
to product navigation" convention. A `<select>` switches among
`SIDE_2`/`ISLAND_2`/`SIDE_4`/`ISLAND_4_TEST`; three come from
`instantiateStationArchetype()` (the same function §16's dispatch repair
fixed), the fourth from the shared synthetic fixture above. Deliberately
**excluded from `vite.config.ts`'s own production `rollupOptions.input`**
— stronger than merely being unlinked, this page does not exist in a
production build at all, the clearest possible guarantee it is dev-only.
Live-verified: all four fixtures render visibly correct, distinct
topologies (side platforms outside their tracks; one island platform
between its two tracks with matching `platformSide` values; side-4's
bypass express tracks rendered dashed/dim with an explicit "— no
platform" label, never pretending to serve one; the island-4 fixture's
two platforms and two outer walls, each wall's `→ track:...` label
naming its real adjacent track, never a platform) — and switching
fixtures never touches the renderer's own implementation.

**Representation fidelity — verified, not just stated.** The renderer
never reads `.provenance` anywhere. An archetype's `heuristic`-provenance
output and the real, `reference`-provenance Bay Ridge Av seed produce
identical lane-kind shapes for the same topology (tested directly); a
test that mutates only `.provenance` on an otherwise-identical input
confirms the projected model is byte-identical. This is the concrete
proof that generic (archetype-derived) and future detailed (authored)
geometry already share one renderer contract — a detailed station added
later via the archived 3D Station Editor's own eventual bridge would
need no new rendering system, only richer Base Truth fields for the
SAME pipeline to read.

**Testing.** `stationTopologyProjection.test.ts` (new, 19 cases): the
archetype-blind contract (2 cases), SIDE_2 (4 cases, including the real
Bay Ridge Av seed), ISLAND_2 (3 cases), SIDE_4 (3 cases), the island-4
contract fixture (2 cases), wall-lane independence from platforms (3
cases), generic-vs-authored provenance (2 cases).
`stationGeometryFourTrackIslandContract.test.ts`
unchanged in assertions, now imports its fixture from the shared module
(still 9/9 passing). Broader `music/src/logic/maps/` + `src/data/` +
`src/ui/maps/` + `src/station/` sweep: 524/524 passing. Full combined
MUSIC suite: 3922/3929 (7 pre-existing skips, 11 pre-existing unrelated
`trainingExclusionExport` failures, untouched by this batch). Typecheck
and lint clean on every touched file.

**Explicitly NOT built:** the final Platform page/surface, the 87.5/12.5
Detail/Overview layout, drawing tools, writable-surface interaction,
train movement, stopping/dwell, doors, live-arrival migration, a
persistent transit authority, 3D, Station Editor changes, new real
station survey data, a real island seed, or `UG_ISLAND_4TRACK` — none
were required to prove the renderer contract, so none were added.

### Recommendation for the smallest STATION-08 Platform batch

The topology projection/renderer pair is proven sufficient for real
drawing across every required validation case. The smallest next step is
NOT the full Detail/Overview Platform UI — it's embedding this exact
`projectStationTopology()`/`renderStationTopologySvg()` pipeline as the
**Overview** band's own content for ONE real station (Bay Ridge Av,
reading its real authored seed rather than an archetype), inside a
minimal, non-interactive container reachable from the Mezzanine Drawer's
own "ENTER PLATFORM" button (still disabled today). That proves the
exact same renderer contract survives the jump from a standalone debug
page into the real product surface, still with zero archetype-specific
logic, BEFORE attempting the Detail/Writable view, train movement, or
the 87.5/12.5 layout split — each of which is a materially larger,
separable piece of work.

## 19. STATION-08 — first real Platform product surface

Establishes Platform as the fourth real, HOME-hostable product surface
(alongside MAP/BLACKBOOK/Station Cover), and makes the Mezzanine Drawer's
own "ENTER PLATFORM" action functional — exactly the batch §18
recommended.

```
MAP
  ↓ select station
MEZZANINE DRAWER
  ↓ ENTER PLATFORM
PLATFORM
  ├── Detail View      — shell established, content NOT implemented
  └── Platform Overview
        ↓
      StationGeometryData (stationGeometryRegistry.ts)
        ↓
      projectStationTopology()        (STATION-07, unmodified)
        ↓
      renderStationTopologySvg()      (STATION-07, unmodified)
```

**Route/surface contract.** `HomeRoute` gains
`{surface:"platform", stationId}` (`homeRouteTypes.ts`), validated/
parsed/serialized by the exact same `isStationId` discipline
`{surface:"station"}` already uses (`homeRoutes.ts`) — same station id
scheme, never a second one. `homeRuntime.ts`'s `childUrl()` maps it to
the real `music/platform.html` document, same `host=home&homeRuntime=…
&homeNavigation=…&station=…` query contract every other hosted surface
already uses. `platform.html` is registered in `vite.config.ts`'s
production `rollupOptions.input` — a real shipped page, not a debug-only
one (contrast `station-topology-debug.html`, §18, deliberately excluded).

**How the selected station id reaches Platform, end to end (never
hardcoded to Bay Ridge Av anywhere in this chain):**

```
station.html's own ENTER PLATFORM button (stationCoverRuntime.ts)
  reads its own already-resolved display.stationId
        ↓ (one of three paths, by context)
  isHome            → homeSurface.requestNavigateToPlatform()  (stationHomeSurface.ts)
  isEmbedded        → postMessage {type:"stationCover:enterPlatform", stationId}
                        → subwayMezzanineDrawer.js validates origin+source,
                          calls SBE.HomeMapSurface.requestNavigate(...)
                          (same postMessage-bridge pattern STATION-04A's
                          own showLineMode restoration already established)
  fully standalone  → a plain same-origin navigation to platform.html?station=…
        ↓
  HOME's real requestNavigate -> validateHomeRoute -> mount -> platform.html
        ↓
  createPlatformHomeSurface() (platformHomeSurface.ts) reads the SAME
  stationId back out of its own query string
```

**Persistent shell — verified, not just asserted.** Platform constructs
neither its own member-identity authority nor its own radio-receiver
session, and renders no MEMBER/RADIO UI of its own at all (both already
persist automatically as HOME's own permanent chrome, outside whichever
surface is mounted — `homeRuntime.ts`'s own `#member-avatar-root` is a
sibling of `#surface`, never inside it, untouched by any child surface
swap). `platformRuntime.test.ts` asserts this directly against the real
source text (no `createFirebaseMemberIdentityAuthority`/
`createRadioChannelReceiver`/`getMemberIdentity`/`getRadioSession`
anywhere in the file). Live-verified: the SAME `runtimeId` persists
across a real MAP → Mezzanine Drawer → ENTER PLATFORM → Platform → back-
to-MAP cycle (byte-identical before/after), and the MEMBER avatar DOM
node is never removed/reconstructed at any point in that cycle.

**Bay Ridge Av Overview — the real, unmodified STATION-07 pipeline.**
`stationGeometryRegistry.ts` is the smallest honest lookup Platform
needs: a plain `gtfsStopId -> builder function` map, today containing
exactly one real entry (`R42 -> buildBayRidgeAvStationGeometrySeed`) —
NOT a topology model, NOT a second archetype dispatch, NOT a fallback.
Any other real/valid station id reaches the identical code path and
renders an honest "topology isn't available in this view yet" Overview
state — never a silent substitution. Live-verified: Bay Ridge Av
resolves to exactly `platform → track → track → platform`, both
platforms `config:"side"`, straight from its real authored seed, through
`projectStationTopology()`/`renderStationTopologySvg()` completely
unmodified since STATION-07 — `platformRuntime.ts` itself contains no
archetype-identifier string anywhere (asserted directly by
`platformRuntime.test.ts`).

**Detail View — intentionally neutral, nothing decided.** A static,
muted "DETAIL VIEW" label and nothing else. No writable surface, no
Canvas, no BLACKBOOK tools, no train/wall selection, no zoom/pan, no 3D —
this batch deliberately does not pre-decide how an observable/writable
Base Truth surface becomes a selected Detail subject.

**Layout.** `#platform-body` splits `flex: 7 1 0` (Detail) /
`flex: 1 1 0` (Overview) — exactly 87.5%/12.5% of the remaining vertical
space below the fixed-height back-link + header chrome, matching the
brief's own ASCII mockup. A real bug this batch's own live verification
caught before merge: `#platform-header`/`#platform-body`'s own ID-level
`display:flex` rules silently defeated the native `[hidden]` attribute's
lower-specificity `display:none` (an unknown-station error state was
rendering visually UNDER a still-visible, still-flex DETAIL VIEW/
OVERVIEW shell) — fixed with explicit `[hidden]` re-assertions, the same
class of bug the Mezzanine Drawer's own STATION-04 work had to solve for
a different reason (CSS-var-driven width vs. the `hidden` attribute).

**Testing.** New: `homeNavigation.test.ts` (+4 cases: platform route
round-trip/rejection, MAP↔PLATFORM↔MAP runtime-identity invariant, a
non-R42 station id round-tripping cleanly), `stationHomeSurface.test.ts`
(+2, `requestNavigateToPlatform`), `platformHomeSurface.test.ts` (new,
10 cases, mirroring `stationHomeSurface.test.ts`'s own discipline),
`stationGeometryRegistry.test.ts` (new, 2 cases), `platformRuntime.test.ts`
(new, 6 cases — the MEMBER/RADIO/archetype-blindness/no-hardcoded-R42
static-source assertions). `subwayMezzanineDrawer.tests.js` (wall/,
hand-rolled) extended +4 cases for the `enterPlatform` message contract.
Broader `music/src/logic/maps/` + `src/data/` + `src/ui/maps/` +
`src/station/` + `src/home/` + `src/logic/home/` sweep: 680/680 passing.
Full combined MUSIC suite: 3955/3962 (7 pre-existing skips, 11
pre-existing unrelated `trainingExclusionExport` failures, untouched by
this batch). Typecheck and lint clean on every touched file (two
pre-existing, unrelated `homeRoutes.ts` control-character lint warnings
on lines this batch never touched — confirmed via diff).

**Explicitly NOT built:** the Platform Detail View's own content/writable
architecture, the 87.5/12.5 layout's interactive behavior beyond static
proportions, drawing tools, surface selection, train objects/movement/
stopping/dwell/doors, arrival-countdown synchronization, clickable
topology, a selected-viewport indicator, live-arrival authority
migration, a persistent transit session, 3D, Station Editor changes, new
archetypes, new real station survey data, a new island seed, or any
Mezzanine Drawer redesign.

## 20. STATION-10 — Detail Subject selection proof

Implements the smallest real proof that STATION-09's own recon
(`docs/architecture/proposals/STATION_09_DETAIL_SUBJECT_RECON.md`)
proposed: a visible subject in the Platform Overview can be clicked and
resolved back to the exact canonical Station Base Truth record it came
from. Read-only subject identification only — no drawing, no Canvas, no
BLACKBOOK integration, no Artwork/Placement.

```
Platform Overview (rendered SVG, STATION-07, UNMODIFIED)
  ↓ click
data-lane-kind / data-lane-id   (already emitted by stationTopologySvgRenderer.ts)
  ↓
StationDetailSubjectRef { stationGeometryId, subjectKind, subjectId }   (new, additive)
  ↓
resolveStationDetailSubject()   (new — the ONLY place a ref becomes real data)
  ↓
canonical StationPlatform / StationTrackCenterline / StationWallSurface
  ↓
Platform Detail View — neutral, read-only SUBJECT/ID/STATION panel
```

**`StationDetailSubjectRef`** (`music/src/data/stationDetailSubjectTypes.ts`,
new) is the pointer-triple type STATION-09 proposed, adopted as written:
`{ stationGeometryId, subjectKind: "platform"|"track"|"wall", subjectId }`.
Deliberately independent of (does not import) `TopologyLaneKind`
(`stationTopologyProjection.ts`) even though the string values coincide
today — a Base-Truth identity reference must never depend on the
rendering layer for its own type, per STATION-09's own stated invariant
that the projection/renderer may expose identity but must never become
its authority.

**`resolveStationDetailSubject()`** (`music/src/logic/maps/
stationDetailSubjectResolver.ts`, new) is the one place a ref is turned
into real data. Its input type, `StationDetailSubjectSource`, is a
narrower structural type (`id` + `platforms`/`trackCenterlines`/
`wallSurfaces`) — same narrowing precedent as STATION-07's own
`StationTopologyInput` — so any real `StationGeometryData` satisfies it
structurally, and a synthetic/test-only fixture can too without
fabricating an entire record. Dispatch is scoped strictly by
`subjectKind`: a platform id and a track id sharing the same string value
can never cross-resolve, because each kind only ever searches its own
array. Never reads `.suitableForArt` or any other writability field — a
track (which has no such field at all) resolves exactly like a wall.
Fails honestly (`null`) for a station-id mismatch or an unknown
`subjectId`, never substituting another subject or falling back to R42.

**Platform integration — the renderer was neither replaced nor forked.**
`platformRuntime.ts` keeps the real, currently-loaded `StationGeometryData`
only long enough to resolve a click (`currentGeometry`, reset on every
real Overview render); the projection/renderer themselves are completely
unmodified from STATION-07. A single delegated click listener on
`#platform-overview-content` reads the clicked shape's own already-
existing `data-lane-kind`/`data-lane-id` (falling back to a lane's `<text>`
label's previous sibling, since the renderer draws them as siblings, not
nested — no renderer change was needed or made), builds a
`StationDetailSubjectRef` from `currentGeometry.id` (never a hardcoded
station id), resolves it, and renders a neutral SUBJECT/ID/STATION panel
into the previously-static "DETAIL VIEW" placeholder. A resolved
selection also gets a `data-selected="true"` attribute (plain CSS
`stroke`/`stroke-width` override in `platform.html`, no `!important`
needed — presentation attributes lose to stylesheet rules by default) so
a human can see which lane is active; switching subjects clears the prior
highlight cleanly.

**Bay Ridge Av acceptance — honest, not padded.** Bay Ridge Av's real
seed still has zero authored `wallSurfaces` (unchanged, deliberately not
touched by this batch — real wall authoring is explicit future work, not
STATION-10's). Live-verified: Overview renders exactly `platform →
track → track → platform` (two platform lanes, two track lanes, zero wall
lanes); clicking a track lane resolves to `{Track, track:R42:northbound,
R42}`; clicking a platform lane resolves to `{Platform,
platform:R42:southbound, R42}`; switching between them updates the Detail
View and the highlight cleanly; no wall was fabricated to make the demo
look complete.

**Wall proof — the synthetic fixture, not Bay Ridge.** Wall-subject
resolution is proven in `stationDetailSubjectResolver.test.ts` against
the existing STATION-06/07 four-track-island contract fixture
(`stationGeometryFourTrackIslandContractFixture.ts`, synthetic/
`authored`-provenance, not a real station) — the one fixture in this
repo with real `StationWallSurface` records, exactly as this batch's own
instruction required.

**Testing.** New: `stationDetailSubjectResolver.test.ts` (new, 15 cases —
ref field preservation; platform/track/wall resolution against real Bay
Ridge Av Base Truth and the synthetic wall fixture; honest failure for a
missing subject id and for a station-id mismatch; no kind-crossing
cross-resolution even with a shared id string; resolution independent of
`suitableForArt`; identical contract for archetype-generated vs.
hand-authored geometry; no archetype branching in the resolver's own
source). `platformRuntime.test.ts` (+5 static-source cases: imports the
real resolver, no archetype branching in the new code, no `.suitableForArt`
read, every ref built from `currentGeometry.id`, no Artwork/Placement/
Canvas/Marks concept introduced). Full combined MUSIC suite: 3974 passing
(7 pre-existing skips, the same 11 pre-existing unrelated
`machineLife`/`sunoLibrary` manifest-path failures this environment
already had before this batch, untouched by it). Typecheck and lint
clean on every touched/new file.

**Human acceptance — live-verified.** HOME dev harness
(`home-dev.html?surface=map` → `PLATFORM (Bay Ridge Av)`, the same
`requestNavigate({surface:"platform", stationId:"R42"})` call ENTER
PLATFORM itself drives): clicked a track lane (resolved `Track /
track:R42:northbound / R42`), clicked a platform lane (resolved
`Platform / platform:R42:southbound / R42`, prior highlight cleared
cleanly), confirmed via direct DOM inspection that exactly 2 platform +
2 track lanes render and zero wall lanes exist for R42, navigated back to
MAP, confirmed the SAME `runtimeId` persisted across the whole round trip
and `#member-avatar-root` was never removed/reconstructed. (Reached
Platform via the dev harness's own direct entry point rather than
re-driving a full pixel-level MAP pan/zoom to Bay Ridge Av's map marker —
the identical `requestNavigate` call STATION-08's own MAP→Drawer→ENTER
PLATFORM path already issues and already proved live in that batch.)

**Explicitly NOT built:** drawing, Canvas, BLACKBOOK integration,
Artwork, ArtworkPlacement, graffiti placement, Bay Ridge Av wall
authoring, inferred wall geometry, visual station reconstruction, N/S
direction switching, doors, trains/train selection in Overview, arrivals,
live transit migration, materials/textures, a visual facelift, or any
change to Station Editor.

## 21. STATION-11 — Bay Ridge Av structural truth enrichment

Turns Bay Ridge Av (R42) from a minimal topology proof into the first
meaningfully authored real Station Truth model, using only existing
in-repo evidence (field photos, the field calibration survey, prior
checkpoint reports) — no new field visit, no web research, no invented
dimensions.

### Evidence matrix

| Fact | Source | Confidence/provenance | Representable today? | Action taken |
|---|---|---|---|---|
| Two side platforms, Manhattan-bound (N) / 95th St-bound (S) | OSM footprints + reference sources | `reference`, 0.35 | Yes (`StationPlatform`) | Already authored (checkpoint 5), unchanged |
| Northbound wider (direction only, no magnitude) | Reference sources + field confirmation, 2026-09-09 | `evidenceConflict:R42:platformWidthAsymmetry`, status `resolved` (direction), magnitude unresolved | Yes (`StationGeometryEvidenceConflict`) | Already resolved (prior checkpoint), unchanged |
| Southbound has columns along its full length | Field photos (IMG_1169 etc.) | `reference`, qualitative | Partially — no column/pillar primitive exists, only a provenance-note mention | Already present (southbound platform note), unchanged this batch |
| Northbound comparatively open/columnless | Field photos (IMG_1115/1167, contrastive reading) | `reference`, qualitative | Same as above | **Added**: new sentence in northbound platform's own provenance note |
| Northbound stair circulation preserves two lanes; southbound interrupts to one | 2026-09-09 field observation | `reference`, qualitative | Yes (`StationConnection.provenance.note`, split per-platform since a prior pass) | Already present, unchanged |
| Southbound has a rear-exit relationship; northbound does not | 2026-09-09 field observation | `reference`, qualitative | Yes (note-level only, no `StationEntrance`) | Already present, unchanged |
| A 20-step stair run separates the northbound platform from the mezzanine landing | Field photo IMG_1186 | `reference`, a directly-observed step COUNT, not an elevation | Yes, as a qualitative note; NOT as `elevationM` (would also need the mezzanine's own unmeasured depth below street) | **Added**: new sentence on `connection:R42:mezzanine-platform-northbound`'s provenance |
| Station stack includes a real surface level (real street entrances on both sides, confirmed by photos) | Field photos (surface-entry screenshots) | `heuristic` (elevation, by convention) + the entrances claim itself `reference`-sourced | Yes (`StationLevel{kind:"surface"}`) | **Added**: new `level:R42:surface` record, unconnected (no stair/position evidence yet) |
| Each side platform has a real back wall (opposite its track-facing edge) | Field calibration survey (items 1/2 target exactly this wall) + field photos | `reference`, identity/relationship only — zero geometry | **Gap closed this batch**: `StationWallSurface.localPolygon` was previously required, and no field existed for "faces this platform" (only `adjacentTrackId` existed) | **Added**: two new `StationWallSurface` records + two new optional schema fields (see below) |
| Track center-to-center spacing, platform-edge-to-track distance, real platform width, platform depth, crossover/entrance exact position | Field calibration survey (items 1-7), all explicitly UNMEASURED | n/a | N/A — no real number exists anywhere in the repo for any of these | **Not touched.** Remains `reference`/estimated exactly as before; no magnitude fabricated |

Unlocatable/unavailable facts: no repository evidence was found for exact
column count, column spacing, column material, back-wall position/
dimensions, surface-to-mezzanine stair position, or absolute platform
depth below street. These remain honestly absent, not estimated.

### Schema capability / gap analysis

The existing model expresses almost everything supported by evidence
without any change: platform asymmetry, circulation differences, and the
rear-exit relationship already lived in `provenance.note` fields from
prior checkpoints. Two real gaps were found and closed, both exactly the
smallest additive primitive needed:

1. **`StationWallSurface.localPolygon` was required**, so a wall's
   identity/relationship could not be authored before its geometry was
   measured — contradicting this codebase's own established "omission,
   not a fabricated default" discipline (already used for
   `StationPlatform.footprint`). **Fix:** made it optional
   (`localPolygon?: LocalPoint3D[]`).
2. **No field let a wall declare "I sit behind this platform"** — only
   `adjacentTrackId` (STATION-06, trackside) existed, a gap STATION-09's
   own recon already identified. **Fix:** added
   `StationWallSurface.adjacentPlatformId?: string`, symmetric to
   `adjacentTrackId`, not mutually exclusive by the type system but never
   both-set on any real wall today.

Both changes are structural (identity/relationship), not visual;
optional/backward-compatible (every existing real seed and every
archetype-generated wall is unaffected — confirmed by the full regression
suite); independent of 2D/3D rendering, Tunnel Vision, BLACKBOOK, and
UGC/evidence storage. No column/pillar primitive was added — the only
supported column fact (existence + qualitative density contrast) is
already expressible as a provenance note, and no real position/spacing
evidence exists to justify a geometric primitive yet; this is reported as
a known gap, not a blocker.

### What was authored (R42, this batch)

- `level:R42:surface` (new `StationLevel`, `kind:"surface"`,
  `elevationM:0` by the same convention every archetype's own surface
  level already uses) — unconnected to the mezzanine (no stair-position
  evidence yet).
- Two new `StationWallSurface` records: `wall:R42:northbound-back` /
  `wall:R42:southbound-back`, each `adjacentPlatformId`-linked to its own
  platform, `localPolygon` omitted, `suitableForArt:false` as an explicit
  undecided placeholder (a curation decision this batch does not make,
  never promoted to a researched fact).
- Two new provenance-note sentences (northbound columnless contrast;
  northbound's 20-step stair count) — zero new fields required for either.

Zero existing ids were renamed; zero existing fields were removed; every
pre-existing platform/track/connection/platformLink/evidenceConflict
record is byte-identical except where a note explicitly grew.

### Stable identity — future-safe, verified by construction

Both new walls use this codebase's own established deterministic,
role-based id convention (`wall:R42:northbound-back`), identical in kind
to every other real id in this arc (`platform:R42:northbound`,
`track:R42:southbound`) — never renderer-derived, never random. A future
`EvidenceCapture`-shaped record (not implemented here) could already say
`{stationGeometryId:"stationGeometry:R42", subjectId:"wall:R42:northbound-back", ...}`
today and remain valid once real geometry is later authored onto the same
record — the same "same record, same id, fields filled in" upgrade path
STATION-05's own recon already established for platforms/tracks (§F of
that recon). No structural refinement in this batch split an existing
subject into multiple subjects, so the "STOP and document" identity-
migration case this batch's own instructions warned about did not arise.

### Projection / selection proof (STATION-07/STATION-10 untouched)

Neither `stationTopologyProjection.ts`, `stationTopologySvgRenderer.ts`,
nor `stationDetailSubjectResolver.ts` was modified this batch. Both new
walls resolve through the exact generic STATION-10 path
(`resolveStationDetailSubject`) with zero R42-specific code — proven by
direct unit test. Both are honestly **skipped** by
`projectStationTopology()` (its own `meanY()` returns `null` for an
omitted `localPolygon`, exactly the same "no positional evidence, don't
guess" rule that already applies to any unauthored platform/track) — real
Base Truth identity exists without being visible in the 2D Overview. This
is intentional, not a defect: the alternative would be fabricating
geometry merely to make the renderer show something.

### Testing / verification

New: 6 wallSurfaces tests + 2 surface-level tests + 2 qualitative-note
(no-fabricated-number) tests in `stationGeometryCoordinates.test.ts`; 4
new resolution/projection-skip tests in
`stationDetailSubjectResolver.test.ts` (both new walls resolve via
STATION-10; both are confirmed absent from the projected model; platform/
track lane counts unaffected). Two pre-existing assertions updated to
match the new reality (`wallSurfaces` is no longer `[]`; level elevations
are unauthored except the new, conventionally-zeroed surface level).
Full combined MUSIC suite: 3989 passing (same 11 pre-existing unrelated
manifest-path failures as before this batch, untouched by it). Typecheck
and lint clean on every touched/new file.

**Human acceptance — live-verified, full real path (not the dev-harness
shortcut STATION-10 used).** `home-dev.html?surface=map` → real map marker
click on Bay Ridge Av → Mezzanine Drawer opened with the real Station
Cover → real ENTER PLATFORM click → Platform loaded R42 through the
unmodified `stationGeometryRegistry.ts` → clicked the northbound track
lane, confirmed Detail View resolved `{Track, track:R42:northbound, R42}`
→ confirmed via direct DOM inspection that the Overview still renders
exactly 2 platform + 2 track lanes and zero wall lanes (the two new walls
present in Base Truth, correctly invisible in this 2D view) → back to MAP
→ confirmed the same `runtimeId` persisted and `#member-avatar-root` was
never removed/reconstructed.

### Architectural gate

**Is Bay Ridge Av Station Truth now sufficiently expressive to begin a
representation-independent 3D structural projection?**

**NO** — specifically missing: (1) any real wall/back-wall/mezzanine
geometry (only identity/relationship exists for the two new walls); (2)
a column/pillar structural primitive (not even attempted this batch —
no position evidence exists to justify one yet); (3) stair/connection
path geometry for any of the three real stair runs (two platform↔
mezzanine, the not-yet-wired mezzanine↔surface pair); (4) the mezzanine's
own footprint/polygon; (5) any level's real elevation relative to another
level (only the surface level's conventional 0 exists); (6) real track
spacing/platform-edge-to-track distance (still OSM-estimated, per the
unresolved items of the field calibration survey). A future STATION-12
consuming this record for a 3D projection would need, at minimum: real
platform footprints (replacing the OSM estimates), at least one real wall
polygon per platform, real level elevations for mezzanine and platform
relative to surface, and a documented policy for how a 3D projection
should represent a structurally-real-but-geometrically-unauthored subject
(e.g. the two new walls) — rendering nothing, per this batch's own
documented STATION-07 behavior, is the only policy proven safe so far.

**Architecture docs:** this section + the `OWNERSHIP.md` station-geometry
row update are the required bookkeeping for this batch's schema change
(`StationWallSurface.localPolygon` optional,
`adjacentPlatformId` added) — both are included in this same commit.

## 22. STATION-12 — Bay Ridge Av 3D readiness / structural geometry resolution

Resolves as much of STATION-11's own architectural-gate "NO" as existing
in-repo evidence honestly supports, and establishes a canonical,
representation-independent readiness evaluator — no web research, no
invented geometry, no renderer.

### Phase 1 — recon against the STATION-11 gate

| Requirement | Current truth | Available evidence | Schema support | Resolve now? | Why |
|---|---|---|---|---|---|
| Platform footprints | OSM-estimated polygons, `reference`, 0.35 confidence; width asymmetry direction-resolved, magnitude unresolved | No new measurement exists anywhere in the repo | `StationPlatform.footprint?` already supports partial/omitted | No | Nothing beyond what STATION-11 already found; the field calibration survey's own items 1/2 remain unexecuted |
| Northbound back-wall geometry | Identity/relationship only (STATION-11) | Zero coordinates in any source document | `StationWallSurface.localPolygon?` already optional | No | No position evidence exists; the calibration survey's own item 1 targets exactly this and is unexecuted |
| Southbound back-wall geometry | Identity/relationship only (STATION-11) | Zero coordinates | Same | No | Same as above (survey item 2) |
| Platform↔mezzanine stairs | Connectivity known (kind, levels, relatedPlatformId, qualitative circulation notes); no spatial path | Field photos show which side feeds which staircase; no coordinates | `StationConnection.localPath?` already optional | No (geometry); **connectivity already complete, nothing to add** | No position evidence; this requirement was already as resolved as the project's evidence allows |
| Mezzanine footprint | No footprint, no primitive existed to hold one | Field photos show a real unified mezzanine area; no dimensions | **Gap — no `footprint` field existed on `StationLevel` at all** | Schema gap closed; R42 instance left empty (no evidence) | Primitive now exists generically; Bay Ridge's own value stays honestly unauthored |
| Relative surface/mezzanine/platform elevations | Surface=0 (convention); mezzanine/platform elevationM omitted; **no connection wired the surface level to anything** | Field photos directly show real entrances feeding the same mezzanine on both sides | `StationConnection` already generic; `StationLevel.elevationM?` already supports omission | **Partially — topological order, not magnitude** | Magnitude requires a real survey (unexecuted); topological order is fully evidenced and was simply never wired up |
| Columns/pillars | Existence + qualitative density contrast only (STATION-11 notes) | No count, spacing, or position anywhere | No primitive exists | No | Phase 4's own explicit caution: a primitive must not imply known positions when none exist; still zero justification for one |
| Structural openings/interruptions | Already expressed as qualitative circulation notes (prior checkpoints) | Same field observations already used | Existing `provenance.note` convention is sufficient | Already resolved | No new primitive needed; nothing left unexpressed |

### Phase 2 — minimum 3D structural contract (representation-independent)

**Required for first structural 3D:**
- Every level that exists is reachable via at least one real `StationConnection` (relative STACKING ORDER known) — exact `elevationM` magnitude is NOT required for a first pass.
- Every platform has a `config` and, ideally, a `footprint` — but a station may enter 3D with `footprint` partially estimated (as R42's is) rather than withheld entirely.
- Every track has a `platformId` relationship; `localPoints` strengthens but is not strictly required to show adjacency.
- A wall may exist with identity/relationship only; a 3D consumer must be able to ask "does this wall have geometry?" and get an honest no.
- Connectivity between levels (which stairs connect what) must be real, even if the spatial path is not.

**Optional enrichment (improves but never blocks a first pass):**
- Real `elevationM` magnitudes for every level.
- Real wall/mezzanine polygons.
- Real `localPath` spatial geometry for connections.
- `TrackRole`/`TrackPhysicalRole`/`platformSide` refinements.

**Visual truth — explicitly NOT required, NOT modeled here or ever by Station Truth itself:**
tile appearance, paint color, signage appearance, benches, advertisements,
lighting design, photographic materials, graffiti, decorative fixtures,
column material/finish, AI reconstruction.

### Phase 3 — partial-truth policy (confirmed canonical, not newly invented)

STATION-11 already established this invariant by construction (the two
geometryless walls, honestly skipped by the STATION-07 projection);
STATION-12 confirms it as the repository's own canonical policy, now
also directly enforced by `stationStructuralReadiness.ts`'s own
existence/geometry distinction:

```
known subject + unknown geometry
      -> subject remains canonical (stable id, real relationships)
      -> no invented geometry is ever stored as truth
      -> a projection/renderer may honestly omit it
      -> later evidence may add geometry WITHOUT replacing identity
```

No fake placeholder coordinates were introduced anywhere in this batch.
How a future renderer might visually indicate "this subject exists but is
unmeasured" is a representation concern, explicitly out of scope here.

### Phase 4 — minimal structural primitives

One generic, additive primitive was added: `StationLevel.footprint?:
LocalPoint2D[]` — identical discipline to `StationPlatform.footprint` and
(STATION-11) `StationWallSurface.localPolygon`: omitted, never defaulted,
whenever a level's existence is real but its spatial extent is not yet
authored. Applies to any station's any level — not Bay Ridge-specific, not
mezzanine-specific (the field name doesn't encode "mezzanine" anywhere).

**No column/pillar primitive was added.** Investigated directly per this
batch's own instruction — no project evidence anywhere establishes a
count, spacing, or position for any column at any station, and the task's
own caution against implying known positions where none exist applies
squarely. The existing qualitative-note convention (already used for
"columns along its full length") remains the only representation until
real evidence justifies a geometric primitive.

**No new connection-geometry primitive was added** — `StationConnection
.localPath?` already existed (STATION-05 era) and already supports
exactly the "connectivity known, path unknown" case this batch needed;
confirmed by Phase 1's own recon rather than assumed.

### Phase 5 — R42 geometry actually authored this batch

Only one class of fact was improved, and it is topological, not metric:
two new `StationConnection` records wire the real surface level
(STATION-11) into actual topology for the first time —
`connection:R42:surface-mezzanine-northbound` and
`...-southbound`, each citing the same real field-photographed street
entrances the existing `platformLinks[crossover]` note already uses as
corroborating visual evidence for "one unified mezzanine." Both have
`localPath` omitted (no position evidence). The southbound REAR exit
(a distinct, separately-observed relationship) deliberately received NO
connection record — its own structural path (through this mezzanine, or
bypassing it) is not established by any evidence in this repository, and
asserting `fromLevelId`/`toLevelId` for it would have been a fabricated
relationship, not an observed one; it remains exactly where STATION-11
left it, a provenance note only.

No platform footprint, wall polygon, mezzanine footprint, or any
elevation magnitude was authored — none is supported by any evidence this
batch could locate, and Phase 1's own recon says so explicitly rather
than silently declining to look.

### Phase 6 — future field-evidence compatibility (verified, not built)

No Evidence/Capture schema was created. Verified compatible: every
canonical subject this batch touched (the surface level, the two new
connections) already carries the same stable, deterministic id shape
(`level:R42:surface`, `connection:R42:surface-mezzanine-northbound`) a
future `EvidenceCapture`-shaped record could reference today — identical
reasoning to STATION-11's own identity/facelift analysis, now extended to
levels and connections, not just platforms/tracks/walls.

### Phase 8 — `stationStructuralReadiness.ts` (new, generic evaluator)

A pure function, `evaluateStationStructuralReadiness(geometry):
StationStructuralReadinessReport`, classifying 7 requirements as
READY/PARTIAL/UNKNOWN purely from real `StationGeometryData` fields —
never a station id, never an archetype id (proven directly by static-
source test, and behaviorally by running it against Bay Ridge Av, two
different archetypes, and the STATION-06/07 synthetic four-track-island
fixture, all producing correctly-differentiated results from the same
unmodified function).

**R42's own real readiness, as of this commit:**

| Requirement | Status | Why |
|---|---|---|
| levels | READY | All 3 levels (surface/mezzanine/platform) are now topologically connected — relative order fully known. Elevation magnitude (0/3 beyond the conventional surface=0) remains optional enrichment. |
| platformFootprints | PARTIAL | Both platforms have a footprint, neither at strong (authority-grade or ≥0.8 confidence) provenance — OSM estimates, known-unreliable on width. |
| trackCenterlines | PARTIAL | Both tracks have real localPoints, neither at strong provenance — OSM-sourced, not survey-grade. |
| wallSurfaces | UNKNOWN | Both STATION-11 walls have real identity/relationship; zero have geometry. Existence is never read as geometry. |
| mezzanineFootprint | UNKNOWN | The mezzanine level exists; no footprint has ever been authored. |
| connections | READY | Every level is reachable via a real connection (this batch's own improvement); 0/4 connections have spatial path geometry (optional enrichment). |
| columns | UNKNOWN | No primitive exists in Station Truth at all — true for every station, not specific to R42. |

### Phase 9/architectural gate

**Is Bay Ridge Av Station Truth now sufficiently expressive to begin the
first representation-independent 3D structural projection?**

**YES** — with the explicit understanding (per this batch's own
instruction) that YES does not mean complete: `levels` and `connections`
are READY (the real station stack and its circulation topology are fully
known), `platformFootprints`/`trackCenterlines` are PARTIAL (real but
estimated geometry — enough for a first pass, not survey-grade),
`wallSurfaces`/`mezzanineFootprint`/`columns` remain UNKNOWN and should
render as nothing, exactly as STATION-07's own projection already does
for any geometryless subject. A future STATION-13 (if pursued) should
consume: `levels` (for stacking), `platforms[].footprint` +
`trackCenterlines[].localPoints` (for plan geometry, explicitly PARTIAL-
grade), and `connections` (for level-to-level circulation) — and should
render `wallSurfaces`/`mezzanineFootprint`/columns as absent rather than
guessed, per the Phase 3 policy this batch confirmed canonical.

**Architecture docs:** this section, `OWNERSHIP.md`'s station-geometry
row, and `stationStructuralReadiness.ts`'s own module doc are the
required bookkeeping for this batch's schema change
(`StationLevel.footprint?` added) and the newly-canonicalized partial-
truth policy — all included in this same commit.

## 23. STATION-13 — representation-independent 3D structural projection

Implements the generic transformation STATION-12's own gate called for:

```
StationGeometryData -> projectStationStructure3D() -> StationStructuralProjection3D
```

`music/src/logic/maps/stationStructuralProjection3D.ts` (new). This
describes SPATIAL STRUCTURE only — no color, material, lighting, texture,
mesh, camera, or any Three.js/WebGL concept appears anywhere in this
module or its output type. It is a pure, archetype-blind, provenance-
blind bridge, same architectural family as `stationTopologyProjection.ts`
(STATION-07) and `stationStructuralReadiness.ts` (STATION-12), downstream
of canonical Base Truth and never a second authority over it.

### Phase 1 — input contract confirmed, no contradiction found

STATION-12's own minimum structural contract (level stacking order,
platform/track relationships and geometry-where-available, wall identity
and geometry-where-available, real level connectivity) matched current
canonical architecture exactly — no discrepancy between this prompt and
the existing registry was found, so none was reported as a deviation.

### Ownership / projection boundary

`StationStructuralProjection3D` is **derived, read-only, and never
persisted** — no IndexedDB store, no `localStorage` key, no Firestore
collection, nothing analogous to `stationGeometryStore.ts` exists or was
added for it (verified directly by this module's own static-source
test). There remains exactly one physical Station Truth authority:
`StationGeometryData`. A future renderer calls
`projectStationStructure3D(geometry)` fresh whenever it needs the
projection — the same "call it, don't cache it as truth" discipline
`projectStationTopology()` already established.

### Canonical vs. projection-derived vertical coordinates

Every `ProjectedLevel` carries two deliberately distinct fields:

- `presentationStackIndex: number` — ALWAYS present, unitless, a
  deterministic 0-based stacking rank derived purely from each level's
  own `kind` (`surface`/`entrance` > `mezzanine` > `platform` > `other`,
  ties broken by id) — real schema-level domain knowledge every station
  already carries, not an R42-specific or archetype-specific heuristic.
- `canonicalElevationM?: number` — the real `StationLevel.elevationM`,
  copied verbatim, present ONLY when Base Truth actually has one, NEVER
  derived, defaulted, or set equal to the stack index.

The naming asymmetry itself (`presentationStackIndex` vs.
`canonicalElevationM`) is deliberate: a future consumer that wants
physical truth must read the `M`-suffixed field explicitly; the unitless
rank can never be mistaken for a measurement. Confirmed by test: the
derived index is never written back onto the canonical `StationLevel`
object.

### Platform / track projection

Both are thin, identity-preserving projections: canonical `id`,
`levelId`/relationship fields, and `footprint`/`localPoints` copied
verbatim ONLY when the canonical record has them — never padded,
completed, or beautified. R42's own real, OSM-estimated, currently-
incomplete-on-width platform footprints project exactly as estimated,
not as though they were exact. `ProjectedTrack.levelId` is derived only
when `platformId` is set (via the owning platform's own `levelId`) —
never guessed for a platformless bypass track (proven directly against
`UG_SIDE_4TRACK`'s own express tracks).

### Wall / connection partial-truth behavior

Both honor the STATION-11/STATION-12 invariant explicitly, with a typed
discriminator rather than an implicit convention:

- `ProjectedWall.geometryState: "geometryKnown" | "geometryUnknown"` —
  a wall with no `localPolygon` still appears in `projection.walls`
  (existence known) but never receives a fabricated polygon
  (`geometryUnknown`). R42's two STATION-11 back walls project exactly
  this way today.
- `ProjectedConnection.pathState: "pathKnown" | "topologyOnly"` — a
  connection with no `localPath` still appears, with its real
  `fromLevelId`/`toLevelId`/`kind` intact, but no invented staircase path.
  All four of R42's real connections (two mezzanine↔platform, two
  surface↔mezzanine, STATION-12) project as `topologyOnly` today —
  honest, not a defect.

### Generic topology proof

Exercised directly, through the one unmodified exported function, with
no station/archetype-specific code path: `UG_SIDE_2TRACK` (2 platforms, 2
tracks, 0 walls), `UG_ISLAND_2TRACK` (1 island platform served by 2
tracks), `UG_SIDE_4TRACK` (2 platforms, 4 tracks — 2 platformless bypass),
the STATION-06/07 synthetic four-track-island contract fixture (2 island
platforms, 4 tracks, 2 geometried walls — proving `geometryKnown` is
reachable, not just `geometryUnknown`), and the real, hand-authored R42
seed — all through the identical `projectStationStructure3D()` call site.

### R42 projection summary (live-generated, not hand-written)

```
Station: stationGeometry:R42
Levels (3):
  [0] level:R42:surface (surface) -- elevationM=0, footprint=unknown
  [1] level:R42:mezzanine (mezzanine) -- elevationM=unknown, footprint=unknown
  [2] level:R42:platform (platform) -- elevationM=unknown, footprint=unknown
Platforms (2):
  platform:R42:northbound (side, level=level:R42:platform) -- footprint=known, servedBy=[track:R42:northbound]
  platform:R42:southbound (side, level=level:R42:platform) -- footprint=known, servedBy=[track:R42:southbound]
Tracks (2):
  track:R42:northbound (platformId=platform:R42:northbound) -- localPoints=known
  track:R42:southbound (platformId=platform:R42:southbound) -- localPoints=known
Walls (2):
  wall:R42:northbound-back -- geometryUnknown, adjacentPlatformId=platform:R42:northbound
  wall:R42:southbound-back -- geometryUnknown, adjacentPlatformId=platform:R42:southbound
Connections (4):
  connection:R42:mezzanine-platform-northbound (stairs: level:R42:mezzanine -> level:R42:platform) -- topologyOnly
  connection:R42:mezzanine-platform-southbound (stairs: level:R42:mezzanine -> level:R42:platform) -- topologyOnly
  connection:R42:surface-mezzanine-northbound (stairs: level:R42:surface -> level:R42:mezzanine) -- topologyOnly
  connection:R42:surface-mezzanine-southbound (stairs: level:R42:surface -> level:R42:mezzanine) -- topologyOnly
```

Produced by `summarizeStationStructuralProjection3D()` (STATION-13 Phase
13 — a plain text debug function, never a renderer, never Three.js).

### Stable identity / mutation / persistence proof

Every projected id (platforms, tracks, walls, connections) is copied
verbatim from its canonical record — proven directly by test, for both
R42 and every generic case above. `projectStationStructure3D()` never
mutates its input (`Array.prototype.sort` is applied to a COPY of
`geometry.levels`, never the original); proven by a before/after deep-
equality check in the test suite. No persistence of any kind exists for
`StationStructuralProjection3D` — confirmed by a static-source test that
the module never imports `indexedDB`/`localStorage`/`fetch`.

### Regression — STATION-07 / STATION-10 / STATION-12 unaffected

None of `stationTopologyProjection.ts`, `stationTopologySvgRenderer.ts`,
`stationDetailSubjectResolver.ts`, or `stationStructuralReadiness.ts` was
modified this batch. Confirmed directly by test: STATION-07's own
projection still renders R42 as 2 platform + 2 track lanes (0 wall
lanes); STATION-10's resolver still resolves R42's real platform/wall
subjects; STATION-12's readiness evaluator still reports R42's `levels`/
`connections` as READY and `wallSurfaces` as UNKNOWN, unchanged.

### Testing

34 new tests in `stationStructuralProjection3D.test.ts` (determinism,
mutation safety, stable-identity preservation for every subject kind,
level-stacking-order proof, platform/track/wall/connection partial-truth
behavior, the 4-archetype + synthetic-fixture + real-R42 generic topology
proof, the R42 end-to-end proof + debug-summary content check, no-
persistence/no-archetype-branch/no-station-branch static-source checks,
and direct STATION-07/STATION-10/STATION-12 regression checks run from
within this same file). Full combined MUSIC suite: 4040 passing (same 11
pre-existing unrelated manifest-path failures as before this batch).
Typecheck clean; this batch's own files lint clean.

### Architectural gate

**Is the representation-independent 3D structural projection now
sufficiently stable to build the first visual 3D station renderer?**

**YES** — future visual consumers can call `projectStationStructure3D()`
and render canonical known structure without inventing Station Truth,
branching on a station or archetype identity, creating a second station
model, or confusing presentation-space placement (`presentationStackIndex`)
with measured geometry (`canonicalElevationM`). A future STATION-14
should consume `StationStructuralProjection3D` directly — specifically
`levels[].presentationStackIndex` (and `canonicalElevationM` where
present) for vertical placement, `platforms[].footprint`/
`tracks[].localPoints` where present for plan geometry (explicitly
PARTIAL-grade for R42 today), `walls[].geometryState` to decide whether
to draw anything per wall, and `connections[].pathState` to decide
whether to draw a real path or only indicate topological connectivity —
never guessing where either state reads `"geometryUnknown"`/
`"topologyOnly"`.

**Architecture docs:** this section plus a new dedicated `OWNERSHIP.md`
row (`station structural 3D projection (representation-independent)`) are
the required bookkeeping for the new canonical transformation this batch
establishes — both included in this same commit. (A second small row,
for `stationStructuralReadiness.ts`, was also added — STATION-12 had
left that module without its own explicit `OWNERSHIP.md` entry.)

## 24. STATION-14 — first visual 3D station renderer

Implements the first visual consumer of the chain STATION-13 established:

```
StationGeometryData -> projectStationStructure3D() -> StationStructuralProjection3D
                                                              |
                                                              v
                                               buildStationStructure3DScene()   (pure, music/src/logic/maps/stationStructure3DScene.ts)
                                                              |
                                                              v
                                               renderStationStructure3D()       (DOM/WebGL lifecycle, stationStructure3DRenderer.ts)
                                                              |
                                                              v
                                                    visible 3D structural scene
```

### Renderer boundary (Phase 1, confirmed)

Both new modules consume **only** `StationStructuralProjection3D` — proven
directly by static-source test, not just by convention: neither imports
`stationGeometryBayRidgeAvSeed.ts`, `stationGeometryRegistry.ts`,
`stationArchetypeInstantiate.ts`, or any archetype-id constant, and
neither contains a quoted `"R42"`/`'R42'` literal anywhere. The one place
R42's own real geometry is resolved is the debug runtime
(`station3DDebugRuntime.ts`), which calls the exact, unmodified STATION-08
registry and then hands the result to `projectStationStructure3D()` —
same three-stage pipeline every other consumer already uses.

### Rendering infrastructure recon (Phase 2)

No 3D/WebGL library existed anywhere in this repository before this
batch (confirmed directly: no `three` import, no WebGL usage, in
`music/` or elsewhere). MAP's own 3D buildings are Mapbox GL's own
internal WebGL layer, not a general-purpose scene API this batch could
reuse for arbitrary station structure. **`three`** (^0.186, + `@types/three`
devDependency) was added as the smallest appropriate, actively-maintained
dependency — its own `OrbitControls` (`three/examples/jsm/controls/
OrbitControls.js`, bundled in the package, no separate install) satisfies
Phase 11's "reuse existing controls if available" directly. No other new
dependency was added. The existing dark-field token palette
(`#0e0d0b` background, `#f4efe7`/`#6b6357`/`#a39a8d` text, already used by
`platform.html`/`station-topology-debug.html`) is reused for the debug
page's own chrome and scene background, per Phase 10's "reuse existing
tokens, don't redesign branding."

### API

```ts
buildStationStructure3DScene(projection: StationStructuralProjection3D): THREE.Group   // pure
renderStationStructure3D(container: HTMLElement, projection: StationStructuralProjection3D, options?: { onSelect? }): { dispose(); resetCamera() }
```

Split deliberately into a **pure** scene-builder (`stationStructure3DScene.ts`
— constructs Three.js scene-graph objects only, touches no canvas/WebGL
context, and is therefore fully unit-testable in this repo's own Node/
vitest runner with no jsdom, same "no jsdom configured here" precedent
`platformRuntime.test.ts` already established) and a thin **DOM-mounting**
lifecycle wrapper (`stationStructure3DRenderer.ts` — the only file that
touches `WebGLRenderer`/`<canvas>`/`ResizeObserver`). Neither is R42's own
API, nor an archetype's — both take `StationStructuralProjection3D` and
nothing else.

### Coordinate mapping (Phase 4)

Station-local convention (unchanged, STATION-13): `+X` = along-track,
`+Y` = lateral, `+Z` = up. Three.js scene convention: `+X` = right,
`+Y` = up, `+Z` = toward the camera. The ONE place this swap happens is
`toSceneVector3()` in `stationStructure3DScene.ts` — station-local `Z`
(up) becomes scene `Y` (up); station-local `Y` (lateral) becomes scene
`Z` (depth), so an oblique camera reads along-track motion as left/right
and platform/track lateral separation as near/far depth, matching how a
person standing on a platform actually perceives the station. No other
function in either module swaps axes independently.

### Canonical vs. presentation vertical placement (Phase 4)

`buildLevelSceneY()` is the one place a level's scene height is decided:
when `ProjectedLevel.canonicalElevationM` exists, it is used **directly,
unconverted** (real meters, already using the same "negative = below
street" sign convention as scene-space "up"); when absent,
`presentationStackIndex` drives scene Y instead, scaled by
`LEVEL_PRESENTATION_SPACING_UNITS` (a renderer-owned, deliberately
un-meter-like constant — `6`, scene units, never written back anywhere).
Proven by test: a level with a real `elevationM` of `-3.56` renders at
exactly `-3.56`, never at a stack-index-derived value, even when its
`presentationStackIndex` would independently suggest a different number.

### Level / platform / track / wall / connection representation (Phases 5-9)

- **Levels**: an abstract, fixed-extent reference `GridHelper` at the
  level's own scene height, plus a text label (`SURFACE`/`MEZZANINE`/
  `PLATFORM`, derived from `kind`) — never an invented floor/room
  footprint. A real canonical level `footprint`, when one exists, draws
  as an honest outline on that grid.
- **Platforms**: rendered only when a real `footprint` exists — an
  extruded, translucent planar shape plus an outline, extrusion depth a
  documented presentation constant (`PLATFORM_PRESENTATION_THICKNESS_UNITS`),
  never implying measured thickness. R42's own real, estimated, currently
  width-unreliable footprints render exactly as estimated — never
  beautified or completed.
- **Tracks**: rendered only when real `localPoints` exist — a schematic
  two-rail line pair, offset by a documented presentation gauge constant
  (`TRACK_RAIL_GAUGE_PRESENTATION_UNITS`), never a claim about real rail
  spacing. A platformless bypass track (`SIDE_4TRACK`'s own express
  tracks) falls back to the lowest `platform`-kind level's own scene
  height — a generic, documented decision, not R42-specific.
- **Walls**: `geometryState: "geometryKnown"` renders the real
  `localPolygon` as an extruded mesh; `"geometryUnknown"` renders
  **nothing physical at all** — proven directly by test that R42's two
  real STATION-11 back walls produce zero wall-type scene objects. Their
  existence is communicated only through the debug page's own text
  summary (`Walls: 0 / 2 geometrically resolved`), never a placeholder
  mesh at an arbitrary position.
- **Connections**: `pathState: "pathKnown"` renders the real `localPath`,
  interpolated in height between its two levels, as a solid line.
  `"topologyOnly"` (all four of R42's real connections, today) renders an
  explicitly **dashed**, 2-point, level-to-level relationship indicator —
  proven by test to never exceed 2 points (never an invented multi-point
  staircase shape) and to use `LineDashedMaterial` specifically so it
  reads visually distinct from a real path.

### Camera (Phase 11)

One deterministic default oblique view (`DEFAULT_CAMERA_POSITION`/
`DEFAULT_CAMERA_TARGET`, module-level constants) showing along-track
extent, lateral platform/track relationship, and vertical level stack
simultaneously. `OrbitControls` (damping disabled) provides restrained
orbit/zoom/pan; a `resetCamera()` handle method restores the exact
default view deterministically. No first-person, train-follow, cinematic,
or fly-through camera exists anywhere in this batch.

### Picking / identity (Phase 14)

Every renderable Object3D carries `userData: { type, id, levelId? }` —
the EXACT canonical id STATION-13's own projection already carried,
never a renderer-generated id. `renderStationStructure3D()`'s optional
`onSelect` raycasts on click and walks up the Object3D ancestry to the
nearest tagged node — reporting PROJECTION identity only. It does not
construct or duplicate STATION-10's own `resolveStationDetailSubject()`;
truth resolution remains exactly where STATION-10 put it.

### Lifecycle / disposal (Phase 15)

No animation loop exists — `OrbitControls` (damping disabled) fires a
`"change"` event on every pointer-driven camera move, which together with
the initial frame and `ResizeObserver`-triggered resizes is this
renderer's only `render()` trigger. `dispose()` disconnects the
`ResizeObserver`, removes the `"change"`/click listeners, disposes every
geometry/material/texture the scene builder created, disposes the
`WebGLRenderer` itself, and removes its `<canvas>` from the container —
live-verified: switching fixtures repeatedly, and a full page reload,
both leave exactly one `<canvas>` in the container, never a duplicate.

### Debug/proof entry point

`music/station-3d-debug.html` + `music/src/station/station3DDebugRuntime.ts`
— development/debug tooling ONLY, same "isolated page route, excluded
from `vite.config.ts`'s production `rollupOptions.input`" convention
`station-topology-debug.html` (STATION-07) already established. Not
reachable from MAP, the Mezzanine Drawer, or Platform. A fixture selector
covers the real R42 station (via the unmodified registry) plus
`UG_SIDE_2TRACK`/`UG_ISLAND_2TRACK`/`UG_SIDE_4TRACK`/the synthetic
four-track-island contract fixture — the exact same five cases
`station-topology-debug.html` already exercises for STATION-07's own
renderer. A compact, fully-derived (never hardcoded) truth/projection
summary panel and a picked-subject panel (`TYPE`/`ID`/`LEVEL`) sit beside
the canvas.

### Boundary with future Tunnel Vision integration

This batch deliberately stops short of: materials, lighting, textures,
tiles, signage, trains, doors, animation, a network/world camera, and any
BLACKBOOK/evidence/UGC integration. A future Tunnel Vision integration
should consume `StationStructuralProjection3D` (not `StationGeometryData`
directly) and may build its own renderer, or extend
`stationStructure3DScene.ts`'s own scene-building conventions, but must
preserve the same invariants this section documents: canonical identity
on every render-object, no fabricated geometry for an unknown subject,
and presentation constants that never become physical truth.

### Testing / verification

28 new tests in `stationStructure3DScene.test.ts` (scene construction,
mutation safety, canonical-identity preservation for every subject kind,
wall/connection partial-truth behavior, canonical-vs-presentation
vertical placement, the 5-case generic topology proof, projection-only-
boundary and no-branching static-source checks, dispose()-lifecycle and
no-`requestAnimationFrame` static-source checks, and direct STATION-07/
STATION-10/STATION-12/STATION-13 regression checks). Full combined MUSIC
suite: 4068 passing (same 11 pre-existing unrelated manifest-path
failures as before this batch). Typecheck clean; this batch's own files
lint clean.

**Human visual acceptance — live-verified.** `station-3d-debug.html`:
R42 renders a visibly three-dimensional SURFACE/MEZZANINE/PLATFORM stack
with the real platform footprint visible and zero fabricated walls;
orbit-drag rotates the camera and simultaneously proved picking (a drag
that ended as a click correctly selected and reported `LEVEL /
level:R42:surface`); `Reset camera` restores the default view; switching
to `ISLAND_4_TEST` shows a visibly distinct wall|local|island|express|
express|island|local|wall structure with real wall geometry now present
(`Walls: 2 / 2 geometrically resolved`); switching to `SIDE_4` shows the
correct, independently-derived counts (`Connections: 0 / 2 spatially
resolved`); cycling through three fixtures and a full page reload both
leave exactly one `<canvas>` in the container.

### Architectural gate

**Is the first generic visual 3D station renderer sufficiently stable to
integrate a station into the Underground/Tunnel Vision world?**

**YES** — the same renderer faithfully visualizes partial canonical
Station Truth (R42) and fully generic structural cases (all four
archetype/fixture cases) without station-specific fabrication, archetype
branching, a second station model, or confusing presentation-space
placement with measured geometry. A future STATION-15 should integrate:
`renderStationStructure3D()` (`music/src/logic/maps/
stationStructure3DRenderer.ts`) fed by `projectStationStructure3D()`
(STATION-13) fed by real `StationGeometryData` from
`stationGeometryRegistry.ts` (STATION-08, unmodified) — mounted into
whatever container Tunnel Vision's own future layout provides, disposed
on that container's own teardown.

**Architecture docs:** this section plus two new `OWNERSHIP.md` rows
(`station structural 3D scene builder`, `station structural 3D renderer`)
are the required bookkeeping for this batch — both included in this same
commit.

## 25. STATION-15 — Tunnel Vision / Underground 3D station integration

Integrates the first real canonical 3D station (Bay Ridge Av / R42) into
the existing Underground/Tunnel Vision world:

```
StationGeometryData (canonical)
  -> projectStationStructure3D()                       (STATION-13, unmodified)
  -> deriveStationWorldAnchor() / deriveLevelPresentationDepthM()   (STATION-15, pure)
  -> window.SBE.StationStructure3DBridge                (STATION-15, plain data only)
  -> wall/systems/presentation/subway3DStationActorLayer.js         (STATION-15, native THREE)
  -> existing Underground / Tunnel Vision Mapbox world
```

### Targeted recon result (Phase 1-2, reported before implementation)

1. Underground/Tunnel Vision is owned by `wall/systems/presentation/
   subway3DTrainActorLayer.js` + `subway3DVisibilityPolicy.js` — a Mapbox
   **custom layer** (`type:'custom', renderingMode:'3d'`), not a separate
   world/page.
2. It already owns a real Three.js scene: `onAdd(map, gl)` creates
   `THREE.Camera()` + `THREE.WebGLRenderer({canvas: map.getCanvas(),
   context: gl})`; `render(gl, matrix)` composes one real model matrix per
   object (`MercatorCoordinate.fromLngLat` + `meterInMercatorCoordinateUnits()`
   + `rotateZ(-headingDeg)`) and calls `renderer.render(object, camera)`
   once per object — the exact, already-proven pattern this batch reuses
   for the station.
3. **Critical finding, materially affecting the implementation path**:
   `wall/` loads its own global `THREE` **r0.160** via a CDN `<script>` tag
   (see `wall/index.html`); MUSIC's own `three` npm dependency (added
   STATION-14) is **r0.186** — a real, confirmed version gap. Passing a
   `THREE.Object3D` built against one module instance into a
   `WebGLRenderer` built against the other is a genuine cross-version risk,
   not a hypothetical one. Per this batch's own explicit instruction
   ("if the actual Underground architecture materially contradicts the
   assumptions in this prompt, report the smallest architecture-consistent
   integration path" — this is exactly that case), STATION-14's own scene
   builder (`stationStructure3DScene.ts`) is **not** reused directly for
   this integration. Instead: the bridge carries ONLY plain data (zero
   Three.js dependency, confirmed by build output — the built
   `station-3d-bridge.js` chunk is ~2KB, nowhere near `three`'s real size),
   and `subway3DStationActorLayer.js` builds its own Three.js scene
   content natively against wall/'s own global `THREE`, mirroring
   `stationStructure3DScene.ts`'s own presentation constants/behavior
   rather than importing its (incompatible) objects.
4. Station-local's own native convention (+X along-track, +Y lateral,
   +Z up, real meters) already matches EXACTLY what this Mapbox-Three
   bridge's own per-object model matrix expects (local X/Y → the real
   horizontal Mercator plane, local Z → real altitude, rotation around
   local Z for heading) — no axis swap/mirror is needed anywhere in the
   new integration file, unlike STATION-14's own standalone debug renderer
   (which deliberately converts to a Y-up scene for its own OrbitControls
   camera convenience).
5. `window.SBE.MapboxViewportRuntime.getMap()`/`.onReady()` is the existing
   map-instance/readiness authority (same one this entire SUBWAY arc
   already uses, including every STATION-08-14 live-acceptance pass).
6. Bay Ridge Av's existing 2D marker (`MTASubwayStationLibrary`/
   `subwayStationHud.js`) is untouched and unaffected — the new 3D layer
   is an independent, additive Mapbox custom layer, never a replacement.
7. A genuinely pre-existing, previously-undetected dev-environment gap was
   found and fixed as part of making this batch's own acceptance possible:
   `vite dev` has no static-serving rule for `dist/assets/*`, so
   `wall/index.html`'s own `<script type="module" src="../assets/
   subway-member-runtime.js">` (and its sibling
   `radio-channel-receiver-runtime.js`) silently received Vite's SPA
   `index.html` fallback instead of the real script in dev mode —
   confirmed live, not introduced by this batch. Fixed with the smallest
   possible addition: a `server.middlewares.use('/assets', ...)` static
   file handler in `vite.config.ts`, serving a real file from
   `dist/assets/` when one exists, else falling through unchanged. This
   also retroactively fixes the same long-standing gap for the two
   pre-existing bridges. Requires `npm run build` (or `vite build`) to
   have produced `dist/assets/` at least once before `npm run dev`.

### Integration boundary (Phase 1)

`subway3DStationActorLayer.js` reads real `StationGeometryData` ONLY
through `window.SBE.StationStructure3DBridge` — never the Bay Ridge seed,
never any MUSIC source file directly, never a second copy of R42's
geometry. The bridge itself is a thin, same-origin, build-once pass-
through (same convention `subway-member-runtime.js` already established)
of three already-canonical functions:
`resolveKnownStationGeometry` (STATION-08), `projectStationStructure3D`
(STATION-13), and this batch's own `deriveStationWorldAnchor`/
`deriveLevelPresentationDepthM`.

### Station-local → world transform (Phase 3)

`music/src/logic/maps/stationWorldTransform.ts` (new, pure, zero
Three.js/Mapbox dependency — deliberately, so it stays safely bridgeable
despite the version gap above):

```ts
interface StationWorldAnchor { longitude; latitude; altitudeM; headingDeg }
function deriveStationWorldAnchor(geometry: StationGeometryData): StationWorldAnchor
function deriveLevelPresentationDepthM(level: ProjectedLevel): number
```

- **Geographic position (Phase 4)**: `anchor.longitude`/`latitude` are a
  verbatim pass-through of `StationGeometryData.origin.longitude`/
  `latitude` — themselves already sourced from the real GTFS station-stop
  record (see `stationGeometryBayRidgeAvSeed.ts`'s own header). No second
  geographic authority was consulted or introduced.
- **Orientation (Phase 5)**: `anchor.headingDeg` is a verbatim pass-through
  of `origin.orientationDeg` — itself already a real, derived route
  bearing (`computeBearingDeg()` against real GTFS track-shape geometry,
  STATION-05 era) — never hand-typed, never an `if stationId === "R42"`
  branch. Any future station whose own `origin.orientationDeg` is
  similarly derived gets correct orientation automatically, with zero new
  code.
- **Scale (Phase 6)**: deliberately NOT answered by this module. Station-
  local coordinates are already real/estimated meters; the integration
  layer applies Mapbox's own real, per-latitude
  `MercatorCoordinate.meterInMercatorCoordinateUnits()` conversion at
  render time — reusing real, already-correct geographic math rather than
  reimplementing (and risking drifting from) it. 1 station-local unit =
  1 real meter throughout.
- **Vertical/depth (Phase 7)**: `deriveLevelPresentationDepthM()` mirrors
  `stationStructure3DScene.ts`'s own `buildLevelSceneY()` rule exactly (a
  real `canonicalElevationM` is used directly, unconverted; otherwise
  `presentationStackIndex` scaled by the same documented constant) —
  intentionally re-declared rather than imported, to keep this module
  dependency-free. `STATION_DEPTH_OFFSET_M` (in
  `subway3DStationActorLayer.js`, currently `0`) is the one explicit,
  representation-owned knob for a future station whose own real altitude
  anchor would otherwise collide visually with surface terrain/buildings
  — Bay Ridge Av's own `origin.altitudeM` (0, street level) needs none.

### Existing marker relationship (Phase 8) / visibility (Phase 9)

The 2D station marker is never removed, never station-specific-cased
away — stations without sufficient Station Truth (every station except
R42, today) continue to rely on it exclusively, unchanged. The 3D
structural layer is purely additive, gated by the same dev-flag
convention as 3D trains, and only renders once the camera is reasonably
near (`STATION_VISIBLE_FROM_ZOOM = 14`, a presentation-owned constant) —
the smallest useful visibility rule, explicitly documented as the next
refinement a future batch could replace with real semantic zoom, not a
camera-system rewrite.

### Visual language (Phase 10)

Reuses STATION-14's own presentation constants/behavior by convention
(same colors, same geometryKnown/geometryUnknown and pathKnown/
topologyOnly rules) — no redesign, no tiles/signage/benches/decoration,
no fabricated walls/stairs/mezzanine footprint.

### Bay Ridge Av live proof (Phase 11) — live-verified

**START HERE:**
```
cd wall && npx serve -p 5500 .                 # wall/'s own static server
cd music && PLAY_LIBRARY_ROOT=... npm run dev -- --port 5176   # MUSIC dev server (requires a prior `npm run build` for /assets/* — see the recon finding above)
```
Then: `http://localhost:5177/wall-app/?subway3d=1` (direct standalone
MAP entry, with the shared 3D dev flag in the URL — the flag reads
`location.search` of this exact document, so a HOME-hosted iframe path
would need the flag applied differently; both are legitimate real
entry points, see `subwayMezzanineDrawer.js`'s own precedent for
standalone-vs-hosted handling elsewhere in this arc).

Confirmed live: `[Subway3DStationActorLayer] activated — stations
mounted: {0: R42}`; `window.SBE.Subway3DStationActorLayer.getMountedStationIds()`
→ `["R42"]`; zero console errors from the new modules. Jumping the camera
to R42's real coordinate (`[-74.023377, 40.634967]`) at top-down (`pitch:
0`) showed a real, subtly-tinted structural overlay precisely at the Bay
Ridge Av marker, with dashed topology-only connection indicators visibly
aligned with the real R-line route direction (confirming both position
and orientation). A pitched/oblique view showed the real existing
`Subway3DTrainActorLayer` 3D train continuing to render and promote/
retire trains normally alongside the new station layer, sharing the same
GL context without conflict — direct live proof of Phase 2's own "reuse
the shared context, never a second canvas" requirement. `disable()`/
`enable()` cycled cleanly (`map.getLayer(LAYER_ID)` removed then
re-added, mounted-station list emptied then restored to exactly `["R42"]`
— never duplicated). MEMBER avatar persistence and the same persistent
`runtimeId` were separately reconfirmed via the normal HOME-hosted
`home-dev.html?surface=map` path (3D mode off by default there, as
designed — the dev flag is never forced on for a hosted session).
Bay Ridge Av's own two STATION-11 back walls remained geometrically
absent throughout (geometryUnknown is never fabricated); all four of its
real connections rendered only as abstract dashed indicators
(topologyOnly), never invented stairs.

### Generic transform proof (Phase 12) — not R42-specific

`stationWorldTransform.test.ts` (new, 13 tests, vitest) proves
`deriveStationWorldAnchor`/`deriveLevelPresentationDepthM` work
identically for: the real R42 seed, an entirely arbitrary synthetic
origin (longitude/latitude/altitude/bearing unrelated to Bay Ridge Av),
an archetype-generated station, and a reversed/perpendicular bearing —
all through the one unmodified function, with a static-source test
confirming no archetype-id or real-station-id branch exists anywhere in
the module.

### Future multi-station / train-alignment compatibility (Phase 13-14)

`subway3DStationActorLayer.js`'s own `KNOWN_STATION_GTFS_STOP_IDS` is a
plain array (today: `['R42']`) and `mountStation(gtfsStopId)`/
`unmountStation(gtfsStopId)` are already per-station functions, keyed
entirely by a real gtfsStopId parameter — adding a future station means
adding its id to that array, never a new code path, never a global-
singleton assumption tied to R42. No train integration was built or
implied; the transform this batch establishes (station-local meters →
real Mercator world position, deterministic, per-track as well as
per-wall/platform) is exactly the same coordinate space a future train
alignment would need to share — proven deterministic and station-generic
here, nothing about it would need to change or be rebuilt for that later
work.

### MEMBER / RADIO / host boundary (Phase 15)

`subway3DStationActorLayer.js` and `station3DBridge.ts` construct no
`MemberIdentityAuthority`, no RADIO receiver, no independent persistent
runtime of any kind — confirmed by direct code inspection (neither file
imports anything from `music/src/member/` or constructs an identity/
session object) and by live verification (same `runtimeId`, same
`#member-avatar-root`, through the normal HOME-hosted path, unaffected by
this batch).

### Testing

13 new tests in `stationWorldTransform.test.ts` (determinism, no
mutation, verbatim pass-through for real/arbitrary/archetype-generated
geometry, no archetype/station branching, zero Three.js/Mapbox
dependency) + a new hand-rolled `subway3DStationActorLayer.tests.js`
(same convention as `subway3DTrainActorLayer.tests.js`: known-station-
list integrity, honest `mountStation()` failure when the bridge is
unavailable or a station is unresolvable, dev-flag URL-param reading).
Full combined MUSIC vitest suite: 4081 passing (same 11 pre-existing
unrelated manifest-path failures as before this batch). Typecheck clean;
this batch's own files lint clean (the `vite.config.ts` dev-server fix
touches a file with pre-existing, unrelated lint findings elsewhere in
it, none on the lines this batch added).

### Architectural gates

**Is the first canonical 3D station now successfully integrated into the
real Underground/Tunnel Vision world?**

**YES** — live-verified via the real `wall/` Mapbox world (not the
STATION-14 debug page alone), at R42's real geographic position and real
route orientation, coexisting with the existing 3D train layer, the
existing 2D station marker, and the existing camera/navigation, with
clean mount/unmount and no second canvas or second Station Truth.

**Is the Underground integration now generic enough that additional
stations with sufficient Station Truth can enter the same 3D world
without a new station-specific integration path?**

**YES** — `mountStation(gtfsStopId)` and `deriveStationWorldAnchor()`/
`deriveLevelPresentationDepthM()` are already fully generic (proven by
the arbitrary-origin/arbitrary-bearing/archetype-generated test cases);
adding a second real station is exactly: author its `StationGeometryData`
seed (existing, unrelated workflow), register it in
`stationGeometryRegistry.ts` (existing, STATION-08 workflow), and add its
gtfsStopId to `KNOWN_STATION_GTFS_STOP_IDS` — zero new rendering code,
zero new transform code.

**Architecture docs:** this section is the required bookkeeping for the
new canonical Underground integration this batch establishes — no
`OWNERSHIP.md` row changes were required beyond updating the existing
"Underground / Tunnel Vision (3D) rendering" row (below) to name the new
file.

## 26. Future: printable/semantic MAP output (direction, not implementation)

Documented here as intended direction only — **not implemented, not
designed, not scheduled**. A future StudioRich OUTPUTS phase (roadmap
concept, not this directory's concern — see the `WOS-share` roadmap) may
eventually want a print/poster representation of MAP data (Surface map,
Underground/Tunnel Vision map, borough/line/station/neighborhood maps,
event or artwork editions, personalized member maps).

The one thing current work should keep in mind so that direction stays
reachable later: avoid unnecessarily coupling semantic map information
(borough boundaries, coastline/water, parks, airports, subway routes,
station markers, terminal symbols, labels, station hierarchy, Station
Truth, selected artwork/location info) to exactly one interactive
renderer (Surface's Mapbox layer, or Underground's Mapbox-custom-layer
Three.js scene), so that a future, genuinely different print renderer
isn't forced to re-derive truth the interactive renderers already have.
`StationGeometryData`/`StationStructuralProjection3D` (STATION-13) are
already one real example of this discipline done correctly — canonical
truth, consumed by more than one representation, owned by neither. No
print-specific module, type, or consumer exists anywhere in this
codebase today.
