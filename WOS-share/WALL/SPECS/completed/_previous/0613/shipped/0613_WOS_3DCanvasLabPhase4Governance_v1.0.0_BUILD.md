---
layout: spec
title: "WOS 3D Canvas Lab — Phase 4 Governance"
date: 2026-06-13
doc_id: "0613_WOS_3DCanvasLabPhase4Governance_v1.0.0_BUILD"
version: "1.0.0"
project: "Wall of Sound"
system: "WOS"
domain: "governance"
component: "3D Canvas Lab"
type: "governance-spec"
status: "approved"
priority: "high"
risk: "high"
classification: "runtime-authority"
summary: "Defines Phase 4 governance for the WOS 3D Canvas Lab: promotion gate, canonical actor registry, lifecycle states, live feed binding, heading-only rotate gizmo, LOD/scalar editing, runtime promotion behavior, DEGRADED states, fork/supersede, and retirement."
depends_on:
  - "WOS-3DLAB-P1-v0.1"
  - "WOS-3DLAB-P2-v0.1"
  - "WOS-3DLAB-P3-v0.1"
  - "ContractGovernance v1.3.0"
  - "AISRuntime v1.6.1"
  - "MarineRenderer v1.0.4"
enables:
  - "Canonical actor promotion"
  - "Runtime actor loading"
  - "Live feed subscription binding"
  - "Actor retirement governance"
tags:
  - "wos"
  - "3d-canvas-lab"
  - "governance"
  - "promotion-gate"
  - "actor-manifest"
  - "live-tracking"
  - "runtime"
---

# WOS 3D Canvas Lab — Phase 4 Specification: Governance

## Spec metadata

| Field | Value |
|---|---|
| Spec ID | WOS-3DLAB-P4-v1.0.0 |
| Status | BUILD |
| Authors | WOS Core Team |
| Date | 2026-06-13 |
| Requires | Phase 3 ship gate passed before Phase 4 implementation begins |
| Ship gate | A Draft actor passes the promotion gate, receives `meta.promoted = true`, loads in the WOS runtime, and cannot be deleted without the governance retirement flow. |

---

## 1. Purpose and scope

Phase 4 closes the authoring loop. Phases 1–3 gave authors the ability to place, configure, and manage actors. Phase 4 determines which authored actors are correct enough to load in the WOS runtime as canonical content.

Phase 4 introduces:

1. Promotion Gate.
2. Canonical actor registry.
3. Actor lifecycle state machine.
4. Live feed binding.
5. Heading-only rotate gizmo.
6. LOD threshold editing.
7. Continuity scalar editing.
8. Runtime promotion behavior.
9. DEGRADED runtime states.
10. Fork / supersede lifecycle.
11. Promoted actor retirement.

After Phase 4, the complete authored actor lifecycle is operational:

```txt
place → configure → review → promote → run → evolve → retire
```

### Phase 4 ship gate

1. A Draft actor passes all blocking checks in the Promotion Gate and receives `meta.promoted = true`.
2. The promoted actor loads in the WOS runtime at its anchor position with LOD switching active.
3. A promoted actor with a live feed binding receives a feed subscription and updates in real time.
4. A promoted actor cannot be deleted from the Library. The retirement flow is required.
5. A promoted actor that is edited is forked to a new Draft. The original remains canonical until the fork is promoted.

---

## 2. Locked Phase 4 decisions

| Decision | Answer |
|---|---|
| Feed binding UX | Hybrid: free-text `bindingKey` / `bindingValue` inputs plus live-validate button per feed type. |
| Rotate gizmo scope | `headingDeg` only. No scale field. No manifest schema change. |
| Registry location | Flat JSON file in WOS repo: `data/actors/wos-registry.json`. |
| Breaking change format | `ContractGovernance v1.3.0` artifact format reused verbatim. |
| Warning acknowledgement | Checkbox plus required text field. Same pattern as `changeReason`. |
| Dependent surfacing | Flat list in gate UI. No graph. No explorer. |

---

## 3. Normative dependencies

