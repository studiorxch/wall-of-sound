# 0610J_WOS_ReplacementBuildingGroupAuthority_v1.0.0_BUILD

Stage: [BUILD]

---

## Purpose

Treat multiple Mapbox building features as one replacement target.

Current issue:

```txt
one visible building
=
multiple selectable Mapbox features / blocks
```

The user can select both blocks and assign both as skyscrapers, but the system still treats them as separate replacement records.

Target:

```txt
feature A + feature B
→ one Building Replacement Group
→ one replacement actor
→ all original source parts suppressed
```

---

## Core Rule

A replacement target may contain more than one source building feature.

```txt
single replacement group
→ multiple source features
→ one replacement actor
```

---

## Scope

### In Scope

- Add building replacement grouping to Map Lab.
- Allow selected building features to be grouped.
- Persist group metadata.
- Use group geometry for replacement footprint.
- Suppress all member source features.
- Render one replacement actor per group.
- Preserve existing single-feature replacement flow.
- Add debug/status APIs.

### Out of Scope

- No new visual archetypes.
- No material changes.
- No Canvas changes.
- No Glyph changes.
- No GLTF/model imports.
- No source geometry mutation.
- No destructive Mapbox edits.

---

## Files

### Primary Modify

```txt
studio/mapLab/buildingEditRegistry.js
studio/mapLab/mapLabView.js
studio/mapLab/mapInspector.js
studio/mapLab/buildingPreviewRuntime.js
wall/systems/runtime/buildingReplacementRuntime.js
wall/systems/presentation/buildingEditProjectionRuntime.js
```

### Optional New File

```txt
studio/mapLab/buildingGroupAuthority.js
```

### Do Not Modify

```txt
wall/index.html
wall/main.js
studio/canvasLab/*
wall/ui/glyphDrawer.js
wall/ui/symbolDrawer.js
```

unless absolutely required.

---

## Manifest Schema Addition

Add optional top-level groups collection:

```json
{
  "version": "1.0.0",
  "buildings": {},
  "groups": {
    "group_278053568_956471671": {
      "id": "group_278053568_956471671",
      "members": [
        "composite:building:278053568",
        "composite:building:956471671"
      ],
      "replacement": {
        "enabled": true,
        "archetype": "skyscraper",
        "label": "Skyscraper",
        "style": "",
        "scale": 1,
        "heightMode": "tall"
      },
      "geometry": {
        "source": "studio-maplab-group",
        "centroid": { "lng": -74.014, "lat": 40.701 },
        "bounds": {},
        "widthM": 80,
        "depthM": 40,
        "areaM2": 3200,
        "heading": 72,
        "memberCount": 2,
        "capturedAt": 1710000000000
      },
      "notes": "",
      "tags": []
    }
  }
}
```

Backward compatible:

```txt
manifests without groups continue to work
single-feature replacement records continue to work
```

---

## Group Identity

Group IDs must be deterministic from sorted member keys:

```txt
same members
→ same group id
```

Preferred:

```js
group_<stable_hash_of_sorted_member_keys>
```

Acceptable:

```js
group_278053568_956471671
```

---

## Minimal Group UX

When one building is selected:

```txt
[Start Group]
```

When group draft exists and another building is selected:

```txt
[Add to Group]
[Finish Group]
[Cancel Group]
```

After group exists:

```txt
Group: 2 parts
[Ungroup]
```

No complex grouping UI in this pass.

---

## Group Editing Behavior

When group is active:

```txt
replacement controls edit the group
```

Not each individual member.

If group replacement exists:

```txt
member replacement settings must not spawn separate actors
```

The group owns replacement output.

---

## Suppression Rules

For a group:

```txt
suppress every member feature key
suppress every footprint-query candidate from every member geometry
suppress any source building candidate inside group geometry
```

This must apply to:

```txt
Studio Preview
Wall Runtime
```

---

## Replacement Actor Rules

For a group:

```txt
one group → one replacement actor
```

Actor ID:

```txt
replacement-group:<groupId>
```

Actor geometry:

```txt
group.geometry
```

