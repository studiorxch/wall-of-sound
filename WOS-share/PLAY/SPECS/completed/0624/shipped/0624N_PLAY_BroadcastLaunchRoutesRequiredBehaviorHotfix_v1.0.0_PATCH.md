# 0624N_PLAY_BroadcastLaunchRoutesRequiredBehaviorHotfix_v1.0.0_PATCH

## Status

Ready for implementation.

## Priority

P0 / Restore Required Map Behavior

This patch corrects the Broadcast HUD requirement.

The required behavior is not “show a dark stage,” not fake overlays, not capture modes, and not decorative map motion.

The required behavior is:

```text
Launch Routes
```

Broadcast must launch into a usable route/map screen that the operator can move and control.

---

## Active Project Paths

```text
WOS root:
  /Users/studio/Projects/wall-of-sound

PLAY root:
  /Users/studio/Projects/wall-of-sound/play

PLAY app:
  /Users/studio/Projects/wall-of-sound/play/flow-curve-builder

PLAY source:
  /Users/studio/Projects/wall-of-sound/play/flow-curve-builder/src
```

Do not use:

```text
/Users/studio/Projects/play
```

That path is legacy/inactive.

---

## Problem

0624M removed the unwanted route line, fake signal dot, dark haze, and extra capture controls.

But the Broadcast HUD still cannot be operated because no usable route/map feed is loading.

Current failure:

```text
Broadcast HUD opens
toolbar exists
map stage is clean/dark
but there is no launched route/map surface to move
```

This means the issue is no longer overlay clutter.

The issue is:

```text
Launch Routes is not wired as the required Broadcast behavior.
```

---

## Product Correction

Broadcast HUD should launch the route/map surface by default.

Correct model:

```text
Operate = launch and control route/map
Show = OBS-friendly route/map view
Snapshot = one-shot still helper
```

No other mode.

---

## Required Behavior

### 1. Broadcast opens with a usable map/route

When Broadcast HUD opens, it must resolve and load a real route/map source.

Expected:

```text
map visible
route/map source loaded
operator can pan/zoom/move in Operate
no empty dark stage unless load fails
```

---

### 2. Launch Routes is the primary action

Add or restore one clear action:

```text
Launch Routes
```

This should:

```text
resolve the configured WOS/map channel URL
mount the route/map iframe or embedded map
set Broadcast surface to active map state
enable pointer interaction in Operate
show load/error status if source fails
```

If the route/map source is already configured, Broadcast should auto-launch it.

If not configured, the button should use the default local WOS route fallback.

---

### 3. Default route/map fallback

If no map channel is configured, do not show an empty dark stage.

Use a default fallback.

Suggested fallback order:

```text
1. configured mapChannelUrl / routeChannelUrl
2. selected playlist broadcast map source
3. WOS local route URL from prior direct patch
4. local dev fallback route/map page
5. visible error card with exact missing URL/config
```

Do not silently render a blank stage.

---

### 4. Operate mode must control the launched route

Operate mode must allow:

```text
pan
zoom
move camera/map
click map controls if present
interact with route controls if present
```

Required:

```text
iframe/map pointer-events: auto
decorative overlays pointer-events: none
toolbar pointer-events: auto
no full-stage transparent blocker
```

---

### 5. Show mode uses same route/map source

Show mode should not swap to a fake overlay or blank stage.

Show mode:

```text
uses the same launched route/map
cleans surrounding UI
keeps map visible
keeps return to Operate available
does not block map source
```

---

### 6. Snapshot remains one-shot

Snapshot must remain one button.

```text
no capture mode
no still mode
no freeze mode
no 16:9 frame mode
```

Snapshot can briefly clean UI, then restore automatically.

---

## Remove / Do Not Reintroduce

Do not reintroduce:

```text
fake route line
signal dot
pulse ring
BroadcastMapMotionOverlay as decoration
Capture Mode
Still Mode
Hide HUD mode
Freeze
16:9 guide
Exit Capture
dark haze blanket
teal wash
video capture workflow
```

---

## UI Requirements

Broadcast toolbar:

```text
Operate | Show | Snapshot
```

Route/map area:

```text
Launch Routes
```

If route is already launched, show status:

```text
Routes: Live
```

If route cannot load, show explicit error:

```text
Routes unavailable: missing map source URL
```

No silent blank screen.

---

## Suggested State

Use minimal state only:

```ts
type BroadcastMode = "operate" | "show";

type BroadcastRouteStatus =
  | "idle"
  | "launching"
  | "live"
  | "error";
```

Suggested fields:

```ts
broadcastMode: BroadcastMode;
routeStatus: BroadcastRouteStatus;
routeError?: string;
activeRouteUrl?: string;
```

Do not add:

```ts
captureMode
stillMode
freezeMode
hideHud
frameMode
fakeMotionEnabled
```

---

## Source Resolution Logic

Add or repair route source resolver.

Suggested helper:

```ts
resolveBroadcastRouteUrl(params: {
  playlist: PlaylistRecord;
  projectSettings?: unknown;
  configuredMapChannelUrl?: string;
  configuredRouteChannelUrl?: string;
}): {
  url: string | null;
  source: "configured" | "playlist" | "wos-local-fallback" | "missing";
  error?: string;
};
```

Keep the implementation grounded in actual existing project structures.

---

## Required Fallback Error Card

If no route/map URL can be resolved, render a clear card instead of dark stage:

```text
Routes not launched

No Broadcast route/map source is configured.

Expected:
- configured map channel URL
- playlist broadcast map source
- WOS local fallback URL

Action:
Set route/map source or start WOS local server.
```

This prevents confusion.

---

## Implementation Targets

Likely files:

```text
src/ui/BroadcastHUD.tsx
src/ui/BroadcastOperatorOverlay.tsx
src/ui/BroadcastShowModeOverlay.tsx
src/styles.css
src/App.tsx
```

Possible files:

```text
src/logic/broadcastRouteSource.ts
src/data/playProjectTypes.ts
src/data/playProjectStorage.ts
```

Only touch storage/types if needed for a real existing route/map source field.

---

## Acceptance Criteria

### A. Launch Routes exists

Broadcast HUD has a clear way to launch the route/map surface.

---

### B. Broadcast auto-loads route/map if configured

If a route/map source exists, Broadcast does not open to a blank dark stage.

---

### C. Fallback path exists

If no route/map source is configured, Broadcast uses a default local WOS route/map fallback or shows a clear missing-source card.

---

### D. Map/route is movable

In Operate mode, user can pan/zoom/move the launched map/route surface.

---

### E. No fake line/dot returns

The removed fake route line and signal dot do not return.

---

### F. No haze returns

No dark haze/teal fog blanket returns.

---

### G. Toolbar remains simple

Toolbar remains:

```text
Operate | Show | Snapshot
```

---

### H. No capture-system states return

No Capture/Still/Freeze/16:9/Exit Capture states return.

---

### I. Show mode uses real route/map

Show mode displays the launched route/map source, not a fake decorative layer.

---

### J. tsc clean

Run:

```bash
cd /Users/studio/Projects/wall-of-sound/play/flow-curve-builder
tsc -b
```

Expected:

```text
exits 0
```

---

## Manual Test Checklist

1. Start WOS route/map server if required.

2. Start PLAY.

```bash
cd /Users/studio/Projects/wall-of-sound/play/flow-curve-builder
npm run dev
```

3. Open Broadcast HUD.

4. Confirm toolbar is:

```text
Operate | Show | Snapshot
```

5. Confirm either:

```text
Routes: Live
```

or a visible:

```text
Launch Routes
```

button.

6. Click Launch Routes if needed.

7. Confirm the route/map loads.

8. Drag/pan/move the map in Operate.

Expected:

```text
map moves
```

9. Zoom the map.

Expected:

```text
map zooms
```

10. Switch to Show.

Expected:

```text
same route/map remains visible
```

11. Return to Operate.

12. Click Snapshot.

Expected:

```text
one-shot behavior only
no new mode
```

13. Confirm no fake route line/dot is visible.

14. Confirm no dark haze is visible.

15. Run:

```bash
tsc -b
```

Expected:

```text
exits 0
```

---

## Expected Result

Broadcast HUD launches into a usable route/map surface.

The operator can move the screen.

The interface stays simple:

```text
Operate
Show
Snapshot
Launch Routes
```

No fake overlays. No capture modes. No dark haze.

---

## Implementation Guide

- **Where:** Broadcast HUD map/iframe source resolution, route launch action, operator toolbar, map stage error state.
- **What:** Make Launch Routes the required behavior, auto-load configured route/map source, provide fallback/error state, and ensure Operate mode gives pointer control to the real map.
- **Expect:** Broadcast HUD opens to an actual movable route/map surface instead of a blank dark stage.
