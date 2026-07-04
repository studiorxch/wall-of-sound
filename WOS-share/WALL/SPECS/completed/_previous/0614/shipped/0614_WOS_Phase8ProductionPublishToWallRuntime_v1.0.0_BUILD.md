---
layout: spec
title: "WOS Phase 8 Production Publish to Wall Runtime"
date: 2026-06-14
doc_id: "0614_WOS_Phase8ProductionPublishToWallRuntime_v1.0.0_BUILD"
version: "1.0.0"
project: "Wall of Sound"
system: "WOS"
domain: "runtime"
component: "WallRuntime"
type: "build-spec"
status: "approved"
priority: "high"
risk: "high"
classification: "runtime-publish-boundary"
summary: "Phase 8: Production Publish to Wall Runtime. Implements the Studio to Wall publish path defined in 0614_WOS_WallRuntimeArchitecture_v1.0.0_SPEC. StudioPublisher assembles promoted actor bundles. Five Wall runtime modules consume the bundle: BundleLoader, ActorFilter, StructureReplacementLayer, MaterialOverrideApplicator, Diagnostics. Rollback to previous known-good bundle on validation failure. Studio and Wall are isolated systems sharing only data contracts."
spec_version: "WOS-3DLAB-P8-v1.0.0"
prerequisite: "0614_WOS_WallRuntimeArchitecture_v1.0.0_SPEC"
depends_on:
  - "WOS-3DLAB-P7-v1.0.0"
  - "Three.js"
  - "Mapbox GL JS"
enables:
  - "StudioPublisher"
  - "WallRuntimeBundleLoader"
  - "WallRuntimeActorFilter"
  - "WallRuntimeStructureReplacementLayer"
  - "WallRuntimeMaterialOverrideApplicator"
  - "WallRuntimeDiagnostics"
new_files:
  - "studio/systems/publish/studioPublisher.js"
  - "wall/systems/runtime/wallRuntimeBundleLoader.js"
  - "wall/systems/runtime/wallRuntimeActorFilter.js"
  - "wall/systems/runtime/wallRuntimeStructureReplacementLayer.js"
  - "wall/systems/runtime/wallRuntimeMaterialOverrideApplicator.js"
  - "wall/systems/runtime/wallRuntimeDiagnostics.js"
updated_files:
  - "studio/views/threeDCanvasView.js"
  - "studio/index.html"
shared_files:
  - "shared/data/wosPalette.js"
moved_files:
  - from: "studio/data/wosPalette.js"
    to: "shared/data/wosPalette.js"
    reason: "Wall must not import from studio/ path"
bundle_output: "wos-wall-runtime-bundle.json"
rollback_bundle: "wos-wall-runtime-bundle.previous.json"
doctrine:
  - "Wall consumes promoted runtime bundles only"
  - "Studio authors and governs — Wall renders"
  - "Wall never consumes Draft state"
  - "Wall never consumes assetPath"
  - "Wall restores original Mapbox buildings when replacements disappear"
  - "Wall applies material overrides as runtime presentation state from promoted manifest truth"
  - "Wall fails safe before it fails visible"
  - "Studio and Wall share data contracts, not code"
  - "Publish does not promote — promote first, then publish"
tags:
  - "wos"
  - "wall-runtime"
  - "studio-publish"
  - "runtime-bundle"
  - "rollback"
  - "structure-suppression"
  - "material-override-runtime"
  - "phase-4-gate"
---

# WOS Phase 8 — Production Publish to Wall Runtime

WOS
Phase 8: Production Publish to Wall Runtime

---

**Doc ID:** Version
**Status:** Date
**Spec ref:** Prerequisite
**Depends on:** Requires
**New files:** Updated files
**Ship gate:** 

---


## 1. Purpose and scope

