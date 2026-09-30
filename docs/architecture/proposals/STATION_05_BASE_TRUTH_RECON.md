# Station Base Truth / generic representation architecture (recon)

Status: **RECON ONLY — no code implemented, nothing decided.** This is a
proposal/analysis document, not current-state truth (see `../README.md`'s
own rule on this directory). Baseline: `release/subway-beta-0.1`,
`e029606` (STATION-04 — Mezzanine Drawer). Nothing in this document has
been implemented; STATION-06 is explicitly on hold pending further
discussion.

## Why this exists

STATION-01 through STATION-04 built Station Cover / the Mezzanine Drawer
entirely on top of `wall/`'s live `MTASubwayStationLibrary` (identity)
and the static GTFS snapshot (routes, ordering) — never touching the
MUSIC-side `stationGeometry*`/`stationClassification*`/`stationArchetype*`
subsystem at all. That subsystem is real, tested, and already answers
questions the future Platform view will need (tracks, platforms,
adjacency), but it has never been assessed as a candidate **Station Base
Truth** for a generic, structurally-truthful station representation that
doesn't require detailed 3D authoring first. This recon answers that
question before any Platform-renderer code is written, and before Bay
Ridge Av's own side-platform topology can accidentally become the
assumed universal shape.

## A. Existing architecture inventory

All of the following lives in `music/src/data/` and `music/src/logic/maps/`
— MUSIC-side, IndexedDB-backed, **not bridged into `wall/`'s live runtime**
(confirmed unchanged: `../DEBT.md`'s "SUBWAY station-geometry authoring
system has no bridge into the live `wall/` runtime" entry, and
`../subway/README.md` §8). Canonical station *identity* is never
duplicated — every record points at a real `gtfsStopId` rather than
inventing a second id scheme.

| Concern | File | What it actually is |
|---|---|---|
| Base geometry record | `stationGeometryTypes.ts` | `StationGeometryData`: `origin`, `levels[]`, `platforms[]`, `trackCenterlines[]`, `connections[]`, `platformLinks[]`, `entrances[]`, `wallSurfaces[]`, `evidenceConflicts[]` — every fact-bearing group carries its own `Provenance` |
| Coordinate math | `stationGeometryCoordinates.ts` | Pure WGS84↔station-local-meter projection + real compass `orientationDeg`; no renderer coupling |
| Footprint editing | `stationGeometryEditGeometry.ts` | Platform-polygon vertex add/move/remove/clear only — pure functions, no track/adjacency editing |
| Persistence | `stationGeometryStore.ts` | IndexedDB (`MUSIC_STATION_GEOMETRY_DB`), keyed `stationGeometry:<gtfsStopId>`; a shape-only guard (`isPlausibleStationGeometryData`), not a validator — conflict handling lives in the record itself, not the store |
| Editor | `StationGeometryEditor.tsx` | 2D SVG plan view, deliberately single-station V0 (Bay Ridge Av), no Three.js/Mapbox coupling; edits platform footprints directly, shows tracks/levels/connections read-only; also hosts an "Archetype Editor" for generating fresh temp-station shells |
| Classification grammar | `stationClassificationTypes.ts` | 4 independent axes — topology, service pattern, structure, operational role — composed via `StationComponent → StationComplex`; **types + composability tests only, no automatic classifier** |
| Archetypes | `stationArchetypeTypes.ts` + `stationArchetypeInstantiate.ts` + `stationArchetypeUndergroundSide{2,4}Track.ts` | `UG_SIDE_2TRACK`, `UG_SIDE_4TRACK` — parametric generators producing a `heuristic`-provenance `StationGeometryData` shell for a human to then calibrate with real evidence |
| Real seeds | `stationGeometryBayRidgeAvSeed.ts` (R42), `stationGeometry45thStreetSeed.ts` (R39), `stationGeometry53rdStreetSeed.ts` (R40), `stationGeometry77thStreetSeed.ts` (R43) | All individually-authored, real, evidence-tiered, **all side-platform** — none island |

