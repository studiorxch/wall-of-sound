# Detail View subject / station writable-surface architecture (recon)

STATION-09 — recon + architecture only. No Detail selection UI, no Canvas,
no BLACKBOOK integration, no Artwork creation, no persistence-schema change
was implemented in this batch. This document records what already exists,
what is genuinely missing, and a proposed (not yet built) contract.

## Why this exists

STATION-08 shipped Platform's permanent Detail View / Overview composition
with Detail View intentionally unresolved. Before building anything into
it, we need to know: what can Detail View represent, how is that subject
identified, and how does writability relate to observation/physical
accessibility? Our own Base Truth work already proved these are not the
same property (`StationWallSurface.adjacentTrackId`, STATION-06) — this
recon extends that same discipline to the Detail View question.

## A. Existing architecture inventory

**Station geometry (`music/src/data/stationGeometryTypes.ts`)**

- `StationWallSurface { id, levelId, localPolygon, label, suitableForArt: boolean, adjacentTrackId?: string, provenance }`
  — `suitableForArt` is already a direct writability signal. `adjacentTrackId`
  (STATION-06) already establishes that a wall can be a real, trackside,
  potentially-writable surface with **no** passenger-platform adjacency.
  There is **no symmetric field** for a platform-backing wall (no
  `adjacentPlatformId`) — only the trackside relationship is modeled today.
- `StationPlatform { id, levelId, footprint?, config: "island"|"side"|"unknown", servesRouteIds, provenance }`
  — no sub-surface/edge concept; a platform is one footprint, one id.
- `StationTrackCenterline { id, platformId, platformSide?: "A"|"B", role?, physicalRole?, operatingDirection?, localPoints?, provenance }`
  — `platformSide` (STATION-06) disambiguates an island platform's two
  track-facing edges without being a direction; `operatingDirection` is the
  one field that actually carries N/S-type direction, and it lives on the
  **track**, not the platform.
- `Provenance { source: "authority"|"reference"|"heuristic"|"authored"|"unknown", confidence?, sourceRef?, note? }`
  — five-way, no confidence rubric, used uniformly across all element types.
- `StationGeometryEvidenceConflict` — records disagreement between sources,
  never auto-resolves; a precedent for "record the fact, don't invent an
  answer," relevant to identity-splitting below.
- `StationGeometryData.id: StationGeometryId = \`stationGeometry:${gtfsStopId}\`` —
  the one canonical identity per station, deterministic from the real GTFS
  stop id.

**Element ids are role-based and deterministic, not random.** Both the
archetype generators (`stationArchetypeUndergroundSide2Track.ts` etc.) and
the real hand-authored seeds use the identical convention:
`platform:<idPrefix>:northbound`, `track:<idPrefix>:southbound`,
`level:<idPrefix>:mezzanine` — for Bay Ridge Av, `idPrefix = "R42"`
everywhere, whether the value was archetype-derived or hand-typed. This
means element identity is already stable across the generic→detailed
transition **as long as authoring reuses the existing id** (see §D).

**Real seeds that exist today:** Bay Ridge Av (R42), 45th St, 53rd St,
77th St (`stationGeometry{BayRidgeAv,45thStreet,53rdStreet,77thStreet}Seed.ts`).
**Bay Ridge Av's `wallSurfaces` array is currently empty** — no wall has
ever been authored for any real station. Scenario A below is therefore a
"not yet authored" case, not an "already modeled, just unselected" case.

**`stationGeometryRegistry.ts`** (STATION-08) — a plain `gtfsStopId ->
builder` map, `null` for anything unregistered, never a fallback. Only R42
is registered.

**StationGeometryEditor (`music/src/ui/maps/StationGeometryEditor.tsx`)** —
V0, single-station (Bay Ridge Av only), edits **only the two side-platform
footprints** (vertex add/move/remove), via `SelectedVertex = { platformId,
index }` — i.e. selection-by-platform-id already exists in this editor,
just not for walls or tracks. Persists to `MUSIC_STATION_GEOMETRY_DB`
(**IndexedDB, browser-local, never Firestore, never synced to `wall/`** —
`docs/architecture/subway/README.md` §8). Reached via an isolated
`#stationGeometryEditor` hash route, no production navigation coupling —
the established precedent STATION-07/08's own debug entry points followed.

