# 0612L_WOS_StudioToWallPublishAuthority_v1.0.0_BUILD

## Purpose

Establish a formal publishing boundary between Studio and Wall.

Studio is the authoring environment.

Wall is the presentation environment.

Wall must never become an experimental workspace, and Studio must never be mistaken for the currently published world state.

The system must make draft, modified, and published states explicit.

---

## Problem

Current behavior creates ambiguity:

```txt
Studio and Wall appear similar
Studio and Wall sometimes diverge
Changes may exist in one view but not the other
No formal publish event exists
No visual indication of unpublished changes exists
```

This creates confusion during debugging and makes it difficult to determine whether a rendering discrepancy is:

```txt
A bug
A draft edit
A missing sync
An unpublished change
A style mismatch
```

The system currently lacks authoritative ownership.

---

## Required Authority Model

```txt
Studio
    ↓
 Draft State

Publish

    ↓

Published State
    ↓

Wall
```

### Studio

Owns:

```txt
Building edits
Replacement assignments
Density zones
Registry changes
Visual authoring
Future world state
```

### Wall

Owns:

```txt
Published city state only
Presentation
Broadcast
Recording
Video output
Stream output
```

Wall must never automatically become the newest draft.

---

## State Definitions

### DRAFT

```txt
Changes exist only in Studio
Not visible in Wall
Not yet approved
```

### MODIFIED

```txt
Studio differs from published state
Publish available
```

### PUBLISHED

```txt
Studio and Wall share identical authoritative data
```

---

## Data Model

### Current

```txt
buildingEditRegistry
localStorage
runtime state
```

### New

```txt
wos_building_draft
wos_building_published
```

Published state becomes a first-class artifact.

---

## Publish Operation

### Trigger

```txt
Publish Button
```

### Behavior

Copy:

```txt
Draft Registry
→
Published Registry
```

Then:

```txt
Wall reloads
Projection Runtime reloads
Replacement Runtime reloads
Density Authority reloads
```

---

## Publish UI

### Studio Header

Add:

```txt
[ Draft ]
[ Modified ]
[ Published ]
```

Only one may be active.

---

### Publish Button

When modified:

```txt
Publish
```

When already published:

```txt
Published ✓
```

Disabled until additional edits occur.

---

## Unpublished Changes Detection

Hash:

```txt
Draft Registry
Published Registry
```

If unequal:

```txt
State = Modified
```

If equal:

```txt
State = Published
```

No manual tracking.

Truth derived from data.

---

## Wall Restrictions

Wall must:

```txt
Never write edits
Never create authoring state
Never mutate draft data
```

Wall only consumes:

```txt
Published Registry
```

---

## Runtime Ownership

### Studio

Allowed

```txt
Map Lab
Inspector
Preview Runtime
Building Registry
Density Authoring
```

### Wall

Allowed

```txt
Projection Runtime
Replacement Runtime
Presentation Runtime
Atmosphere Runtime
```

---

## Acceptance Tests

### T1

Edit building in Studio.

Expected:

```txt
State = Modified
Wall unchanged
```

Pass required.

---

### T2

Publish.

Expected:

```txt
State = Published
Wall updates
```

Pass required.

---

### T3

Refresh Wall.

Expected:

```txt
Published state restored
```

Pass required.

---

### T4

Refresh Studio.

Expected:

```txt
Draft state restored
```

Pass required.

---

### T5

No edits.

Expected:

```txt
Publish button disabled
```

Pass required.

---

## Success Criteria

```txt
Studio = Draft Authority

Wall = Published Authority

Unpublished changes are visible

Publishing is explicit

Wall never silently diverges

Studio never silently becomes production

Rendering discrepancies can immediately be classified as:
- Draft
- Published
- Bug
```

---

## Build Classification

```txt
Authority Build

Priority: Critical

Required Before:
0612M_WOS_BuildingZeroStateProof_v1.0.0_BUILD

Required Before:
0612N_WOS_SingleBuildingReplacementProof_v1.0.0_BUILD
```