Phases 1–7 built and proved the Studio-side authoring stack: placement, configuration, governance, 3D render preview, building replacement, and material overrides. Phase 8 connects Studio output to the Wall runtime — the live broadcast display environment. It implements the Studio → Wall publish path defined in the Wall Runtime Architecture spec (0614_WOS_WallRuntimeArchitecture_v1.0.0_SPEC).
Phase 8 scope is the publish boundary and runtime consumption. It does not introduce new authoring tools, material systems, building modelling, camera systems, feed adapters, or CDN deployment implementation.

> **Ship gateAuthor promotes an actor in Studio using the Phase 4 gate.Author clicks Publish in Studio. Studio assembles and writes wos-wall-runtime-bundle.json.The Wall runtime loads the bundle. PROMOTED actors render in the live display.Structure replacement suppressions are applied to the Mapbox layer.Material overrides are applied to actor Object3Ds.Feed-bound actors (AIS, GTFS-RT, GBFS) receive live subscriptions where present.A newly published bundle that fails Wall validation causes rollback to the previous known-good bundle.Studio UI modules are never imported by the Wall runtime.**


## 2. Studio → Wall boundary

This boundary is the central contract of Phase 8. Everything on the Studio side stays in Studio. Everything the Wall consumes comes only through the published bundle.

### 2.1 Studio owns

1. Library, 3D Canvas, Inspector — all authoring UI
1. Draft, GATE_PENDING, PROMOTED, DEPRECATED, and RETIRED records — all lifecycle states for authoring review
1. The promotion gate and governance history
1. Building replacement authoring (Phase 6)
1. Material override authoring (Phase 7)
1. Local authoring previews — never sent to Wall


### 2.2 Wall owns

1. Live display and broadcast rendering
1. Runtime bundle loading and validation
1. Lifecycle filtering — only PROMOTED actors render by default
1. Map and world presentation
1. Feed-driven motion
1. Runtime fallback behaviour


> **Wall MUST NOT import Studio modulesstudioShell.jsthreeDCanvasView.jsinspectorController.jsmaterialOverrideController.jsbuildingSelectionController.jsAny other Studio authoring module.The Wall runtime is a separate system. Studio and Wall share data contracts, not code.**


## 3. Runtime bundle — wos-wall-runtime-bundle.json


### 3.1 Bundle shape

```js
// wos-wall-runtime-bundle.jsoninterface WOSWallRuntimeBundle {  bundleVersion: string;        // semver, incremented on every publish  publishedAt:   string;        // ISO 8601  publishedBy?:  string;        // user/session identifier  registry: WOSActorRegistryEntry[];  // from wos-registry.json  actors:   WOSActorManifest[];       // from wos-actors.json, filtered  metadata?: {    source:        "studio";    studioVersion?: string;    buildId?:       string;    notes?:         string;  };}
```


### 3.2 Bundle eligibility rules


> **Bundle MUST contain only runtime-eligible recordsPROMOTED actors: included.DEPRECATED actors: included only for rollback compatibility or visual comparison. Hidden by default.DRAFT actors: excluded. Must not appear in the bundle.GATE_PENDING actors: excluded.RETIRED actors: excluded.Any actor with assetPath, assetUrl, or glbPath fields: excluded.**


### 3.3 Bundle version

1. bundleVersion is a semver string, incremented on every publish. The Wall uses this to detect stale bundles.
1. If the Wall receives a bundle with a bundleVersion lower than or equal to the current active bundle, it rejects it as stale.
1. bundleVersion is set by StudioPublisher at publish time. Authors do not set it manually.


## 4. StudioPublisher — studioPublisher.js

StudioPublisher is the new Studio-side module that assembles and writes the runtime bundle. It is the only path from Studio to Wall.

### 4.1 Responsibilities