| Dependency | Version / Source | Role |
|---|---|---|
| `WOS-3DLAB-P1-v0.1` | Phase 1 spec | Manifest schema, store write contract, architecture constraints. |
| `WOS-3DLAB-P2-v0.1` | Phase 2 spec | Inspector field contract, `assetId` validation, save sequence. |
| `WOS-3DLAB-P3-v0.1` | Phase 3 spec | Undo/redo, delete rules, promoted badge. Phase 4 extends these. |
| `ContractGovernance` | `v1.3.0` | Breaking change artifact format, DEGRADED tracking vocabulary, promotion criteria vocabulary. |
| `AISRuntime` | `v1.6.1` | Continuity scalar contract, feed subscription lifecycle, dead reckoning loop. |
| `MarineRenderer` | `v1.0.4` | LOD threshold contract, scene load on promotion, asset path lock. |
| `WOSActorManifest` | `v0.1 TypeScript` | Authoritative field names and types. No schema changes in Phase 4. |
| `AssetResolver` | Phase 1/2 contract | Gate validates `assetId` via registry, not filesystem. |

---

## 4. Actor lifecycle state machine

All actors begin as `DRAFT`. Promotion is the only path to canonical runtime use. The lifecycle state machine is the authoritative source of truth for what is permitted in each state. No code path may bypass it.

### 4.1 States and allowed mutations

| State | Allowed mutations | Transitions out |
|---|---|---|
| `DRAFT` | Full edit. All Inspector fields. Delete, undoable. Submit to gate. | Submit → `GATE_PENDING` |
| `GATE_PENDING` | Read-only. Withdraw back to `DRAFT` only. | Pass → `PROMOTED`; Fail → `DRAFT`; Withdraw → `DRAFT` |
| `PROMOTED` | Runtime loads. Edit attempt triggers transient `LOCKED` UI state. No direct delete. | Edit attempt → `LOCKED` transient → fork creates new `DRAFT`; original remains `PROMOTED` until fork promotion. |
| `LOCKED` | Transient UI state only. Exists between edit attempt and fork creation. Not a resting registry status. | Fork Draft created → `LOCKED` collapses; original stays `PROMOTED`; fork promoted → original becomes `DEPRECATED`. |
| `DEPRECATED` | Runtime still loads. No edit. Retire to remove from runtime eligibility. | Retire → `RETIRED` |
| `RETIRED` | Runtime ignores. Manifest archived. No mutations. | Terminal state. |

### 4.2 Transition rules

1. A `DRAFT` actor submitted to the gate transitions to `GATE_PENDING` immediately and becomes read-only until the gate completes or is withdrawn.
2. A `GATE_PENDING` actor that fails any blocking check returns to `DRAFT` with a gate result report attached.
3. A `PROMOTED` actor that the author attempts to edit enters transient `LOCKED` UI state. The edit is not applied.
4. `LOCKED` is not a registry status. It is an interaction state that requires the author to fork.
5. Forking a `PROMOTED` actor creates a new `DRAFT` with a new `objectId` and a `supersedes` pointer to the original actor's `objectId`.
6. `changeReason` is required on the fork.
7. The original actor remains `PROMOTED` and canonical while the fork is `DRAFT` or `GATE_PENDING`.
8. When the fork is promoted, the original actor transitions to `DEPRECATED` and receives a `supersededBy` pointer.
9. `DEPRECATED` actors remain runtime-eligible until explicitly retired.
10. `RETIRED` is terminal. No actor may leave `RETIRED`.
11. A `DEPRECATED` actor that is the `supersedes` target of a `GATE_PENDING` actor cannot be retired until that pending actor is promoted or withdrawn.

---

## 5. Canonical actor registry

The canonical actor registry is a flat JSON file in the WOS repo. It is the authoritative record of all promoted actors. The Promotion Gate reads from and writes to this file. The WOS runtime reads it on startup to determine which actors to load.

### 5.1 Registry location and format

```json
{
  "version": "1",
  "entries": [
    {
      "objectId": "a1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4d5",
      "status": "promoted",
      "specVersion": "1.0.0",
      "promotedAt": "2026-06-13T16:00:00Z",
      "promotedBy": "user-session-id",
      "supersedes": null,
      "supersededBy": null,
      "dependents": [],
      "retiredAt": null,
      "retiredBy": null,
      "retireReason": null
    }
  ]
}
```

Canonical path:

```txt
data/actors/wos-registry.json
```

### 5.2 Registry write rules

1. All registry writes are atomic: write to a temp file, then rename over the live registry.
2. The live registry file is never written directly.
3. The Promotion Gate writes a new registry entry on successful promotion.
4. Retirement writes `retiredAt`, `retiredBy`, `retireReason`, and updates `status` to `retired` on the existing entry.
5. Supersession writes `supersededBy` on the old entry and `supersedes` on the new entry at the moment the fork is promoted.
6. The registry is append-only for entries. Entries are never deleted; only status-updated.
7. Retired entries remain in the file permanently.
8. `objectId` uniqueness is enforced at write time. A duplicate `objectId` is a hard error that aborts promotion.

