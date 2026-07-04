# 0610K_WOS_CompoundBuildingAuthority_v1.0.0_BUILD

## Purpose

Create a compound-building authoring layer for Map Lab so multiple Mapbox building features can be treated as one intentional WOS replacement target.

This fixes the current problem where a real-world building or landmark may be split into multiple Mapbox polygons, forcing manual per-piece replacement behavior.

## Assumptions

- Current Map Lab already supports building selection, replacement metadata, grouping, preview mode, and Wall projection.
- Current manifest key remains `localStorage["wos.maplab.buildings"]`.
- Existing `groups` remain supported.
- Compound buildings are a higher-level authoring object above groups.
- No Canvas or Glyph files are modified.

## Build Target

Add a new manifest authority:

```txt
Mapbox Feature → Building Group → Compound Building → Replacement Actor
```

Compound buildings allow named structures such as:

```txt
Castle Clinton
Statue of Liberty Base
Battery Tunnel Vent Complex
Pier Warehouse Cluster
```

to be edited as one replacement target.

---

## Required Files

### Modify

```txt
studio/mapLab/buildingEditRegistry.js
studio/mapLab/mapInspector.js
studio/mapLab/mapLabView.js
studio/mapLab/buildingPreviewRuntime.js
wall/systems/runtime/buildingReplacementRuntime.js
wall/systems/presentation/buildingEditProjectionRuntime.js
```

### Do Not Modify

```txt
Canvas files
Glyph files
wall/index.html
studio/index.html
buildingStyleKit.js
```

---

## Manifest Schema

Extend the existing manifest with top-level `compounds`.

```json
{
  "version": "1.0.0",
  "buildings": {},
  "groups": {},
  "compounds": {
    "compound_castle_clinton_001": {
      "id": "compound_castle_clinton_001",
      "name": "Castle Clinton",
      "kind": "landmark",
      "members": [
        "composite:building:956471671",
        "group_278053568_956471671"
      ],
      "replacement": {
        "enabled": true,
        "archetype": "civic-block",
        "label": "Civic Block",
        "style": "historic fort",
        "scale": 1,
        "heightMode": "inherit"
      },
      "geometry": {
        "source": "studio-maplab-compound",
        "centroid": { "lng": -74.014408, "lat": 40.701056 },
        "bounds": {
          "minLng": -74.0149,
          "maxLng": -74.0139,
          "minLat": 40.7008,
          "maxLat": 40.7013
        },
        "widthM": 80,
        "depthM": 52,
        "areaM2": 4160,
        "heading": 12,
        "memberCount": 3,
        "capturedAt": 1710000000000
      },
      "notes": "Battery landmark compound",
      "tags": ["landmark", "battery"]
    }
  }
}
```

Backward compatibility is mandatory:

```js
compounds = parsed.compounds && typeof parsed.compounds === 'object'
  ? parsed.compounds
  : {};
```

---

## Compound Rules

### Authority Priority

Runtime visual priority must be:

```txt
Compound actor
Group actor
Standalone building actor
Original Mapbox building
```

If a building belongs to an enabled compound, it must not spawn as a standalone replacement.

If a group belongs to an enabled compound, the group must not spawn as its own replacement actor.

### Member Types

A compound can contain:

```txt
building key: composite:building:123
 group id: group_123_456
```

Groups remain useful for joining two polygons into a clean substructure. Compounds are for naming and managing the whole structure.

### Deterministic IDs

Create compound IDs from a normalized name plus timestamp-safe suffix:

```js
compound_<slug>_<shortHash>
```

Example:

```txt
compound_castle_clinton_a93f2c
```

Do not use raw display names as object keys.

---

## Registry API

Add to `BuildingEditRegistry`:

```js
createCompound({ name, kind, members })
deleteCompound(compoundId)
getCompound(compoundId)
getCompounds()
findCompoundByMember(memberKeyOrGroupId)
addMemberToCompound(compoundId, memberKeyOrGroupId)
removeMemberFromCompound(compoundId, memberKeyOrGroupId)
setCompoundReplacement(compoundId, replacement)
setCompoundMeta(compoundId, { name, kind, notes, tags })
```

### Compound Geometry

Add `_computeCompoundGeometry(members)`.

It must combine geometry from:

- `buildings[key].geometry`
- `groups[groupId].geometry`

Use existing combined-bounds logic from groups, but include group geometries as valid geometry sources.

### Validation

- A compound needs at least 2 members.
- Invalid members are ignored.
- A compound with fewer than 2 valid members should not be created.
- Deleting a compound must not delete its buildings or groups.
- Removing a member that leaves fewer than 2 members should auto-delete the compound.

---

## Inspector UI

Add a new **Compound** section above Group.

### States

#### none

Show:

```txt
[Start Compound]
```

#### draft

Show:

```txt
Compound Draft: N part(s)
Name: [input]
Kind: [select]
[Add to Compound]
[Finish Compound]
[Cancel]
```

Kind options:

```txt
landmark
building
campus
pier
station
custom
```

#### member

Show:

```txt
Compound: <name>
Kind: <kind>
Members: N
[Ungroup Compound]
```

When a selected building belongs to a compound, the Replacement section title must become:

```txt
Compound Replacement
```

Replacement controls must edit the compound, not the building or group.

---

## MapLab View Wiring

Add compound draft state:

```js
var _compoundDraft = null;
```

Shape:

```js
{
  name: '',
  kind: 'custom',
  members: []
}
```