1. Read promoted actors from WOSActorManifestStore (meta.promoted === true, not retired).
1. Read corresponding registry entries from the canonical actor registry (wos-registry.json).
1. Filter out DRAFT, GATE_PENDING, and RETIRED actors.
1. Strip any forbidden runtime fields (assetPath, assetUrl, glbPath, previewAnchor, previewHeading, inspectorDraft, authoringSelectionState).
1. Assemble the WOSWallRuntimeBundle object.
1. Increment bundleVersion.
1. Write wos-wall-runtime-bundle.json atomically (temp file → rename).
1. Archive the previous bundle as wos-wall-runtime-bundle.previous.json.
1. Emit a publish completion event with bundle metadata.


### 4.2 Does NOT own

1. Wall runtime loading or validation — that is WallRuntimeBundleLoader.
1. Any runtime rendering — that is the Wall render layer.
1. The promotion gate — that is PromotionGateController (Phase 4).
1. Any authoring UI — StudioPublisher is a headless data assembly module.


### 4.3 Publish sequence

Author clicks Publish in Studio.
StudioPublisher reads all actors from WOSActorManifestStore.
Filters to meta.promoted === true AND meta.retiredAt is absent.
Reads registry entries for each eligible actor from wos-registry.json.
Strips forbidden fields from each manifest.
Assembles WOSWallRuntimeBundle with current timestamp and incremented bundleVersion.
Writes wos-wall-runtime-bundle.previous.json ← current bundle (backup).
Writes wos-wall-runtime-bundle.json atomically.
Emits publish event: { bundleVersion, publishedAt, actorCount }.
Studio displays publish confirmation with bundle metadata.


### 4.4 Forbidden field stripping

```js
const FORBIDDEN_RUNTIME_FIELDS = [  "assetPath", "assetUrl", "glbPath", "localFilePath",  "authoringSelectionState", "inspectorDraft",  "previewAnchor", "previewHeading"];function stripForbiddenFields(manifest) {  const clean = { ...manifest };  for (const field of FORBIDDEN_RUNTIME_FIELDS) {    delete clean[field];  }  return clean;}
```


### 4.5 StudioPublisher interface

```js
class StudioPublisher {  constructor(manifestStore, registry)  // Assemble and write the runtime bundle  async publish(): Promise<PublishResult>  // Preview what would be in the next bundle (dry run, no write)  async previewBundle(): Promise<WOSWallRuntimeBundle>}interface PublishResult {  bundleVersion: string  publishedAt:   string  actorCount:    number  bundlePath:    string}
```
### 4.6 Local dev publish endpoint

Browser Studio cannot write arbitrary files without a server-side path. Phase 8 local-dev publish uses a lightweight Node.js write endpoint.

**Endpoint:** `POST http://localhost:PORT/wos/publish`

**Request body:** `WOSWallRuntimeBundle` (JSON)

**Endpoint behaviour:**
- Receives the assembled bundle from StudioPublisher.
- Archives the current wos-wall-runtime-bundle.json to wos-wall-runtime-bundle.previous.json.
- Writes the new bundle atomically via temp file → rename.
- Returns `{ ok: true, bundleVersion, publishedAt }` on success.
- Returns `{ ok: false, error }` on failure. Previous bundle is preserved.

**Locked rules:**
- Do not substitute browser `Blob` download as the publish path unless the feature is explicitly marked as Export Mode (offline authoring only).
- Export Mode may write a downloadable bundle JSON for manual deployment, but it is not the default publish path.
- The Wall runtime reads the file from disk, not from a browser download.

**Suggested file:** `studio/systems/publish/localPublishServer.js` (dev tooling, not production Studio code)



## 5. Wall runtime modules

Five new modules implement the Wall-side consumption contract. Each has a single clear ownership boundary. None imports Studio authoring modules.

### 5.1 WallRuntimeBundleLoader


| Field | Type | Description |
| --- | --- | --- |
| Location | string | wall/systems/runtime/wallRuntimeBundleLoader.js |
| Purpose | string | Bundle fetch, parse, validation, rollback pointer management |
| Does NOT own | string | Rendering, actor filtering, material application, diagnostics |

