# 0619F_WOS_MapboxAccessRecoveryPatch_v1.0.1

## Status

```txt
BUILD SPEC — PATCH REVISION
```

## Purpose

Restore Studio map access by making Studio consume the same working Mapbox authority path as Broadcast/Wall.

The v1.0.0 patch correctly exposed the failure: Studio was using a separate access path and falling back to a hardcoded legacy token. That proved the black map was not a texture, GLB, or layout failure.

This revision removes the access drift.

## Core Rule

```txt
Studio must not invent its own Mapbox access path.
Studio must use the same token/style authority that Broadcast uses.
No silent hardcoded legacy fallback.
No silent black map.
```

## Problem Statement

Broadcast map works.
Studio map does not.

The cause is not the style itself. The cause is that Studio resolves Mapbox access independently:

```txt
Studio Map
→ WOSMapboxAccessController
→ SBE.MapboxToken OR localStorage OR hardcoded-legacy
→ MapLookController
→ WOSMapStyleAuthority/custom style
```

When `SBE.MapboxToken` is missing from Studio and localStorage has no valid override, Studio falls back to a stale hardcoded token. Mapbox then returns 401/403, even for `mapbox://styles/mapbox/dark-v11`.

Broadcast has a working token/style path. Studio should reuse it.

## Required Change

### 1. Remove hardcoded-legacy fallback from normal Studio operation

`WOSMapboxAccessController` must no longer silently return a hardcoded legacy token as a valid access token.

Allowed token sources:

```txt
1. SBE.MapboxToken
2. localStorage wos.studio.mapboxToken — dev override only
3. missing-token visible failure
```

If `SBE.MapboxToken` is missing and localStorage override is missing, return:

```js
{
  ok: false,
  reason: 'shared_broadcast_token_missing',
  source: 'missing'
}
```

Visible UI message:

```txt
Studio Mapbox token missing — Broadcast token not available to Studio.
```

### 2. Share Broadcast token into Studio bootstrap

Find the Broadcast/Wall token authority path and expose the same token to Studio as:

```js
window.SBE = window.SBE || {};
window.SBE.MapboxToken = <same token Broadcast uses>;
```

The solution may be a shared bootstrap file, shared config file, or existing Wall style/token authority export.

Do not duplicate the token in multiple unrelated files.

### 3. Share Broadcast style authority into Studio

Studio already loads:

```txt
../wall/systems/presentation/wosMapStyleAuthority.js
```

Keep that as the shared style authority.

Studio should ask `SBE.WOSMapStyleAuthority` for the same active Broadcast style, unless the user deliberately selects another Studio preview look.

Required default behavior:

```txt
Studio Map default look
→ WOSMapStyleAuthority active Broadcast/WOS style
→ apply Studio layer toggles/options after load
```

### 4. Guard custom style swaps

`WOSMapLookController` must continue to ask `WOSMapboxAccessController.canUseCustomStyle(styleUrl)` before applying any custom StudioRich style.

If token status is missing/unauthorized/style-error:

```txt
Do not call map.setStyle(customStyleUrl)
Keep current safe style if already loaded
Show explicit UI error if no style is available
```

### 5. Improve debug snapshot

`_wos.debug.studio.mapSurface()` must expose:

```js
{
  tokenSource,
  tokenPresent,
  tokenPreview,
  mapboxAccessStatus,
  lastErrorStatus,
  lastError,
  initialStyle,
  activeStyle,
  sharedBroadcastStyle,
  customStyleAllowed,
  layerCount,
  buildingLayers,
  styleName
}
```

Add explicit source values:

```txt
SBE.MapboxToken
localStorage-dev-override
missing
```

Do not report `hardcoded-legacy` as a valid ready source.

## Non-Goals

```txt
Do not touch GLB runtime rendering.
Do not touch building texture packaging.
Do not touch building texture preview/proof code.
Do not alter actor manifests.
Do not alter Wall/Broadcast runtime behavior except for extracting/reusing shared token/style authority if needed.
Do not add new Mapbox styles.
```

## Files Expected

Likely files:

```txt
studio/views/mapboxAccessController.js
studio/views/mapLookController.js
studio/views/threeDCanvasView.js
studio/index.html
wall/systems/presentation/wosMapStyleAuthority.js
possibly a shared token/config bootstrap file
```

## Acceptance Criteria

### AC1 — No hardcoded fallback

Studio does not silently use a hardcoded legacy Mapbox token.

If no shared token exists, Studio fails visibly.

### AC2 — Shared token path

When Broadcast can render, Studio can resolve the same token through `SBE.MapboxToken` or a clearly shared bootstrap source.

Expected debug:

```js
tokenSource: 'SBE.MapboxToken'
tokenPresent: true
mapboxAccessStatus: 'ready'
```

### AC3 — Dev override remains possible

Developer may still run:

```js
localStorage.setItem('wos.studio.mapboxToken', 'pk.VALID_TOKEN')
```

Expected debug:

```js
tokenSource: 'localStorage-dev-override'
```

### AC4 — Same WOS/Broadcast style path

Studio default style comes from `WOSMapStyleAuthority`, not a separate hardcoded Studio style path.

### AC5 — Visible failure on missing token

If no token exists, the Map panel shows:

```txt
Studio Mapbox token missing — Broadcast token not available to Studio.
```

No black map.

### AC6 — Visible failure on unauthorized token

If Mapbox returns 401/403, the Map panel shows:

```txt
Mapbox access error — 401/403 Unauthorized
```

Debug includes the HTTP status.

### AC7 — Custom style guarded

Custom `studiorich/...` style is not applied unless access status is ready.

### AC8 — Studio map becomes visible with valid shared token

With the Broadcast token available to Studio:

```txt
Map renders visibly
layerCount > 0
buildingLayers reports truthfully
View Options remains usable
Select target → Buildings remains reachable
```

### AC9 — 0618D path unblocks

After Studio map renders:

```txt
Select Buildings
→ click visible building
→ Building inspector opens
→ Apply Test Texture becomes reachable
```

### AC10 — No unrelated regressions

```txt
Library tab works
Canvas tab works
Broadcast link works
Publish button/chip unchanged
GLB/texture package systems unchanged
Wall/Broadcast still renders
```

## Smoke Test

```txt
1. Clear bad Studio override if needed:
   localStorage.removeItem('wos.studio.mapboxToken')

2. Hard reload Studio.

3. Run:
   _wos.debug.studio.mapSurface()

4. Confirm tokenSource is SBE.MapboxToken.

5. Confirm mapboxAccessStatus is ready.

6. Confirm layerCount > 0.

7. Confirm visible map surface.

8. Open View Options.

9. Enable Select target → Buildings.

10. Click a visible building.

11. Confirm Building inspector opens.
```

## Closure Rule

```txt
0619F v1.0.1 closes only when Studio uses the same working Broadcast Mapbox access/style authority, or fails visibly because the shared Broadcast token is not available to Studio.
```

## Expected Final State

```txt
Broadcast map works.
Studio map works from the same token/style authority.
No hardcoded legacy token path.
No silent black map.
0618D visible texture proof can resume.
```
