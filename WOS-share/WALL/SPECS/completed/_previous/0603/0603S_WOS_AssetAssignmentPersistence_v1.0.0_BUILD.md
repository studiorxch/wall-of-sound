---
layout: spec
title: "Asset Assignment Persistence"
date: 2026-06-03
doc_id: "0603_WOS_AssetAssignmentPersistence_v1.0.0"
version: "1.0.0"

project: "Wall of Sound"
system: "WOS"

domain: "studio"
component: "asset_assignment_persistence"

type: "system-spec"
status: "approved"

priority: "high"
risk: "medium"

classification: "studio-persistence-authority"

summary: "Adds explicit import/export persistence for Actor Asset Library identity-to-asset assignments, allowing Studio experiments to be saved and restored without auto-saving, localStorage, runtime mutation, or truth changes."

depends_on:
  - "0603O_WOS_ActorAssetLibraryAuthority_v1.0.0"
  - "0603R_WOS_ActorAssetAssignmentStudio_v1.0.1_BUILD"

enables:
  - "manual assignment export"
  - "manual assignment import"
  - "assignment JSON handoff"
  - "safe reload restoration"
  - "future persisted Studio asset editing"

tags:
  - "wos"
  - "studio"
  - "asset-assets"
  - "assignment"
  - "persistence"
  - "json"
  - "import-export"
---

# 0603S_WOS_AssetAssignmentPersistence_v1.0.0_BUILD

## Build Readiness

[BUILD]

---

# Purpose

Add explicit persistence for Studio asset assignments.

0603R made assignment changes safe and in-memory.

0603S lets the user manually save and restore those assignments.

This is the next step toward editable actor assets without introducing unsafe autosave behavior.

---

# Core Concept

Current:

```text
identity → asset assignment
```

exists only in memory.

After reload:

```text
assignments reset to defaults
```

0603S adds:

```text
Export assignments → JSON file
Import assignments ← JSON file/text
```

No automatic persistence.

No localStorage.

No hidden writes.

---

# Critical Scope

This spec is **manual import/export only**.

It must not:

- auto-save
- use localStorage
- write source files directly
- upload files
- start feeds
- start Drive
- mutate actor truth
- mutate identity records
- mutate asset records
- alter Wall runtime

Persistence is user-controlled.

---

# Required Files

Modify:

```text
wall/systems/actors/actorAssetLibraryAuthority.js
studio/studioShell.js
studio/styles.css
```

Optional, only if needed:

```text
studio/index.html
```

Do not modify:

```text
TruthActorRuntime
ActorRenderAuthority
WorldSpaceVehicleLayer
HeroVehicleRuntime
feed runtimes
Mapbox style systems
```

---

# Authority API Additions

Extend:

```js
SBE.ActorAssetLibraryAuthority
```

Add:

```js
exportAssignments()
importAssignments(payload, options)
validateAssignments(payload)
```

---

# Export Shape

`exportAssignments()` returns:

```js
{
  schema: "wos.actorAssetAssignments",
  version: "1.0.0",
  exportedAt: "2026-06-03T00:00:00.000Z",
  assignmentCount: 17,
  assignments: {
    "mta.bus": "asset://road/mta_bus_standard",
    "ais.vessel": "asset://marine/tug_boat"
  },
  metadata: {
    source: "studio",
    note: "Manual export from WOS Studio"
  }
}
```

Use ISO timestamp.

Return a deep copy.

No throw.

---

# Validation Behavior

`validateAssignments(payload)` must:

1. confirm object shape
2. confirm schema string
3. confirm assignments object
4. confirm each identity key is non-empty string
5. confirm each assetId exists in asset registry
6. collect invalid entries without throwing

Return:

```js
{
  ok: true,
  validCount: 17,
  invalidCount: 0,
  invalid: []
}
```

or:

```js
{
  ok: false,
  reason: "invalid_schema",
  validCount: 0,
  invalidCount: 0,
  invalid: []
}
```

Invalid assignment row shape:

```js
{
  identityKey: "ais.vessel",
  assetId: "asset://marine/does_not_exist",
  reason: "asset_not_found"
}
```

---

# Import Behavior

`importAssignments(payload, options)`:

```js
options = {
  mode: "merge" | "replace",
  dryRun: false
}
```

Default:

```js
mode: "merge"
dryRun: false
```

## Merge Mode

Only valid assignments are applied.

Existing assignments not present in payload remain unchanged.

## Replace Mode

Reset assignments to defaults first, then apply valid assignments.

Invalid assignments are skipped.

## Dry Run

Validates and reports what would happen.

Does not mutate assignment map.

Return:

```js
{
  ok: true,
  mode: "merge",
  dryRun: false,
  appliedCount: 3,
  skippedCount: 1,
  invalid: [...],
  state: getState()
}
```

Never throw for normal user data errors.

---

# State Additions

Add to `getState()`:

```js
lastExportAt
lastImportAt
lastImportResult
```

---

# Studio UI Requirements

Add persistence controls to Actor Library assignment area.

Recommended location:

```text
Actor Library → Inspector → Assignment block
```

Controls:

```text
Export Assignments
Import Assignments
Dry Run Import
Reset Assignments
```

Reset already exists from 0603R.

---

# Export UI Behavior

Clicking:

```text
Export Assignments
```

should:

1. call `SBE.ActorAssetLibraryAuthority.exportAssignments()`
2. stringify pretty JSON
3. trigger browser download

Suggested filename:

```text
wos_actor_asset_assignments_YYYY-MM-DD.json
```