```js
class WallRuntimeBundleLoader {  constructor(bundlePath)  // Load and validate bundle. Returns validated bundle or throws.  async load(): Promise<WOSWallRuntimeBundle>  // Rollback to previous known-good bundle.  async rollback(): Promise<WOSWallRuntimeBundle>  // Returns current active bundle metadata.  getActiveBundleMeta(): { bundleVersion: string; publishedAt: string } | null}
```


### 5.2 WallRuntimeActorFilter


| Field | Type | Description |
| --- | --- | --- |
| Location | string | wall/systems/runtime/wallRuntimeActorFilter.js |
| Purpose | string | Lifecycle filtering, manifest field rejection, runtime eligibility |
| Does NOT own | string | Bundle loading, rendering, diagnostics |

```js
class WallRuntimeActorFilter {  // Returns only runtime-eligible actors from the bundle.  filter(bundle: WOSWallRuntimeBundle): WOSActorManifest[]  // Returns actors rejected and the reason for each.  getRejected(): Array<{ objectId: string; reason: string }>}// Eligibility: PROMOTED, not retired, no forbidden fields, valid anchorfunction isEligible(actor: WOSActorManifest): boolean {  return (    actor.meta.promoted === true &&    !actor.meta.retiredAt &&    !actor.assetPath &&    !actor.assetUrl &&    !actor.glbPath &&    !!actor.objectId &&    isValidAnchor(actor.anchor)  );}
```


### 5.3 WallRuntimeStructureReplacementLayer


| Field | Type | Description |
| --- | --- | --- |
| Location | string | wall/systems/runtime/wallRuntimeStructureReplacementLayer.js |
| Purpose | string | Mapbox feature-state suppression for structure replacement actors |
| Does NOT own | string | Actor manifest creation, building selection, material application |

```js
class WallRuntimeStructureReplacementLayer {  constructor(map)  // Apply suppressions for all eligible structure actors in bundle.  // Called after bundle load and actor filter.  applyAll(actors: WOSActorManifest[]): void  // Restore all suppressed buildings (on bundle swap or rollback).  restoreAll(): void  // Restore a single building (actor removed from bundle).  restore(featureId: string | number, sourceId: string, sourceLayer: string): void}
```

Canonical suppression (from Wall Runtime Architecture spec §6.4):
```js
// Apply: suppress buildingmap.setFeatureState(  { source: actor.structure.mapboxSourceId,    sourceLayer: actor.structure.mapboxSourceLayer,    id: actor.structure.mapboxFeatureId },  { wosReplaced: true });map.setPaintProperty(actor.structure.mapboxLayerId, "fill-extrusion-opacity", [  "case", ["boolean", ["feature-state", "wosReplaced"], false], 0, prevOpacity]);// Restore: clear suppressionmap.removeFeatureState(  { source: actor.structure.mapboxSourceId,    sourceLayer: actor.structure.mapboxSourceLayer,    id: actor.structure.mapboxFeatureId },  "wosReplaced");// MUST NOT use setFilter() for replacement suppression.
```


### 5.4 WallRuntimeMaterialOverrideApplicator


| Field | Type | Description |
| --- | --- | --- |
| Location | string | wall/systems/runtime/wallRuntimeMaterialOverrideApplicator.js |
| Purpose | string | Runtime material cloning, palette resolution, color/class/PBR scalar application |
| Does NOT own | string | Material override authoring, palette editing, actor lifecycle |

```js
class WallRuntimeMaterialOverrideApplicator {  constructor(palette)  // WOS_PALETTE from wosPalette.js  // Apply override to an actor Object3D after load.  apply(object3D: THREE.Object3D, override: WOSMaterialOverride): void  // Reset to base material (on actor rebuild or bundle swap).  reset(object3D: THREE.Object3D): void}
```


