# 0623A_PLAY_WOSLocalUrlAndMapChannelDirectPatch_v1.0.0_PATCH

## Status

Ready for implementation.

## Priority

P0 — restore direct product value.

This patch connects PLAY `Map Channel` to the real local WOS visual surface from the new project location. It replaces the placeholder/mock-first behavior with a direct WOS iframe wallpaper path.

---

## Active Paths

Use the relocated project paths.

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

Do not write new PLAY work to:

```text
/Users/studio/Projects/play
```

That path is now legacy/inactive.

---

## Product Lock

```text
Map Channel = show real WOS as the playlist visual/wallpaper surface.
```

PLAY and WOS now live under the same project tree, but they remain separate subsystems.

```text
WOS  = spatial/world renderer
PLAY = playlist programming, scheduler, Smart Grid, Broadcast HUD
```

For this patch, `Map Channel` must work as a direct playlist visual mode.

It must not require:

- Scheduler
- Smart Grid
- grid preview mode
- mock feed mode
- editing source flags by hand
- placeholder-first behavior

---

## Problem

The current Map Channel path can still resolve to placeholder or mock feed behavior instead of showing real WOS.

That is not acceptable for the actual product task.

The desired behavior is simple:

```text
Set playlist Presentation Mode = Map Channel
Open Broadcast HUD
See WOS running as the full-bleed background/wallpaper
```

---

## Required Behavior

### 1. Add a single WOS URL source of truth

Create or update a small config module:

```text
src/data/mapRegionFeedConfig.ts
```

Required default:

```ts
export const DEFAULT_WOS_LOCAL_URL = "http://localhost:5500";
```

If WOS currently runs on another local port, use that instead.

The config should expose:

```ts
export type MapRegionFeedContext = "wallpaper" | "region";

export type MapRegionFeedSource =
  | "wos_iframe"
  | "mock"
  | "none";

export type MapRegionFeedConfig = {
  source: MapRegionFeedSource;
  wosUrl: string;
  allowMockFallback: boolean;
};
```

Default active config:

```ts
export const ACTIVE_MAP_REGION_FEED_CONFIG: MapRegionFeedConfig = {
  source: "wos_iframe",
  wosUrl: DEFAULT_WOS_LOCAL_URL,
  allowMockFallback: false,
};
```

Important: `wos_iframe` should be the committed default for Map Channel wallpaper.

---

### 2. Map Channel wallpaper must prefer real WOS iframe

In Broadcast HUD, when the current/hud playlist is `Map Channel`, render WOS as the full-bleed background visual.

Target file:

```text
src/ui/BroadcastHudShell.tsx
```

Expected logic:

```ts
const isMapChannel = hudPlaylist?.presentationMode === "map_channel";
```

When `isMapChannel` is true:

```tsx
<MapRegionFeed context="wallpaper" />
```

should render inside the background/atmosphere layer.

This must not depend on:

```text
schedule state
grid enabled state
Smart Grid preset
secondary overlay mode
```

---

### 3. MapRegionFeed must render iframe directly

Target file:

```text
src/ui/MapRegionFeed.tsx
```

Required behavior by context:

#### wallpaper context

```text
source = wos_iframe
→ render iframe using config.wosUrl
```

If iframe URL is missing:

```text
→ render clear fallback label
```

Do not silently show placeholder as if it were correct.

#### region context

Smart Grid region rendering may continue using region-safe behavior, but should not block wallpaper mode.

---

### 4. Fallback behavior

Fallbacks are allowed but must not become the main path.

Correct order for `wallpaper` context:

```text
1. Real WOS iframe
2. Clear WOS unavailable message
3. Optional mock only if allowMockFallback === true
```

Do not default to mock.

Do not default to placeholder.

Suggested unavailable message:

```text
WOS LOCAL SURFACE UNAVAILABLE
Expected: http://localhost:5500
Start WOS, then reload PLAY Broadcast HUD.
```

---

### 5. Iframe requirements

Iframe should be visual-only for this patch.

```tsx
<iframe
  className="map-region-feed__iframe"
  src={config.wosUrl}
  title="WOS Map Channel"
  loading="eager"
/>
```

