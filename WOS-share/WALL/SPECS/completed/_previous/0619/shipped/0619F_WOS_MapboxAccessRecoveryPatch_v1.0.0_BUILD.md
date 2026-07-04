---
layout: spec
title: "0619F WOS Mapbox Access Recovery Patch"
date: 2026-06-19
doc_id: "0619F_WOS_MapboxAccessRecoveryPatch_v1.0.0_BUILD"
version: "1.0.0"
project: "Wall of Sound"
system: "WOS"
domain: "studio-authoring"
component: "Map Authoring Surface / Mapbox Access"
type: "recovery-patch"
status: "build-ready"
priority: "high"
risk: "medium"
classification: "support-system"
summary: "Recover the Studio Map authoring surface from Mapbox 401/style-load failures by adding explicit token authority, visible access diagnostics, safe style fallback rules, and guarded MapLookController behavior."
---

# 0619F_WOS_MapboxAccessRecoveryPatch_v1.0.0_BUILD

## Purpose

0619E restored the Map authoring controls, but the visible map remains blocked by Mapbox access failure.

Current observed failure:

```txt
GET https://api.mapbox.com/styles/v1/studiorich/... 401 Unauthorized
You may have provided an invalid Mapbox access token.
```

This patch exists to make Mapbox access failures explicit, recoverable, and impossible to mistake for a texture/rendering failure.

## Current State

```txt
Toolbar: restored
View Options: restored
Building target control: restored
Diagnostics strip: restored
Mapbox style request: 401 Unauthorized
Visible basemap: missing
0618D proof test: still blocked
```

## Recovery Goal

```txt
Map tab
→ token/state validated
→ safe initial style chosen
→ visible basemap or visible access error
→ View Options remains usable
→ building selection only enables when style/building layers are available
→ 0618D Apply Test Texture path becomes testable after access is restored
```

## Non-Negotiable Rule

```txt
No silent black map.
```

A Mapbox token/style/access failure must produce visible UI state and debug state.

## Scope

### Owns

- Mapbox token resolution for Studio Map authoring.
- Mapbox style access diagnostics.
- Safe style fallback order.
- Visible map access error banner.
- Guarding MapLookController so it cannot immediately replace a valid fallback with an unauthorized custom style.
- Extending `_wos.debug.studio.mapSurface()` with token/style diagnostics.

### Does Not Own

- GLB runtime rendering.
- Building texture package storage.
- Building texture preview/proof logic.
- Wall/Broadcast runtime bundle contracts.
- Mapbox account billing/configuration itself.
- Final visual map styling doctrine.

## Files Expected

```txt
studio/views/threeDCanvasView.js
studio/views/mapLookController.js
studio/studioShell.js
studio/styles.css
```

Optional if cleaner:

```txt
studio/views/mapboxAccessController.js
studio/index.html
```

## Required Implementation

## 1. Add explicit Mapbox access authority

Preferred new module:

```txt
studio/views/mapboxAccessController.js
```

Export:

```js
window.WOSMapboxAccessController = {
  resolveToken,
  resolveInitialStyle,
  recordMapError,
  canUseCustomStyle,
  getSnapshot,
}
```

Minimum data shape:

```js
type MapboxAccessSnapshot = {
  enabled: true,
  tokenSource: 'SBE.MapboxToken' | 'localStorage' | 'missing' | 'hardcoded-legacy',
  tokenPresent: boolean,
  tokenPreview: string | null,
  initialStyle: string,
  activeStyle: string | null,
  customStyleAllowed: boolean,
  lastStatus: 'ready' | 'missing-token' | 'unauthorized' | 'style-error' | 'unknown',
  lastError: string | null,
  lastErrorStatus: number | null,
  updatedAt: string,
}
```

Token preview must be redacted:

```txt
pk.abc…xyz
```

Never expose the full token in debug output.

## 2. Remove silent hardcoded token fallback

Current failure-prone pattern:

```js
var token = global.SBE && global.SBE.MapboxToken
  ? global.SBE.MapboxToken
  : 'pk....';
```

Required behavior:

```js
var token = access.resolveToken();
if (!token.ok) {
  showMapAccessError('Mapbox token missing');
  return;
}
mapboxgl.accessToken = token.value;
```

A legacy hardcoded token may exist only as a clearly labeled developer fallback and must report:

```txt
tokenSource: hardcoded-legacy
```

Preferred: no hardcoded fallback in Studio.

## 3. Safe initial style

During recovery, the first style should be public and boring:

```txt
mapbox://styles/mapbox/dark-v11
```

Do not start from the StudioRich custom style until access is verified.

Required style priority:

```txt
1. explicit safe public authoring style
2. user-selected custom style only if customStyleAllowed === true
3. visible error if token/style unauthorized
```

## 4. Guard MapLookController

Problem observed:

```txt
MapLookController.init()
→ map.once('load')
→ map.setStyle(custom StudioRich style)
→ style 401
→ map goes black
```

Required patch:

```txt
MapLookController must not set a custom StudioRich style when access status is unauthorized or unknown.
```

Behavior:

```js
if (!access.canUseCustomStyle(styleUrl)) {
  return { ok: false, reason: 'custom_style_access_not_verified' };
}
```

The Look dropdown may still show custom looks, but selecting one must either:

```txt
A. apply successfully
```

or:

```txt
B. visibly report "Style unavailable / unauthorized" and keep the current safe style active
```

It must not black out the map.

## 5. Capture errors before any style mutation

In `threeDCanvasView.enter()`:

```txt
create map
→ expose debug map instance
→ register map.on('error') immediately
→ initialize MapLookController only after error handler exists
```

`_diagState.lastError` must capture:

```txt
401 Unauthorized
missing token
style load failed
network error
```

## 6. Visible Map access banner

Add an in-map banner when access/style fails:

```txt
Mapbox access error
401 Unauthorized — token/style cannot load.
Check SBE.MapboxToken or use public authoring style.
```

Class names:

```css
.tdcv-map-access-error
.tdcv-map-access-error-title
.tdcv-map-access-error-body
.tdcv-map-access-error-action
```

Action button:

```txt
Retry Safe Style
```

Button behavior:

```txt
sets style to mapbox://styles/mapbox/dark-v11
keeps toolbar/view options mounted
updates diagnostics
```

## 7. Extend map surface debug snapshot

`_wos.debug.studio.mapSurface()` must include:

```js
{
  mapMounted,
  toolbarMounted,
  viewOptionsButtonMounted,
  mapboxAvailable,
  mapboxMapReady,
  styleLoaded,
  layerCount,
  styleName,
  activeStyle,
  tokenPresent,
  tokenSource,
  tokenPreview,
  mapboxAccessStatus,
  lastErrorStatus,
  lastError,
  customStyleAllowed,
  buildingLayers,
  buildingSelectionReady,
  actorRenderLayerReady,
}
```

## 8. Building selection guard

If the map has no visible building/extrusion layers, the Building selection button must not pretend the path is valid.

Behavior:

```txt
Select target: Buildings disabled or warning state
reason: building_layers_unavailable
```

The button can remain visible, but must report why building selection cannot run.

## Acceptance Criteria

```txt
AC1 — Map tab no longer silently renders black on 401.
AC2 — A visible access/style error banner appears on Mapbox 401.
AC3 — _wos.debug.studio.mapSurface() reports tokenSource, tokenPresent, activeStyle, lastErrorStatus, and lastError.
AC4 — Error handler is registered before MapLookController.init().
AC5 — MapLookController cannot auto-replace a safe style with an unauthorized StudioRich custom style.
AC6 — Retry Safe Style attempts mapbox://styles/mapbox/dark-v11 without remounting the entire Studio shell.
AC7 — If token is missing, Map creation is blocked with a visible token-missing state.
AC8 — If token is valid, public dark-v11 renders visibly.
AC9 — If custom style is unauthorized, current safe style stays visible.
AC10 — Building selection only reports ready when building/extrusion layers are present.
AC11 — No GLB, texture, publish, or Wall runtime contracts are modified.
```

## Validation Commands

Run in browser console:

```js
_wos.debug.studio.mapSurface()
```

Expected healthy access result:

```js
{
  mapMounted: true,
  toolbarMounted: true,
  mapboxAvailable: true,
  mapboxMapReady: true,
  styleLoaded: true,
  layerCount: 50,
  tokenPresent: true,
  tokenSource: 'SBE.MapboxToken',
  mapboxAccessStatus: 'ready',
  lastError: null
}
```

Expected unauthorized result:

```js
{
  mapMounted: true,
  toolbarMounted: true,
  mapboxAvailable: true,
  mapboxMapReady: false,
  styleLoaded: false,
  tokenPresent: true,
  mapboxAccessStatus: 'unauthorized',
  lastErrorStatus: 401,
  lastError: 'Unauthorized'
}
```

Also run:

```js
window._wosMapInstance && {
  loaded: _wosMapInstance.loaded(),
  styleLoaded: _wosMapInstance.isStyleLoaded(),
  style: _wosMapInstance.getStyle && _wosMapInstance.getStyle().name,
  layerCount: _wosMapInstance.getStyle && _wosMapInstance.getStyle().layers.length,
}
```

## Closure Rule

0619F closes only when one of these is true:

### Valid Success

```txt
Map visibly renders a public authoring style.
Map surface diagnostics report ready.
Buildings layer availability is truthfully reported.
```

### Valid Blocker

```txt
Mapbox token is missing/unauthorized.
Visible UI reports the exact access failure.
Debug snapshot reports token/style failure.
No silent black map remains.
```

## Relationship to 0618D

0618D remains blocked until the Map can show a visible basemap/building surface.

After 0619F succeeds:

```txt
Map visible
→ Select target: Buildings
→ click building
→ Building inspector
→ Apply Test Texture
→ cyan/magenta WOS PROOF checker appears
→ 0618D can close
```

## Final Instruction to Build

Patch only the Mapbox access/style recovery layer. Do not add more texture or GLB infrastructure. The goal is to make the black map impossible to misread.