### 5.3 Dependent tracking

When a spec or subsystem declares a dependency on a promoted actor, that actor's registry entry gains a record in `dependents[]`.

```ts
type ActorDependent = {
  specId: string;
  declaredAt: string;
};
```

Rules:

1. The gate reads `dependents[]` when an author attempts to fork a promoted actor.
2. The gate UI shows the full dependent list as a flat read-only list.
3. No graph view or explorer is implemented in Phase 4.
4. If `dependents[]` is non-empty, the author must acknowledge the list before the fork proceeds.
5. Acknowledgement requires a note of at least 10 characters.
6. Acknowledgement does not notify dependents. It is a local audit record only.

---

## 6. Promotion Gate

The Promotion Gate is the Phase 4 UI surface that runs all checks before transitioning a `DRAFT` actor to `PROMOTED`. It is accessed from the Library or Inspector when a Draft actor is selected.

### 6.1 Gate entry

1. Author selects a Draft actor in the Library or Inspector.
2. Author clicks **Submit for promotion**.
3. Actor transitions to `GATE_PENDING` immediately.
4. Actor becomes read-only.
5. Gate UI opens showing the full checklist.
6. Checks run automatically.
7. Gate UI shows results: `passed`, `failed`, or `warned`.
8. If no blocking failures exist, author may promote or withdraw back to `DRAFT`.
9. If any blocking failure exists, Promote is disabled. The author must withdraw, fix, and resubmit.

### 6.2 Blocking checks — Group A: schema integrity

| Check | Group | Result if fail |
|---|---|---|
| Manifest validates against `WOSActorManifest` schema. | A | Gate blocked. Actor returns to `DRAFT`. |
| `specVersion` is set and matches a canonical WOS release. | A | Gate blocked. Actor returns to `DRAFT`. |
| `liveTracking` extension block matches `feedType` discriminator. | A | Gate blocked. Actor returns to `DRAFT`. |
| Static actors carry `deadReckoningWeight = 0`. | A | Gate blocked. Actor returns to `DRAFT`. |
| LOD thresholds are strictly ascending: `highM < medM < lowM < billboardM`. | A | Gate blocked. Actor returns to `DRAFT`. |
| Anchor coordinates are valid: `lat ±90`, `lon ±180`, `altM >= -500`, `headingDeg 0–360`. | A | Gate blocked. Actor returns to `DRAFT`. |
| `assetId` resolves to a known entry in the asset registry. | A | Gate blocked. Actor returns to `DRAFT`. |
| `objectId` is unique in the canonical actor registry. | A | Gate blocked. Actor returns to `DRAFT`. |

### 6.3 Blocking on update, warning on first promotion — Group B

| Check | Group | Result if fail |
|---|---|---|
| `changeReason` is present and at least 10 characters. | B | Blocking on update. Warning, overridable, on first promotion. |
| `authoredBy` is set. | B | Warning. Overridable with acknowledgement note. |
| LOD thresholds differ from `DEFAULT_LOD` (`500 / 2000 / 8000 / 20000`). | B | Warning. Suggests author reviewed LOD for this asset. |
| Continuity scalars reviewed for live-tracking actors. | B | Warning when all nullable scalars are null while `drEnabled = true`. |

### 6.4 Auto-verified — Group C

| Check | Group | Result if fail |
|---|---|---|
| `objectId` is valid UUID v4. | C | Auto-fail if manually edited to non-UUID. Lab-generated IDs should pass. |
| `authoredAt` and `promotedAt` are valid ISO 8601 timestamps. | C | Auto-fail if manually edited. |
| Reserved extension slot keys contain no unsupported data. | C | Auto-fail if non-empty unsupported extension slots are found. |
| `liveTracking.bindingValue` passes gate-time validation if feed is reachable. | C | Auto-fail if feed is reachable and `bindingValue` is confirmed absent. Warning if feed is unreachable. |

### 6.5 Warning acknowledgement UX

1. Each overridable warning shows a checkbox labelled: **I acknowledge this warning.**
2. Checking the box reveals a text input.
3. The author must enter a note of at least 10 characters explaining why the warning is acceptable.
4. The note is stored in the gate result record alongside the warning.
5. The note is not stored in the manifest.
6. The Promote button remains disabled until all blocking checks pass and all unacknowledged warnings are resolved or acknowledged.

### 6.6 Gate result record

Every gate submission produces a gate result record stored adjacent to the actor manifest in the store.

