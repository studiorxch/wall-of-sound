---
layout: spec
title: "WOS 3D Canvas Lab - Phase 2 Specification: Properties"
date: 2026-06-13
doc_id: "0613_WOS_3DCanvasLabPhase2Properties_v1.0.0_BUILD"
version: "1.0.0"

project: "Wall of Sound"
system: "WOS"

domain: "interaction"
component: "3DCanvasLab"

type: "system-spec"
status: "approved-build"

priority: "high"
risk: "medium"

classification: "interpretation-layer"

summary: "Defines the Phase 2 Inspector for WOS 3D Canvas Lab: selected actor properties, assetId dropdown selection from the WOS Library asset registry, inline validation, atomic manifest saves, and Canvas reaction to saved manifest updates."

doctrine:
  - "2D owns truth"
  - "2.5D owns presentation"
  - "Manifest stores assetId, not assetPath"
  - "Inspector edits manifests, not scene graph objects"
  - "Canvas reacts to manifest store updates"

depends_on:
  - "WOS-3DLAB-P1-v0.1"
  - "0613_WOS_3DCanvasLabLockedArchitecture_v1.0.0_BUILD"
  - "WOSActorManifest v0.1"
  - "AssetResolver"

enables:
  - "WOS 3D Canvas Lab Phase 3 Authoring UX"
  - "WOS 3D Canvas Lab Phase 4 Governance"

tags:
  - "wos"
  - "3d-canvas-lab"
  - "inspector"
  - "actor-manifest"
  - "asset-registry"
  - "phase-2"
---

# WOS 3D Canvas Lab - Phase 2 Specification: Properties

| Field | Value |
|---|---|
| Spec ID | `WOS-3DLAB-P2-v1.0.0` |
| Status | `BUILD` |
| Date | `2026-06-13` |
| Requires | Phase 1 ship gate passed before Phase 2 implementation begins |
| Ship Gate | All editable manifest fields are editable via Inspector; invalid values are rejected inline; save is reflected in `wos-actors.json` within `500ms` |

---

## 1. Purpose and Scope

Phase 2 adds the **Inspector**: a selected-actor editing surface that exposes the manifest fields an author needs to configure a placed actor.

The 3D Canvas places actors.  
The Inspector configures selected actors.  
The WOS Library owns reusable assets.  
The runtime resolves `assetId` to GLB path.

These concerns must remain separate.

Phase 2 does **not** add:

- full asset browser
- search palette
- transform gizmos
- undo / redo
- batch editing
- governance promotion
- GTFS-RT / GBFS / liveTracking binding
- continuity scalar editing
- LOD threshold editing

### Phase 2 Ship Gate

Phase 2 is complete only when:

1. Every editable manifest field listed in this spec is accessible through the Inspector for a selected actor.
2. Invalid field values are rejected inline with visible field-local errors.
3. The Save button is disabled while any field is invalid.
4. A valid save writes to `wos-actors.json` within `500ms`.
5. Reload after save restores every edited value exactly.
6. No saved manifest contains `assetPath`.
7. No Phase 2 save persists `assetId: ""`.

---

## 2. Normative Dependencies

| Dependency | Type | Requirement |
|---|---|---|
| `WOS-3DLAB-P1-v0.1` | Phase 1 spec | Manifest schema, store format, write contract, no-second-renderer constraint |
| `0613_WOS_3DCanvasLabLockedArchitecture_v1.0.0_BUILD` | Architecture doc | Studio hierarchy, WOS Library merge, Inspector ownership, Proof Stage removal |
| `WOSActorManifest v0.1` | TypeScript interface | Authoritative field names, types, and constraints |
| `AssetResolver` | Runtime contract | Resolves `assetId` and lists registry entries |
| `ActorManifestStore` | Store authority | Atomic read/write authority for `wos-actors.json` |

---

## 3. Core Principles

### 3.1 Inspector Edits Manifest State Only

The Inspector edits the in-memory `WOSActorManifest` representation. It must not mutate Three.js objects directly.

