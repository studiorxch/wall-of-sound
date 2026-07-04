# 0627_WOS_OrbitalEarthCameraFramingAndGlobeFit_v1.0.0

## Project

**Project:** WOS  
**Feature Layer:** Orbital Earth Mode  
**Document Type:** Camera / Framing Spec  
**Version:** v1.0.0  
**Status:** Proposed  
**Primary Runtime Owner:** WOS  
**Connected Systems:** Mapbox Earth/Globe, Orbital Earth Mode, Broadcast HUD, Orbital FX Panel, WosModeTransitionController

---

## Purpose

Fix Orbital Earth camera framing so the default Orbital view shows a complete, readable Earth/globe composition instead of a cropped close-up map/globe state.

The previous readability pass improved overlays, token-driven styling, atmosphere, origin marker, and FX controls. The remaining problem is camera/framing:

```text
Orbital selected
→ Mapbox globe activates
→ overlays apply
→ camera remains too close / too cropped
→ full Earth is not visible
```

This spec defines the camera presets, globe-fit behavior, HUD-safe framing, and return-state rules required for a believable Orbital Earth mode.

---

## Core Problem

Orbital Earth is now correctly Mapbox-first, but it still behaves too much like a styled map zoom state.

The user should see:

```text
Map
→ camera lifts
→ curvature appears
→ Earth fits in frame
→ Orbital HUD activates
```

Not:

```text
Map
→ projection changes
→ view stays close
→ only part of Earth is visible
```

---

## Product Lock

Default Orbital Earth entry must frame the full globe.

Required default:

```text
Orbital Earth default = full Earth visible, readable, HUD-safe
```

Manual cinematic crops are allowed later, but they must not be the default.

---

## Non-Negotiable Architecture Locks

Do not change these during this pass:

1. Orbital Earth remains Mapbox-first.
2. Three.js fake Earth/portal/visualizer remains manual-only.
3. Style tokens continue driving overlay color and readability.
4. Moon Mode remains gated from Orbital Earth.
5. Return to map must restore the previous map camera state.
6. No unlabeled celestial objects.
7. No hard-coded cyan camera/overlay identity.

---

## Required Camera Behavior

### On Orbital entry

The system must:

1. Capture current map camera state.
2. Switch or confirm Mapbox globe projection.
3. Animate away from the local map.
4. Set a true orbital camera preset.
5. Fit the globe inside the viewport.
6. Preserve HUD safe area.
7. Activate Orbital Earth overlays only after the globe framing is stable or near-stable.

### On return to map

The system must:

1. Exit Orbital overlays.
2. Restore previous projection/camera where appropriate.
3. Restore saved map center, zoom, bearing, and pitch.
4. Restore selected transport to Flight.
5. Clear all Orbital body classes and dim states.

---

## Camera Presets

Add dedicated Orbital Earth camera presets.

### 1. Readable Orbit

Default entry preset.

Purpose:
- full Earth visible
- readable map linework
- strongest geographic trust
- safe for debugging and normal user experience

Expected:
```text
full globe visible
Earth centered slightly above vertical center
bottom controls not covering key globe center
moderate starfield
low atmosphere
```

### 2. Broadcast Orbit

Purpose:
- stream-safe composition
- full globe visible
- more room for track cards / HUD
- still visually rich

Expected:
```text
globe slightly smaller than Readable Orbit
more negative space
HUD-safe left/right zones
bottom controls clear
```

### 3. Deep Orbit

Purpose:
- more space around Earth
- cinematic listening state
- useful for ambient streams

Expected:
```text
Earth smaller
starfield more present
map linework still visible
quiet composition
```

### 4. Cinematic Crop

Manual-only.

Purpose:
- dramatic partial Earth frame
- album/playlist visual moments
- not default

Expected:
```text
Earth may crop at edges
surface linework still readable
explicitly selected by user
```

### 5. Origin Focus Orbit

Optional later.

Purpose:
- keep captured map origin facing viewer
- show local/regional anchor before full pullback

Expected:
```text
origin marker remains visible
camera frames the anchor region briefly
then can pull to full Earth
```

---

## Recommended Camera Preset Shape

Mapbox camera values may need testing, but use this as the implementation model:

```js
{
  id: "readable_orbit",
  label: "Readable Orbit",
  zoom: 0.85,
  pitch: 0,
  bearing: 0,
  padding: {
    top: 80,
    right: 80,
    bottom: 150,
    left: 80
  },
  durationMs: 1300,
  fullGlobeRequired: true
}
```

Additional presets:

```js
{
  id: "broadcast_orbit",
  zoom: 0.65,
  pitch: 0,
  bearing: 0,
  padding: { top: 100, right: 160, bottom: 170, left: 160 },
  fullGlobeRequired: true
}
```

```js
{
  id: "deep_orbit",
  zoom: 0.35,
  pitch: 0,
  bearing: 0,
  padding: { top: 120, right: 180, bottom: 180, left: 180 },
  fullGlobeRequired: true
}
```

```js
{
  id: "cinematic_crop",
  zoom: 1.35,
  pitch: 0,
  bearing: 0,
  padding: { top: 40, right: 40, bottom: 120, left: 40 },
  fullGlobeRequired: false,
  manualOnly: true
}
```

These values are starting points. The build must tune based on actual Mapbox behavior.

---

## Globe-Fit Requirement

Orbital Earth needs a runtime globe-fit check.

### Required check

After entering Orbital:

```text
Is the globe fully visible inside the safe viewport?
```

If not:

```text
reduce zoom
recenter globe
retry once or twice
log diagnostic
```

### Safe viewport

Define a screen region that excludes persistent UI:

```text
top bar
bottom transport controls
left HUD
right HUD
browser/embedded frame safe margin
```

The full Earth should fit inside the remaining safe region for `readable_orbit`, `broadcast_orbit`, and `deep_orbit`.

---

## HUD-Safe Framing

The globe should not be hidden behind controls by default.

### Required

- Earth center should sit above the bottom transport controls.
- Earth rim should not be fully covered by the bottom bar.
- Left/right HUD can overlap atmosphere, but not destroy readability.
- Broadcast mode should leave extra negative space for text blocks.

### Suggested default framing

```text
Earth visual center: 44%–48% viewport height
Earth max diameter: 68%–78% viewport height for Readable Orbit
Earth max diameter: 58%–70% viewport height for Broadcast Orbit
Earth max diameter: 38%–55% viewport height for Deep Orbit
```

---

## Transition Timing

The transition should feel like a lift into orbit.

### Revised Map → Orbital sequence

```text
0ms      capture map camera and style tokens
100ms    begin camera lift / zoom-out
300ms    reduce local UI emphasis
500ms    globe curvature becomes apparent
750ms    apply readable_orbit camera target
950ms    activate orbital overlays at low opacity
1200ms   confirm globe-fit
1300ms   clear transition veil
```

### Revised Orbital → Map sequence

```text
0ms      fade orbital overlays
150ms    begin map camera restore
500ms    restore saved center / zoom / pitch / bearing
750ms    clear Orbital body classes
900ms    Flight selected, map fully readable
```

---

## Map Camera State Capture

Before Orbital entry, capture:

```js
{
  center: map.getCenter(),
  zoom: map.getZoom(),
  bearing: map.getBearing(),
  pitch: map.getPitch(),
  projection: map.getProjection?.(),
  padding: currentPadding,
  selectedTransport: "flight",
  timestamp: Date.now()
}
```

Store this in Orbital Earth mode or transition controller.

The return path must use the saved state.

---

## Public API Additions

Recommended additions to `OrbitalEarthMode.js`:

```js
enter(context, options)
exit()
isActive()
setCameraPreset(presetId)
getCameraPreset()
saveMapCameraState(map)
restoreMapCameraState(map)
fitGlobeToViewport(presetId)
getGlobeFitReport()
```

Recommended additions to `WosModeTransitionController.js`:

```js
transitionToOrbitalEarth({ cameraPreset: "readable_orbit" })
transitionFromOrbitalEarth()
```

Recommended FX panel controls:

```text
CAMERA
Readable
Broadcast
Deep
Crop
Fit Globe
Restore View
```

---

## Diagnostics

Add camera/framing diagnostics.

### Required logs

```text
[WOS Orbital] CAMERA PRESET
[WOS Orbital] CAMERA SAVE
[WOS Orbital] CAMERA RESTORE
[WOS Orbital] GLOBE FIT
[WOS Orbital] GLOBE FIT RETRY
[WOS Orbital] GLOBE FIT FAILED
```

