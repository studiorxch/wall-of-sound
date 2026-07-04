# 🚦 SPEC STAGE

Stage: BUILD  
Freeze Decision: ACTIVE  
Action: Create a camera-safe preview mode that makes WOS replacement buildings visibly usable immediately by controlling zoom, pitch, bearing, framing, and optional nearby-building visibility.

---

layout: spec

title: "Building Replacement Camera-Safe Preview"
date: 2026-06-12
doc_id: "0612I_WOS_BuildingReplacementCameraSafePreview_v1.0.0_BUILD"
version: "1.0.0"

project: "Wall of Sound"
system: "WOS"

domain: "building-replacement"
component: "CameraSafePreview"

type: "production-workaround-spec"
status: "active"

priority: "critical"
risk: "low"

classification: "preview-camera-control"

summary: "Defines a camera-safe replacement preview mode for getting one WOS building visibly clean on the map without reopening suppression architecture. The mode frames the selected replacement at safe zoom/pitch/bearing ranges and may hide nonessential nearby building clutter in editable/preview mode."

---

# 🎯 PURPOSE

Put one selected WOS replacement building cleanly on the map without another two-day authority investigation.

This build is a production workaround and preview tool.

It does not claim to structurally solve Mapbox Standard suppression.

It creates a repeatable camera-safe preview state where:

```text
selected WOS replacement is clearly visible
old/source fragments are visually excluded or minimized
nearby clutter is reduced when possible
camera framing is deterministic
```

---

# 🧠 CORE PRINCIPLES

## Visual Result First

The success condition is visible:

```text
One WOS replacement building reads clearly on the map.
```

## No New Authority

Do not create another building authority, suppression authority, or replacement runtime.

## Camera Is Allowed

Camera framing is a valid production tool.

If the old fragment disappears at a certain zoom/pitch/bearing, the system may intentionally use that safe camera range for preview and shot capture.

## Scratch-Build Direction

If Mapbox source buildings continue to block WOS objects, editable preview should favor:

```text
flat/non-Standard basemap
WOS-owned replacement buildings
camera-safe framing
optional hide/reduce nearby nonessential building layers
```

---

# ✅ REQUIRED BEHAVIOR

## B1 — Camera-safe preview command

Add a public command:

```js
_wos.debug.buildingReplacement.cameraSafePreview()
```

and/or:

```js
SBE.BuildingReplacementRuntime.cameraSafePreview()
```

It should target the currently selected building or selected replacement.

If no building is selected, it should return a useful error:

```js
{
  ok: false,
  reason: "NO_SELECTED_BUILDING"
}
```

---

## B2 — Deterministic framing

The command must move the active map camera to a safe replacement view.

Suggested defaults:

```js
{
  zoom: 17.25,
  pitch: 62,
  bearing: "preserve-or-align-to-building",
  padding: 80,
  duration: 650
}
```

Implementation may tune these values based on actual result.

The camera must center on:

```text
selected building centroid
or replacement geometry centroid
```

---

## B3 — Replacement visibility guarantee

Before/after framing, ensure the canonical replacement runtime is active:

```js
BuildingReplacementRuntime.reload()
BuildingReplacementRuntime.repairDominance()
```

Canonical layer only:

```text
wos-replacement-markers
wos-replacement-layer
```

Do not create:

```text
wos-building-replacements
wos-building-replacement-layer
```

---

## B4 — Editable flat basemap if available

If `EditableBasemapAuthority` exists, use it before camera framing:

```js
SBE.EditableBasemapAuthority.activate()
```

Expected:

```text
dark-v11 / non-Standard editable substrate
```

This prevents the old Standard import from blocking replacement work.

---

## B5 — Optional nearby clutter reduction

If nearby source buildings still block the selected replacement, this build may add a preview-only reduction mode.

Allowed:

```text
temporarily lower opacity of nonselected source-building layers
temporarily hide host/query building debug layers
temporarily reduce nearby building layer opacity in Studio preview
```

Forbidden:

```text
new per-feature Standard suppression architecture
new replacement runtime
new source/layer IDs
persistent manifest mutation
deleting source data
```

---

## B6 — Shot-safe state report

Return a report:

```js
{
  ok: true,
  selectedBuildingKey,
  replacementLayerExists,
  editableBasemapActive,
  camera: {
    lng,
    lat,
    zoom,
    pitch,
    bearing
  },
  visualMode: "camera-safe-preview",
  notes: []
}
```

---

# 📁 EXPECTED FILES

Likely files:

```text
wall/systems/runtime/buildingReplacementRuntime.js
wall/systems/presentation/editableBasemapAuthority.js
wall/systems/presentation/threeViewStyleParityLock.js
studio/mapLab/mapLabView.js
studio/mapLab/mapboxAdapter.js
studio/mapLab/buildingPreviewRuntime.js
```

Prefer minimal changes.

Do not modify all files unless required.

---

# 🧪 VALIDATION CHECKLIST

## T1 — Command exists

Run:

```js
typeof _wos.debug.buildingReplacement.cameraSafePreview
```

Expected:

```text
"function"
```

---

## T2 — Selected building frames cleanly

Select one building with replacement enabled.

Run:

```js
_wos.debug.buildingReplacement.cameraSafePreview()
```

Expected:

```text
Camera moves to selected replacement.
WOS replacement is prominent.
Old fragment is not visible or is visually minimized.
```

---

## T3 — Canonical replacement layer remains

Run:

```js
map.getLayer('wos-replacement-layer')
map.getSource('wos-replacement-markers')
```

Expected:

```text
present
```

---

## T4 — No duplicate replacement layers

Run:

```js
map.getLayer('wos-building-replacement-layer')
map.getSource('wos-building-replacements')
```

Expected:

```text
absent
```

---

## T5 — Editable basemap active

Run:

```js
verifyEditableBasemapAuthority()
```

Expected:

```js
{
  standardImportsPresent: false,
  standard3dBuildingLayersPresent: false,
  authorityClassification: "READY"
}
```

If editable basemap authority is unavailable, report that clearly.

---

## T6 — Screenshot proof

Provide before/after screenshots:

```text
Before: replacement difficult to read / old fragments visible
After: WOS replacement clearly readable
```

---

# 🚫 NON-GOALS

This build must not implement:

- another suppression architecture
- another building authority runtime
- another replacement runtime
- another source/layer naming system
- full Studio/Wall parity refactor
- Moebius treatment
- texture/outline system
- city-wide WOS building generation

---

# 📦 DELIVERABLES

Claude/Codex must return:

```text
1. Exact diff
2. Files changed
3. Console command added
4. Camera defaults used
5. Before/after screenshot notes
6. Confirmation no duplicate replacement layers were created
7. Confirmation no obsolete selected-buildings-only path was reintroduced
```

---

# ✅ SUCCESS DEFINITION

Success is:

```text
A selected WOS replacement building can be made clearly visible on the map within one command.
```

The system does not need to solve every building in NYC.

The system does need to prove:

```text
we can place, frame, and visually read one replacement building reliably today.
```
