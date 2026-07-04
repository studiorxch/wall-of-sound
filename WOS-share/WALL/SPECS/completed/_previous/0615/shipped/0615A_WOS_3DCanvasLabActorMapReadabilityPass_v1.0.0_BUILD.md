# 0615A_WOS_3DCanvasLabActorMapReadabilityPass_v1.0.0_BUILD

## Status

BUILD

## Classification

studio-authoring-ux  
post-phase-8-validation-cleanup  
3d-canvas-readability  
actor-recovery-tools

## Purpose

Improve the Studio 3D Canvas authoring experience so placed actors can be found, selected, focused, filtered, and visually distinguished after placement.

This pass exists because Phase 1–8 successfully closed the authoring-to-runtime loop, but validation exposed an authoring usability issue:

```txt
Actors can be placed and published, but placed actors become visually hard to recover.
The 3D Canvas currently behaves more like a dark placement surface than a usable authoring map.
```

The goal is not to change publishing, promotion, rendering contracts, or Wall runtime behavior.

The goal is to make Studio usable for placing and managing actors.

---

# 1. Background

Phases 1–8 are accepted:

```txt
Phase 1: Place + Save
Phase 2: Properties
Phase 3: Authoring UX
Phase 4: Governance
Phase 5: 3D Actor/Object Render Layer
Phase 6: Building Selection + Replacement Authoring
Phase 7: Material Overrides
Phase 8: Production Publish to Wall Runtime
```

Phase 8 validation confirmed:

```txt
wall/data/wos-wall-runtime-bundle.json exists
forbidden runtime fields are absent
Studio → Wall publish boundary works
```

However, Studio actor authoring still has a readability problem:

```txt
multiple placed actors
+ small dots
+ dark authoring surface
+ weak actor list recovery
+ no focus-to-actor control
= author loses track of placed objects
```

This BUILD resolves that issue.

---

# 2. Non-Goals

This pass MUST NOT implement:

1. New actor manifest schema.
2. New promotion lifecycle.
3. Wall runtime changes.
4. Publish bundle changes.
5. Material override changes.
6. Building replacement logic changes.
7. New Mapbox instance.
8. New WebGL context.
9. Freeform map styling editor.
10. Full minimap system.
11. Multi-user collaboration.
12. Batch governance operations.

---

# 3. Locked UX Outcome

After this pass, the author must be able to:

```txt
place actors
find actors again
focus the map on a selected actor
distinguish Draft vs Promoted actors
hide noisy Draft actors
see which actor is currently selected
remove visual clutter without breaking manifest truth
```

---

# 4. Files

## 4.1 Updated Files

```txt
studio/views/threeDCanvasView.js
studio/views/libraryController.js
studio/studioShell.js
studio/styles.css
```

## 4.2 Optional New File

Only create this file if the implementation becomes too large for `threeDCanvasView.js`:

```txt
studio/views/actorMapReadabilityController.js
```

If created, it MUST be a Studio-only authoring helper and MUST NOT be imported by Wall.

---

# 5. Authoring Map Mode

## 5.1 Requirement

3D Canvas MUST support a clearer authoring map mode.

The default map style may remain dark, but the authoring surface must provide enough visual context to locate placed actors.

## 5.2 Minimum Implementation

Add a Studio-only authoring readability toggle in the 3D Canvas toolbar:

```txt
Authoring View
```

The toggle may use either:

1. A lighter Mapbox style.
2. Paint overrides on the existing style.
3. Reduced darkness / higher label and road contrast.

## 5.3 Locked Rule

Authoring View is a Studio-only visual mode.

It MUST NOT write to:

```txt
WOSActorManifest
wos-registry.json
wos-wall-runtime-bundle.json
Wall runtime map style
```

## 5.4 Suggested Behavior

When enabled:

```txt
roads become more readable
water remains visible
parks remain visible
building footprints/outlines remain visible
actor markers become high-contrast
labels become more legible
```

When disabled:

```txt
3D Canvas returns to the existing visual style
```

---

# 6. Actor Focus Control

## 6.1 Requirement

Every placed actor must be recoverable from the Library actor list.