```txt
Inspector field edit
-> in-memory manifest draft
-> validation
-> Save
-> ActorManifestStore atomic write
-> 3D Canvas observes store update
-> Canvas refreshes actor visual
```

### 3.2 Canvas Owns Visual Reaction

The 3D Canvas reacts to saved manifest updates. It owns visual refresh for:

- geometry swaps after `assetId` changes
- altitude changes after `anchor.altM` changes
- heading rotation after `anchor.headingDeg` changes
- label render updates after `meta.displayLabel` changes

### 3.3 WOS Library Owns Asset Inventory

The Inspector does not browse, manage, import, delete, or organize assets. It only selects an `assetId` from the registry list exposed by the WOS Library / `AssetResolver` boundary.

### 3.4 Manifest Stores `assetId`, Not `assetPath`

`assetPath` is forbidden in `wos-actors.json`.

```txt
Accepted:
assetId: "sr_brooklyn_bridge_001"

Forbidden:
assetPath: "/assets/bridges/brooklyn.glb"
```

---

## 4. Authority Boundaries

### 4.1 Inspector Owns

- selected actor property field state
- editable/read-only field presentation
- inline validation display
- save/update affordance
- save success/failure display
- unresolved asset warnings
- selected actor draft state before save

### 4.2 Inspector Must Not Own

- actor placement
- renderer lifecycle
- Three.js scene graph mutation
- WebGL context creation
- asset inventory browsing
- asset importing
- asset deletion
- promotion authority
- feed subscription runtime
- live tracking binding
- governance state transitions

### 4.3 Required Boundary Rule

The Inspector must never call scene graph APIs directly.

Forbidden examples:

```ts
mesh.position.set(...)
mesh.rotation.set(...)
scene.add(mesh)
scene.remove(mesh)
renderer.render(...)
```

Accepted flow:

```ts
await actorManifestStore.update(objectId, nextManifest)
```

Then the 3D Canvas observes the manifest store update and performs the visual refresh.

---

## 5. Editable Fields

The Inspector exposes exactly the fields below in Phase 2.

Fields not listed here must not appear in the Phase 2 Inspector.

| Inspector Field | Editable | Behavior / Validation |
|---|---:|---|
| `objectId` | No | Read-only UUID v4. Generated by Lab. Never editable. |
| `actorCategory` | Yes | Dropdown: `maritime`, `vehicle`, `structure`, `prop`. Changing category may reset `actorType` to `custom`. |
| `actorType` | Yes | Dropdown populated from valid types for selected `actorCategory`. |
| `assetId` | Yes | Dropdown populated from asset registry. Must be registry-listed or reserved placeholder `wos_placeholder_cube`. |
| `anchor.lat` | No | Read-only. Edited only by placement or Phase 3 translate gizmo. |
| `anchor.lon` | No | Read-only. Edited only by placement or Phase 3 translate gizmo. |
| `anchor.altM` | Yes | Number input. Float. Range `-500` to `8849`. Inline unit label: `m`. |
| `anchor.headingDeg` | Yes | Number input. Float. Range `0` to `<360`. Inline unit label: `deg`. Explicit wrapping: `360 -> 0`, `-1 -> 359`. |
| `meta.displayLabel` | Yes | Optional text input. Max `64` characters. Renders above actor if non-empty. |
| `meta.specVersion` | No | Read-only. Set by Lab at save time. |
| `meta.authoredAt` | No | Read-only ISO 8601 timestamp from first save. |
| `meta.promoted` | No | Read-only. Always `false` in Phase 2. |

### 5.1 Explicitly Excluded Fields

The following fields are intentionally excluded from Phase 2 Inspector:

- `liveTracking`
- `scalars.*`
- `lod.*`
- `meta.promotedAt`
- `meta.changeReason`
- governance controls
- animation graph fields
- non-uniform scale fields
- batch editing fields

---

## 6. `assetId` Dropdown Specification