```json
{
  "objectId": "a1b2c3d4-...",
  "submittedAt": "2026-06-13T16:00:00Z",
  "submittedBy": "user-session-id",
  "outcome": "promoted",
  "checks": [
    { "id": "schema-valid", "group": "A", "result": "pass" },
    { "id": "lod-ascending", "group": "A", "result": "pass" },
    {
      "id": "lod-default",
      "group": "B",
      "result": "warned",
      "acknowledged": true,
      "note": "Default LOD appropriate for this small prop."
    }
  ],
  "promotedAt": "2026-06-13T16:00:12Z"
}
```

Allowed `outcome` values:

```txt
promoted | failed | withdrawn
```

---

## 7. Live feed binding — Phase 4 Inspector

Phase 4 adds a `liveTracking` section to the Inspector. This section is available for compatible maritime and vehicle actor types. It is hidden for actor categories that cannot receive feed bindings, including `structure` and static `prop` actors.

### 7.1 Feed binding UX decision

Phase 4 uses a hybrid model:

1. The author selects feed type.
2. The author enters `feedSourceId`, `bindingKey`, and `bindingValue`.
3. The author clicks Validate.
4. The validation result is advisory during Draft editing.
5. The Promotion Gate runs authoritative validation at gate time.

Phase 4 does not include a feed browser or feed management UI.

### 7.2 `liveTracking` Inspector fields

| Field | Control | Behavior |
|---|---|---|
| `liveTracking.feedType` | Dropdown | `ais`, `gtfs_rt`, `gbfs`. Changing feed type clears `bindingKey` and `bindingValue` and shows feed-specific fields. |
| `liveTracking.feedSourceId` | Text input | Identifies the source system, such as `mta-gtfs-rt`, `citibike-gbfs`, or `ais-feed-default`. |
| `liveTracking.bindingKey` | Dropdown or constrained text input | Identifies the field used to bind the actor: `mmsi`, `vehicle_id`, `trip_id`, `route_id`, `stop_id`, `station_id`, `system_id`. |
| `liveTracking.bindingValue` | Text input | Actual external identifier. Validated on button press only. |
| Validate button | Button | Confirms `bindingValue` exists for the selected `feedType`, `feedSourceId`, and `bindingKey`. Shows `FOUND`, `NOT FOUND`, or `FEED ERROR` inline. Does not block Draft save. |
| `liveTracking.feedUrl` | Text input | Optional endpoint override. Blank means WOS default for selected `feedType` / `feedSourceId`. |
| `liveTracking.pollHz` | Number input | Float. Pre-populated with feed-type default on feed type selection. Editable. |
| `liveTracking.drEnabled` | Toggle | Boolean. Pre-populated `true` for `ais` and `gtfs_rt`, `false` for `gbfs`. Editable. |
| `liveTracking.drMaxSec` | Number input | Integer seconds. Shown only when `drEnabled = true`. |

### 7.3 Feed-type-specific extension fields

#### AIS extension — `feedType = ais`

1. `ais.statusCodes`: multi-select of AIS status codes `0–15`. Default: all codes selected.
2. `ais.hideOnSART`: toggle. Default `true`. Hides actor when code `14` distress is active.

#### GTFS-RT extension — `feedType = gtfs_rt`

1. `gtfsRt.routeId`: text input. Optional. MTA route ID for buses, such as `M15`, or line for subway.
2. `gtfsRt.tripId`: text input. Optional. Specific trip binding. `trip_id` is only stable within a service day.

#### GBFS extension — `feedType = gbfs`

1. `gbfs.stationId`: text input. Null for free-floating bikes.
2. `gbfs.dockStatus`: read-only display populated from feed after validate. Not author-editable.

### 7.4 Live validate behavior

1. Author enters `feedSourceId`, selects `bindingKey`, enters `bindingValue`, and clicks Validate.
2. Inspector calls the appropriate feed endpoint for `feedType`.
3. AIS validation checks `mmsi` against the AIS feed.
4. GTFS-RT validation checks the selected `bindingKey` against the current GTFS-RT snapshot.
5. GBFS validation checks `station_id` against `station_information.json` when binding a station.
6. Result appears inline adjacent to the `bindingValue` field.

| Result | Badge | Meaning | Draft save impact |
|---|---|---|---|
| `FOUND` | Green | `bindingValue` confirmed present at validation time. | Does not block save. |
| `NOT FOUND` | Amber | `bindingValue` not present. Entity may be inactive, off-route, off-dock, or feed may be stale. | Does not block save. |
| `FEED ERROR` | Red | Feed endpoint unreachable. | Does not block save. |

