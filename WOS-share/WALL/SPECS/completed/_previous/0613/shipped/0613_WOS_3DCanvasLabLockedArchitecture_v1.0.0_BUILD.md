---
layout: spec
title: "WOS 3D Canvas Lab Locked Architecture"
date: 2026-06-13
doc_id: "0613_WOS_3DCanvasLabLockedArchitecture_v1.0.0_BUILD"
version: "1.0.0"
project: "Wall of Sound"
system: "WOS"
domain: "authoring"
component: "3DCanvasLab"
type: "system-spec"
status: "approved"
priority: "high"
risk: "medium"
classification: "authoring-layer"
summary: "Locks Option 4: Canvas Lab becomes 3D Canvas Lab. Studio is reduced to Library, 3D Canvas, and Inspector. Phase 1 is strictly Place + Save, with no management-tool drift."
doctrine:
  - "Canvas Lab → 3D Canvas Lab"
  - "Drag, drop, move, place, save"
  - "Asset equals reusable geometry"
  - "Actor equals manifest instance placed in world"
  - "Manifest stores assetId, not assetPath"
  - "Do not build another management tool"
depends_on:
  - "WOS-3DLAB-P1-v0.1"
  - "WOSActorManifest"
  - "ContractGovernance"
  - "WOS Naming Doctrine"
enables:
  - "3DCanvasLabPhase1"
  - "WOSLibrary"
  - "3DActorPlacementRuntime"
  - "ManifestPromotionGate"
tags:
  - "wos"
  - "3d-canvas-lab"
  - "studio"
  - "actor-manifest"
  - "asset-registry"
  - "authoring"
---

# WOS 3D Canvas Lab Locked Architecture

## 1. Decision

**OPTION 4 is locked.**

The current Studio workspace hierarchy is revised to:

```txt
Studio
├── Library
├── 3D Canvas
└── Inspector
```

The product direction is no longer a set of separate management screens. The authoring center is now the **3D Canvas Lab**, evolved from the existing Canvas Lab.

The tool must prioritize direct world authoring:

```txt
Drag
Drop
Move
Place
Save
```

This is the primary implementation target.

---

## 2. Replaced Workspace Model

### 2.1 Previous Model

```txt
Studio
├── Asset Library
├── Actor Library
├── Proof Stage
├── Map Lab
└── Canvas
```

This model created excessive workspace splitting and encouraged management-tool behavior.

### 2.2 Locked Model

```txt
Studio
├── Library
├── 3D Canvas
└── Inspector
```

### 2.3 Workspace Disposition

| Existing Workspace | Locked Disposition | Reason |
|---|---|---|
| Asset Library | Merge into WOS Library | Assets are reusable geometry records, not a separate authoring world. |
| Actor Library | Merge into WOS Library | Actors are manifest instances and should be browsed from the same system context. |
| Proof Stage | Remove | It adds another intermediate management surface and conflicts with direct 3D placement. |
| Map Lab | Absorb into 3D Canvas | Building/object placement belongs in the authoring canvas, not a separate tab. |
| Canvas | Promote to 3D Canvas | Canvas Lab becomes the main spatial authoring surface. |

---

## 3. Canonical Product Definitions

### 3.1 Asset

An **Asset** is reusable geometry.

```txt
Asset = reusable geometry package
Primary format = GLB
```

An asset may be shared by many actors.

Assets are not world placements. Assets are source objects that may be referenced by placements.

### 3.2 Actor

An **Actor** is a manifest instance placed in the world.

```txt
Actor = WOSActorManifest instance
Actor stores placement, category, type, behavior flags, and assetId reference
```

An actor is not the GLB itself. It is the placed world instance that references a reusable asset.

### 3.3 Asset-to-Actor Relationship

```txt
Asset
└── reusable GLB geometry

Actor
└── manifest instance placed in world
    └── assetId references Asset
```

Example:

```txt
assetId: "sr_billboard_steel_frame_001"

Actor A → placed in Brooklyn
Actor B → placed in Queens
Actor C → placed in Manhattan

All three actors share the same assetId.
```

---

## 4. Manifest Rule

The manifest stores:

```txt
assetId
```

The manifest does **not** store:

```txt
assetPath
assetUrl
assetFile
cdnPath
gltfPath
glbPath
```

### 4.1 Correct Manifest Pattern

```json
{
  "objectId": "a1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4d5",
  "actorCategory": "prop",
  "actorType": "custom",
  "assetId": "sr_placeholder_cube_001",
  "anchor": {
    "lat": 40.689247,
    "lon": -74.044502,
    "altM": 0,
    "headingDeg": 0
  },
  "meta": {
    "specVersion": "1.0.0",
    "authoredAt": "2026-06-13T14:32:00Z",
    "promoted": false
  }
}
```