> **Material cloning rule applies at runtime tooWall runtime MUST clone materials before applying overrides, identical to Studio (Phase 7 §6.2).paletteRef takes precedence over color. PBR scalars ignored on Lambert material.Invalid override fields are skipped silently. Runtime emits a diagnostic but does not crash.wosPalette.js is a shared file used by both Studio and Wall. Wall imports it directly.**


### 5.5 WallRuntimeDiagnostics


| Field | Type | Description |
| --- | --- | --- |
| Location | string | wall/systems/runtime/wallRuntimeDiagnostics.js |
| Purpose | string | Runtime health snapshot, per-actor diagnostic events, debug output |
| Does NOT own | string | Bundle loading, actor rendering, suppression |

```js
class WallRuntimeDiagnostics {  // Record a diagnostic event.  emit(diag: WOSRuntimeDiagnostic): void  // Return current debug snapshot (from Wall Runtime Architecture §13).  getDebugSnapshot(): WOSWallRuntimeDebugSnapshot}interface WOSRuntimeDiagnostic {  level:    "info" | "warn" | "error" | "blocking";  code:     string;  objectId?: string;  message:  string;}interface WOSWallRuntimeDebugSnapshot {  bundleVersion:            string | null;  publishedAt:              string | null;  activeActorCount:         number;  rejectedActorCount:       number;  structureReplacementCount:number;  suppressedBuildingCount:  number;  materialOverrideCount:    number;  feedBoundActorCount:      number;  degradedActorCount:       number;  missingAssetCount:        number;  diagnostics:              WOSRuntimeDiagnostic[];}
```


## 6. Runtime load sequence

Follows the Wall Runtime Architecture spec §10 exactly.
WallRuntimeBundleLoader.load() — fetch, parse, and validate the bundle.
Validate bundle metadata: bundleVersion, publishedAt, source: "studio".
WallRuntimeActorFilter.filter() — apply lifecycle and field eligibility checks.
Resolve assets by assetId through the runtime asset registry.
Initialize actor render layer — place Object3Ds at anchor positions.
WallRuntimeStructureReplacementLayer.applyAll() — suppress Mapbox buildings.
Render all PROMOTED actors in the 3D scene.
WallRuntimeMaterialOverrideApplicator.apply() per actor with non-null materialOverride.
Attach live feed subscriptions for actors with non-null liveTracking.
WallRuntimeDiagnostics.emit() for any rejected actors, failed assets, or suppression failures.


> **Wall fails safe before it fails visibleIf bundle validation fails: keep previous bundle active. Emit blocking diagnostic. Do not render partial bundle.If an actor asset is missing: use proxy fallback or hide safely. Do not crash.If structure suppression fails (feature ID not found): render WOS actor at anchor. Do not suppress unknown building. Emit diagnostic.If material override is invalid: skip invalid fields. Apply remaining valid fields. Emit diagnostic.If feed subscription fails: render actor at authored anchor. Emit feed-unavailable diagnostic.**


## 7. Rollback contract

Directly implements Wall Runtime Architecture spec §12.

### 7.1 Bundle pointers

1. currentBundle: wos-wall-runtime-bundle.json — the active bundle.
1. previousBundle: wos-wall-runtime-bundle.previous.json — the last known-good bundle, written by StudioPublisher on every publish.


### 7.2 Rollback triggers


| Trigger | Automatic? |
| --- | --- |
| Bundle schema validation failure | Yes — immediate |
| Missing critical assets (all actors) | No — operator action required |
| Broken structure suppression (all) | No — operator action required |
| Wall runtime crash on bundle load | Yes — WallRuntimeBundleLoader catches and rolls back |
| Operator explicit rollback request | Yes — on demand |


### 7.3 Rollback sequence

Rollback triggered (automatic or operator).
WallRuntimeStructureReplacementLayer.restoreAll() — clear all wosReplaced feature-states from the current bundle.
WallRuntimeBundleLoader.rollback() — load previousBundle.
Re-run the full load sequence (§6) with the previous bundle.
WallRuntimeDiagnostics.emit() — rollback diagnostic with reason.