Do not attempt to read iframe DOM.

Do not add cross-origin fetch logic.

Do not add postMessage yet.

Do not merge PLAY and WOS runtimes.

---

### 6. CSS requirements

Target file:

```text
src/styles.css
```

The WOS iframe must behave as a broadcast wallpaper.

Required visual behavior:

```text
position: absolute or full parent fill
width: 100%
height: 100%
border: 0
pointer-events: none
background: #000
```

The Broadcast HUD controls must remain visible above it:

```text
top row visible
bottom transport visible
current playlist/track line visible
```

The iframe should not capture mouse interaction inside the HUD.

---

## Non-Goals

Do not implement these in this patch:

- Scheduler autoplay
- Smart Grid dependency
- WOS command protocol
- postMessage
- shared package/monorepo conversion
- Mapbox token migration into PLAY
- WOS source merge
- project storage/export fix
- new mock visuals
- iframe DOM inspection

Those are separate patches.

---

## Implementation Targets

### Required files to inspect/change

```text
src/data/mapRegionFeedConfig.ts
src/ui/MapRegionFeed.tsx
src/ui/BroadcastHudShell.tsx
src/styles.css
```

### Optional files only if needed

```text
src/data/playlistTypes.ts
src/App.tsx
```

Only touch optional files if `presentationMode` detection is currently inconsistent or not typed.

---

## Acceptance Criteria

### A. Direct visual path

Given WOS is running locally at:

```text
http://localhost:5500
```

and PLAY is running from:

```text
/Users/studio/Projects/wall-of-sound/play/flow-curve-builder
```

when a playlist is set to:

```text
Presentation Mode = Map Channel
```

then Broadcast HUD shows the real WOS surface as the full-bleed wallpaper.

---

### B. No scheduler dependency

Map Channel wallpaper works even when:

```text
Scheduler is not open
Scheduler has no active block
Smart Grid is disabled
secondary overlay mode is none
```

---

### C. No placeholder success state

If WOS is not running, the HUD must show a clear unavailable state, not a generic placeholder that looks like intended output.

---

### D. HUD remains readable

When WOS is visible:

```text
top HUD row remains visible
bottom transport remains visible
track/playlist line remains visible
operator controls remain usable
```

---

### E. Build passes

Run:

```bash
cd /Users/studio/Projects/wall-of-sound/play/flow-curve-builder
npm run build
```

Expected:

```text
build passes
no TypeScript errors
no runtime crash
```

---

## Manual Test Checklist

1. Start WOS locally.

```bash
cd /Users/studio/Projects/wall-of-sound
# use the normal WOS local server command
```

Confirm WOS is visible at:

```text
http://localhost:5500
```

2. Start PLAY from new location.

```bash
cd /Users/studio/Projects/wall-of-sound/play/flow-curve-builder
npm run dev
```

3. Open PLAY.

4. Set or select a playlist with:

```text
Presentation Mode = Map Channel
```

5. Open Broadcast HUD.

6. Confirm real WOS appears as the background/wallpaper.

7. Stop WOS server.

8. Reload PLAY Broadcast HUD.

9. Confirm clear unavailable message appears.

10. Restart WOS.

11. Reload PLAY Broadcast HUD.

12. Confirm WOS returns.

---

## Expected Result

PLAY now treats WOS as the direct visual source for `Map Channel`.

The operator experience becomes:

```text
Run WOS
Run PLAY
Select Map Channel playlist
Open Broadcast HUD
See WOS
```

No mock-first detour.  
No scheduler detour.  
No Smart Grid detour.  
No code flag detour.

---

## Implementation Guide

- **Where:** Work from `/Users/studio/Projects/wall-of-sound/play/flow-curve-builder`, touching `src/data/mapRegionFeedConfig.ts`, `src/ui/MapRegionFeed.tsx`, `src/ui/BroadcastHudShell.tsx`, and `src/styles.css`.
- **What:** Make `Map Channel` render the real WOS iframe from a single configured local URL as the Broadcast HUD wallpaper.
- **Expect:** Playlist set to `Map Channel` shows WOS directly in Broadcast HUD, with fallback only when WOS is unavailable.