### 4.2 Incorrect Manifest Pattern

```json
{
  "assetPath": "/assets/models/billboard.glb"
}
```

This is prohibited.

Asset path resolution belongs to the asset resolver, not the actor manifest.

---

## 5. Accepted Canonical Systems

The following systems are accepted and should not be reopened as naming or architecture debates during Phase 1.

| System | Status | Locked Meaning |
|---|---:|---|
| Promotion Gate | accepted | Governance gate that promotes drafts into canonical runtime use. |
| WOSActorManifest | accepted | Authoritative actor placement and identity record. |
| GTFS-RT | accepted | Realtime transit feed class for vehicle/service movement. |
| GBFS | accepted | Realtime bike-share feed class. |
| liveTracking | accepted | Manifest/runtime field for dynamic feed-bound actor tracking. |

Phase 1 does not implement GTFS-RT, GBFS, or liveTracking behavior. They are accepted vocabulary and future-compatible manifest concepts.

---

## 6. Locked Phase Plan

### Phase 1 — Place + Save

Goal:

```txt
A user can place an actor in the world and save it.
```

Required behavior:

1. Open 3D Canvas.
2. Select or use a default placeholder asset.
3. Place an actor into the world.
4. Save a WOSActorManifest.
5. Reload session.
6. Actor appears in the same place.

Phase 1 is complete only when placement persists across reload.

### Phase 2 — Properties

Goal:

```txt
A user can edit selected actor properties through Inspector.
```

Allowed properties:

- actorCategory
- actorType
- assetId
- anchor.altM
- anchor.headingDeg
- display label
- simple scale fields if already supported by manifest contract

Not allowed yet:

- governance promotion
- feed binding
- advanced transform gizmos
- animation graphs
- batch editing

### Phase 3 — Authoring UX

Goal:

```txt
Make placement fast, visible, and usable.
```

Allowed systems:

- drag/drop from Library to 3D Canvas
- move existing actor
- duplicate actor
- delete actor
- basic transform handles
- object snapping if non-destructive
- asset thumbnails
- actor list/search inside Library
- unresolved asset warnings

Phase 3 is the UX pass, not the governance pass.

### Phase 4 — Governance

Goal:

```txt
Promote correct authored manifests into canonical WOS runtime use.
```

Allowed systems:

- Promotion Gate
- manifest validation
- WOSActorManifest schema enforcement
- unknown-key rejection
- GTFS-RT actor compatibility checks
- GBFS actor compatibility checks
- liveTracking eligibility checks
- promoted:false → promoted:true transition

Governance is intentionally deferred until placement is useful.

---

## 7. Studio Navigation Lock

Studio navigation must now resolve to exactly three primary workspaces:

```txt
Library
3D Canvas
Inspector
```

### 7.1 Library

Library is the unified inventory surface.

It contains:

- Assets
- Actors
- unresolved references
- draft manifests
- promoted manifests when governance exists

It must not become two separate tabs again.

### 7.2 3D Canvas

3D Canvas is the primary authoring surface.

It owns:

- spatial placement UX
- drag/drop target behavior
- move/place/save actions
- selected actor focus
- visual placeholder state

It does not own:

- renderer truth
- manifest schema truth
- asset resolver internals
- governance promotion

### 7.3 Inspector

Inspector is the selected-object editing surface.

It owns:

- selected actor properties
- validation display
- save/update affordance
- unresolved asset warnings

It does not own:

- browsing inventory
- promotion authority
- scene rendering
- feed subscription runtime

---

## 8. Hard Non-Goal

The goal is **not** another management tool.

Do not build:

- a dashboard-first actor admin
- a spreadsheet replacement
- a proof-stage checkpoint UI
- a disconnected asset database viewer
- a second renderer
- a second scene graph
- a separate placement preview runtime

Build the shortest path to this:

```txt
Canvas Lab → 3D Canvas Lab
Drag → Drop → Move → Place → Save
```

---

## 9. Implementation Boundary

### 9.1 Data Layer First

Create or confirm:

```txt
data/actors/wos-actors.json
```

Required store shape:

```json
{
  "version": "1",
  "actors": []
}
```

Required data behavior:

- load store on startup
- create missing store
- reject malformed JSON
- write atomically
- save full manifest array
- never store assetPath in actor manifest

### 9.2 Logic Layer Second

Create or confirm:

```txt
ActorManifestStore
AssetResolver
ActorPlacementController
ActorSelectionController
```

Required logic behavior:

- generate stable objectId
- map screen/world position to anchor.lat/lon
- write manifest before visual placement
- resolve assetId through resolver
- fallback to placeholder when unresolved
- select newly placed actor after successful save

### 9.3 Interface Layer Third

Create or confirm:

```txt
StudioShell
WOSLibraryView
ThreeDCanvasView
InspectorView
```