### 7.4 Hotfix rule

1. A hotfix bundle follows the same publish path as a normal bundle through StudioPublisher.
1. No hotfix bypasses WallRuntimeBundleLoader validation.
1. A hotfix that fails validation triggers rollback to the bundle that was active before the hotfix attempt.


## 8. Actor runtime states

Wall classifies each actor into one of five runtime states after loading.

| State | Condition | Wall behaviour |
| --- | --- | --- |
| LIVE | Feed data arriving normally | Render from feed position |
| FEED_STALE | No feed update within drMaxSec | Render at last known / coasted position |
| FEED_UNAVAILABLE | Feed subscription failed to connect | Render at authored anchor.lat/lon |
| ASSET_MISSING | assetId does not resolve | Proxy fallback or hide. Emit diagnostic. |
| DEGRADED | Multiple conditions or unknown failure | Render fallback. Emit diagnostic. |


> **Static actor ruleStructure actors and static prop actors MUST have deadReckoningWeight = 0 at runtime.No live-motion smoothing is applied to static actors regardless of their liveTracking field.This rule comes from WOSActorManifest: static actors carry this value in the promoted manifest.**


## 9. Publish UI in Studio

Phase 8 adds a Publish button to the Studio shell. It is the only surface that triggers StudioPublisher.publish(). No authoring action in Phases 1–7 automatically publishes to the Wall.

### 9.1 Publish button behaviour

Author clicks Publish.
Studio shows a pre-publish summary: actor count, structure replacement count, material override count, any unpromoted actors that will be excluded.
Author confirms. StudioPublisher.publish() runs.
On success: Studio displays publish confirmation with bundleVersion and publishedAt.
On failure: Studio displays error. Previous bundle is preserved. Wall is unaffected.


### 9.2 Pre-publish summary


| Summary field | Source |
| --- | --- |
| PROMOTED actors to include | WOSActorManifestStore — meta.promoted = true, not retired |
| DRAFT actors excluded | WOSActorManifestStore — meta.promoted = false |
| Structure replacements | Count of included actors with non-null structure.mapboxFeatureId |
| Material overrides | Count of included actors with non-null materialOverride |
| Feed-bound actors | Count of included actors with non-null liveTracking |
| Current bundle version | Last bundleVersion from wos-wall-runtime-bundle.json |
| New bundle version | Incremented semver (preview) |


> **Publish does not promotePublish assembles and sends already-promoted actors to the Wall.An actor that is Draft at publish time is excluded from the bundle. It does not receive emergency promotion.Authors who want an actor in the next Wall bundle must promote it through the Phase 4 gate first, then publish.There is no "publish and promote" shortcut.**


## 10. Studio isolation

The Wall runtime and Studio are architecturally separate. Phase 8 enforces this boundary.
1. wosPalette.js is the only file shared between Studio and Wall. It is a pure data file with no UI or authoring dependencies.
1. WOSActorManifest TypeScript interfaces are shared as a type contract, not as runtime module imports.
1. All other Studio modules remain Studio-only. Wall imports nothing from studio/.
1. WallRuntimeBundleLoader reads only the written bundle file. It does not access the Studio manifest store directly.


## 11. Explicitly out of scope in Phase 8


> **Do not build in Phase 8New authoring tools, material systems, or building modelling.New camera systems or OBS layout changes.New feed adapters (AIS, GTFS-RT, GBFS feed infrastructure changes).CDN deployment implementation — Phase 8 writes to a local file; CDN delivery is deferred.Multiplayer or remote collaboration.Real-time Wall preview inside Studio.Per-actor publish (all promoted actors publish together).Wall-side promotion gate (Wall consumes promoted content only).Authentication or access control on the bundle endpoint.Bundle diffing or incremental publish. Full bundle on every publish.DEPRECATED actor visual comparison mode. Diagnostic mode only.**