No server.

No upload.

No external library.

---

# Import UI Behavior

Add a simple textarea or file input.

Accept either:

```text
paste JSON
```

or:

```text
choose JSON file
```

V1 may support pasted JSON only if simpler.

Preferred v1:

- textarea
- Import Merge
- Import Replace
- Dry Run

No modal required.

---

# Import Safety

Before applying:

1. parse JSON safely
2. validate
3. display summary
4. apply only after user clicks import button

Do not auto-apply on paste.

Do not auto-apply on file selection.

---

# Import Summary UI

Show:

```text
valid: 3
invalid: 1
mode: merge
dryRun: false
applied: 3
skipped: 1
```

If invalid entries exist, show a compact table:

```text
identityKey
assetId
reason
```

---

# Studio Debug API

Extend:

```js
_wos.debug.studio
```

Add:

```js
exportAssetAssignments()
validateAssetAssignments(payload)
importAssetAssignments(payload, options)
```

## exportAssetAssignments

Returns export object.

## validateAssetAssignments

Returns validation result.

## importAssetAssignments

Applies import according to options.

Example:

```js
_wos.debug.studio.importAssetAssignments(payload, { mode: "merge" })
```

---

# No Automatic Load

Do not auto-load a JSON file on Studio startup.

No default fetch.

No local file path.

No `assignments.json` auto-discovery.

Manual only.

---

# Optional Download Helper

Add helper:

```js
function _downloadJson(filename, data)
```

Implementation:

```js
var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
var url = URL.createObjectURL(blob);
var a = document.createElement('a');
a.href = url;
a.download = filename;
a.click();
URL.revokeObjectURL(url);
```

Guard if browser APIs missing.

No throw.

---

# Acceptance Tests

## Test 1: Export Assignments

Run:

```js
_wos.debug.studio.exportAssetAssignments()
```

Expected:

```text
schema: wos.actorAssetAssignments
version: 1.0.0
assignments object present
assignmentCount >= 17
```

---

## Test 2: Import Merge

Create payload:

```js
{
  schema: "wos.actorAssetAssignments",
  version: "1.0.0",
  assignments: {
    "ais.vessel": "asset://marine/tug_boat"
  }
}
```

Run:

```js
_wos.debug.studio.importAssetAssignments(payload, { mode: "merge" })
_wos.debug.studio.assignmentState("ais.vessel")
```

Expected:

```text
assetId: asset://marine/tug_boat
```

---

## Test 3: Import Replace

Run import with:

```js
{ mode: "replace" }
```

Expected:

```text
assignments reset to defaults first
then valid payload assignments applied
```

---

## Test 4: Dry Run

Run:

```js
_wos.debug.studio.importAssetAssignments(payload, { dryRun: true })
```

Expected:

```text
appliedCount reports expected count
actual assignment unchanged
```

---

## Test 5: Invalid Asset Skipped

Payload:

```js
{
  schema: "wos.actorAssetAssignments",
  version: "1.0.0",
  assignments: {
    "ais.vessel": "asset://marine/does_not_exist"
  }
}
```

Expected:

```text
ok: false or ok:true with skipped invalid
invalid includes asset_not_found
existing assignment unchanged
no crash
```

---

## Test 6: UI Export Download

In Studio:

```text
Export Assignments
```

Expected:

```text
browser downloads wos_actor_asset_assignments_YYYY-MM-DD.json
```

---

## Test 7: No Auto Persistence

Reload Studio.

Expected:

```text
assignments return to defaults unless user manually imports
```

---

# Failure Conditions

This build fails if:

- assignments auto-save without user action
- localStorage is used
- invalid JSON crashes Studio
- invalid assetId crashes authority
- import mutates asset records
- import mutates identity records
- import starts feeds
- import starts Drive
- import changes actor IDs
- Wall runtime changes
- export object exposes live mutable assignment object
- dry run mutates assignment map
- replace mode fails to reset defaults first

---

# Implementation Notes

## Keep Import Boring

This should be plain JSON.

Do not invent a database format.

Do not compress.

Do not encode.

Do not add schema complexity beyond the minimum.

## No Persistence Magic

Manual export/import is safer for now.

Once this works, future specs can introduce file-backed persistence or a build-time manifest.

---

# Future Follow-Ups

0603S enables:

```text
0603T_WOS_MarineVesselAssetTaxonomy_v1.0.0_BUILD
0603U_WOS_MTABusAssetPack_v1.0.0_BUILD
0603V_WOS_ActorAssetImportManifest_v1.0.0_BUILD
0603W_WOS_StudioAssetPersistenceManifest_v1.0.0_BUILD
```

---

# Implementation Guide

- **Where**: Add `exportAssignments()`, `validateAssignments()`, and `importAssignments()` to `wall/systems/actors/actorAssetLibraryAuthority.js`; add import/export controls and debug APIs to `studio/studioShell.js`; add small textarea/status/table styling to `studio/styles.css`.
- **What**: Run `node --check wall/systems/actors/actorAssetLibraryAuthority.js` and `node --check studio/studioShell.js`; export assignments, import a merge payload mapping `ais.vessel` to `asset://marine/tug_boat`, dry-run the same payload, test invalid asset handling, then reload Studio to confirm nothing auto-persists.
- **Expect**: Studio can manually export and import assignment maps as JSON, invalid rows are skipped safely, dry runs do not mutate state, replace mode resets defaults first, and no feed, Drive, hero, Wall, Mapbox, truth, identity, or asset-record behavior changes.