### 6.1 Decision

Phase 2 `assetId` selection is a **dropdown populated from the asset registry**.

Rejected alternatives:

| Option | Decision | Reason |
|---|---:|---|
| Free-text string input | Rejected | Allows typos, unresolved references, and empty saves. |
| Searchable command palette | Deferred | Better for Phase 3 Authoring UX, not Phase 2 Properties. |
| Dropdown from registry | Accepted | Minimal constrained selector for valid `assetId` assignment. |
| Free-text now, upgrade later | Rejected | Creates throwaway UX and bad manifest habits. |

### 6.2 Rationale

Free-text input allows manifests that are syntactically valid JSON but operationally broken. Phase 2 closes this gap.

The Inspector must write only:

1. a registry-listed `assetId`, or
2. the reserved placeholder assetId: `wos_placeholder_cube`.

The full asset browser with thumbnails, search, tags, grouping, preview, and drag/drop is Phase 3.

### 6.3 Dropdown Behavior

On Inspector mount for a selected actor:

1. The Inspector calls `AssetResolver.list()` once.
2. The dropdown displays asset name as primary text.
3. The dropdown displays `assetId` as secondary muted text.
4. The reserved placeholder entry `wos_placeholder_cube` is always present as the first dropdown entry.
5. The current `assetId` is pre-selected if it exists in the registry.
6. If the current `assetId` is `""`, the dropdown pre-selects `wos_placeholder_cube` and shows the unresolved warning badge.
7. If the current `assetId` is non-empty but not present in the registry, the raw value is shown with the unresolved warning badge.
8. Selecting a new asset updates the in-memory manifest draft immediately.
9. Selecting a new asset does not save automatically.
10. The author must press Save explicitly.

### 6.4 Asset Registry Query Contract

The Inspector calls the asset registry only through the `AssetResolver` boundary.

```ts
export type AssetRegistryEntry = {
  assetId: string;
  name: string;
  category?: string;
};

export interface AssetResolver {
  resolve(assetId: string): Promise<string>;
  list(): Promise<AssetRegistryEntry[]>;
}
```

### 6.5 Required Placeholder Entry

The registry response consumed by the Inspector must include this reserved entry:

```ts
const WOS_PLACEHOLDER_ASSET: AssetRegistryEntry = {
  assetId: "wos_placeholder_cube",
  name: "Placeholder Cube",
  category: "system",
};
```

If the resolver does not return this entry, the Inspector must inject it locally as the first dropdown entry. This is allowed because it is a reserved system asset, not user inventory.

### 6.6 Asset Resolver Failure

If `AssetResolver.list()` fails:

1. The dropdown displays the current stored `assetId` as a single read-only option.
2. The Inspector shows an error badge.
3. The error reads: `Asset registry unavailable. Current asset cannot be changed.`
4. The Inspector does not retry automatically.
5. Save remains available only if the current `assetId` is non-empty.
6. Save remains blocked if the current `assetId` is `""`.

### 6.7 Unresolved Asset Warning

If the current actor has `assetId: ""` from a Phase 1 save:

- do not error on load
- display unresolved warning badge
- pre-select `wos_placeholder_cube`
- require Save to persist `wos_placeholder_cube`

If the current actor has a non-empty `assetId` that is not in the registry:

- display the raw `assetId`
- display unresolved warning badge
- warning text: `Asset not found in registry. Actor renders as placeholder.`
- allow save only after selecting a registry-listed asset or `wos_placeholder_cube`

### 6.8 `assetId` Validation Rule

`assetId` must be either a registry-listed assetId or the reserved placeholder assetId: `wos_placeholder_cube`.

Error message:

```txt
Select an asset or use the placeholder to save.
```

A Phase 2 save must never persist:

```json
{ "assetId": "" }
```

---

## 7. `meta.displayLabel` Field

`displayLabel` is a Phase 2 addition stored at `meta.displayLabel`.

It is optional, max `64` characters, and controls the label shown above the actor in the 3D Canvas viewport.