### 7.5 Gate-time feed validation

Live validation during Draft editing is advisory. Promotion Gate validation at gate time is authoritative.

At gate time:

1. `FOUND` passes.
2. `NOT FOUND` blocks promotion if the feed is reachable and the `bindingValue` is confirmed absent.
3. `FEED ERROR` becomes a Group C warning, not a hard block, unless the actor is marked as requiring live tracking as a runtime-critical dependency.
4. The Group C result is written to the gate result record regardless of outcome.

---

## 8. Rotate gizmo — `headingDeg` only

Phase 4 adds the rotate gizmo. The rotate gizmo controls only `anchor.headingDeg`. No scale field is added. No manifest schema change is authorized for Phase 4.

### 8.1 Gizmo appearance

1. Rotate gizmo appears alongside the translate gizmo when an actor is selected.
2. It renders as a circular arc handle around the actor.
3. It is oriented for horizontal rotation around the world vertical axis.
4. No vertical rotation handle is shown.
5. No scale handles are shown.

### 8.2 Rotate gizmo behavior

1. Author clicks and drags the rotate arc handle.
2. Actor mesh rotates around its Y axis.
3. Rotation maps to `anchor.headingDeg` in degrees.
4. `headingDeg` wraps: exceeding `359.9°` wraps to `0°`; going below `0°` wraps to `359.9°`.
5. Inspector `headingDeg` field updates live during drag using transient preview state.
6. No manifest write occurs during drag.
7. On drag release, final `headingDeg` is written to the manifest store atomically as one update.
8. Rotate action is added to the undo stack as one operation: start heading → end heading.

### 8.3 Rotate gizmo scope lock

1. Scale is not in scope for Phase 4.
2. `WOSActorManifest` has no scale field. Do not add one.
3. Pitch and roll are not in scope.
4. The Inspector `headingDeg` field and rotate gizmo write to the same manifest field.

---

## 9. LOD threshold editing

Phase 4 adds LOD threshold editing to the Inspector. LOD editing is promotion-adjacent because thresholds determine runtime rendering behavior after canonical promotion.

### 9.1 LOD Inspector fields

| Field | Control | Validation |
|---|---|---|
| `lod.highM` | Number input | Float. Must be `> 0` and `< lod.medM`. |
| `lod.medM` | Number input | Float. Must be `> lod.highM` and `< lod.lowM`. |
| `lod.lowM` | Number input | Float. Must be `> lod.medM` and `< lod.billboardM`. |
| `lod.billboardM` | Number input | Float. Must be `> lod.lowM`. |

### 9.2 LOD preview ring update

1. Phase 3 LOD rings update in real time as the author edits threshold values in the Inspector.
2. Ring radius changes immediately on field edit.
3. No save is required to preview ring changes.
4. Default LOD values (`500 / 2000 / 8000 / 20000`) are shown as a grey baseline ring set when the actor’s LOD matches `DEFAULT_LOD`.

### 9.3 Strictly ascending invariant

1. LOD thresholds must always be strictly ascending: `highM < medM < lowM < billboardM`.
2. If the author edits a value that breaks the invariant, the Inspector shows an error on all affected fields: `Thresholds must be in ascending order.`
3. Save is disabled while any LOD threshold is invalid.
4. This invariant is also a Group A blocking check in the Promotion Gate.

---

## 10. Continuity scalar editing

Phase 4 adds continuity scalar editing for live-tracking actors. Scalars are only shown when `liveTracking` is non-null and `drEnabled = true`. They are hidden for static actors.

### 10.1 Scalar Inspector fields

| Field | Range | Null/default behavior |
|---|---|---|
| `scalars.continuityAlpha` | `[0, 1]` | `null` means runtime default applies. |
| `scalars.deadReckoningWeight` | `[0, 1]` | Required for live-tracking actors. `0` for static actors. No null. |
| `scalars.coastAlpha` | `[0, 1]` | `null` means runtime default applies. |
| `scalars.staleWeight` | `[0, 1]` | `null` means runtime default applies. |
| `scalars.interpolationWeight` | `[0, 1]` | `null` means runtime default applies. |

### 10.2 Null scalar UX

1. Nullable scalars show a **Use runtime default** toggle.
2. When enabled, the field is disabled and the value in the manifest is `null`.
3. When disabled, the field becomes editable and accepts a float in `[0, 1]`.
4. This prevents authors from accidentally setting a scalar to `0` when they intend runtime default behavior.