## 12. Acceptance criteria

These implement the Wall Runtime Architecture spec §15 (AC1–AC10) and extend with Phase 8 publish-path criteria.

### AC1 — Bundle filter

1. A bundle containing DRAFT, GATE_PENDING, PROMOTED, DEPRECATED, and RETIRED actors: Wall renders only PROMOTED actors.
1. DEPRECATED actors are not rendered by default.


### AC2 — No forbidden asset fields

1. If an actor manifest contains assetPath, assetUrl, or glbPath: WallRuntimeActorFilter rejects that actor with a logged reason.
1. StudioPublisher strips these fields before writing the bundle. Double protection.


### AC3 — Structure replacement

1. A promoted structure actor with a valid structure.mapboxFeatureId: Wall suppresses the Mapbox extrusion using fill-extrusion-opacity paint expression.
1. WOS actor renders at anchor position.


### AC4 — Replacement restore

1. When a replacement actor is removed from the active bundle (rollback or retire): Wall calls removeFeatureState. Original Mapbox building becomes visible.


### AC5 — Material override (palette)

1. Promoted actor with materialOverride.paletteRef: Wall applies palette color and material class.
1. paletteRef takes precedence over color.


### AC6 — Material override (custom hex)

1. Promoted actor with materialOverride.color: Wall applies the hex color if valid.
1. Invalid hex: skip and emit diagnostic. Do not crash.


### AC7 — Missing asset fallback

1. Promoted actor whose assetId cannot resolve: Wall uses proxy fallback. Does not crash. Emits ASSET_MISSING diagnostic.
1. Structure replacement with missing asset: restore original Mapbox building extrusion.


### AC8 — Static actor continuity

1. Structure and static prop actors: deadReckoningWeight = 0. No live-motion smoothing applied.


### AC9 — Bundle rollback

1. Bundle validation failure: Wall keeps previous known-good bundle active. Does not render partial bundle.
1. Rollback emits a blocking diagnostic with reason.
1. Hotfix bundle that fails validation: rollback to pre-hotfix active bundle.


### AC10 — Studio isolation

1. Wall runtime does not import studioShell.js, threeDCanvasView.js, inspectorController.js, materialOverrideController.js, or buildingSelectionController.js.
1. Verified by static import analysis.


### AC11 — Publish path (Phase 8 specific)

1. Clicking Publish in Studio: StudioPublisher.publish() runs. wos-wall-runtime-bundle.json is written within 2 seconds.
1. Previous bundle is archived to wos-wall-runtime-bundle.previous.json before new bundle is written.
1. Pre-publish summary shows correct actor counts before confirmation.
1. Draft actors are not present in the written bundle.
1. Forbidden fields (assetPath, assetUrl, glbPath) are absent from all actors in the written bundle.


### AC12 — Debug snapshot

1. WOSWallRuntime.getDebugSnapshot() returns all required fields from WOSWallRuntimeDebugSnapshot.
1. activeActorCount matches the count of PROMOTED actors rendered.
1. rejectedActorCount matches the count of actors rejected by WallRuntimeActorFilter.


## 13. Controller summary — Phase 8


| Field | Type | Description |
| --- | --- | --- |
| StudioPublisher | NEW (Phase 8) | Assembles runtime bundle, strips forbidden fields, writes atomically, archives previous. |
| WallRuntimeBundleLoader | NEW (Phase 8) | Bundle fetch, parse, schema validation, rollback pointer. |
| WallRuntimeActorFilter | NEW (Phase 8) | Lifecycle filter, forbidden field rejection, eligibility check. |
| WallRuntimeStructureReplacementLayer | NEW (Phase 8) | Mapbox feature-state suppression for runtime (same contract as Phase 6 Lab layer, separate implementation). |
| WallRuntimeMaterialOverrideApplicator | NEW (Phase 8) | Runtime material cloning, palette resolution, PBR scalar application. |
| WallRuntimeDiagnostics | NEW (Phase 8) | Health snapshot, per-actor diagnostic events, debug output. |
| PromotionGateController | Phase 4 | Unchanged. Promotion is the prerequisite for publish. Phase 8 adds no new gate checks. |
| WOSActorManifestStore | Phase 1–7 | Unchanged. StudioPublisher reads from it. Does not write. |
| wosPalette.js | Phase 7 → Phase 8 | Moved to shared/data/wosPalette.js. Both Studio and Wall import from this path. Wall never imports from studio/. |