**Test coverage is real, not aspirational:** 202 tests across the 8
relevant test files, all passing at `e029606` (confirmed by direct
`vitest run`).

### Key type shapes (verbatim, `stationGeometryTypes.ts`)

```ts
export type GeometrySource = "authority" | "reference" | "heuristic" | "authored" | "unknown";
export interface Provenance { source: GeometrySource; confidence?: number; sourceRef?: string; note?: string; }

export type EvidenceConflictStatus = "unresolved" | "resolved" | "accepted_discrepancy";
export interface StationGeometryEvidenceConflict {
  id: string;
  affectedField: string;
  conflictingEvidence: { description: string; sourceRef: string }[];
  status: EvidenceConflictStatus;
  note?: string;
}

export type PlatformConfig = "island" | "side" | "unknown";
export interface StationPlatform {
  id: string; levelId: string; footprint?: LocalPoint2D[];
  config: PlatformConfig; servesRouteIds: string[]; provenance: Provenance;
}

export type TrackRole = "northboundLocal" | "northboundExpress" | "southboundExpress" | "southboundLocal";
export type TrackPhysicalRole = "local" | "express" | "reversibleExpress" | "bypass" | "yardLead" | "relay";
export type TrackOperatingDirection = "northbound" | "southbound" | "reversible" | "none";
export interface StationTrackCenterline {
  id: string; platformId: string | null; // adjacency: null = no platform (bypass/express)
  role?: TrackRole; physicalRole?: TrackPhysicalRole; operatingDirection?: TrackOperatingDirection;
  localPoints?: LocalPoint2D[]; gtfsShapeRef?: { shapeId: string; fromIdx: number; toIdx: number };
  provenance: Provenance;
}

export interface StationConnection {
  // ...
  relatedPlatformId?: string; // per-platform ("side-specific") connection instance, e.g. two distinct staircases
}

export interface StationWallSurface {
  id: string; levelId: string; localPolygon: LocalPoint3D[];
  label: string; suitableForArt: boolean; provenance: Provenance;
  // NO relationship to a track or platform today — see Gap 4.
}
```

`stationClassificationTypes.ts`'s topology axis **already names the exact
validation set this batch asks about**:

```ts
export type StationTopologyFamily =
  | "SINGLE_TRACK_SINGLE_PLATFORM" | "SIDE_2TRACK" | "ISLAND_2TRACK"
  | "SIDE_3TRACK" | "ISLAND_3TRACK" | "SIDE_4TRACK" | "ISLAND_4TRACK"
  | "MIXED_4TRACK_3PLATFORM";
```

`StationComponent` (one coherent track/platform system, classified on all
4 axes) composes into `StationComplex` via `StationComplexConnector` —
this is already the mechanism for a real multi-topology station (the
type's own doc example: Union Square = two `ISLAND_4TRACK` components +
one `SIDE_2TRACK` component).

## B. Gap analysis

1. **Island platforms are type-valid but functionally unproven.**
   `PlatformConfig`/`StationTopologyFamily` already name island variants.
   Nothing prevents a hand-authored record from setting `config:
   "island"` today — but no archetype, seed, or test exercises that path.
   `stationClassificationTypes.test.ts` explicitly asserts *no* island
   archetype exists yet — the absence is deliberate/tracked, not an
   oversight.
2. **Track↔platform adjacency needs no structural change for island.**
   `StationTrackCenterline.platformId` is already many-to-one — two
   tracks can point at the same island `platformId` today.
3. **Missing: which edge of an island platform a track sits on.** The
   model can say "tracks A and B both serve platform P" but not "A is on
   P's north edge, B is on P's south edge." This is precisely the fact
   the task's own "northbound ≠ northbound platform" warning is about,
   and it's genuinely absent from the type system.
