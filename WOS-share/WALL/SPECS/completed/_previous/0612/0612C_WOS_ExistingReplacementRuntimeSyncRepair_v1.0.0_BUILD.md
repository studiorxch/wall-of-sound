# 0612C_WOS_ExistingReplacementRuntimeSyncRepair_v1.0.0_BUILD

## 🚦 SPEC STAGE

Stage: BUILD  
Freeze Decision: ACTIVE  
Action: Repair the existing replacement runtime chain. Do **not** create another replacement runtime, source, layer, or registry.

---

layout: spec

title: "Existing Replacement Runtime Sync Repair"
date: 2026-06-12
doc_id: "0612C_WOS_ExistingReplacementRuntimeSyncRepair_v1.0.0_BUILD"
version: "1.0.0"

project: "Wall of Sound"
system: "WOS"

domain: "rendering"
component: "BuildingReplacementRuntime"

type: "runtime-spec"
status: "active"

priority: "critical"
risk: "high"

classification: "runtime-authority"

summary: "Repair the existing Map Lab → BuildingEditRegistry → BuildingReplacementRuntime → wos-replacement-layer sync path so replacement edits visibly mutate the existing WOS replacement actor without introducing duplicate replacement infrastructure."

doctrine:

- "2D owns truth"
- "2.5D owns presentation"
- "Existing authority before new infrastructure"
- "Visible result before further audit expansion"

depends_on:

- "0609U_WOS_BuildingReplacementProjection"
- "0609V_WOS_BuildingReplacementRuntime"
- "0609W_WOS_ReplacementVisualKit"
- "0610A_WOS_ReplacementFootprintAuthority"
- "0610C_WOS_ReplacementMaterialAuthority"
- "0610F_WOS_ReplacementLayerDominance"
- "0610J_WOS_ReplacementBuildingGroupAuthority"
- "0610K_WOS_CompoundBuildingAuthority"
- "0612A_WOS_HostBuildingLayerBootRepair"

enables:

- "Building replacement video capture"
- "Building stylization pass"
- "Map Lab replacement authoring"
- "WOS-owned building object workflow"

tags:

- "building"
- "replacement"
- "sync-repair"
- "runtime-authority"
- "map-lab"
- "do-not-duplicate"

---

# 🎯 PURPOSE

Repair the existing replacement pipeline that already exists in WOS.

This build exists because recent work created or proposed duplicate replacement infrastructure even though the real system already exists:

```text
studio/mapLab/buildingEditRegistry.js
studio/mapLab/mapInspector.js
studio/mapLab/mapLabView.js
studio/mapLab/mapboxAdapter.js
wall/systems/runtime/buildingReplacementRuntime.js
wall/systems/presentation/buildingEditProjectionRuntime.js
```

The existing production replacement runtime already owns:

```text
wos-replacement-markers
wos-replacement-layer
BuildingReplacementRuntime
BuildingEditRegistry manifest sync
replacement archetypes
replacement materials
replacement footprint authority
group authority
compound authority
layer dominance
source building suppression diagnostics
```

Therefore this patch must **repair the existing chain** instead of creating another one.

The target result is simple:

```text
Change replacement controls in Map Lab
→ existing manifest updates
→ existing BuildingReplacementRuntime reloads/syncs
→ existing wos-replacement-layer changes visibly
→ debug report proves the same object changed
```

---

# 🔥 PROBLEM STATEMENT

WOS has spent multiple patches trying to make building replacement visible and editable.

The visible screenshot now proves three things:

1. A building can be selected.
2. The Inspector already exposes replacement controls.
3. A replacement-like visual can appear.

The unresolved problem is that the selected/editable authority chain is unreliable.

Current failure pattern:

```text
Inspector edits appear to affect source building state
or replacement metadata exists but does not reliably resync
or replacement actor appears but does not become the actual edit authority
or duplicate replacement layers confuse the visual result
```

This patch must establish one authoritative path only.

---

# 🧠 CORE PRINCIPLES

## 1. No New Replacement Runtime

Do not create a new runtime such as:

```text
BuildingReplacementMinimumVisibleResult
BuildingReplacementAuthorityTakeover
BuildingReplacementOverlayRuntime
```

Those are now out of scope.

## 2. No New Replacement Source Or Layer Names

Use only the existing Wall runtime IDs:

```js
SOURCE_ID = 'wos-replacement-markers'
LAYER_ID  = 'wos-replacement-layer'
```

