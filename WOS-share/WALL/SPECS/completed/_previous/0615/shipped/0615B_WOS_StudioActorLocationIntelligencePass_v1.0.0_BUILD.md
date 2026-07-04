# 0615B_WOS_StudioActorLocationIntelligencePass_v1.0.0_BUILD

## Status

BUILD

## Classification

studio-authoring-map  
actor-location-intelligence  
post-phase-8-validation-cleanup  
no-runtime-contract-change

---

# Purpose

Give every placed Studio actor a human-readable map location.

The current 3D Canvas actor system stores coordinates, but coordinates are not enough for authoring. Authors need to know where an actor is in real-world map language:

```txt
actor.anchor.lat/lon
→ readable geography
→ borough / neighborhood / road / nearby feature
→ searchable Library row
→ Inspector location section
→ selected marker label
```

This pass does **not** make final 3D object authoring complete. It closes the missing map-awareness layer required before true 3D object placement becomes usable.

---

# Problem

The 0615 Actor Map Readability Pass made actors easier to focus and filter, but it did not answer the actual authoring question:

```txt
Where is this actor?
```

Current actor rows expose:

```txt
assetId
actorCategory
actorType
lat/lon
short objectId
```

But they do not expose:

```txt
street
borough
neighborhood
nearest road
nearest park / pier / waterfront / landmark
nearest building
```

This means the author can focus a dot, but cannot understand its map context.

---

# Locked Diagnosis

The current issue is not only visual clutter.

The deeper issue is:

```txt
Actors have coordinates, but no human-readable geography.
```

This pass makes Studio actors geographically intelligible.

---

# Scope

## In Scope

1. Add actor location resolution from actor anchor coordinates.
2. Query Mapbox rendered features around actor location.
3. Infer readable location metadata.
4. Cache location summaries for the authoring session.
5. Show readable location in Library actor rows.
6. Show readable location in Inspector.
7. Make Library search match location text.
8. Update selected actor marker labels with location context.
9. Add debug snapshot for actor location resolution.

## Out of Scope

1. Reverse geocoding API calls.
2. Network geocoding dependency.
3. Persisting street/neighborhood into WOSActorManifest.
4. Wall runtime changes.
5. Publish bundle changes.
6. Promotion Gate changes.
7. Schema changes.
8. New Mapbox token work.
9. 3D GLB loading improvements.
10. Per-building address authority.

---

# Non-Goals

This pass does **not** solve final 3D authoring.

It does not yet guarantee:

```txt
large visible GLB object
precise 3D transform workflow
building-level replacement UX polish
asset scale normalization
production Wall visual parity
```

Those come after Studio can answer where placed actors are.

---

# New Module

## `studio/views/actorLocationResolver.js`

### Responsibility

Resolve a placed actor’s coordinates into readable map context using the currently loaded Studio Mapbox map.

### Public API

```js
WOSActorLocationResolver.init(map, store)
WOSActorLocationResolver.resolveActor(actorOrObjectId, options?)
WOSActorLocationResolver.resolvePoint(lat, lon, options?)
WOSActorLocationResolver.get(objectId)
WOSActorLocationResolver.clear(objectId?)
WOSActorLocationResolver.resync()
WOSActorLocationResolver.debugSnapshot()
```

### Does Own

```txt
Mapbox rendered feature query around actor anchor
location summary generation
session cache
location search text
location debug state
```

### Does Not Own

```txt
actor selection
actor placement
manifest persistence
promotion state
publishing
Wall runtime loading
Mapbox style authority
```

---

# Location Result Shape

```ts
interface WOSActorLocationSummary {
  objectId?: string;
  resolvedAt: string;
  lat: number;
  lon: number;

  borough?: string | null;
  neighborhood?: string | null;
  locality?: string | null;
  nearestRoad?: string | null;
  nearestPlace?: string | null;
  nearestBuildingName?: string | null;
  waterbody?: string | null;
  landmark?: string | null;

  summary: string;
  shortLabel: string;
  searchText: string;

  confidence: "high" | "medium" | "low" | "unknown";
  source: "rendered-features" | "fallback-coordinates";

  rawFeatureCount: number;
}
```

Example:

```js
{
  objectId: "ef5ef27c-...",
  resolvedAt: "2026-06-15T12:34:00.000Z",
  lat: 40.7083,
  lon: -74.0439,
  borough: "Manhattan",
  neighborhood: "Battery Park City",
  nearestRoad: "West Street",
  nearestPlace: "Battery Park",
  waterbody: "Hudson River",
  summary: "Battery Park City, Manhattan · near West Street",
  shortLabel: "Battery Park City",
  searchText: "battery park city manhattan west street battery park hudson river 40.7083 -74.0439",
  confidence: "medium",
  source: "rendered-features",
  rawFeatureCount: 14
}
```

---

# Resolution Strategy

## Primary Strategy — Rendered Feature Query

Use the current Studio Mapbox map.

```js
const point = map.project([actor.anchor.lon, actor.anchor.lat]);
const features = map.queryRenderedFeatures([
  [point.x - radiusPx, point.y - radiusPx],
  [point.x + radiusPx, point.y + radiusPx]
]);
```

Default radius:

```txt
24px
```

Fallback radius if no useful result:

```txt
64px
```

## Preferred Feature Types

Feature properties should be scanned for useful name/context fields.

Priority order:

```txt
1. place / locality / borough / district labels
2. neighborhood labels
3. road / street labels
4. park / landmark / POI labels
5. building names
6. water labels
7. fallback coordinates
```

The resolver must tolerate style differences. It must not assume one exact Mapbox layer ID.

## Useful Property Keys

Scan feature properties for:

```txt
name
name_en
class
type
maki
category
structure
iso_3166_2
```

Also inspect layer IDs for hints:

```txt
road
street
place
settlement
poi
transit
water
building
landuse
park
```

---

# Borough / Neighborhood Handling

## Phase 1 Rule

Do not require perfect borough resolution.

If a borough is not available from rendered features, leave it null and produce a lower-confidence summary.

## NYC Heuristic Optional

A small Manhattan/Brooklyn/Queens/Bronx/Staten Island heuristic may be added only as advisory fallback if it is clearly marked as heuristic.

Do not persist heuristic borough truth.

---

# Cache Rules

Location summaries are authoring-session cache only.

```txt
Do not write location summaries into WOSActorManifest.
Do not publish location summaries to Wall.
Do not add location fields to registry.
```

Cache invalidation:

```txt
actor placed → resolve
actor moved/committed → re-resolve
actor heading changed only → no re-resolve needed
actor deleted → clear cache
map style changes → resync visible actors after style idle
manual resync → resolve all actors
```

---

# ThreeDCanvasView Integration

Update:

```txt
studio/views/threeDCanvasView.js
```

## On Map Load

Initialize resolver after Mapbox load:

```js
if (global.WOSActorLocationResolver) {
  global.WOSActorLocationResolver.init(_map, _store());
  global.WOSActorLocationResolver.resync();
}
```

## On Actor Place

After placing actor:

```js
WOSActorLocationResolver.resolveActor(result.manifest);
```

## On Actor Move Commit

After final anchor commit:

```js
WOSActorLocationResolver.resolveActor(actor);
```

## On Actor Remove

```js
WOSActorLocationResolver.clear(ev.objectId);
```

## On Style Change

After style reload / authoring view toggle:

```js
map.once('idle', function () {
  WOSActorLocationResolver.resync();
});
```

---

# StudioShell Integration

Update:

```txt
studio/studioShell.js
```

## Library Actor Rows

Actor rows should show readable location below the asset/type line.

Current row:

```txt
Generic Vessel
prop · custom · asset://marine/vessel_generic
40.7083, -74.0439 #a32f91
```

New row:

```txt
Generic Vessel
prop · custom · asset://marine/vessel_generic
Battery Park City, Manhattan · near West Street
40.7083, -74.0439 · #a32f91
```

If unresolved:

```txt
Location resolving…
```

If no features found:

```txt
40.7083, -74.0439 · location unknown
```

## Inspector Location Section

Add read-only section after Identity or before Properties:

```txt
LOCATION
Summary: Battery Park City, Manhattan · near West Street
Borough: Manhattan
Neighborhood: Battery Park City
Nearest Road: West Street
Nearest Place: Battery Park
Waterbody: Hudson River
Coordinates: 40.7083, -74.0439
Confidence: medium
```

## Search

Library search must include location summaries.

Search examples that should work:

```txt
battery
manhattan
west street
hudson
pier
brooklyn
```

---

# LibraryController Integration

Update:

```txt
studio/views/libraryController.js
```

`filterActors()` should include resolver search text.

```js
const loc = WOSActorLocationResolver && WOSActorLocationResolver.get(a.objectId);
const locationText = loc ? loc.searchText : "";
```

