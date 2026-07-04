# 0609S_WOS_MapLabBuildingEditPersistence_v1.0.0_BUILD

Stage: [BUILD]

## Purpose

Persist Map Lab building edits across sessions and establish the foundational data layer required for future building replacement, actor attachment, and world authoring workflows.

## Goals

### Primary

Persist:

- color
- hidden
- notes
- tags

### Secondary

Create a Building Manifest system consumable by future replacement, district, actor-placement, and world-authoring systems.

## New Module

`studio/mapLab/buildingEditRegistry.js`

Responsibilities:

- load edits
- save edits
- query edits
- update edits
- remove edits
- export edits
- import edits

## Manifest Schema

```json
{
  "version": "1.0.0",
  "buildings": {
    "composite:building:248143639": {
      "color": "#55e0d5",
      "hidden": false,
      "tags": [],
      "notes": ""
    }
  }
}
```

## Storage

Local Storage Key:

`wos.maplab.buildings`

## Files

### New

- studio/mapLab/buildingEditRegistry.js

### Modified

- studio/mapLab/mapboxAdapter.js
- studio/mapLab/mapInspector.js
- studio/mapLab/mapLabView.js

## Acceptance Tests

1. Color persists after reload.
2. Multiple building edits persist after reload.
3. Export generates valid JSON.
4. Import restores edits.
5. Reset Building restores defaults.
6. Corrupt JSON does not crash application.

## Future Builds Enabled

- 0610A_WOS_MapLabBuildingReplacement_v1.0.0
- 0610B_WOS_MapLabDistrictAuthoring_v1.0.0
- 0610C_WOS_MapLabActorPlacement_v1.0.0
- 0610D_WOS_MapLabWorldManifest_v1.0.0