Clicking or focusing an actor row MUST be able to move the 3D Canvas map to that actor.

## 6.2 Public API

Add to `WOSThreeDCanvasView`:

```js
focusActor(objectId, options)
```

Recommended shape:

```js
function focusActor(objectId, options) {
  options = options || {};
  const actor = WOSActorManifestStore.get(objectId);
  if (!actor || !_map) return { ok: false, reason: 'actor_or_map_unavailable' };

  _map.flyTo({
    center: [actor.anchor.lon, actor.anchor.lat],
    zoom: options.zoom || 17,
    pitch: options.pitch != null ? options.pitch : 55,
    bearing: options.bearing != null ? options.bearing : _map.getBearing(),
    essential: true,
    duration: options.duration || 650,
  });

  _selectActor(objectId);
  _pulseMarker(objectId);
  return { ok: true };
}
```

## 6.3 Library Behavior

Actor rows in the Library MUST provide actor recovery.

Minimum acceptable behavior:

```txt
Click actor row
→ select actor
→ focus 3D Canvas map to actor if 3D Canvas is mounted
→ pulse marker
```

Preferred behavior:

```txt
Actor row includes Focus button
```

## 6.4 Cross-Mode Behavior

If the current Studio mode is not `3d-canvas`, focusing an actor may either:

1. Switch to `3d-canvas`, then focus after enter completes.
2. Select the actor and show a hint that focus requires 3D Canvas.

Preferred:

```txt
Switch to 3D Canvas, then focus actor.
```

---

# 7. Actor Visibility Filters

## 7.1 Requirement

The author must be able to reduce clutter when many Draft actors exist.

## 7.2 Minimum Filters

Add Studio-only actor visibility controls:

```txt
All
Draft
Promoted
Structures
```

Minimum acceptable implementation:

```txt
Show All
Hide Drafts
Show Promoted Only
```

## 7.3 Filter Scope

Filters affect only Studio display:

```txt
Library actor rows
Mapbox markers
3D Canvas authoring visibility
```

Filters MUST NOT delete actors or mutate manifests.

## 7.4 Public API

Add to `WOSThreeDCanvasView`:

```js
setActorVisibilityFilter(filterKey)
getActorVisibilityFilter()
```

Allowed `filterKey` values:

```txt
all
draft
promoted
structure
```

Optional values:

```txt
vehicle
maritime
prop
hidden
```

## 7.5 Filter Logic

```js
function actorMatchesFilter(actor, filterKey) {
  const state = actor.meta && actor.meta.lifecycleState;
  const promoted = actor.meta && actor.meta.promoted;

  if (filterKey === 'all') return true;
  if (filterKey === 'draft') return !promoted && state !== 'RETIRED';
  if (filterKey === 'promoted') return promoted || state === 'PROMOTED';
  if (filterKey === 'structure') return actor.actorCategory === 'structure';
  return true;
}
```

---

# 8. Marker Readability

## 8.1 Requirement

Actor markers must communicate state and category at a glance.

## 8.2 Lifecycle Visual Rules

```txt
Draft       = small hollow marker
Promoted    = bright filled marker
Pending     = amber marker
Deprecated  = dim marker
Retired     = hidden by default
Selected    = cyan ring + pulse
```

## 8.3 Category Visual Rules

```txt
structure = square marker
vehicle   = triangle / arrow marker
maritime  = wedge / boat marker
aircraft  = wing / caret marker
prop      = circle marker
```

If category-specific marker shapes are too much for this pass, lifecycle styling is required and category styling may be deferred.

## 8.4 Selected Actor Requirement

Selected actor must be unmistakable.

Required selected state:

```txt
cyan marker ring
larger marker scale
visible label
optional pulse animation
```

## 8.5 Label Rules

```txt
selected actor: always show label
near zoom: show label
far zoom: hide label
promoted actor: label may remain visible if not cluttered
```

Minimum implementation:

```txt
selected actor label always visible
non-selected actor labels dimmed or hidden by CSS
```

---

# 9. Actor List Readability

## 9.1 Requirement

Actor rows must be easier to identify.

## 9.2 Actor Row Content

Each actor row SHOULD display:

```txt
lifecycle badge
actor display label or asset name
actorCategory / actorType
assetId
short objectId
lat/lon
Focus action
Select action if separate from row click
Delete action for Draft actors only
```

## 9.3 Row Example

```txt
[Draft] Generic Vessel
marine · custom · asset://marine/vessel_generic
40.6890, -74.0440
[Focus] [Select] [Delete]
```

## 9.4 Draft Cleanup Utility

Add optional but recommended action:

```txt
Delete All Draft Actors
```

Guardrails:

```txt
requires confirm()
only deletes actors where promoted !== true and lifecycleState === DRAFT or missing
MUST NOT delete PROMOTED, GATE_PENDING, DEPRECATED, or RETIRED actors
MUST restore building suppression if any deleted draft is structure-bound
```

If this is included, it must call existing deletion/removal paths rather than directly splicing store data.

---

# 10. Interaction Contract

## 10.1 Actor Row Click

Preferred:

```txt
single click actor row
→ select actor
→ focus map to actor
```

Alternative:

```txt
single click actor row selects only
Focus button focuses map
```

The preferred behavior is recommended because the current pain is actor recovery.

## 10.2 Marker Click

Marker click remains:

```txt
marker click
→ WOSActorPlacementController.select(objectId)
→ Inspector updates
→ render layer selection updates
```

## 10.3 Object3D Click

If Phase 5 Object3D picking exists or is added later:

```txt
Object3D click
→ forward objectId to WOSActorPlacementController.select(objectId)
```

Selection authority remains `WOSActorPlacementController`.

---

# 11. Persistence Rules

This pass is authoring UX only.

It MUST NOT persist:

```txt
selected actor
focused actor
actor filter
authoring map mode
marker pulse state
hidden-by-filter state
```

Optional localStorage persistence is allowed only for Studio UI preferences:

```txt
wos.studio.actorFilter
wos.studio.authoringMapMode
```

These preferences MUST NOT appear in actor manifests or Wall bundles.

---

# 12. Publish / Runtime Isolation

This pass MUST NOT alter:

```txt
StudioPublisher
localPublishServer
wallRuntimeBundleLoader
wallRuntimeActorFilter
wallRuntimeStructureReplacementLayer
wallRuntimeMaterialOverrideApplicator
wallRuntimeDiagnostics
wos-wall-runtime-bundle.json shape
```

Publish remains:

```txt
PROMOTED actors only
forbidden fields stripped
Wall consumes bundle only
```

---

# 13. Implementation Plan

## Step 1 — Add Focus API

Update:

```txt
studio/views/threeDCanvasView.js
```

Add:

```txt
focusActor(objectId, options)
_pulseMarker(objectId)
```

Expose from `global.WOSThreeDCanvasView`.

## Step 2 — Add Visibility Filter API

Update:

```txt
studio/views/threeDCanvasView.js
```

Add:

```txt
setActorVisibilityFilter(filterKey)
getActorVisibilityFilter()
_applyActorVisibilityFilter()
_actorMatchesFilter(actor, filterKey)
```

Marker visibility must update immediately.

Render layer visibility can be deferred unless current render layer supports per-object visibility cleanly.

Minimum required:

```txt
markers and Library rows filter correctly
```

## Step 3 — Update Library Actor Rows

Update:

```txt
studio/studioShell.js
studio/views/libraryController.js
```

Actor rows must include:

```txt
lifecycle badge
asset label
category/type
coordinates
Focus action
```

Click behavior should focus actor.

## Step 4 — Add Toolbar Controls

Update:

```txt
studio/views/threeDCanvasView.js
studio/styles.css
```

Add toolbar controls:

```txt
Authoring View toggle
Actor filter dropdown
```

Example filter dropdown:

```txt
Show: All / Draft / Promoted / Structures
```

## Step 5 — Marker Styling

Update:

```txt
studio/styles.css
```

Add marker classes:

```txt
tdcv-marker--draft
tdcv-marker--promoted
tdcv-marker--pending
tdcv-marker--deprecated
tdcv-marker--retired
tdcv-marker--structure
tdcv-marker--vehicle
tdcv-marker--maritime
tdcv-marker--aircraft
tdcv-marker--prop
tdcv-marker--pulse
```