Required interface behavior:

- Studio nav shows Library / 3D Canvas / Inspector
- Proof Stage removed from primary navigation
- Asset Library and Actor Library removed as separate tabs
- Library can expose both asset and actor sections internally
- 3D Canvas is the default placement surface
- Inspector reacts to selected actor

---

## 10. Acceptance Criteria

### Navigation

- [ ] Studio primary navigation is exactly `Library`, `3D Canvas`, `Inspector`.
- [ ] `Asset Library` is not a primary tab.
- [ ] `Actor Library` is not a primary tab.
- [ ] `Proof Stage` is not a primary tab.
- [ ] Legacy routes may remain dormant only if they do not appear in primary UI.

### Phase 1 Placement

- [ ] User can place an actor in 3D Canvas.
- [ ] Save writes a WOSActorManifest.
- [ ] Manifest contains `assetId`.
- [ ] Manifest does not contain `assetPath`.
- [ ] Actor reloads in the same location after full page reload.
- [ ] Placeholder renders when `assetId` is empty or unresolved.

### Architecture

- [ ] 3D Canvas does not create a second WebGL renderer.
- [ ] 3D Canvas does not fork scene graph ownership.
- [ ] Renderer resolves assetId through resolver layer.
- [ ] Multiple actors may share one assetId.
- [ ] Promotion Gate is not implemented in Phase 1.
- [ ] GTFS-RT, GBFS, and liveTracking are accepted but not implemented in Phase 1.

### UX

- [ ] Primary authoring path is visually obvious.
- [ ] The user does not have to visit a separate proof workspace.
- [ ] Placement feels like direct manipulation, not database entry.
- [ ] Save result is visible and reload-verifiable.

---

## 11. Required Build Order

```txt
1. Data layer
   → manifest type
   → manifest store
   → atomic write
   → reload read

2. Logic layer
   → assetId resolver boundary
   → placement controller
   → selection controller
   → placeholder fallback

3. Interface layer
   → Studio nav compression
   → Library merge
   → 3D Canvas placement surface
   → Inspector selected actor view
```

No UI work should bypass the manifest store.

No renderer work should bypass the assetId resolver boundary.

---

## 12. Blockers Removed

The following issues are no longer open:

| Question | Locked Answer |
|---|---|
| Should Asset Library and Actor Library remain separate? | No. Merge into WOS Library. |
| Should Proof Stage remain? | No. Remove from primary Studio. |
| Is this a management tool? | No. It is a 3D authoring canvas. |
| Does manifest store assetPath? | No. It stores assetId only. |
| Is Promotion Gate accepted? | Yes. Phase 4. |
| Is WOSActorManifest accepted? | Yes. |
| Is GTFS-RT accepted? | Yes. Future feed class. |
| Is GBFS accepted? | Yes. Future feed class. |
| Is liveTracking accepted? | Yes. Future dynamic actor field. |

---

## 13. Remaining Deferred Questions

These do not block Phase 1.

1. Whether Library internally uses tabs, filters, or segmented controls for Assets vs Actors.
2. Whether assetId selection in Phase 2 is free-text, dropdown, or searchable command palette.
3. Whether actor movement in Phase 3 is mouse-drag, transform gizmo, keyboard nudge, or all three.
4. Whether promoted actors are visually distinguished from draft actors in Library.
5. Whether GTFS-RT and GBFS feed actors are authored manually, generated from feed config, or hybrid.

---

## 14. Canonical Summary

```txt
OPTION 4 LOCKED

Canvas Lab becomes 3D Canvas Lab.

Studio becomes:
- Library
- 3D Canvas
- Inspector

Asset Library + Actor Library merge into WOS Library.

Proof Stage is removed.

Asset = reusable GLB geometry.
Actor = WOSActorManifest instance placed in world.

Manifest stores assetId.
Manifest never stores assetPath.

Promotion Gate accepted.
WOSActorManifest accepted.
GTFS-RT accepted.
GBFS accepted.
liveTracking accepted.

Phase 1 = Place + Save.
Phase 2 = Properties.
Phase 3 = Authoring UX.
Phase 4 = Governance.

Goal is not another management tool.
Goal is drag, drop, move, place, save.
```

---

# Implementation Guide

- **Where:** Update `studio/index.html` primary navigation; update `studio/studioShell.js` route registry; add/confirm data store at `data/actors/wos-actors.json`; implement manifest-store logic before UI placement code.
- **What:** Run the app locally, verify Studio nav only exposes `Library`, `3D Canvas`, `Inspector`, then place one actor and confirm `wos-actors.json` saves `assetId` without `assetPath`.
- **Expect:** Reloading the app restores the placed actor at the same world position; unresolved or empty `assetId` displays a placeholder instead of blocking placement.