### 7.1 Manifest Storage

```json
{
  "meta": {
    "specVersion": "1.0.0",
    "authoredAt": "2026-06-13T14:32:00Z",
    "authoredBy": null,
    "promoted": false,
    "promotedAt": null,
    "changeReason": null,
    "displayLabel": "Brooklyn Bridge North Tower"
  }
}
```

### 7.2 Viewport Behavior

1. If `meta.displayLabel` is non-empty, the 3D Canvas renders it as a world-space text label above the actor.
2. If `meta.displayLabel` is empty or absent, no label is rendered.
3. Label rendering is a 3D Canvas concern.
4. The Inspector only writes the manifest value.

---

## 8. Inline Validation

Validation runs on the in-memory manifest draft as the author edits. Validation does not require a save attempt.

The Save button is disabled while any field is invalid.

### 8.1 Validation Rules

| Field | Rule | Error Message |
|---|---|---|
| `actorCategory` | Required. Must be enum value. | `actorCategory is required.` |
| `actorType` | Required. Must be valid for category. | `actorType is not valid for this category.` |
| `assetId` | Must be registry-listed or `wos_placeholder_cube`. Must not be empty. | `Select an asset or use the placeholder to save.` |
| `anchor.altM` | Float. Range `-500` to `8849`. | `altM must be between -500 and 8849.` |
| `anchor.headingDeg` | Float. Range `0` to `<360`. | `headingDeg must be between 0 and 360.` |
| `meta.displayLabel` | Optional. Max `64` chars if present. | `Label must be 64 characters or fewer.` |

### 8.2 Validation Display Rules

1. Error messages appear directly below the invalid field.
2. Error messages must not appear only in toast, banner, or modal form.
3. Invalid fields use the shared red invalid field state.
4. Save button label changes to `Fix errors to save` while any field is invalid.
5. Errors clear immediately when the field becomes valid.
6. Multiple simultaneous field errors are shown at once.

### 8.3 No Silent Coercion

The Inspector must not silently coerce invalid values.

Forbidden:

- silently clamping `361` to `359.9`
- silently trimming `meta.displayLabel` to 64 characters
- silently replacing empty `assetId` with `wos_placeholder_cube` on save

Allowed explicit behavior:

- `anchor.headingDeg` input `360` wraps to `0`
- `anchor.headingDeg` input `-1` wraps to `359`

This wrapping must be visible in the field value before save.

---

## 9. Save Contract

The Inspector save action writes the full updated manifest to the manifest store. It does not write partial updates.

### 9.1 Save Sequence

1. Author presses Save.
2. Inspector re-validates all fields.
3. If any field is invalid, save is aborted and inline errors remain visible.
4. Inspector replaces the matching manifest in the in-memory manifest array by `objectId`.
5. `ActorManifestStore` flushes the full manifest array to disk atomically using temp file -> rename.
6. 3D Canvas observes the store update and refreshes the affected actor.
7. Inspector displays inline save confirmation: `Saved` for `1.5s`, then returns to `Save`.

### 9.2 Save Timing Requirement

The manifest must be written to `wos-actors.json` within `500ms` of the author pressing Save.

The timing is measured from button press to file write completion.

### 9.3 Save Failure Handling

If the manifest store write fails:

1. Inspector surfaces: `Save failed. Your changes are not persisted.`
2. The in-memory manifest store rolls back to its pre-edit state.
3. The 3D Canvas does not update.
4. The scene remains at the last successful saved state.
5. The author's unsaved edits remain visible in Inspector fields so the author can retry.

---

## 10. `actorCategory` / `actorType` Cascade

Changing `actorCategory` resets `actorType` to `custom`.

This is potentially destructive and must be confirmed if the current `actorType` is not already `custom`.

### 10.1 Cascade Flow

1. Author changes `actorCategory` via dropdown.
2. If `actorType !== "custom"`, Inspector shows inline warning:

```txt
Changing category will reset actor type to custom. Continue?
```