## Appendix A: Bundle example

```js
// wos-wall-runtime-bundle.json (abbreviated){  "bundleVersion": "1.3.0",  "publishedAt":   "2026-06-14T14:00:00Z",  "publishedBy":   "user-session-id",  "metadata": { "source": "studio", "buildId": "build-042" },  "registry": [    { "objectId": "a1b2...", "status": "promoted", "specVersion": "1.0.0", ... }  ],  "actors": [    {      "objectId":      "a1b2c3d4-...",      "actorCategory": "structure",      "actorType":     "building",      "assetId":       "sr_glass_tower_001",      // assetPath absent — stripped by StudioPublisher      "anchor": { "lat": 40.758, "lon": -73.985, "altM": 0, "headingDeg": 15 },      "structure": {        "mapboxFeatureId":   9876543,        "mapboxSourceId":    "composite",        "mapboxSourceLayer": "building",        "mapboxLayerId":     "3d-buildings"      },      "materialOverride": {        "paletteRef":    "glass",        "materialClass": "standard",        "roughness":     0.05,        "metalness":     0.1      },      "meta": {        "specVersion": "1.0.0",        "promoted":     true,        "promotedAt":  "2026-06-14T12:00:00Z"        // inspectorDraft absent — stripped        // previewAnchor absent — stripped      }    }  ]}
```


## Appendix B: Final doctrine


> **Wall consumes promoted runtime bundlesStudio authors and governs manifests. Wall renders them.Wall never consumes Draft state.Wall never consumes assetPath.Wall restores original Mapbox buildings when replacements disappear.Wall applies material overrides as runtime presentation state from promoted manifest truth.Wall fails safe before it fails visible.Studio and Wall are isolated systems. They share data contracts, not code.Publish does not promote. Promote first, then publish.**


## Appendix C: Spec revision history


| Version | Date | Notes |
| --- | --- | --- |
| v1.0.0 | 2026-06-14 | Initial BUILD. Implements 0614_WOS_WallRuntimeArchitecture_v1.0.0_SPEC. StudioPublisher, five Wall runtime modules, rollback contract, publish UI, Studio isolation. |

## Implementation Guide

**Start order:**

1. Move `studio/data/wosPalette.js` → `shared/data/wosPalette.js`. Update Studio imports.
2. Build `studio/systems/publish/localPublishServer.js` (dev endpoint, PORT configurable).
3. Build `studio/systems/publish/studioPublisher.js` — assembles bundle, calls endpoint.
4. Add Publish button to Studio shell → calls `StudioPublisher.publish()`.
5. Build `wall/systems/runtime/wallRuntimeBundleLoader.js`.
6. Build `wall/systems/runtime/wallRuntimeActorFilter.js`.
7. Build `wall/systems/runtime/wallRuntimeStructureReplacementLayer.js`.
8. Build `wall/systems/runtime/wallRuntimeMaterialOverrideApplicator.js`.
9. Build `wall/systems/runtime/wallRuntimeDiagnostics.js`.
10. Wire Wall runtime load sequence.

**What to expect:** A promoted actor is published from Studio → localPublishServer writes `wos-wall-runtime-bundle.json` → Wall loads it → renders PROMOTED actors only → structure suppressions applied → material overrides applied → rollback available via previous bundle.

**Do not:** Import any `studio/` module into `wall/`. Share only `shared/data/wosPalette.js`.