### 10.3 Scalar snapshot at promotion

1. When an actor is promoted, the runtime reads scalar values from the promoted manifest as constants.
2. Null scalars cause the runtime to use its own defaults.
3. Non-null scalars override runtime defaults for that actor.
4. Lab edits after promotion have no effect on the running actor until the actor is forked, re-promoted, and the old actor is retired.

---

## 11. Promoted actor retirement

Phase 3 blocks deletion of promoted actors. Phase 4 introduces the retirement flow. Retirement is the only way to remove a promoted actor from WOS runtime eligibility.

### 11.1 Retirement sequence

1. Author selects a `PROMOTED` or `DEPRECATED` actor in the Library.
2. Author clicks **Retire actor**.
3. Retirement panel opens.
4. Author enters a retire reason of at least 20 characters.
5. Author clicks **Confirm retirement**.
6. Final confirmation dialog appears: `Retiring this actor will remove it from the WOS runtime permanently. This cannot be undone.`
7. Author confirms.
8. Registry entry updates to `status: "retired"` with `retiredAt`, `retiredBy`, and `retireReason` written atomically.
9. Actor manifest is flagged retired in `wos-actors.json`.
10. Lab removes the actor from the 3D Canvas authoring scene immediately.
11. Library badge updates to `Retired`.
12. WOS runtime ignores the retired actor on next startup.

### 11.2 Retirement rules

1. Retirement is permanent and not undoable.
2. There is no un-retire action.
3. Retirement does not delete the manifest entry.
4. The manifest entry is archived in place.
5. Phase 4 does not require hot-unload from an already-running broadcast runtime.
6. A `DEPRECATED` actor that is the `supersedes` target of a `GATE_PENDING` actor cannot be retired until the pending fork is promoted or withdrawn.

### 11.3 Breaking change artifact

When a promoted actor is retired, a breaking change artifact is written adjacent to the registry entry using the `ContractGovernance v1.3.0` artifact format.

```json
{
  "artifactType": "breaking-change",
  "severity": "breaking",
  "objectId": "a1b2c3d4-...",
  "retiredAt": "2026-06-13T17:00:00Z",
  "retiredBy": "user-session-id",
  "reason": "Asset replaced by higher-fidelity model sr_flatiron_v2_001.",
  "supersededBy": "b2c3d4e5-..."
}
```

---

## 12. Runtime behavior on promotion

This section is normative for runtime integration.

### 12.1 Scene loading

1. Runtime reads `data/actors/wos-registry.json` on startup.
2. Runtime loads actors with `status = promoted` or `status = deprecated`, unless retired.
3. Promoted actor `assetId` resolves via `AssetResolver`.
4. The resolved glTF is loaded into the Three.js scene.
5. If multiple promoted actors share the same `assetId`, the runtime uses instanced rendering (`InstancedMesh` or equivalent): one glTF load, N instances.
6. If `assetId` does not resolve at startup, the actor enters DEGRADED sub-reason `asset-missing`.
7. Promoted LOD thresholds are registered with the MarineRenderer LOD controller from first frame.

### 12.2 Feed subscription on promotion

1. For actors with `liveTracking` non-null, the runtime opens a feed subscription using `feedType`, `feedSourceId`, `bindingKey`, and `bindingValue` on startup.
2. If subscription fails to connect within `connectTimeoutMs`, recommended `8000ms`, the actor enters DEGRADED sub-reason `feed-unavailable`.
3. The actor renders at its anchor position when feed is unavailable.
4. Scalar values from the promoted manifest are loaded as constants.
5. Null scalars use runtime defaults.
6. GBFS actors with `drEnabled = false` bypass the dead-reckoning loop. GBFS handler outputs dock state directly to the renderer.

### 12.3 DEGRADED sub-reasons

| Sub-reason | Trigger | Runtime behavior |
|---|---|---|
| `asset-missing` | `assetId` does not resolve at startup. | Actor is not rendered. No placeholder fallback. DEGRADED flag raised. |
| `feed-unavailable` | Feed subscription fails within `connectTimeoutMs`. | Actor renders at anchor position. DEGRADED flag raised. Dead-reckoning loop does not start. |
| `feed-stale` | No feed update within `drMaxSec`. | Dead reckoning continues until forced coast threshold. Actor renders at last known or coasted position. DEGRADED flag raised. |

### 12.4 DEGRADED visibility rule

DEGRADED visibility depends on sub-reason:

1. `asset-missing`: actor is not rendered because geometry cannot resolve.
2. `feed-unavailable`: actor renders at its anchor position.
3. `feed-stale`: actor renders at last known or coasted position.
4. DEGRADED is an operational health signal, not a removal mechanism.
5. Only retirement removes an actor from canonical runtime eligibility.

---

## 13. New and updated controllers — Phase 4

| Controller | Phase | Responsibility |
|---|---|---|
| `ActorManifestStore` | Phase 1–4 | Adds `fork(objectId, changeReason)` and `retire(objectId, reason)`. |
| `InspectorController` | Phase 2–4 | Adds `liveTracking` section, LOD threshold fields, scalar fields, and rotate gizmo `headingDeg` observation. |
| `GizmoController` | Phase 3–4 | Adds rotate arc handle. Publishes transient preview heading during drag. Commits on release. |
| `LODRingController` | Phase 3–4 | Updates rings live during LOD Inspector field edits. Shows DEFAULT_LOD baseline rings. |
| `PromotionGateController` | Phase 4 | Owns gate submission, check execution, result recording, and `GATE_PENDING ↔ DRAFT ↔ PROMOTED` transitions. |
| `ActorRegistryController` | Phase 4 | Owns canonical registry reads/writes, `objectId` uniqueness, dependency tracking, supersession, retirement writes. |
| `FeedBindingController` | Phase 4 | Owns live-validate calls per feed type. Does not own runtime feed subscriptions. |
| `RetirementController` | Phase 4 | Owns retirement reason input, confirmation dialog, registry write, and Lab scene removal signal. |

---

## 14. Explicitly out of scope in Phase 4

Do not build in Phase 4:

1. Scale gizmo.
2. Scale field in `WOSActorManifest`.
3. Pitch or roll rotation.
4. Feed browser or feed management UI.
5. Batch promotion.
6. Automated promotion / CI gate.
7. Registry migration to a database or service.
8. Governance history viewer.
9. Multi-actor selection for bulk retirement.
10. Animated actors or keyframe support.
11. Live feed preview in Lab viewport for promoted actors.

---

## 15. Acceptance criteria

### 15.1 Promotion Gate

1. All Group A blocking checks run and block correctly on failure.
2. Group B warnings are shown and overridable via checkbox plus note of at least 10 characters.
3. Group C checks run automatically.
4. Passing gate transitions actor to `PROMOTED` and writes a registry entry.
5. Failing gate returns actor to `DRAFT` with gate result report attached.
6. Gate result records are written for every submission: pass, fail, and withdrawn.

### 15.2 Actor lifecycle

1. `DRAFT` actors can be submitted, edited, and deleted.
2. `GATE_PENDING` actors are read-only. Withdraw returns to `DRAFT`.
3. `PROMOTED` actors load in WOS runtime at anchor position with LOD active.
4. Editing a `PROMOTED` actor triggers transient `LOCKED` UI state. The edit is not applied. Author must fork.
5. Forking a `PROMOTED` actor creates a new `DRAFT` with a new `objectId` and `supersedes` pointer.
6. Original actor remains `PROMOTED` until the fork is promoted.
7. Promoting the fork transitions the original actor to `DEPRECATED` and writes `supersededBy`.
8. `DEPRECATED` actors remain runtime-eligible until retired.
9. Retirement transitions actor to `RETIRED`.

### 15.3 Registry

1. `wos-registry.json` is written atomically on every promotion and retirement.
2. `objectId` uniqueness is enforced.
3. Duplicate `objectId` blocks promotion.
4. Retired entries remain in the registry permanently with `retiredAt`, `retiredBy`, and `retireReason`.
5. Supersession pointers `supersedes` and `supersededBy` are written correctly on fork promotion.

### 15.4 Feed binding

1. `liveTracking` Inspector section is shown for compatible maritime and vehicle actor types.
2. `liveTracking` Inspector section is hidden for structure and static prop actors.
3. Validate button confirms `bindingValue` against the live feed for `feedType`, `feedSourceId`, and `bindingKey`.
4. Inline validation shows `FOUND`, `NOT FOUND`, or `FEED ERROR`.
5. Gate-time feed validation blocks promotion when feed is reachable and `bindingValue` is absent.
6. Gate-time feed validation records `FEED ERROR` as a warning when feed is unreachable.
7. Feed subscription opens on runtime startup for promoted live-tracking actors.
8. DEGRADED sub-reasons are distinct: `asset-missing`, `feed-unavailable`, `feed-stale`.