**STATION-05's own recon** (§F, already written) already answered part of
the facelift question: "generic → detailed" is the **same record, same
id**, fields overwritten in place, `provenance.source` upgraded
heuristic → reference/authored, `version`/`updatedAt` bumped. No new
station identity is ever created. This recon extends that same claim down
to individual platform/wall/track ids (see §D).

**BLACKBOOK (`docs/architecture/blackbook/README.md`, `music/src/member/`)**

- **Workspace** = open authoring backdrop, never persisted, never Artwork.
- **Artwork** = authored Marks (`shared/member-identity/src/data/artworkTypes.ts`):
  `Artwork { id, creatorId, surfaceId: string, artworkType: "map"|"blank", composition, marks, state, visibility, pageFrame? }`.
  Identity is `surfaceId`, an **opaque string pointer** the Artwork does not
  interpret — `blackbook:studio-rich-main:page:page-1` for the one hardcoded
  Blackbook page, `map:new-york` (`SUBWAY_MAP_SURFACE_ID`) for MAP's free
  paint surface. Artwork never owns or defines what the surface physically
  is; it only names it.
- **Artboard** = the finite presentation/export region (`PageFrame`), purely
  presentational, independent of Marks and Workspace.
- **WALL**, per `blackbook/README.md` §1, is explicitly **not** a universal
  abstraction: it names `wall/`'s own runtime/product surface (increasingly
  "a public/map-associated writable location"), a sibling concept to
  BLACKBOOK, not a parent of it. This recon does not reuse "Wall" as the
  station-surface abstraction, consistent with that boundary.

**A second, already-built, structurally-independent precedent exists:
member-authored car-surface graffiti** (`subway/README.md` §8/§11,
`music/src/data/subwayRollingStockAdminTypes.ts`), explicitly **separate**
storage/identity from BLACKBOOK's Firestore `artworks`:
```ts
interface Artwork { id, creatorType, creatorId, title, sourceType, sourceRef, status, metadata }
type PlacementTargetType = "route" | "route_family" | "logical_train" | "logical_consist" | "logical_car" | "surface"
interface ArtworkPlacement {
  id, artworkId, targetType: PlacementTargetType, targetId,
  routeId, logicalTrainId, consistId, logicalCarId, surfaceId,
  startedAt, endedAt: number | null, placementState, layerIndex, ...
}
```
This is the codebase's own working answer to "how does Artwork attach to an
external subject without owning its identity": a separate, append-only,
never-deleted **Placement** join record (`targetType` + `targetId`),
structurally distinct from the Artwork itself. `subway/README.md` §11 is
explicit that this car-surface path and BLACKBOOK/MAP-paint's direct
`surfaceId` path are **two disjoint systems with zero current bridge**, by
design — "do not merge them."

**STATION-07's projection already carries identity through, unowned.**
`StationTopologyInput`'s platform/track/wall arrays are the real
`StationGeometryData` element types; every output `TopologyLane.id` is the
source element's own `id`, copied verbatim (`platform.id`, `track.id`,
`wall.id` — never rehashed/regenerated). The SVG renderer already emits
`data-lane-id="${lane.id}"` (plus `data-lane-kind`) on every drawn element —
this is already a stable, DOM-addressable, canonical-id-carrying attribute,
today unused by any click handler. Both `projectStationTopology` and
`renderStationTopologySvg` are pure functions with no cache, no module
state, no identity of their own to own.

## B. Gap analysis

Genuinely missing:

1. **No symmetric wall→platform adjacency field.** `adjacentTrackId` lets a
   wall declare "I face this track" (trackside case). Nothing lets a wall
   declare "I sit behind this platform" (platform-backing case) — so even
   once Bay Ridge Av gets real wall surfaces, "is this wall passenger-
   accessible" cannot be derived purely from existing fields; it would need
   either a new `adjacentPlatformId`-shaped field or an explicit
   `passengerAccessible` fact, authored directly.
2. **No reference/envelope type connecting "a click in the Overview" to "a
   canonical station element."** `data-lane-id` already carries the right
   value; nothing resolves it into a typed reference today.
