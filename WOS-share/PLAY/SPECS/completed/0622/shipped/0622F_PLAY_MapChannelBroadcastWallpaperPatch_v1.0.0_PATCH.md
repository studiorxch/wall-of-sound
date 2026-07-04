# 0622F_PLAY_MapChannelBroadcastWallpaperPatch_v1.0.0_PATCH

## Project

PLAY — Playlist / Scheduler / Smart Grid / Broadcast HUD

## Patch Type

Hotfix / Product correction

## Status

Ready for implementation

## Purpose

Make `Map Channel` behave as a playlist-level broadcast wallpaper mode.

The current 0622E WOS projection path is too conditional for the immediate offline workflow because it requires Smart Grid map-region routing and, in some cases, scheduler-driven composition. That is useful later, but the basic operator expectation is simpler:

```text
Playlist Presentation Mode = Map Channel
↓
Broadcast HUD uses WOS/map as the main atmosphere surface
↓
No scheduler required
↓
No Smart Grid toggle required
```

## Product Correction

The scheduler should only decide **what is active, when**.

It should not own playlist visual identity, WOS projection, or grid layout decisions.

Correct separation:

```text
PLAYLIST  = audio + visual identity + presentation intent
SCHEDULER = timing authority only
SMART GRID = layout / composition authority
HUD = OBS-friendly output surface
```

## Core Rule

```text
Playlist defines the visual source.
Smart Grid handles layout.
Scheduler only handles time.
```

## Current Problem

At 0622E, WOS projection exists, but it is routed as a Smart Grid map-region source.

Current practical issue:

```text
Setting Playlist Identity → Presentation Mode → Map Channel

does not immediately show WOS/map as the Broadcast HUD surface.
```

This makes the feature feel broken because the operator expects `Map Channel` to behave like a broadcast wallpaper/background mode.

## Required Behavior

When the active HUD playlist has:

```text
broadcastIdentity.presentationMode = "map_channel"
```

Broadcast HUD should render the map/WOS feed as the main atmosphere surface.

This must work without:

- scheduler block activation
- Smart Grid toggle
- guide-preview region
- map-placeholder region visibility
- manual grid composition setup

## Offline Workflow Requirement

For current offline authoring, this should work directly:

1. Open Playlist Identity.
2. Set `Presentation Mode` to `Map Channel`.
3. Open Broadcast HUD.
4. See WOS/map source as the full broadcast wallpaper/atmosphere.
5. Bottom playback row remains visible.
6. Top operator row remains visible.

## Future Programming Requirement

This must still work later when scheduled programming is running.

Future precedence should be:

```text
1. Playing playlist visual mode, if music is currently playing.
2. Scheduled NOW playlist visual mode, if scheduler playback handoff is armed and active.
3. Editor-selected playlist visual mode, only when no playback/scheduled program is active.
4. Default background/cover fallback.
```

Do not implement full scheduler playback handoff in this patch.

This patch should simply structure the Broadcast HUD source selection so the above precedence can be supported later.

## Broadcast Atmosphere Source Model

Add or clarify a single resolver for the main Broadcast HUD atmosphere source.

Recommended source order:

```text
map_channel feed
background image
cover blur fallback
neutral fallback
```

Suggested type:

```ts
export type BroadcastAtmosphereSourceType =
  | "map_channel"
  | "background_image"
  | "cover_image"
  | "fallback";

export type BroadcastAtmosphereSource = {
  sourceType: BroadcastAtmosphereSourceType;
  src?: string;
  label?: string;
};
```

## Map Feed Behavior

Reuse the 0622E map feed contract.

- `source: "none"` should show the existing WOS/MAP placeholder or a safe map-channel placeholder.
- `source: "mock"` should show the deterministic mock map feed if selected locally.
- `source: "iframe"` should show the configured WOS iframe if selected locally and URL exists.
- unsupported sources should render fallback copy, not crash.

Committed default must remain safe:

```ts
source: "none"
```

## Important Distinction

`Map Channel` should be usable in two places:

### 1. As the main Broadcast HUD atmosphere surface

Used when a playlist wants WOS/map as its main visual world.

This is the 0622F requirement.

### 2. As a Smart Grid region content source

Used when the grid wants map content inside a specific region/PIP.

This was the 0621K–0622E path and should remain available.

These should not fight each other.

## Smart Grid Interaction

Smart Grid remains optional.

When Smart Grid is off:

```text
Map Channel still renders as the main HUD atmosphere.
```

When Smart Grid is on:

```text
Grid overlays may compose on top of or around the map atmosphere.
```

The grid must not be required to make Map Channel appear.

## Scheduler Interaction

The scheduler should not be required for this patch.

For future scheduled playback, when a scheduled block becomes active, it may supply the active playlist/program whose presentation mode is resolved by the same Broadcast atmosphere source resolver.

Do not build automatic scheduler playback start in this patch.

## Required Files / Likely Touch Points

Likely files:

```text
src/ui/BroadcastHudShell.tsx
src/ui/MapRegionFeed.tsx
src/ui/BroadcastGridLayer.tsx
src/config/mapRegionFeedConfig.ts
src/data/playlistTypes.ts
src/App.tsx
src/styles.css
```