Then match query against:

```txt
assetId
actorCategory
actorType
displayLabel
objectId
location searchText
```

---

# Marker Label Integration

Selected actor marker label should prefer:

```txt
displayLabel
short location label
assetId
```

For selected actors, label may show two lines:

```txt
Generic Vessel
Battery Park City
```

For unselected actors, keep labels conservative to avoid clutter.

---

# Debug API

Expose:

```js
WOSActorLocationResolver.debugSnapshot()
```

Example:

```js
{
  ready: true,
  cachedCount: 5,
  unresolvedCount: 1,
  lastResolvedAt: "2026-06-15T12:34:00.000Z",
  actors: [
    {
      objectId: "...",
      summary: "Battery Park City, Manhattan · near West Street",
      confidence: "medium",
      rawFeatureCount: 14
    }
  ]
}
```

Also add convenience debug:

```js
_wos.debug.studio.actorLocations()
```

Returns the same snapshot if possible.

---

# UI Text Rules

Use map language, not database language.

Good:

```txt
Battery Park City, Manhattan · near West Street
Near Battery Park
Location unknown
Resolving location…
```

Avoid:

```txt
feature count 12
layer id road-label
source composite
queryRenderedFeatures result
```

Raw details belong in debug only.

---

# Acceptance Criteria

## AC1 — Actor location resolver loads

Given Studio loads the 3D Canvas:

```txt
WOSActorLocationResolver exists
Resolver initializes with the 3D Canvas Mapbox map
No new Mapbox instance is created
```

## AC2 — Placed actor receives location summary

Given an actor is placed on the map:

```txt
Resolver produces a WOSActorLocationSummary
Summary contains either readable map text or fallback coordinates
No manifest fields are added
```

## AC3 — Library row shows readable location

Given a placed actor exists:

```txt
Library actor row shows readable location text under actor metadata
```

## AC4 — Inspector shows Location section

Given an actor is selected:

```txt
Inspector shows LOCATION section with summary, coordinates, confidence, and available geography fields
```

## AC5 — Search by place

Given an actor resolved near a road/place/neighborhood:

```txt
Searching the Library by that location text returns the actor row
```

## AC6 — Move commit re-resolves location

Given an actor is moved with the gizmo:

```txt
Location summary updates after commit
Library row updates
Inspector location section updates
```

## AC7 — Style toggle does not lose location intelligence

Given Authoring View changes Mapbox style:

```txt
Resolver resyncs after map idle
Actor rows regain location summaries
No actor manifests mutate
```

## AC8 — Marker label improves selected actor context

Given an actor is selected:

```txt
Selected marker label includes either displayLabel or short location label
```

## AC9 — No runtime/publish/schema changes

Confirm:

```txt
No WOSActorManifest schema changes
No Promotion Gate changes
No Wall runtime changes
No publish bundle changes
No localStorage writes for location summaries
```

## AC10 — Debug snapshot

Given actors have been placed:

```js
WOSActorLocationResolver.debugSnapshot()
```

returns cached location summaries and counts.

---

# Manual Test Plan

1. Open Studio → 3D Canvas.
2. Toggle Authoring View if needed.
3. Place one actor near Battery Park / Financial District.
4. Confirm Library row shows readable location.
5. Select actor.
6. Confirm Inspector LOCATION section appears.
7. Search Library for part of the location, such as `battery`, `manhattan`, or `west`.
8. Move actor several blocks.
9. Confirm location text changes after move commit.
10. Toggle Authoring View style.
11. Confirm resolver resyncs and location text returns.
12. Publish Actors.
13. Confirm published bundle does not include location summaries.

---

# Ship Gate

This pass ships when the author can place actors and answer:

```txt
Where is this actor?
What neighborhood or place is it near?
What road or visible map feature is nearby?
Can I search for it by location?
```

Minimum acceptable result:

```txt
Place 5 actors
→ each Library row shows readable map context or coordinates fallback
→ each selected Inspector shows LOCATION
→ search by visible location text finds the actor
→ no manifest or Wall bundle changes
```

---

# Final Lock

```txt
0615 Actor Location Intelligence does not make actors more 3D.
It makes placed actors geographically understandable.

3D object visibility and direct 3D manipulation come next.
```

Next expected pass after this:

```txt
0615_WOS_StudioAuthoringMapSurface_v1.0.0_BUILD
```

Then:

```txt
0615_WOS_3DAssetVisualAuthoringPass_v1.0.0_BUILD
```