3. **No target-type value for station elements in any Placement-shaped
   system.** `PlacementTargetType` (car-surface family) has no
   `"stationWallSurface"`/`"stationPlatform"` member; BLACKBOOK's `surfaceId`
   convention has no station-element case either.
4. **No `observable` / `passengerAccessible` stored facts anywhere** — only
   `suitableForArt` (writability) is explicit.
5. **No id-continuity rule written down** for what happens if a future
   detailed re-survey needs to **split** one generic wall into two real
   ones (STATION-05's §F only covers field-level refinement of an existing
   id, not structural splits — flagged, not solved, in §D below).

Already sufficient, needs no new schema:

- Element identity itself (role-based, deterministic, stable across
  provenance upgrades).
- The pure, identity-preserving projection/renderer pipeline.
- `suitableForArt` as the writability signal.
- `adjacentTrackId` as the non-accessibility signal for the trackside case.
- The `ArtworkPlacement`-shaped join pattern as a structural precedent,
  proven in production-adjacent code, for "Artwork references an external
  subject it doesn't own."

## C. Recommended Detail View subject/reference contract

A minimal, additive reference type — working name only, not adopted as
final: `StationDetailSubjectRef`.

```ts
export type StationDetailSubjectKind = "platform" | "wallSurface" | "trackCenterline";

export interface StationDetailSubjectRef {
  readonly stationGeometryId: StationGeometryId; // e.g. "stationGeometry:R42"
  readonly subjectKind: StationDetailSubjectKind;
  readonly subjectId: string; // the element's own existing `id`, unmodified
}
```

Relationship diagram:

```
Base Truth (StationGeometryData: platforms/wallSurfaces/trackCenterlines, each with a stable .id)
    |
    v
projectStationTopology()  — pure, copies .id into each TopologyLane
    |
    v
renderStationTopologySvg() — pure, emits data-lane-id="<id>" per shape
    |
    v
(future) Overview click handler reads event.target.closest('[data-lane-id]')
    |
    v
resolves StationDetailSubjectRef { stationGeometryId, subjectKind, subjectId }
    |
    v
Detail View consumes the REF, re-reads the REAL element from Base Truth
by (kind, id) — never trusts the SVG's own drawn geometry as content
```

Nothing here creates parallel station truth: the ref is a pointer triple,
resolved back into the same `StationGeometryData` Platform's own work
already established as canonical. The projection/renderer remain exactly
as archetype-blind and provenance-blind as STATION-07 proved; adding
`data-lane-id`-based resolution does not change that contract (see the
STATION-07 projection-identity finding above — `.id` is an opaque
pass-through field, structurally identical to `.label`, never a branch
condition).

## D. Identity/facelift analysis

- Surface identity for an **existing** platform/wall/track is already
  canonical and stable: ids are deterministic role-based strings
  (`platform:R42:northbound`), not archetype-instance-random, and
  STATION-05's own §F already established that a generic→detailed upgrade
  overwrites fields on the **same record with the same id** — confirmed
  consistent with how all four real seeds were actually built.
- A `StationDetailSubjectRef` that names `(stationGeometryId, subjectKind,
  subjectId)` therefore survives a facelift automatically, with zero
  migration: any future Artwork Placement keyed by that same triple keeps
  resolving correctly the moment the underlying record's provenance moves
  heuristic → authored, because the id itself never changes.
- **Caveat, not yet solved:** this only holds when authoring genuinely
  *refines* an existing element. A wall surface authored for Bay Ridge Av
  for the first time (today: zero exist) has no prior id to preserve — it's
  an addition, not an upgrade, and no prior Artwork could have referenced
  it. A future re-survey that discovers one generic wall was actually two
  physically distinct walls (a structural split, not a refinement) is a
  real, currently-unaddressed case — recommend it follow the same
  discipline `StationGeometryEvidenceConflict` already uses (record the
  fact explicitly, e.g. a future `supersedes`/`supersededBy` pointer,
  never silently reassign or delete), but do not design that mechanism now.
- This confirms the recon's own premise: **logical surface identity
  (the id string) and representation geometry (footprint/localPolygon
  value) are already distinct concepts** in the schema — the only thing
  this recon adds is naming that distinction as a rule authors and future
  Placement records must rely on, not a schema change.

## E. Observation / writability / accessibility model

These are **not** currently modeled as three independent stored facts, and
should not all become stored booleans:

| Property | Where it lives today | Status |
|---|---|---|
| Writable (digital) | `StationWallSurface.suitableForArt: boolean` | **Explicit, authored fact.** Keep as-is. |
| Trackside (no platform adjacency) | `StationWallSurface.adjacentTrackId?: string` | **Explicit, authored fact** (STATION-06). The one existing building block for "not passenger-accessible." |
| Platform-backing adjacency | — | **Missing.** No field exists; needed before "passenger-accessible wall" can be derived rather than guessed. |
| Observable | — | **Not modeled; should stay derived**, not authored — e.g. "adjacent to any track with a real train service" is closer to a runtime/derived fact than a structural Base Truth fact. Recommend computing it, never storing it, consistent with the existing door-side-derivation precedent (STATION-06: derive, don't encode). |
| Passenger accessible | — | **Not modeled; should be derived** once a platform-adjacency field exists, same reasoning as Observable. |

Recommendation: `writable` stays a stored, authored fact (`suitableForArt`)
because it is a genuine editorial/curation decision a human makes, not a
geometric consequence. `observable` and `passengerAccessible` should be
**derived** from structural relationships (level/adjacency/track-service),
matching how `platformSide -> door side` was deliberately left as a future
presentation-layer computation rather than encoded fact in STATION-06.

## F. Overview → Detail selection flow

Layer that owns identity, end to end:

1. **Base Truth** (`StationGeometryData`) owns the only real identity —
   every `.id` field.
2. **Projection** (`stationTopologyProjection.ts`) owns nothing; it is a
   pure, stateless copy that preserves identity without interpreting it.
3. **Renderer** (`stationTopologySvgRenderer.ts`) owns nothing; it already
   exposes identity via `data-lane-id`, purely as an echo.
4. **Selectable representation** (the rendered SVG, live in the DOM) is
   where a user interaction (click) originates — it must never become the
   identity itself; it only carries the `data-lane-id` needed to resolve one.
5. **Canonical subject reference** (`StationDetailSubjectRef`, proposed) is
   constructed by a (future, not-yet-built) resolver that reads
   `data-lane-id` off the clicked element and re-associates it with
   `(stationGeometryId, subjectKind, subjectId)`.
6. **Detail View** consumes the reference only — it re-reads the real
   Platform/WallSurface/TrackCenterline record from Base Truth by id,
   never treats the SVG's drawn shape as authoritative content.

This is the "Base Truth → projection → selectable representation →
canonical subject reference" ordering the task specified, not "SVG element
becomes permanent artwork identity."

## G. BLACKBOOK integration boundary (not implemented)

- **Owns the subject:** Station Base Truth (`stationGeometryTypes.ts`) —
  unchanged by this recon.
- **Owns Artwork:** either BLACKBOOK's shared Artwork family
  (`artworkTypes.ts`, Firestore `artworks`) or a third, SUBWAY-scoped family
  mirroring the car-surface graffiti system (`SubwayArtworkAuthority`) —
  **this recon does not resolve which**, see recommendation below.
- **What would associate them:** a Placement-shaped join record, structurally
  parallel to the existing `ArtworkPlacement` (car-surface family):
  `targetType` gains new values (`"stationWallSurface"`, `"stationPlatform"`)
  and `targetId` becomes the element's own stable `id`. This requires no
  change to `StationWallSurface`/`StationPlatform` themselves and no change
  to `Artwork`'s own shape in either family — it is a genuinely additive
  join, not a modification of either existing owner.
- **Does current persistence support it?** Not today (no matching
  `targetType` value exists), but the shape is proven low-risk to extend —
  this is exactly the kind of additive change the car-surface family's own
  append-only, never-delete placement history was designed to absorb.
- **Reuse without moving ownership:** the car-surface precedent already
  proves this works — it reuses BLACKBOOK's shared Art Supply set
  (`artSupplyTypes.ts`) for drawing tools while keeping its own, entirely
  separate artwork/placement identity and storage. The same pattern would
  let station wall surfaces reuse BLACKBOOK's drawing tools without
  BLACKBOOK's Firestore `artworks` collection ever needing to know what a
  `StationWallSurface` is. Recommend following the **car-surface precedent**
  (separate Placement join, shared tools only) rather than BLACKBOOK's
  direct `surfaceId` convention (where the Artwork document IS the whole
  addressable surface) — a station wall is observable/physical in a way
  closer to "a car's exterior panel" than to "a Blackbook page."

## H. Five validation scenarios

**A — Bay Ridge side-platform wall.** Not yet authorable today: Bay Ridge
Av's `wallSurfaces` is empty. Once authored (following the existing
`platform:R42:northbound`-style convention, e.g. `wall:R42:northbound`),
it would carry `suitableForArt: true`, no `adjacentTrackId` (platform-
backing, not trackside), and resolve to
`{ stationGeometryId: "stationGeometry:R42", subjectKind: "wallSurface", subjectId: "wall:R42:northbound" }`.
Its passenger-accessibility cannot yet be derived (§B gap 1) — would need
to be authored explicitly until a platform-adjacency field exists.

