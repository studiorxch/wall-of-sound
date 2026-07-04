# 0612F_WOS_ThreeViewStyleParityLock_v1.0.0_BUILD

STOP ALL BUILDING FEATURE WORK.

Do not modify replacement geometry.  
Do not modify suppression logic.  
Do not create new renderers.  
Do not create new map views.  
Do not add another authority layer.

Current failure:

WOS / Wall, Studio Author, and Studio Preview are visually out of sync.

This makes all debugging invalid because:

- colors do not match
    
- basemap style does not match
    
- building visibility does not match
    
- replacement visibility cannot be trusted
    
- old building removal cannot be visually verified
    

## Required Fix

Create one shared visual authority state that all existing map views obey.

The three existing views must report and visually match:

1. WOS / Wall view
    
2. Studio Map Lab Author view
    
3. Studio Map Lab Preview view
    

## Shared Required State

All three views must use the same:

```js
{
  styleMode,
  styleUrl,
  presentationMode,
  atmosphericFilterProfile,
  replacementLayerPaint,
  selectedBuildingKey,
  selectedReplacementArchetype,
  selectedReplacementColor,
  sourceHiddenState,
  standardImportPresence,
  standard3dBuildingLayerPresence
}
```

## Required Debug API

Add:

```js
_wos.debug.mapViewParity.verify()
_wos.debug.mapViewParity.apply()
_wos.debug.mapViewParity.report()
```

## Required Report

```js
{
  parityOk: true,
  views: {
    wall: {},
    studioAuthor: {},
    studioPreview: {}
  },
  mismatches: []
}
```

If parity fails, report exact mismatch:

```js
{
  field: "styleUrl",
  wall: "...",
  studioAuthor: "...",
  studioPreview: "..."
}
```

## Apply Behavior

`apply()` must force all three existing views into the same visual state.

No new views.

No duplicate map runtimes.

No extra rendering surfaces.

## Acceptance Test

After running:

```js
_wos.debug.mapViewParity.apply()
_wos.debug.mapViewParity.verify()
```

Expected:

```text
All three views visually match.
Replacement color matches.
Basemap style matches.
Old building visibility state matches.
WOS building visibility matches.
```

Only after this passes should building removal/replacement work continue.