3. Author confirms or cancels.
4. On confirm, `actorType` resets to `custom`.
5. On confirm, the `actorType` dropdown repopulates with types valid for the new category.
6. On cancel, `actorCategory` reverts to previous value and no changes are made.

### 10.2 Valid `actorType` Values

| `actorCategory` | Valid `actorType` Values |
|---|---|
| `maritime` | `vessel`, `buoy`, `beacon`, `wreck`, `mooring`, `platform`, `custom` |
| `vehicle` | `land_vehicle`, `aircraft`, `rail`, `emergency`, `custom` |
| `structure` | `building`, `bridge`, `tower`, `facility`, `port_infra`, `custom` |
| `prop` | `static_marker`, `signage`, `environmental`, `custom` |

---

## 11. 3D Canvas Reaction to Inspector Saves

The 3D Canvas listens to manifest store updates. The Inspector does not call the Canvas directly.

### 11.1 Canvas Updates After Save

| Changed Field | Canvas Reaction |
|---|---|
| `assetId` | Unload current geometry, resolve new `assetId`, load new GLB or placeholder. |
| `anchor.altM` | Move actor to new altitude in world space. |
| `anchor.headingDeg` | Rotate actor to new heading. |
| `meta.displayLabel` | Add, update, or remove world-space label. |
| `actorCategory` | No visual change in Phase 2. Metadata only. |
| `actorType` | No visual change in Phase 2. Metadata only. |

### 11.2 Canvas Does Not Update

The Canvas does not update these from Inspector saves in Phase 2:

- `anchor.lat`
- `anchor.lon`
- `lod.*`
- `scalars.*`
- `liveTracking`

---

## 12. Data Model

### 12.1 `WOSActorManifest` Phase 2 Editable Shape

```ts
export type ActorCategory = "maritime" | "vehicle" | "structure" | "prop";

export type ActorTypeByCategory = {
  maritime: "vessel" | "buoy" | "beacon" | "wreck" | "mooring" | "platform" | "custom";
  vehicle: "land_vehicle" | "aircraft" | "rail" | "emergency" | "custom";
  structure: "building" | "bridge" | "tower" | "facility" | "port_infra" | "custom";
  prop: "static_marker" | "signage" | "environmental" | "custom";
};

export type ActorAnchor = {
  lat: number;
  lon: number;
  altM: number;
  headingDeg: number;
};

export type WOSActorManifestMeta = {
  specVersion: string;
  authoredAt: string;
  authoredBy: string | null;
  promoted: false;
  promotedAt: string | null;
  changeReason: string | null;
  displayLabel?: string;
};

export type WOSActorManifest = {
  objectId: string;
  actorCategory: ActorCategory;
  actorType: string;
  assetId: string;
  anchor: ActorAnchor;
  lod: {
    highM: number;
    medM: number;
    lowM: number;
    billboardM: number;
  };
  scalars: {
    continuityAlpha: number | null;
    deadReckoningWeight: number;
    coastAlpha: number | null;
    staleWeight: number | null;
    interpolationWeight: number | null;
  };
  liveTracking: null;
  meta: WOSActorManifestMeta;
};
```

### 12.2 Manifest Example After Phase 2 Save

```json
{
  "objectId": "a1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4d5",
  "actorCategory": "structure",
  "actorType": "bridge",
  "assetId": "sr_brooklyn_bridge_001",
  "anchor": {
    "lat": 40.706,
    "lon": -73.997,
    "altM": 0,
    "headingDeg": 52
  },
  "lod": {
    "highM": 500,
    "medM": 2000,
    "lowM": 8000,
    "billboardM": 20000
  },
  "scalars": {
    "continuityAlpha": null,
    "deadReckoningWeight": 0,
    "coastAlpha": null,
    "staleWeight": null,
    "interpolationWeight": null
  },
  "liveTracking": null,
  "meta": {
    "specVersion": "1.0.0",
    "authoredAt": "2026-06-13T14:32:00Z",
    "authoredBy": null,
    "promoted": false,
    "promotedAt": null,
    "changeReason": null,
    "displayLabel": "Brooklyn Bridge"
  }
}
```