Actor replacement metadata:

```txt
group.replacement
```

Do not spawn replacement actors for grouped member records.

---

## Group Geometry Rules

Group geometry is derived from member geometries.

Required:

- Combined bounds of all member geometries
- Combined centroid
- Combined width/depth
- Combined area
- Heading from dominant/longest member or combined longest edge

Acceptable initial strategy:

```txt
combined axis-aligned bounds + dominant heading
```

Do not over-engineer polygon union in this pass.

---

## Registry Functions

Add:

```js
createGroup(memberKeys)
addMemberToGroup(groupId, memberKey)
removeMemberFromGroup(groupId, memberKey)
deleteGroup(groupId)
getGroup(groupId)
getGroups()
findGroupByMember(memberKey)
```

All must be safe against corrupt or missing group data.

---

## Runtime Resolution Priority

Replacement runtime should resolve in this order:

```txt
1. groups with replacement.enabled
2. ungrouped building edits with replacement.enabled
```

If a building key belongs to a group:

```txt
skip standalone actor
```

---

## Studio Preview Resolution Priority

Same as Wall:

```txt
groups first
ungrouped building edits second
```

Studio Preview must match Wall.

---

## Debug APIs

### Studio

```js
window.WOSMapLab.groupStatus()
```

Returns:

```js
{
  groupCount: 1,
  activeGroupId: "group_278053568_956471671",
  activeMemberCount: 2,
  groupedMemberCount: 2,
  ungroupedReplacementCount: 1,
  lastError: null
}
```

### Wall

```js
_wos.debug.buildingReplacement.groupStatus()
```

Returns:

```js
{
  groupActorCount: 1,
  standaloneActorCount: 2,
  skippedGroupedMemberCount: 2,
  lastError: null
}
```

---

## Acceptance Tests

### T1 — Create Group From Two Blocks

Select building block A, start group, select block B, add to group, finish.

Expected:

```txt
manifest.groups contains one group with two members
```

### T2 — Group Replacement Spawns One Actor

Enable replacement on group.

Expected:

```txt
one replacement actor appears for the group
not two
```

### T3 — Group Suppresses All Members

Expected:

```txt
both original Mapbox building blocks are suppressed
```

### T4 — Group Preview Matches Wall

Expected:

```txt
Studio Preview and Wall show the same group replacement
```

### T5 — Standalone Replacements Still Work

Expected:

```txt
single-feature replacements still spawn normally
```

### T6 — Group Members Do Not Spawn Standalone Actors

If member records still contain replacement metadata:

Expected:

```txt
group owns output
member standalone actors skipped
```

### T7 — Ungroup Restores Standalone Behavior

Expected:

```txt
members can be edited/replaced independently again
```

### T8 — Cross-Tab Sync Works

Expected:

```txt
Studio edits update Wall through existing localStorage sync
```

### T9 — Corrupt Group Data Safe

Expected:

```txt
invalid group skipped
no crash
```

### T10 — No Canvas/Glyph Changes

Expected:

```txt
no Canvas/Glyph files modified
```

---

## Required Report

Claude/Codex must report:

```txt
files changed
group schema added
group creation behavior
runtime group resolution priority
suppression behavior for group members
Studio Preview behavior
Wall actor behavior
debug API outputs
acceptance test results
```

---

## Success Criteria

A building made of multiple Mapbox blocks can be treated as one building replacement target.

The user should see:

```txt
two source blocks selected/grouped
→ one skyscraper replacement
→ all original blocks suppressed
```

not:

```txt
two separate replacements
+
source leftovers
+
unclear Studio/Wall mismatch
```

---

## Implementation Guide

- **Where:** Add group persistence in `studio/mapLab/buildingEditRegistry.js`; add group controls in `mapInspector.js` / `mapLabView.js`; update Studio Preview and Wall replacement runtimes to render groups first and skip grouped member actors.
- **What:** Group two adjacent building features, assign one replacement archetype, and confirm only one actor renders while both originals are suppressed.
- **Expect:** Multi-block buildings behave as one replacement object in both Studio Preview and Wall.