Add callbacks:

```js
_onStartCompound(memberKeyOrGroupId)
_onAddToCompound(memberKeyOrGroupId)
_onFinishCompound()
_onCancelCompound()
_onUngroupCompound(compoundId)
_onCompoundMetaChange(meta)
```

### Selection Membership Resolution

When a building is selected:

1. Resolve building key.
2. Check compound membership first.
3. If no compound, check group membership.
4. If no group, treat as standalone.

```js
compoundState > groupState > standalone
```

### Replacement Change Routing

`_onReplacementChange(replacement)` must route in this order:

```js
if selected member belongs to compound:
  registry.setCompoundReplacement(compoundId, replacement)
else if selected member belongs to group:
  registry.setGroupReplacement(groupId, replacement)
else:
  registry.set(key, { replacement })
```

---

## Preview Runtime

Update `buildingPreviewRuntime.js` collection order:

1. Build active compounds.
2. Mark compound member buildings and groups as claimed.
3. Build active groups not claimed by a compound.
4. Mark group member buildings as claimed.
5. Build standalone buildings not claimed by group or compound.

Pseudo:

```js
compoundClaimedBuildings = {}
compoundClaimedGroups = {}
groupClaimedBuildings = {}

for each active compound:
  generate compound preview actor
  mark all members claimed

for each active group:
  if compoundClaimedGroups[groupId] skip
  generate group preview actor
  mark group buildings claimed

for each active building:
  if compoundClaimedBuildings[key] skip
  if groupClaimedBuildings[key] skip
  generate standalone actor
```

### Preview Suppression

In preview mode, suppress originals for:

- all active compound member buildings
- all buildings inside active compound member groups
- all active group member buildings
- standalone replacements

Run footprint query expansion on compound geometry as Phase 3.

---

## Wall Replacement Runtime

Update `buildingReplacementRuntime.js` sync order:

```txt
compounds first
then groups
then standalone buildings
```

Actor IDs:

```txt
brep-compound:<compoundId>
brep-group:<groupId>
brep:<buildingKey>
```

Actor type:

```txt
building-compound-replacement
```

Group actors claimed by compounds must be despawned.

Standalone actors claimed by groups or compounds must be despawned.

### Debug

Add:

```js
_wos.debug.buildingReplacement.compoundStatus()
```

Returns:

```js
{
  compoundActorCount,
  groupActorCount,
  standaloneActorCount,
  skippedCompoundMemberCount,
  skippedCompoundGroupCount,
  skippedGroupedMemberCount,
  lastError
}
```

---

## Wall Projection Runtime

Update suppression authority:

### Suppression Passes

1. Standalone replacement IDs
2. Group member IDs
3. Compound member IDs
4. Compound member group building IDs
5. Footprint query expansion for standalone geometry
6. Group combined geometry query
7. Compound combined geometry query

Compound suppression must take priority over group and standalone suppression.

Add debug:

```js
_wos.debug.buildingEdits.compoundSuppressionStatus()
```

Returns:

```js
{
  compoundCount,
  compoundSuppressionIdCount,
  compoundFootprintSuppressionCount,
  suppressedCompoundIds,
  lastError
}
```

---

## Error Handling

Every compound path must be defensive:

- Missing `compounds` → `{}`
- Missing `members` → skip compound
- Missing geometry → skip actor but keep manifest valid
- Corrupt compound → warn and continue
- Unknown member type → ignore
- Duplicate member → dedupe
- Deleted group referenced by compound → ignore that member
- Deleted building referenced by compound → ignore that member

No compound error may block Map Lab, Wall, Preview, or existing group behavior.

---

## Acceptance Tests

### T1 — Backward Compatibility

Old manifests without `compounds` load and behave exactly as before.

### T2 — Create Compound

Selecting two or more buildings and finishing a compound creates one compound entry with combined geometry.

### T3 — Compound Replacement

Editing replacement controls while selecting a compound member updates the compound replacement, not the member building.

### T4 — Preview Parity

Preview mode shows one compound actor and suppresses all member originals.

### T5 — Wall Parity

Wall shows one compound actor after reload or storage sync.

### T6 — Group Inside Compound

A compound containing a group suppresses all group member originals and does not spawn the group actor separately.

### T7 — Standalone Skip

A building claimed by a compound does not spawn as a standalone replacement actor.

### T8 — Ungroup Compound

Deleting a compound restores prior group/standalone behavior without deleting underlying edits.

### T9 — Suppression Audit

`compoundSuppressionStatus()` reports compound suppression counts and no thrown errors.

### T10 — Debug Status

`compoundStatus()` returns correct actor counts and skipped counts.

### T11 — No Canvas / Glyph Changes

No Canvas or Glyph files modified.

---

## Implementation Guide

- **Where**: Implement compound schema/API in `studio/mapLab/buildingEditRegistry.js`; UI in `mapInspector.js`; selection/routing in `mapLabView.js`; preview rendering in `buildingPreviewRuntime.js`; Wall rendering in `buildingReplacementRuntime.js`; Wall suppression in `buildingEditProjectionRuntime.js`.
- **What**: Run local server, open Studio Map Lab, select multiple split building parts, create a compound, assign replacement, toggle Preview, then inspect Wall output.
- **Expect**: One named compound replacement actor renders in Studio Preview and Wall; original Mapbox member buildings are suppressed; groups and standalone replacements still work when not claimed by a compound.