---

## 13. Required Controllers

### 13.1 Existing Controllers

| Controller | Phase | Phase 2 Requirement |
|---|---:|---|
| `ActorManifestStore` | Phase 1 | Add `update(objectId, nextManifest)` or equivalent full-manifest replacement method. |
| `AssetResolver` | Phase 1 | Add `list(): Promise<AssetRegistryEntry[]>`. Keep `resolve()` unchanged. |
| `ActorPlacementController` | Phase 1 | Unchanged. Still owns placement. |
| `ActorSelectionController` | Phase 1 | Unchanged. Inspector subscribes to selection events. |

### 13.2 New Controller

| Controller | Phase | Responsibility |
|---|---:|---|
| `InspectorController` | Phase 2 | Owns selected actor draft state, field validation, cascade warnings, save sequence, and save feedback. Does not touch Three.js. |

---

## 14. Execution Flow

### 14.1 Inspector Mount

```txt
Actor selected
-> Inspector receives selected objectId
-> Inspector loads manifest from ActorManifestStore memory
-> Inspector calls AssetResolver.list()
-> Inspector builds field draft state
-> Inspector validates initial state
-> Inspector renders fields
```

### 14.2 Author Edit

```txt
Author changes field
-> Inspector updates draft state
-> Inspector validates changed field and dependent fields
-> Inspector updates inline error state
-> Inspector enables/disables Save
```

### 14.3 Author Save

```txt
Author presses Save
-> Inspector validates full draft
-> ActorManifestStore replaces manifest by objectId
-> ActorManifestStore writes full wos-actors.json atomically
-> Store emits update event
-> 3D Canvas refreshes affected actor
-> Inspector shows Saved state
```

---

## 15. Observability Impact

Phase 2 affects observability through saved manifest state only.

The Inspector may expose:

- unresolved asset warning state
- dirty draft state
- save success/failure state
- validation error state
- selected actor metadata

The Inspector does not directly influence:

- camera systems
- atmosphere
- overlay grammar
- renderer settings
- Three.js material state
- feed runtime state

---

## 16. Authority Relationships

### Reads From

- `ActorSelectionController`
- `ActorManifestStore`
- `AssetResolver.list()`

### Writes To

- `ActorManifestStore`

### Observed By

- `3DCanvas`
- `ActorManifestStore` subscribers
- future Governance checks in Phase 4

### Forbidden Mutations

- Three.js scene graph
- renderer lifecycle
- WebGL context
- `assetPath`
- `meta.promoted: true`
- `liveTracking`
- `lod.*`
- `scalars.*`

---

## 17. Acceptance Criteria

### 17.1 Inspector Field Coverage

- [ ] Every field listed in Section 5 is visible when an actor is selected.
- [ ] Read-only fields display their current values and are not interactive.
- [ ] Editable fields accept input and update draft state immediately.
- [ ] Fields excluded by Section 5.1 are not visible.

### 17.2 `assetId` Dropdown

- [ ] Dropdown is populated from `AssetResolver.list()` on Inspector mount.
- [ ] `wos_placeholder_cube` is always present as the first entry.
- [ ] Current `assetId` is pre-selected if it exists in the registry.
- [ ] Empty string `assetId` pre-selects `wos_placeholder_cube` with unresolved warning.
- [ ] Non-empty unlisted `assetId` displays raw value with unresolved warning.
- [ ] Selecting a new `assetId` updates draft state and activates Save.
- [ ] Selecting a resolved `assetId` clears unresolved warning.
- [ ] Phase 2 save never persists `assetId: ""`.

### 17.3 Validation