4. **Missing: a wall-to-track relationship with no platform.**
   `StationWallSurface` exists (generic, `levelId`-scoped,
   `suitableForArt: boolean`) but has no field connecting it to a
   specific track or marking it "trackside, no adjacent platform." Unused
   (`wallSurfaces: []`) in all 4 real seeds.
5. **`platformEdge` is not a first-class authored fact anywhere.** It
   exists only as an archetype *generation parameter*
   (`platformEdgeToTrackCenterM`, `outerPlatformEdgeToLocalTrackCenterM`
   in `stationArchetypeTypes.ts`) — a transient offset used once to
   compute a heuristic shell, never persisted as a queryable relationship.
6. **`instantiateStationArchetype()` only dispatches `UG_SIDE_2TRACK`.**
   `UG_SIDE_4TRACK` is bypassed entirely — both 4-track seeds call
   `deriveUndergroundSide4TrackGeometry` directly and hand-assemble the
   envelope themselves, a documented-but-unresolved inconsistency in the
   existing code (both seed files' own headers call extending the
   instantiate dispatch "a real, separate design decision" not yet made).
7. **Calibration depth of 45th/53rd/77th St relative to Bay Ridge Av is
   itself UNRESOLVED per the architecture doc** (`../subway/README.md`
   §7: "was not verified this pass ... requires targeted verification
   before assuming parity"). This recon did not re-verify it either —
   flagging it forward rather than silently assuming parity.
8. **Door-side / which side of a train opens is modeled nowhere.**
   Confirmed via exhaustive grep across `music/src` and `wall/systems`:
   zero hits for any door-side concept (the one incidental match,
   `bus_door_side` in a camera-shot preset file, is an unrelated
   documentary camera angle name).

## C. Proposed Base Truth contract — additive, not parallel

Two new **optional** fields, both backward-compatible with every existing
seed (a side-platform station simply never sets them):

```
StationGeometryData
        │
        ├── StationPlatform (config: side|island|unknown, servesRouteIds)
        │         ▲
        │         │ platformId  (many tracks → one platform — UNCHANGED)
        │         │ + NEW platformSide?: "A" | "B"   (which edge — island only)
        │         │
        ├── StationTrackCenterline (role, physicalRole, operatingDirection)
        │
        └── StationWallSurface (suitableForArt, levelId)
                  + NEW adjacentTrackId?: string   (wall ↔ track, no platform)

Classification (orthogonal file, unchanged):
StationComponent (topology incl. ISLAND_*) ⊕ StationComplex (multi-component, e.g. Union Square)
```

Everything else — `Provenance`, `StationGeometryEvidenceConflict`,
`StationConnection.relatedPlatformId`, `StationPlatformLink` — is already
sufficient and needs no change for the four validation cases below.

## D. Four validation examples

**SIDE / 2-track** (= real Bay Ridge Av today, unchanged): two platforms,
one track each; `platformSide` unused (unambiguous with one track per
platform).

**ISLAND / 2-track:** one platform `config:"island"`; two tracks, both
`platformId: P`, `platformSide:"A"`/`"B"`; two `wallSurfaces` with
`adjacentTrackId` pointing at each outer track — the exact
`WALL | TRACK | ISLAND | TRACK | WALL` diagram from the task brief.

**SIDE / 4-track** (= real 45th St / 53rd St today, unchanged): two side
platforms; four tracks — outer two `platformId`-linked
(`physicalRole:"local"`), inner two `platformId: null`
(`physicalRole:"express"`).

**ISLAND / 4-track:** two island platforms (one per side), each adjacent
to one local + one express track via `platformSide`; outer walls facing
the outermost local tracks via `adjacentTrackId`. Same extended model, no
new types — and this maps onto a real NYC precedent (the local/express
island arrangement at 59th St–Columbus Circle).

## E. Door-side derivation — derivable, no hardcoding required

`track → platformId → platform`, then (new) `→ platformSide → which
physical edge`. A track with `platformId: null` structurally has no
doors to open (bypass/express skip — the pipeline the task describes
naturally short-circuits, no special case needed). A track with
`platformId` set and `platformSide` resolved tells you exactly which
edge should open. Converting `platformSide` into a literal
screen/world-space direction is a presentation-layer computation from
the already-real `orientationDeg` + footprint polygon — not a new Base
Truth field. No "northbound opens right" assumption is required anywhere
in this derivation.

## F. Generic → detailed upgrade path

Already proven by the existing seeds, just not labeled as a formal
"generic/detailed" split: `stationRef.gtfsStopId` is always a pointer,
never a duplicated identity. "Generic" = archetype-derived,
`provenance.source: "heuristic"` throughout, footprints/`localPoints`
unauthored (`undefined`, never a fabricated empty array — the type
system already distinguishes "unauthored" from "authored empty"). This
already IS a functional, structurally-truthful station — a renderer
reading tracks/platforms/adjacency needs nothing more to be correct.
"Detailed" = the **same record**, same `id`, fields overwritten
field-by-field, provenance upgraded heuristic → reference → authored —
exactly the two-step workflow all 4 real seeds already follow. No new
station identity is ever created; `version`/`updatedAt` already support
evolving a record in place. A generic Platform renderer built against
Base Truth would automatically render more accurately the moment a
station's record gains authored detail — no renderer change required.

## G. Recommendation for STATION-06 (smallest batch — NOT started, on hold)

1. Add the two additive fields (`platformSide` on `StationTrackCenterline`,
   `adjacentTrackId` on `StationWallSurface`) — pure type-level, zero
   risk to Bay Ridge Av or the three other real seeds.
2. Build one `UG_ISLAND_2TRACK` archetype, mirroring `UG_SIDE_2TRACK`'s
   existing structure/test shape, to prove the extension end-to-end.
3. Fix `instantiateStationArchetype()`'s `UG_SIDE_4TRACK` dispatch gap
   (Gap 6 above) — small, independent, zero risk.
4. Do **not** build the generic Platform renderer itself yet — a further
   batch once the extended Base Truth is proven by (1)-(3).
5. A real island seed (evidence-authored against a real NYC island
   station) can wait for STATION-07 if STATION-06 needs to stay smaller.

**Explicitly out of scope for STATION-06, per this task's own
boundary:** the Platform UI (detail/overview split), train movement,
doors, any change to the archived 2D/3D station-editor work, any
migration of the live `wall/` transit stack, and re-verifying
45th/53rd/77th St's calibration depth (Gap 7 — a separate, smaller
verification task if it becomes load-bearing).