### 15.5 Rotate gizmo

1. Rotate arc handle appears alongside translate gizmo on selected actor.
2. Dragging the handle updates `headingDeg` as transient preview.
3. No manifest write occurs during drag.
4. On drag release, `headingDeg` is written atomically to the manifest store.
5. `headingDeg` wraps correctly at `0°` and `360°`.
6. Rotate action is undoable as a single operation.

### 15.6 LOD threshold editing

1. All four LOD fields are editable in the Inspector.
2. LOD rings update in real time during Inspector field edits.
3. Baseline ring set is visible when LOD matches `DEFAULT_LOD`.
4. Strictly ascending invariant is enforced inline.
5. Save is disabled while LOD is invalid.

### 15.7 Continuity scalar editing

1. **Use runtime default** toggle works for each nullable scalar.
2. `deadReckoningWeight` is shown only for live-tracking actors, not static actors.
3. Promoted manifest scalar values are loaded as constants by runtime.
4. Lab edits to promoted actors do not affect running actor until fork, re-promotion, and old actor retirement.

### 15.8 Retirement

1. Retired actors are removed from the 3D Canvas authoring scene immediately.
2. WOS runtime ignores retired actors on next startup.
3. Retirement requires a reason of at least 20 characters.
4. Retirement is not undoable.
5. No un-retire action exists.
6. Breaking change artifact is written on retirement.
7. A `DEPRECATED` actor that is the target of a `GATE_PENDING` fork cannot be retired until the fork is resolved.

---

## Appendix A — Fully promoted actor manifest example

```json
{
  "objectId": "a1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4d5",
  "actorCategory": "maritime",
  "actorType": "vessel",
  "assetId": "sr_container_ship_001",
  "anchor": {
    "lat": 40.6892,
    "lon": -74.0445,
    "altM": 0,
    "headingDeg": 270
  },
  "lod": {
    "highM": 800,
    "medM": 3000,
    "lowM": 10000,
    "billboardM": 25000
  },
  "scalars": {
    "continuityAlpha": 0.85,
    "deadReckoningWeight": 0.9,
    "coastAlpha": 0.4,
    "staleWeight": 0.1,
    "interpolationWeight": 0.7
  },
  "liveTracking": {
    "feedType": "ais",
    "feedSourceId": "ais-feed-default",
    "bindingKey": "mmsi",
    "bindingValue": "338234631",
    "feedUrl": null,
    "pollHz": 0.017,
    "drEnabled": true,
    "drMaxSec": 300,
    "ais": {
      "statusCodes": [0, 1, 2, 3, 5],
      "hideOnSART": true
    }
  },
  "meta": {
    "specVersion": "1.6.1",
    "authoredAt": "2026-06-13T14:32:00Z",
    "authoredBy": "user-session-id",
    "promoted": true,
    "promotedAt": "2026-06-13T16:00:12Z",
    "changeReason": null,
    "displayLabel": "Container Ship — NY Harbor"
  }
}
```

---

## Appendix B — Complete actor lifecycle reference

```txt
1. Author drags asset from Library → 3D Canvas                         [Phase 1: Place]
2. Actor manifest created: promoted false                              [Phase 1: Save]
3. Author edits properties in Inspector                                [Phase 2: Configure]
4. Author moves actor with translate gizmo                             [Phase 3: Move]
5. Author sets headingDeg with rotate gizmo                            [Phase 4: Orient]
6. Author edits LOD thresholds                                         [Phase 4: LOD]
7. Author binds live feed and validates bindingValue                   [Phase 4: Feed]
8. Author submits actor to Promotion Gate                              [Phase 4: Gate]
9. Gate runs checks; blocking failures return to DRAFT                 [Phase 4: Gate]
10. Gate passes; actor becomes PROMOTED                                [Phase 4: Promote]
11. Runtime loads actor on next startup                                [Runtime]
12. Author forks actor; new DRAFT created, original stays PROMOTED     [Phase 4: Fork]
13. Fork promoted; fork becomes PROMOTED, original becomes DEPRECATED  [Phase 4: Supersede]
14. Old actor retired when no longer needed                            [Phase 4: Retire]
```

---

## Appendix C — Revision history

| Version | Date | Notes |
|---|---|---|
| v1.0.0 | 2026-06-13 | BUILD. Governance, Promotion Gate, canonical registry, lifecycle states, live feed binding, heading-only rotate gizmo, LOD/scalar editing, runtime promotion behavior, DEGRADED states, fork/supersede, and retirement flow locked. |