**B — Island station outer wall.** `adjacentTrackId` set, no platform
relationship of any kind. `suitableForArt` can independently be `true`.
Resolves to the same ref shape, `subjectKind: "wallSurface"`. Passenger-
accessible derives to `false` (no adjacent platform); observable derives
from the adjacent track's own service presence, independent of both facts —
proving the three properties are genuinely independent here, exactly as
the task's own example anticipated.

**C — Island platform, two track edges.** One `StationPlatform.id`, two
`StationTrackCenterline` records each with a distinct `platformSide` ("A"/
"B") but the same `platformId`. Selecting "northbound" vs "southbound"
resolves to different tracks, never a different platform id — the
`StationDetailSubjectRef` for the platform itself is identical regardless
of which direction was active when it was selected, consistent with
`platformSide`'s own STATION-06 doc comment ("no claim about ... which
side a train's doors will eventually open on").

**D — Generic → detailed facelift.** Per §D: same `StationGeometryData.id`,
same element `.id`s, fields overwritten in place, provenance upgraded. Any
`StationDetailSubjectRef`/Placement keyed by the stable element id survives
automatically — no migration needed, confirmed by STATION-05's own already-
written §F and the real seed authoring pattern already used four times.

**E — Future train.** Already has its own, fully separate identity family
today: `LogicalCar` → `CarSurface` (`exterior_side_a` etc.) →
`ArtworkPlacement { targetType: "surface", targetId: CarSurface.id }`. A
future "click a moving train in Overview" would construct a *different*
presentation reference (say `{ subjectKind: "carSurface", subjectId:
CarSurface.id }`) resolved via `SubwayCarSurfaceAuthority`, not Station
Base Truth — proving a shared Detail View *presentation* envelope
(`subjectKind` + `subjectId`, loosely) can accept a non-station subject
without renaming/rebuilding, while station geometry and rolling stock keep
using two disjoint domain-identity systems, exactly the boundary
`subway/README.md` §11 already documents and requires ("do not merge
them").

## I. Recommendation for STATION-10 (smallest next batch — not started)

1. Add `StationDetailSubjectRef` (or whatever name survives review) as a
   small, additive TS type — no behavior change, no UI.
2. Wire one **read-only** click handler in Platform's existing Overview SVG
   that reads `data-lane-id`, resolves a `StationDetailSubjectRef` against
   the already-loaded `StationGeometryData`, and displays it as plain
   text/JSON inside the still-unresolved Detail View region — proving the
   resolution path end-to-end without adding a Canvas, without making
   anything writable, without touching BLACKBOOK.
3. Separately (can run before, after, or alongside #1-2): author Bay Ridge
   Av's first real `wallSurfaces` records (the two platform-backing walls,
   `suitableForArt` values TBD by product decision), since Scenario A is
   currently impossible to demonstrate against real data — this is itself
   a "detailed" authoring pass STATION-05's §F already describes, not new
   architecture.
4. Do **not** add the `adjacentPlatformId`-style symmetric field, the
   `observable`/`passengerAccessible` derivation logic, the Placement join
   record, or any BLACKBOOK wiring yet — each is its own, still-undecided
   batch this recon deliberately leaves open.

## Scope note

RECON ONLY, as instructed. No Detail selection, Canvas, BLACKBOOK
integration, Artwork creation, persistence-schema change, train/door work,
N/S toggle, or production/Firebase change was made in this batch.
