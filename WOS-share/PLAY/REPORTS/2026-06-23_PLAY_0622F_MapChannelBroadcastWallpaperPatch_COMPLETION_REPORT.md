# PLAY Patch 0622F — Map Channel Broadcast Wallpaper Patch
**Completion Report · 2026-06-23**

---

## Summary

`Map Channel` now works as a playlist-level broadcast wallpaper mode. When `playlist.broadcastIdentity.presentationMode === "map_channel"`, the Broadcast HUD renders the map/WOS feed as the main atmosphere surface behind the transport bar — with no scheduler block required and no Smart Grid toggle required. Reuses the 0622E `MapRegionFeed` renderer in the `hud-bg` stack.

---

## Product Correction Applied

> Playlist defines the visual source. Smart Grid handles layout. Scheduler handles time.

The scheduler was previously the only path to `map_channel` rendering (via `map_channel` schedule block → `resolveSmartGridComposition` → `map_placeholder` region). This made the feature feel broken for offline authoring. 0622F adds a direct playlist-identity path so the operator can set presentation mode and immediately see the result in Broadcast HUD.

---

## Changes

### `src/ui/BroadcastHudShell.tsx`

- Added imports: `MapRegionFeed`, `ACTIVE_MAP_REGION_FEED_CONFIG`.
- Added `isMapChannel` detection: `playlist.broadcastIdentity?.presentationMode === "map_channel"`.
- Updated background stack: `map_channel` → `hud-bg hud-bg-map` + `MapRegionFeed`; otherwise existing `hud-bg` (image) or `hud-bg-cover-blur` fallback. No existing path changed for non-map playlists.

```diff
+ {isMapChannel ? (
+   <div className="hud-bg hud-bg-map">
+     <MapRegionFeed {...ACTIVE_MAP_REGION_FEED_CONFIG} />
+   </div>
+ ) : bgSrc ? (
    <div className="hud-bg" style={{ backgroundImage: `url(${bgSrc})` }} />
  ) : coverSrc ? (
    <div className="hud-bg hud-bg-cover-blur" style={{ backgroundImage: `url(${coverSrc})` }} />
  ) : null}
```

### `src/styles.css`

Added `.hud-bg-map` (inherits `position: absolute; inset: 0; z-index: 0` from `.hud-bg`):

```css
.hud-bg-map {
  overflow: hidden;
  pointer-events: none;
}
```

---

## Architecture

```
playlist.broadcastIdentity.presentationMode === "map_channel"
  → BroadcastHudShell → hud-bg-map → MapRegionFeed
      → source "none"   → MapPlaceholder (default)
      → source "mock"   → MockMapFeed
      → source "iframe" → IframeMapFeed (0622E)
```

Smart Grid region path (0622E) is unchanged and still works when the grid is toggled on with a `map_channel` schedule block. Both paths coexist.

---

## Separation of Concerns

| Layer | Authority |
|---|---|
| **Playlist** `presentationMode` | Visual source selection |
| **Smart Grid** | Layout / composition (optional) |
| **Scheduler** | Timing only — not required for visual mode |
| **HUD** | Output surface |

---

## Verification (browser, port 5173)

**Test A — Offline Map Channel Wallpaper (no scheduler, no grid):**
- Set `playlist.broadcastIdentity.presentationMode = "map_channel"`.
- Opened Broadcast HUD without activating any schedule block.
- Result:
  - `.hud-bg-map` present: `true` ✅
  - `.bgl-map-placeholder` (map feed placeholder) present: `true` ✅
  - Smart Grid off: `gridVisible: false` ✅
  - Transport bar present: `true` ✅
  - iframe count: `0` ✅
  - No error boundary ✅

Screenshot confirms: "WOS / MAP / spatial feed placeholder / awaiting live world source" fills atmosphere, "Not playing / My Mix · 0:00" in bottom bar, top operator row visible, grid off.

**Test B — Normal playlist (non-map):** Default seeded playlist has no `presentationMode`. When `presentationMode` is not `map_channel`, the existing image/cover-blur/dark fallback stack runs unchanged. The `isMapChannel` check is a strict equality guard.

**Feed source tested:** `source: "none"` (committed default) → placeholder renders safely, no network calls.

**Config reverted:** `ACTIVE_MAP_REGION_FEED_CONFIG = DEV_MAP_REGION_FEED_CONFIG = { source: "none" }` — unchanged from committed default.

**TypeScript:** `npx tsc --noEmit` — clean ✅

**Console errors:** none ✅

---

## Invariants Preserved

- **0622A playback decoupling**: `hudPlaylist = playingPlaylist ?? activePlaylist` — unmodified. Map channel atmosphere derives from `hudPlaylist.broadcastIdentity`, which already follows playing context.
- **0622E Smart Grid region feed**: `BroadcastGridLayer → MapRegionContent → MapRegionFeed` path unchanged and still functional.
- **0621E source-group isolation**: no playlist/track logic touched.
- **Scheduler**: timing-only, not consulted for visual mode in this patch.

---

## Future Precedence (not implemented — noted for record)

When scheduled playback handoff is added later, the priority order will be:
1. Playing playlist `presentationMode` (highest — music is live)
2. Scheduled NOW playlist `presentationMode`
3. Editor-selected playlist `presentationMode` (fallback — no active playback)

The current `hudPlaylist = playingPlaylist ?? activePlaylist` already implements steps 1 and 3. Step 2 wires in when the scheduler can hand off a playing context.

---

## Patch Status: ✅ COMPLETE