## STATION-04 follow-up recon (not part of Base Truth, tracked here for visibility)

Both items from STATION-04's own report remain unchanged at `e029606`:

1. **`SubwayLineRibbon.showLineMode()` has no production trigger** — the
   MAP badge-row click handler that used to call it was removed in
   STATION-04 (`../subway/README.md` §15's own "Known gap" note).
   Recommended smallest resolution unchanged: a `postMessage` bridge from
   the Mezzanine Drawer's own route-badge click to
   `subwayMezzanineDrawer.js`. This is independent of the Base Truth work
   above and can be its own tiny corrective batch.
2. **The floating "BAY RIDGE AV STATION" top-chrome pill
   (`subwayStationCoverNavLink.js`) is now redundant** — still present,
   still hardcoded to R42 only, and the Mezzanine Drawer now opens
   automatically (and generically) on every MAP station selection.
   Recommended: retire it in the same tiny corrective batch as item 1,
   separate from STATION-06.

## Reconciliation with the architecture registry

Per `../README.md`'s own rule, this recon's findings are STATE/DEBT
candidates, not just analysis, where they describe what's genuinely true
today. This document itself is the reconciliation for now (a RECON/
PROPOSAL entry, per that file's own classification); `../subway/README.md`
and `../OWNERSHIP.md` are not modified in this batch since no code
changed and STATION-06 has not been approved — promoting these findings
into STATE proper is appropriate once STATION-06 actually lands.
