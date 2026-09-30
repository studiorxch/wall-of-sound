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
  station, never a step toward bulk generation. Two ship today:
  `UG_SIDE_2TRACK`, `UG_SIDE_4TRACK`.
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