Do not create or rely on:

```js
'wos-building-replacements'
'wos-building-replacement-layer'
'wos-building-replacement-outline-layer'
```

## 3. Repair Sync, Do Not Rebuild Architecture

The correct pipeline is:

```text
Map Lab Inspector
→ BuildingEditRegistry manifest write
→ localStorage['wos.maplab.buildings']
→ BuildingReplacementRuntime.reload()
→ _loadManifest()
→ _sync(map)
→ _buildGeoJSONCollection()
→ _pushToMap(map)
→ wos-replacement-layer visible update
```

## 4. One Selected Building Must Be Traceable

A single building key must be traceable through every stage.

Example:

```text
composite:building:278053488
```

must produce an auditable chain:

```text
manifest.buildings[key].replacement.enabled === true
actor exists for key or group/compound owner
GeoJSON features exist for actor
wos-replacement-layer renders those features
Inspector edits mutate that same replacement authority
```

## 5. Disable Duplicate 0612B Runtime During This Repair

If `buildingReplacementMinimumVisibleResult.js` is loaded, it must be removed from the load path or hard-disabled for this repair.

It creates a separate source/layer and can confuse the test.

---

# 🏛️ AUTHORITY BOUNDARIES

This spec governs:

- existing replacement runtime sync
- manifest-to-actor traceability
- actor-to-GeoJSON traceability
- replacement layer data refresh
- cross-tab/local Map Lab edit notification
- duplicate replacement runtime removal
- debug reporting for one selected building

This spec may mutate:

- `buildingReplacementRuntime.js`
- `buildingEditRegistry.js`
- `mapInspector.js`
- `mapLabView.js`
- `mapboxAdapter.js`
- script load order where needed

This spec may not mutate:

- imported Mapbox Standard internals
- Mapbox source data
- unrelated vehicle/actor systems
- Canvas systems
- Glyph systems
- atmospheric systems
- camera systems

---

# 🚫 HARD NON-GOALS

Do **not** implement:

- a new replacement runtime
- new replacement source IDs
- new replacement layer IDs
- new fallback prism system
- another host-building discovery audit
- another Mapbox Standard suppression investigation
- another Inspector bridge if controls already exist
- another visual-only overlay proof

This build is not allowed to add more parallel infrastructure.

---

# 📦 EXISTING SYSTEM INVENTORY

## Existing Runtime Authority

```text
wall/systems/runtime/buildingReplacementRuntime.js
```

Existing exported authority:

```js
SBE.BuildingReplacementRuntime
_wos.debug.buildingReplacement
```

Existing runtime constants:

```js
STORAGE_KEY = 'wos.maplab.buildings'
SOURCE_ID   = 'wos-replacement-markers'
LAYER_ID    = 'wos-replacement-layer'
```

Existing public debug methods include:

```js
SBE.BuildingReplacementRuntime.reload()
SBE.BuildingReplacementRuntime.status()
SBE.BuildingReplacementRuntime.list()
SBE.BuildingReplacementRuntime.geometryStats()
SBE.BuildingReplacementRuntime.dominanceStatus()
SBE.BuildingReplacementRuntime.repairDominance()
SBE.BuildingReplacementRuntime.compoundStatus()
SBE.BuildingReplacementRuntime.groupStatus()
```

## Existing Manifest Authority

```text
localStorage['wos.maplab.buildings']
```

Expected structure:

```js
{
  version: '1.0.0',
  buildings: {
    [buildingKey]: {
      replacement: {
        enabled: true,
        archetype: 'skyscraper',
        style: '...',
        scale: 1,
        heightMode: 'inherit'
      },
      geometry: { ... }
    }
  },
  groups: {},
  compounds: {}
}
```

---

# 🔧 REQUIRED REPAIR WORK

## 1. Remove Or Disable 0612B Duplicate Runtime

Search for:

```text
buildingReplacementMinimumVisibleResult.js
```

If it is included in any HTML/script loader, remove it from the load path for this branch.

The repair must not use:

```js
SBE.BuildingReplacementMinimumVisibleResult
_wos.debug.buildings.createReplacementAtCenter
'wos-building-replacements'
'wos-building-replacement-layer'
'wos-building-replacement-outline-layer'
```

Add a console guard if the file remains present during local testing:

```js
if (SBE.BuildingReplacementMinimumVisibleResult) {
  console.warn('[0612C] duplicate replacement runtime detected; remove buildingReplacementMinimumVisibleResult.js from load path');
}
```

Acceptance:

```js
typeof SBE.BuildingReplacementMinimumVisibleResult === 'undefined'
```

or explicit warning proves it is inactive.

---

## 2. Add Selected Building Trace Debugger

Modify:

```text
wall/systems/runtime/buildingReplacementRuntime.js
```

Add:

```js
function traceReplacementSync(buildingKey) {}
```

Expose:

```js
SBE.BuildingReplacementRuntime.traceReplacementSync(buildingKey)
_wos.debug.buildingReplacement.traceReplacementSync(buildingKey)
```

Required return shape:

```js
{
  ok: boolean,
  buildingKey: string,

  manifestPresent: boolean,
  buildingEditPresent: boolean,
  replacementEnabled: boolean,
  replacementArchetype: string | null,
  replacementHeightMode: string | null,
  replacementScale: number | null,

  claimedByGroupId: string | null,
  claimedByCompoundId: string | null,
  expectedActorKey: string | null,

  actorPresent: boolean,
  actorResolved: boolean,
  actorGeometryAuthority: 'manifest' | 'wall-query' | 'fallback' | 'unknown' | null,
  actorHeight: number | null,
  actorColor: string | null,
  actorPartCount: number | null,

  sourceExists: boolean,
  layerExists: boolean,
  geojsonFeatureCount: number,
  renderedFeatureCount: number,

  dominance: {
    replacementAboveBuildings: boolean,
    replacementLayerIndex: number | null,
    highestBuildingLayerIndex: number | null
  },

  failureStage:
    | null
    | 'MANIFEST_MISSING'
    | 'BUILDING_EDIT_MISSING'
    | 'REPLACEMENT_DISABLED'
    | 'ACTOR_MISSING'
    | 'ACTOR_UNRESOLVED'
    | 'SOURCE_MISSING'
    | 'LAYER_MISSING'
    | 'GEOJSON_EMPTY'
    | 'RENDER_EMPTY'
    | 'LAYER_ORDER_FAILURE',

  lastError: string | null
}
```

This function must not mutate state unless explicitly called with an optional repair flag later.

---

## 3. Add One-Shot Repair Debugger

Add:

```js
function repairReplacementSync(buildingKey) {}
```

Expose:

```js
SBE.BuildingReplacementRuntime.repairReplacementSync(buildingKey)
_wos.debug.buildingReplacement.repairReplacementSync(buildingKey)
```

Required sequence:

```text
1. _loadManifest()
2. _sync(map)
3. _pushToMap(map)
4. _ensureLayerPaint(map)
5. _ensureReplacementLayerDominance(map)
6. BuildingEditProjectionRuntime.apply() if available
7. traceReplacementSync(buildingKey)
```

This must return the final trace report.

---

## 4. Ensure Inspector Replacement Edits Trigger Existing Runtime Reload

Modify the Map Lab code path that writes replacement changes.

Likely files:

```text
studio/mapLab/buildingEditRegistry.js
studio/mapLab/mapInspector.js
studio/mapLab/mapLabView.js
studio/mapLab/mapboxAdapter.js
```

Any action that mutates:

```js
edit.replacement.enabled
edit.replacement.archetype
edit.replacement.style
edit.replacement.scale
edit.replacement.heightMode
edit.geometry
edit.color
edit.hidden
```

must trigger a deterministic replacement refresh.

Required helper:

```js
function notifyReplacementRuntimeChanged(buildingKey) {}
```

Minimum behavior:

```js
window.dispatchEvent(new CustomEvent('wos:building-replacement-edit', {
  detail: { buildingKey, at: Date.now() }
}));
```

If the Wall runtime is present in the same window:

```js
if (window.SBE?.BuildingReplacementRuntime?.reload) {
  window.SBE.BuildingReplacementRuntime.reload();
}
```

If only cross-window/localStorage is available, the existing storage sync remains valid, but this patch must add the direct event because same-window localStorage writes do not always produce a `storage` event in the same document.

---

## 5. Add Runtime Event Listener

Modify:

```text
wall/systems/runtime/buildingReplacementRuntime.js
```

Listen for:

```js
window.addEventListener('wos:building-replacement-edit', function (event) {
  reload();
});
```

Guard against reload storms:

```js
const REPLACEMENT_SYNC_DEBOUNCE_MS = 60;
```

If JavaScript file style is ES5, use `var` instead of `const`.

---

## 6. Ensure `_sync(map)` Always Pushes To Map

The existing `_sync(map)` must end by pushing generated actors into `wos-replacement-markers`.

Required invariant:

```text
Every successful _sync(map) must call _pushToMap(map).
```

If current `_sync(map)` only mutates `_actors` and exits early, repair it.

Expected end of `_sync(map)`:

```js
_updateStats();
_pushToMap(map);
_repairDominance(map);
```

Must preserve existing compound/group/standalone priority.

---

## 7. Add GeoJSON Source Data Debug

Add:

```js
function replacementSourceSnapshot() {}
```

Expose:

```js
SBE.BuildingReplacementRuntime.replacementSourceSnapshot()
_wos.debug.buildingReplacement.replacementSourceSnapshot()
```

Return:

```js
{
  sourceExists: boolean,
  layerExists: boolean,
  featureCount: number,
  actorIds: string[],
  buildingKeys: string[],
  materialRoles: string[],
  sample: Array<{
    id: string | number | null,
    actorId: string | null,
    buildingKey: string | null,
    height: number | null,
    base: number | null,
    color: string | null,
    materialColor: string | null,
    materialRole: string | null
  }>,
  lastError: string | null
}
```

If Mapbox does not allow reading the GeoJSON data back from the source directly, build this snapshot from:

```js
_buildGeoJSONCollection()
```

not from `queryRenderedFeatures`.

---

# 🔄 REQUIRED EXECUTION FLOW

Final flow after this patch:

```text
User selects building in Map Lab
→ Inspector shows source building controls
→ User enables Replacement
→ BuildingEditRegistry writes replacement manifest
→ notifyReplacementRuntimeChanged(buildingKey)
→ BuildingReplacementRuntime.reload()
→ _loadManifest()
→ _sync(map)
→ actor generated/updated under existing _actors
→ _buildGeoJSONCollection()
→ _pushToMap(map)
→ source wos-replacement-markers updated
→ layer wos-replacement-layer renders replacement
→ _repairDominance(map)
→ source building suppression re-applied
→ traceReplacementSync(buildingKey) returns ok:true
```

---

# 🧪 ACCEPTANCE TESTS

## T0 Duplicate Runtime Removed

Console:

```js
typeof SBE.BuildingReplacementMinimumVisibleResult
```

Expected:

```js
'undefined'
```

or an explicit inactive warning with no loaded duplicate source/layer.

Also verify:

```js
map.getSource('wos-building-replacements')
map.getLayer('wos-building-replacement-layer')
```

Expected:

```js
undefined
undefined
```

---

## T1 Existing Runtime Present

Console:

```js
typeof SBE.BuildingReplacementRuntime
SBE.BuildingReplacementRuntime.VERSION
```

Expected:

```js
'object'
'1.9.1'
```

Version must increment from the current runtime.

---

## T2 Existing Source And Layer Only

Console:

```js
map.getSource('wos-replacement-markers')
map.getLayer('wos-replacement-layer')
```

Expected:

```text
both present
```

No 0612B source/layer may be present.

---

## T3 Enable Replacement From Inspector

Steps:

```text
1. Select a building.
2. Enable Replacement.
3. Set archetype to Skyscraper.
4. Change Height Mode to Hero.
5. Change Scale to 1.25.
```

Expected:

```text
The existing wos-replacement-layer changes visibly without reload confusion.
```

---

## T4 Trace Selected Building

Console:

```js
_wos.debug.buildingReplacement.traceReplacementSync('<selected-building-key>')
```

Expected:

```js
{
  ok: true,
  manifestPresent: true,
  buildingEditPresent: true,
  replacementEnabled: true,
  actorPresent: true,
  actorResolved: true,
  sourceExists: true,
  layerExists: true,
  geojsonFeatureCount: > 0,
  renderedFeatureCount: > 0,
  failureStage: null
}
```

---

## T5 Direct Repair Works

Console:

```js
_wos.debug.buildingReplacement.repairReplacementSync('<selected-building-key>')
```

Expected:

```js
ok === true
failureStage === null
```

Visible replacement updates immediately.

---

## T6 Source Snapshot Shows Actor Data

Console:

```js
_wos.debug.buildingReplacement.replacementSourceSnapshot()
```

