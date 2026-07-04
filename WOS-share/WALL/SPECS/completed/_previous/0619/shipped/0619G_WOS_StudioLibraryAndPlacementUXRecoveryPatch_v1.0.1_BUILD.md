# 0619G_WOS_StudioLibraryAndPlacementUXRecoveryPatch_v1.0.1_BUILD

## Status

```txt
BUILD PATCH / CLOSURE PASS
```

## Supersedes

```txt
0619G_WOS_StudioLibraryAndPlacementUXRecoveryPatch_v1.0.0_BUILD
```

## Scope

This patch closes the remaining 0619G implementation gap only:

```txt
- placement feedback completion
- Inspector update after placement
- Library default collapse cleanup
- placement diagnostic/debug completion
```

Do not reopen the full 0619G product model unless this closure pass reveals a blocking missing hook.

---

# Purpose

Recover the Studio authoring loop so the primary workflow is obvious and visibly confirmed:

```txt
Choose asset
→ Map
→ Place on Map
→ click map
→ see placed actor
→ inspect/edit on right
```

The existing 0619G build already reduced the Studio model toward:

```txt
Modes: Library | Map | Canvas | Broadcast
Tools: Publish | Import
Layout: Left Panel | Center Surface | Right Panel
```

This `v1.0.1` patch focuses only on making placement response and Library startup density production-usable.

---

# Core Rule

```txt
Studio is an authoring tool, not a dumping ground.
Every visible surface must have one job.
Every authoring action must produce deterministic visual feedback.
```

---

# Files To Modify

```txt
studio/views/threeDCanvasView.js
studio/studioShell.js
studio/styles.css
```

Do not modify:

```txt
wall/
data/
studio/actors/
studio/mapLab/
studio/index.html
```

unless a missing event hook makes it unavoidable.

---

# Required Behavior

## Placement Success

When the user clicks `Place on Map` and then clicks the map:

```txt
- marker appears
- marker pulses
- actor becomes selected
- Inspector switches to Actor
- placement status strip says Placed <asset label>
- placement flash/toast appears
- placement mode turns off
```

## Placement Failure

If placement fails:

```txt
- placement mode remains armed
- status strip shows Placement failed — <reason>
- flash/toast shows failure reason
- _wos.debug.studio.placement() records lastError
```

Failure must be visible without opening DevTools.

---

# Placement Snapshot Contract

Expose:

```js
_wos.debug.studio.placement()
```

Expected shape:

```js
{
  armed: false,
  activeAssetId: "structure.rooftop.antenna",
  activeAssetLabel: "Rooftop Antenna",
  activeAssetCategory: "structure",
  lastClick: { lat: 40.6892, lon: -74.0445 },
  lastResult: "ok",
  lastError: null,
  createdObjectId: "...",
  markerAdded: true,
  proxyAdded: true
}
```

Diagnostics must remain UI/runtime-only.

They must not be written into:

```txt
- actor manifests
- publish bundles
- local build artifacts
- wall runtime state
```

---

# 1. threeDCanvasView.js Patch

## 1.1 Add Placement Flash

Add this function inside `threeDCanvasView.js` near existing placement status helpers.

```js
function _showPlacementFlash(message, state) {
  if (!_mapContainerEl) return;

  var el = document.getElementById('tdcv-placement-flash');
  if (!el) {
    el = document.createElement('div');
    el.id = 'tdcv-placement-flash';
    _mapContainerEl.appendChild(el);
  }

  el.className = 'tdcv-placement-flash tdcv-placement-flash--' + (state || 'ok');
  el.textContent = message || '';

  if (el._wosClearTimer) clearTimeout(el._wosClearTimer);

  var ttl = state === 'error' ? 2200 : 1400;
  el._wosClearTimer = setTimeout(function () {
    el.classList.add('tdcv-placement-flash--hiding');
  }, ttl);
}
```

Requirements:

```txt
state values: ok | error | armed
success TTL: ~1400ms
error TTL: ~2200ms
```

---

## 1.2 Update Placement Arm Feedback

In `_setPlacementMode(on)`, after `_updatePlacementStrip()`, add:

```js
if (on) {
  _showPlacementFlash(
    'Click map to place ' + (_placementDiag.activeAssetLabel || _placementDiag.activeAssetId || 'asset'),
    'armed'
  );
}
```

Expected armed behavior:

```txt
- _placementDiag.armed = true
- active asset id / label updates
- cursor changes to crosshair
- Place button says Placing… (click map)
- placement strip says Armed — click map to place <asset>
- armed flash appears
```

---

## 1.3 Replace Map Click Success / Failure Handling

In `_onMapClick(e)`, the success path must do all of the following:

```js
if (result.ok) {
  _addMarker(result.manifest);

  if (ctrl && ctrl.select) ctrl.select(result.manifest.objectId);

  _pulseMarker(result.manifest.objectId);

  if (_map && result.manifest.anchor) {
    _map.easeTo({
      center: [result.manifest.anchor.lon, result.manifest.anchor.lat],
      duration: 350,
      essential: true
    });
  }

  _showPlacementFlash(
    'Placed ' + (_placementDiag.activeAssetLabel || result.manifest.assetId || 'actor'),
    'ok'
  );

  document.dispatchEvent(new CustomEvent('wos:studio-placement-result', {
    detail: getPlacementSnapshot()
  }));

  _setPlacementMode(false);

  try { localStorage.setItem(LS_KEY_LAST_PLACE_CAT, defaults.actorCategory); } catch (err) {}
}
```

The failure path must do this:

```js
else {
  _showPlacementFlash(
    'Placement failed — ' + (result.reason || 'unknown error'),
    'error'
  );

  document.dispatchEvent(new CustomEvent('wos:studio-placement-result', {
    detail: getPlacementSnapshot()
  }));

  _updatePlacementStrip();
}
```

Important:

```txt
Do not call _setPlacementMode(false) on failure.
Failure should leave placement armed unless the controller explicitly cannot place.
Success should select the actor immediately.
```

---

## 1.4 Pulse Actor From Controller Callback

In `_onControllerPlace(manifest)`, after marker/render-layer placement handling, add:

```js
_pulseMarker(manifest.objectId);
```

This ensures feedback still works if placement arrives through controller callbacks instead of the direct map click branch.

---

## 1.5 Confirm Public Export Helpers

At the public export bottom of `threeDCanvasView.js`, confirm these exist:

```js
armPlacement: function (assetId) {
  if (assetId) setActiveAsset(assetId);
  _setPlacementMode(true);
},

setActiveAsset: function (assetId) {
  _defaultAssetId = assetId || '';
  try {
    if (_defaultAssetId) localStorage.setItem(LS_KEY_ACTIVE_ASSET, _defaultAssetId);
  } catch (err) {}
  _updateAssetContext();
},

getActiveAsset: function () {
  return _defaultAssetId;
},

getPlacementSnapshot: getPlacementSnapshot,
```

If these already exist, do not duplicate them. Only patch missing behavior.

---

# 2. studioShell.js Patch

## 2.1 Library Default Section State

Update `_SECTION_DEFAULTS` to:

```js
var _SECTION_DEFAULTS = {
  assets: true,

  structure: true,
  road: false,
  marine: false,
  aircraft: false,
  transit: false,
  civic: false,
  world: false,
  prop: false,
  system: false,
  synthetic: false,
  debug: false,
  unknown: false,

  actors: false,
  imports: false,
  advanced: false
};
```

Reason:

```txt
Assets stays open.
Structure stays open for current building/object work.
Everything else stays collapsed until needed.
```

---

## 2.2 Placement Result Listener

Add this listener wherever Studio-level document listeners are registered.

```js
document.addEventListener('wos:studio-placement-result', function (ev) {
  _placementDiag = Object.assign({}, _placementDiag, ev.detail || {});
  _refreshActorRows();

  var body = _byId('studio-inspector-body');
  var ctrl = global.WOSActorPlacementController;
  var selectedObjectId = ctrl && ctrl.selectedObjectId ? ctrl.selectedObjectId() : null;

  if (body && selectedObjectId) {
    _renderSelectedActorInspector(body);
  }
});
```

If a placement result listener already exists, merge this behavior into it instead of creating a duplicate.

Goal:

```txt
- New actor appears in Library immediately.
- Inspector updates immediately.
- Active Placement Asset remains visible.
```

---

## 2.3 Preserve Existing Asset Interaction Contract

Do not change the current interaction contract:

```txt
single-click asset row = select asset
selected row shows Place on Map
double-click row = arm placement
Place on Map from Library switches to Map and arms placement
```

Preserve:

```txt
_selectLibraryAsset(assetId)
_armPlacementFromLibrary(assetId)
```

---

# 3. styles.css Patch

Add near existing `tdcv` / marker styles.