Potential new helper:

```text
src/logic/broadcastAtmosphereResolver.ts
```

## Implementation Requirements

### 1. Resolve HUD Playlist Correctly

Use the current HUD/playing playlist context from 0622A.

Do not regress to editor selection as playback authority.

Preferred source:

```text
hudPlaylist / playing playlist context
```

Fallback only when nothing is playing:

```text
active editor playlist
```

### 2. Detect Map Channel Mode

Detect playlist presentation mode from existing playlist identity metadata.

Accept current enum/string values already used by the app.

Do not rename existing persisted values unless migration is included.

### 3. Render Map Feed in Atmosphere Zone

When playlist mode is Map Channel, render the map feed inside the main HUD atmosphere/background layer.

It should:

- fill the atmosphere surface
- be clipped to the HUD body
- keep `pointer-events: none`
- not create scrollbars
- not cover the bottom playback row
- not cover the top operator row

### 4. Preserve Existing Image Backgrounds

For non-map playlists, existing background/cover behavior must remain unchanged.

### 5. Preserve Smart Grid Region Feed

Do not remove the 0622E region source path.

The same `MapRegionFeed` renderer may be reused, but it must support both:

```text
main atmosphere usage
Smart Grid region usage
```

### 6. Keep Safe Defaults

Do not commit an active iframe URL or live WOS source as default.

Default remains:

```text
source: none
```

## Acceptance Criteria

1. Set a playlist's Presentation Mode to `Map Channel`.
2. Open Broadcast HUD.
3. Map/WOS placeholder or configured feed appears as the main atmosphere surface.
4. No scheduler block is required.
5. Smart Grid does not need to be toggled on.
6. Bottom playback row stays visible.
7. Top operator row stays visible.
8. For a non-map playlist, normal background/cover behavior remains unchanged.
9. If local feed source is `iframe` with a valid WOS URL, the iframe appears full-bleed in the HUD atmosphere.
10. If local feed source is `none`, safe map-channel placeholder appears without network calls.
11. TypeScript build passes.
12. No console errors.
13. Playback remains decoupled from editor selection.
14. Scheduler remains timing-only and is not required for Map Channel display.

## Regression Tests

### Test A — Offline Map Channel Wallpaper

```text
1. Select playlist.
2. Open Playlist Identity.
3. Set Presentation Mode = Map Channel.
4. Open Broadcast HUD.
5. Confirm map placeholder/feed appears as main wallpaper.
6. Confirm Smart Grid is off.
7. Confirm bottom row remains readable.
```

### Test B — Normal Background Playlist

```text
1. Select playlist with Presentation Mode != Map Channel.
2. Open Broadcast HUD.
3. Confirm existing background/cover image behavior remains unchanged.
```

### Test C — Local Iframe Source

```text
1. Start local WOS server.
2. Locally set map feed config source = iframe.
3. Set iframe URL to local WOS URL.
4. Set playlist Presentation Mode = Map Channel.
5. Open Broadcast HUD.
6. Confirm WOS appears in the main atmosphere surface.
7. Revert config to source = none before commit.
```

### Test D — Smart Grid Overlay Compatibility

```text
1. Keep playlist in Map Channel mode.
2. Open Broadcast HUD.
3. Toggle Smart Grid on.
4. Confirm grid overlays do not prevent main map atmosphere from appearing.
5. Confirm grid can still show schedule/card regions if active.
```

## Non-Goals

Do not implement:

- scheduler playback handoff
- scheduler-controlled visual mode ownership
- Mapbox token handling inside PLAY
- live WOS API integration
- map controls
- permanent Smart Grid requirement
- committed live iframe URL
- new queue rail
- default FlowCurveCanvas in HUD

## Risks

### Risk: Confusion between playlist visual mode and grid layout mode

Mitigation:

```text
Playlist chooses visual source.
Smart Grid chooses layout.
Scheduler chooses time.
```

### Risk: iframe could cover HUD controls

Mitigation:

Render only inside the atmosphere surface under the existing HUD rows and keep overflow clipped.

### Risk: future scheduler conflicts

Mitigation:

Do not bind this to scheduler yet. Use the same HUD playlist resolver that can later accept scheduled/playing context.

## Completion Report Requirements

The completion report should include:

- whether Map Channel works without scheduler
- whether it works without Smart Grid
- feed source tested: `none`, `mock`, and/or local `iframe`
- whether config was reverted to `none`
- confirmation that normal background playlists still render correctly
- confirmation that playback decoupling from 0622A remains intact
- confirmation that scheduler remains timing-only
- TypeScript status
- console status

## Implementation Guide

- **Where:** Start in `BroadcastHudShell.tsx` and the HUD atmosphere/background render path. Reuse `MapRegionFeed.tsx` and `mapRegionFeedConfig.ts`; add a resolver helper only if it keeps the logic small.
- **What:** Make playlist `Presentation Mode = Map Channel` select the map feed as the main Broadcast HUD atmosphere source, independent of scheduler and Smart Grid state.
- **Expect:** Map Channel behaves like a playlist broadcast wallpaper mode: opening Broadcast HUD is enough to see WOS/map placeholder or local feed behind the playback/program rows.