Expected:

```js
{
  sourceExists: true,
  layerExists: true,
  featureCount: > 0,
  actorIds: [...],
  buildingKeys: [...]
}
```

---

## T7 Dominance Still Passes

Console:

```js
_wos.debug.buildingReplacement.dominanceStatus()
```

Expected:

```js
replacementAboveBuildings === true
visibleReplacementCount >= 1
```

---

## T8 Same-Window Edit Sync

Change replacement controls in the Inspector without refreshing the page.

Expected:

```text
Runtime reloads in the same browser document.
Replacement geometry/color/height updates immediately.
```

This specifically validates the new direct event path, not only `storage` events.

---

# 📋 DEBUG COMMAND SET FOR CLAUDE

Claude must run and report these exact commands after patching:

```js
SBE.BuildingReplacementRuntime.VERSION
```

```js
_wos.debug.buildingReplacement.status()
```

```js
_wos.debug.buildingReplacement.list()
```

```js
_wos.debug.buildingReplacement.replacementSourceSnapshot()
```

```js
_wos.debug.buildingReplacement.dominanceStatus()
```

```js
_wos.debug.buildingReplacement.traceReplacementSync('<selected-building-key>')
```

```js
_wos.debug.buildingReplacement.repairReplacementSync('<selected-building-key>')
```

Claude must include the selected building key used for testing.

---

# 🧱 REQUIRED FILE CHANGES

## Modify

```text
wall/systems/runtime/buildingReplacementRuntime.js
studio/mapLab/buildingEditRegistry.js
studio/mapLab/mapInspector.js
studio/mapLab/mapLabView.js
studio/mapLab/mapboxAdapter.js
```

Only modify the Studio files needed to trigger deterministic reload after replacement manifest writes.

## Remove / Disable

```text
wall/systems/presentation/buildingReplacementMinimumVisibleResult.js
```

and remove any script reference to it.

## Do Not Modify

```text
canvas/**
glyph/**
wall/render/**
wall/systems/runtime/buildingStyleKit.js
wall/systems/presentation/buildingAuthorityRuntime.js
```

---

# 🧯 FAILURE TRIAGE

If `traceReplacementSync(buildingKey)` fails, classify the failure using this table.

| failureStage | Meaning | Repair Direction |
|---|---|---|
| `MANIFEST_MISSING` | localStorage manifest unavailable or invalid | fix manifest write/load |
| `BUILDING_EDIT_MISSING` | selected key not saved | fix BuildingEditRegistry key path |
| `REPLACEMENT_DISABLED` | replacement controls not writing enabled state | fix Inspector write handler |
| `ACTOR_MISSING` | manifest valid but `_sync()` did not spawn actor | fix group/compound/standalone priority |
| `ACTOR_UNRESOLVED` | actor exists but has no geometry | fix manifest geometry or fallback resolution |
| `SOURCE_MISSING` | source not registered | fix `_pushToMap()` source creation |
| `LAYER_MISSING` | source exists but layer missing | fix `_addLayer()` / style reload path |
| `GEOJSON_EMPTY` | actors exist but collection has no features | fix `_buildGeoJSONCollection()` / `_generateForActor()` |
| `RENDER_EMPTY` | GeoJSON exists but not visible/queryable | fix layer paint/order/zoom/location |
| `LAYER_ORDER_FAILURE` | replacement under source buildings | fix dominance repair |

---

# ✅ DEFINITION OF DONE

This build is complete only when all are true:

```text
1. No duplicate 0612B replacement source/layer is active.
2. Existing BuildingReplacementRuntime version is incremented.
3. Inspector replacement edits trigger same-window runtime reload.
4. Selected building key can be traced end-to-end.
5. wos-replacement-markers contains generated features.
6. wos-replacement-layer visibly updates.
7. dominanceStatus passes.
8. repairReplacementSync(buildingKey) returns ok:true.
```

The final visible result must be obvious enough for video capture.

---

# 🚫 STOP CONDITIONS

Stop and report immediately if:

```text
- A new replacement source/layer seems necessary.
- Another Mapbox Standard suppression audit seems necessary.
- The selected building key cannot be found in the manifest.
- The Inspector writes to a different manifest path than BuildingReplacementRuntime reads.
- More than one replacement runtime is active.
```

Do not continue building around these failures.

The purpose of this patch is to expose the exact broken link, not hide it behind another parallel system.