- [ ] All validation rules in Section 8.1 are enforced.
- [ ] Error messages appear below invalid fields.
- [ ] Save button is disabled while any field is invalid.
- [ ] Save button label reads `Fix errors to save` while invalid.
- [ ] Errors clear immediately when fields become valid.
- [ ] `headingDeg` wrapping behaves exactly as specified: `360 -> 0`, `-1 -> 359`.

### 17.4 Save and Persistence

- [ ] Valid save writes to `wos-actors.json` within `500ms`.
- [ ] All edited values are present in `wos-actors.json` after save.
- [ ] Reload after save restores all edited values exactly.
- [ ] Save failure surfaces visible error.
- [ ] Save failure rolls back in-memory manifest store to pre-edit state.
- [ ] Save failure leaves scene unchanged.
- [ ] `assetPath` does not appear in `wos-actors.json` under any circumstances.

### 17.5 Canvas Reaction

- [ ] Changing `assetId` and saving updates geometry without page reload.
- [ ] Changing `anchor.altM` and saving moves actor altitude.
- [ ] Changing `anchor.headingDeg` and saving rotates actor heading.
- [ ] Setting `meta.displayLabel` and saving shows label above actor.
- [ ] Clearing `meta.displayLabel` and saving removes label from actor.

### 17.6 Architecture Constraint

- [ ] Inspector does not mutate Three.js objects directly.
- [ ] Inspector does not create a second WebGL context.
- [ ] Inspector does not own asset browsing.
- [ ] Inspector does not own actor placement.
- [ ] Inspector does not write promotion state.

---

## 18. Non-Goals

Do not build in Phase 2:

- asset browser with thumbnails
- asset search/filter
- drag/drop from Library
- translate gizmo
- rotate gizmo
- scale gizmo
- LOD preview rings
- undo / redo
- actor duplication
- actor deletion
- batch editing
- governance promotion
- `promoted: true` transition
- feed binding
- GTFS-RT subscription
- GBFS subscription
- AIS subscription changes
- `liveTracking` UI
- continuity scalar editing
- LOD threshold editing
- non-uniform scale
- pivot editing
- animation graph fields

---

## 19. Deferred Questions - Phase 3

1. **Asset search:** Phase 2 dropdown has no search. Phase 3 asset browser resolves search/filter/preview.
2. **Actor movement:** `anchor.lat` and `anchor.lon` remain read-only. Phase 3 translate gizmo edits them.
3. **No selection state:** Phase 2 may show an empty state or hide Inspector. Final navigation behavior belongs to Phase 3 Authoring UX.
4. **Scale fields:** Do not add scale fields unless `WOSActorManifest` is updated first.
5. **Batch operations:** Multi-select and batch edit remain Phase 3.

---

## 20. Canonical References

- `WOS-3DLAB-P1-v0.1`
- `WOS-3DLAB-P2-v1.0.0`
- `0613_WOS_3DCanvasLabLockedArchitecture_v1.0.0_BUILD`
- `WOSActorManifest v0.1`
- `WOS Naming Doctrine v1.1.0`
- `WOS Surface Channel Doctrine v1.1.0`
- `WOS Constitutional Spec Template v2.0.1`
- `ContractGovernance v1.3.0`

---

## 21. Implementation Guide

- **Where:** Add Phase 2 Inspector code under the Studio 3D Canvas Lab workspace; connect it to `ActorManifestStore`, `ActorSelectionController`, and `AssetResolver.list()`.
- **What:** Implement dropdown-based `assetId` selection, inline validation, full-manifest save, and Canvas reaction through store subscription only.
- **Expect:** A selected actor can be configured, saved to `wos-actors.json` within `500ms`, reloaded with exact values, and visually refreshed without Inspector touching Three.js directly.

---

## Appendix A - Revision History

| Version | Date | Change |
|---|---|---|
| `v0.1` | `2026-06-13` | Initial Phase 2 draft. |
| `v1.0.0_BUILD` | `2026-06-13` | Locked dropdown `assetId` selection, resolved Phase 1 empty asset compatibility, canonicalized `wos_placeholder_cube`, and promoted to BUILD spec. |