```css
/* ── 0619G v1.0.1 Placement feedback ─────────────────────────────────────── */
.tdcv-placement-status {
  min-width: 180px;
  max-width: 420px;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 11px;
  letter-spacing: 0.03em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tdcv-placement-status--idle {
  color: rgba(255,255,255,0.48);
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.08);
}

.tdcv-placement-status--armed {
  color: #78e6ff;
  background: rgba(120,230,255,0.10);
  border: 1px solid rgba(120,230,255,0.35);
}

.tdcv-placement-status--ok {
  color: #9affc4;
  background: rgba(154,255,196,0.10);
  border: 1px solid rgba(154,255,196,0.35);
}

.tdcv-placement-status--error {
  color: #ff9a9a;
  background: rgba(255,90,90,0.10);
  border: 1px solid rgba(255,90,90,0.38);
}

.tdcv-placement-flash {
  position: absolute;
  left: 50%;
  top: 52px;
  transform: translateX(-50%);
  z-index: 20;
  pointer-events: none;
  padding: 8px 12px;
  border-radius: 7px;
  font-size: 12px;
  letter-spacing: 0.04em;
  box-shadow: 0 10px 30px rgba(0,0,0,0.35);
  opacity: 1;
  transition: opacity 220ms ease, transform 220ms ease;
}

.tdcv-placement-flash--armed {
  color: #dff8ff;
  background: rgba(7,18,26,0.90);
  border: 1px solid rgba(120,230,255,0.45);
}

.tdcv-placement-flash--ok {
  color: #04100a;
  background: #9affc4;
  border: 1px solid rgba(154,255,196,0.70);
}

.tdcv-placement-flash--error {
  color: #fff0f0;
  background: rgba(90,20,20,0.92);
  border: 1px solid rgba(255,120,120,0.55);
}

.tdcv-placement-flash--hiding {
  opacity: 0;
  transform: translateX(-50%) translateY(-6px);
}

.tdcv-marker--pulse .tdcv-marker-dot {
  animation: tdcv-marker-placement-pulse 900ms ease-out;
}

@keyframes tdcv-marker-placement-pulse {
  0% {
    transform: scale(1);
    box-shadow: 0 0 0 0 rgba(120,230,255,0.75);
  }
  45% {
    transform: scale(1.85);
    box-shadow: 0 0 0 12px rgba(120,230,255,0.18);
  }
  100% {
    transform: scale(1);
    box-shadow: 0 0 0 20px rgba(120,230,255,0);
  }
}
```

If these class names already exist, merge without duplicating.

---

# Acceptance Tests

## T1 — Library Starts Compact

Steps:

```js
localStorage.removeItem('wos.studio.library.sectionState')
location.reload()
```

Expected:

```txt
Assets open
Structure open
Road collapsed
Marine collapsed
Aircraft collapsed
Transit collapsed
Civic collapsed
World collapsed
Prop collapsed
Actors collapsed
Imports collapsed
Advanced collapsed
```

## T2 — Asset Selection Remains Stable

Steps:

```txt
1. Click structure.rooftop.antenna or Midrise Block.
2. Confirm active asset box updates.
3. Confirm Map toolbar selected asset updates.
```

Expected:

```txt
Library selected row is highlighted.
Active Placement Asset shows selected asset.
Map toolbar shows selected asset context.
```

## T3 — Placement Arm Is Obvious

Steps:

```txt
1. Click Place on Map.
```

Expected:

```txt
Button changes to Placing… (click map).
Cursor changes to crosshair.
Placement strip changes to armed state.
Flash appears: Click map to place <asset label>.
```

## T4 — Placement Click Creates Visible Response

Steps:

```txt
1. Click map.
```

Expected:

```txt
New marker appears immediately.
Marker pulses.
Map eases toward marker.
Placement strip shows success.
Flash says Placed <asset label>.
Placement mode turns off.
Cursor returns to normal.
```

## T5 — New Actor Becomes Selected

Steps:

```txt
1. Place actor.
2. Observe Inspector.
```

Expected:

```txt
Right Inspector changes to actor detail.
New actor marker is selected.
Library Actors section includes the new actor when opened.
```

## T6 — Placement Debug Exists

Run:

```js
_wos.debug.studio.placement()
```

Expected:

```txt
lastResult: ok
createdObjectId exists
markerAdded: true
lastClick contains lat/lon
```

## T7 — Failure Is Visible

Steps:

```js
WOSThreeDCanvasView.armPlacement('bad.asset.id')
```

Then click map.

Expected:

```txt
Error flash appears.
Placement strip shows failure.
Placement remains armed unless controller explicitly blocks all placement.
No broken blank UI.
```

## T8 — Building Selection Still Reachable

Steps:

```txt
1. Open View Options.
2. Select target → Buildings.
3. Click visible building.
```

Expected:

```txt
Right Inspector switches to Building inspector.
Apply Test Texture remains reachable.
```

## T9 — No Publish Contamination

Steps:

```txt
1. Place actor.
2. Publish.
3. Inspect generated bundle.
```

Expected:

```txt
No placement diagnostics are included.
No flash/status UI data appears in manifests or bundle.
Only actor manifest data is persisted.
```

---

# Non-Goals

```txt
Do not create new actor systems.
Do not alter actor manifest schema.
Do not alter publish bundle contracts.
Do not change GLB runtime rendering.
Do not change texture package/rendering logic.
Do not add new Mapbox styles.
Do not redesign visual branding.
Do not reintroduce Jekyll.
Do not resume 0618D in this patch.
```

---

# Closure Rule

```txt
0619G v1.0.1 closes only when the basic authoring loop works without DevTools:

Choose asset
→ Place on Map
→ click map
→ see actor
→ inspect actor
```

---

# Next Build After Closure

After this closes, resume:

```txt
0618D_BuildingTextureVisibleProofPatch
```