### Diagnostic fields

Include:

```text
preset
zoom
pitch
bearing
center
safeViewport
globeFitPassed
retryCount
savedCameraStateExists
```

---

## QA Test A — Default Globe Fit

### Steps

```text
1. Hard refresh WOS.
2. Confirm Flight map.
3. Click Orbital.
4. Wait for transition.
```

### Expected

```text
Full Earth is visible.
Earth is not cropped by default.
Bottom bar does not hide the globe center.
Orbital HUD remains readable.
```

### Fail if

- only part of Earth is visible
- camera remains too close
- Earth is cropped without selecting Cinematic Crop
- map appears as flat close-up after Orbital entry

---

## QA Test B — Camera Presets

### Steps

```text
1. Enter Orbital.
2. Select Readable Orbit.
3. Select Broadcast Orbit.
4. Select Deep Orbit.
5. Select Cinematic Crop.
6. Return to Readable Orbit.
```

### Expected

```text
Readable/Broadcast/Deep show full Earth.
Cinematic Crop may crop Earth.
Returning to Readable restores full globe.
```

### Fail if

- all presets look identical
- crop becomes default
- full-globe presets crop Earth
- camera does not update after preset selection

---

## QA Test C — Return Restore

### Steps

```text
1. Start at a specific map location.
2. Set a noticeable zoom/pitch/bearing.
3. Enter Orbital.
4. Change Orbital camera preset.
5. Return to map.
```

### Expected

```text
Map restores previous center/zoom/pitch/bearing.
Flight selected.
Orbital overlays cleared.
No stuck camera padding.
```

### Fail if

- return map stays zoomed out
- map remains in globe orbital distance
- wrong location restored
- pitch/bearing lost unexpectedly
- UI body classes remain active

---

## QA Test D — HUD Safe Area

### Steps

```text
1. Enter Orbital in Readable mode.
2. Observe bottom controls, left HUD, right HUD.
3. Switch to Broadcast mode.
```

### Expected

```text
Readable: globe clear, not hidden by controls.
Broadcast: extra negative space for HUD/track card.
```

### Fail if

- Earth center is behind bottom controls
- left/right HUD fully obscure key map region
- globe rim is hidden by persistent controls
- Broadcast mode does not create useful composition space

---

## QA Test E — Small Viewport

### Steps

```text
1. Resize browser smaller.
2. Enter Orbital.
3. Trigger Fit Globe.
```

### Expected

```text
Camera adjusts to keep Earth visible.
Fit report logs safe viewport.
Controls remain usable.
```

### Fail if

- globe becomes massively cropped
- Fit Globe does nothing
- UI controls cover the whole Earth
- map enters invalid zoom state

---

## Implementation Notes

### Preferred approach

Use Mapbox camera controls and projection first.

Avoid creating a Three.js substitute for camera framing.

### Avoid

- switching to fake sphere to solve framing
- hard-coded viewport assumptions
- crop as default
- losing saved map camera state
- disabling HUD to solve fit
- adding new visual effects before camera fit works

---

## Acceptance Criteria

This spec is complete when:

1. Orbital default shows full Earth/globe.
2. Readable/Broadcast/Deep presets keep full globe visible.
3. Cinematic Crop is manual-only.
4. Globe is centered within HUD-safe viewport.
5. Camera transition feels like a lift from map into orbit.
6. Return to map restores saved camera state.
7. Fit Globe can correct cropped views.
8. Diagnostics report preset and fit status.
9. No Three.js fake sphere is used for default framing.
10. Existing style-token overlays continue working.

---

## Final Principle

Orbital Earth is an altitude state first.

The camera must sell the idea that WOS has moved from local map to Earth orbit. Visual overlays can only work after the full Earth framing is believable.

## Implementation Guide

- **Where:** Patch `OrbitalEarthMode.js`, `WosModeTransitionController.js`, and Orbital FX panel camera controls.
- **What:** Add camera presets, saved map-camera restoration, globe-fit checks, HUD-safe framing, and diagnostics.
- **Expect:** Clicking Orbital shows a complete, readable Earth by default, with optional manual camera presets for broadcast, deep-space, and cinematic crop compositions.