## Step 6 — Optional Draft Cleanup

Add a guarded action:

```txt
Delete All Draft Actors
```

Only if implementation is low-risk.

This action must use existing remove paths.

---

# 14. Acceptance Criteria

## AC1 — Focus from Library

Given an actor exists in the Library actor list:

```txt
clicking Focus or clicking the row focuses the 3D Canvas map on that actor
```

Expected:

```txt
map center changes to actor anchor
actor becomes selected
marker pulses
Inspector shows selected actor
```

## AC2 — Selected actor readability

Given an actor is selected:

```txt
selected marker has cyan ring / stronger visual state
selected label is visible
```

## AC3 — Lifecycle marker states

Given at least one Draft actor and one Promoted actor:

```txt
Draft and Promoted markers are visually distinguishable
```

## AC4 — Actor filter

Given multiple actors:

```txt
Show Promoted Only hides Draft markers and Draft rows
Show All restores them
```

## AC5 — No manifest mutation from filters

Changing actor visibility filters MUST NOT modify:

```txt
WOSActorManifestStore.exportJson()
```

## AC6 — No publish mutation

After using Authoring View and filters, publishing still produces a valid runtime bundle.

Forbidden field grep remains empty:

```bash
grep -R "assetPath\|assetUrl\|glbPath\|previewAnchor\|previewHeading\|inspectorDraft" wall/data/wos-wall-runtime-bundle.json
```

## AC7 — No new Mapbox instance

3D Canvas must still use one Studio-owned Mapbox instance.

No additional Mapbox instance or canvas is created for readability tools.

## AC8 — Wall untouched

No Wall runtime files are modified.

The following must remain unchanged:

```txt
wall/systems/runtime/wallRuntimeBundleLoader.js
wall/systems/runtime/wallRuntimeActorFilter.js
wall/systems/runtime/wallRuntimeStructureReplacementLayer.js
wall/systems/runtime/wallRuntimeMaterialOverrideApplicator.js
wall/systems/runtime/wallRuntimeDiagnostics.js
```

## AC9 — Draft cleanup guardrail

If Delete All Draft Actors is implemented:

```txt
PROMOTED actors are not deleted
GATE_PENDING actors are not deleted
DEPRECATED actors are not deleted
RETIRED actors are not deleted
```

## AC10 — Existing Phase 1–8 tests still pass

Existing accepted functionality remains valid:

```txt
place actor
save actor
submit/promote actor
publish actor
building replacement restore
material override save/reset
Wall bundle load/filter/diagnostics
```

---

# 15. Debug Commands

## 15.1 Focus Selected Actor

```js
WOSThreeDCanvasView.focusActor(
  WOSActorPlacementController.selectedObjectId()
)
```

## 15.2 Filter Actors

```js
WOSThreeDCanvasView.setActorVisibilityFilter('promoted')
WOSThreeDCanvasView.setActorVisibilityFilter('all')
```

## 15.3 Check Filter State

```js
WOSThreeDCanvasView.getActorVisibilityFilter()
```

## 15.4 Actor Counts

```js
WOSActorManifestStore.list().map(a => ({
  id: a.objectId,
  category: a.actorCategory,
  assetId: a.assetId,
  promoted: a.meta && a.meta.promoted,
  lifecycleState: a.meta && a.meta.lifecycleState,
  lat: a.anchor && a.anchor.lat,
  lon: a.anchor && a.anchor.lon,
}))
```

---

# 16. Ship Gate

This BUILD passes when the following is true:

```txt
Place 5 actors
Promote 1 actor
Use Library to focus each actor
Actor map pans to each actor correctly
Selected actor is obvious
Draft vs Promoted markers are visually distinct
Show Promoted Only hides Draft actors
Show All restores Draft actors
No manifests mutate when filters change
Publish still creates valid bundle
Forbidden-field grep remains empty
Wall runtime files unchanged
```

---

# 17. Final Lock

```txt
Studio must be an authoring map, not just a placement surface.
Actors must be recoverable after placement.
Focus, filter, and readability tools are Studio-only UX state.
Manifest truth and Wall runtime contracts remain unchanged.
```
