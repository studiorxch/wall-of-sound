# PLAY Patch 0621L — WOS/Map Region Feed Spike
**Completion Report · 2026-06-21 · Spike / Guarded Integration**

---

## Summary

Added a flag-gated **mock** map/world feed that mounts inside the existing Smart Grid `map_placeholder` region. No Mapbox, no WOS network, no controls, no pointer interaction. The static "WOS / MAP" placeholder remains the default and the safe fallback. Proves a grid region can host map-like content, clipped to the region, without disturbing the HUD.

```
MAP FEED = one possible content source inside a grid region — not a new HUD layer
```

---

## Files Changed

### NEW: `src/ui/MapRegionFeed.tsx`
- `ENABLE_MAP_REGION_FEED` constant — **default `false`** (local flag, no settings system).
- `MapRegionFeedMode` type (`placeholder | mock | wos_embed`) for future use.
- Mock SVG renderer: base grid, borough-like polygons, route polylines, coordinate crosshair marks, one slow drifting scanline, and a `WOS / MAP FEED SPIKE` label.
- Deterministic geometry (no `Math.random`), `pointer-events: none`, `prefers-reduced-motion` disables the scanline. No external network resources.

### `src/ui/BroadcastGridLayer.tsx`
- Added `MapRegionContent()` wrapper: when `ENABLE_MAP_REGION_FEED` is on, renders `<MapRegionFeed />` inside a `try/catch` (DEV `console.warn` on error); otherwise — and on any error — renders the existing static placeholder.
- `map_placeholder` router branch now returns `<MapRegionContent />` (was inline placeholder JSX).
- Overlay loop: when the region is a map feed, the container gets the full region height + `bgl-region-overlay-feed` (no padding/max-width, `overflow: hidden`) so the feed fills and clips to the region. Text regions are unchanged.

### `src/styles.css`
- `.bgl-region-overlay-feed` (full-region, clipped), `.mrf-*` mock-map visuals, `mrf-scan-drift` keyframe, reduced-motion guard.

No persisted data added. No 0621H/0621K region type renames.

---

## Region Routing Behavior (map branch)

```
region.regionType === "map_placeholder":
  ENABLE_MAP_REGION_FEED && feed renders ok → <MapRegionFeed/>   (mock, clipped, pointer-events:none)
  otherwise / on error                      → static WOS/MAP placeholder
```

---

## Scenarios Verified (browser, port 5173)

### Flag OFF (default)
- ✅ Grid on, `map_channel` block active → **static placeholder** shown (`WOS / MAP · spatial feed placeholder · awaiting live world source`); **no** `.mrf-root`. Matches 0621K exactly (criterion 4).

### Flag ON (temporarily, then reverted)
- ✅ `MapRegionFeed` mounts inside the `map_placeholder` region (criterion 5).
- ✅ `pointer-events: none` (criterion 7), container `overflow: hidden` — feed clipped to region.
- ✅ Screenshot: mock map (polygons, routes, coordinate marks, "WOS / MAP FEED SPIKE" label) fills the reserved upper region; the bottom band + transport row ("Not playing / City Drift") stay clear and readable — does not cover the whole HUD (criterion 6).
- ✅ No map controls (criterion 8), no scrollbars, no network (criterion 9).

### Flag reverted to default
- ✅ Reload → placeholder returns, no feed. `ENABLE_MAP_REGION_FEED = false` confirmed in source.

### Regression / preservation
- ✅ Grid off by default + `⊞`-gated; grid off → no feed (criteria 2, 3).
- ✅ `schedule_preview` and `bumper_card` routing unchanged (0621J/0621K) (criteria 10, 11).
- ✅ Live clock (0621I), persistence (0621C), source-group isolation (0621E) untouched (criteria 12–14).
- ✅ `npx tsc --noEmit` clean (criterion 1); no console errors (criterion 15).

**Acceptance criteria 1–15: all met.**

---

## Live WOS — Not Integrated (by design)

No Mapbox instantiation, no token, no WOS fetch/iframe, no map/camera controls. The feed is a self-contained deterministic SVG mock, clearly labeled "FEED SPIKE." Failure safety: the feed renders behind a `try/catch` that falls back to the placeholder, and the whole thing is gated by a default-off flag.

---

## Note on the `coversWholeHud` Probe

An automated measurement (`region height ≥ 95% of window height`) flagged true during one check — a viewport-sizing artifact (the preview window had resized; the `map_channel` region is the upper ~75% of the HUD body by 0621H design). The screenshot confirms the feed is clipped to the region with the bottom HUD band and transport row clearly visible. No code change needed; the region span is intentional and pre-existing.

---

## Follow-up Recommendations

A future patch could replace the mock with a real source behind the same flag/region contract: iframe-style WOS preview, a shared-runtime renderer, a Mapbox mini-view, a static route snapshot, or an OBS/browser-source route preview. The region host, clipping, fallback, and flag are now in place — only the inner renderer would change.

---

## Patch Status: ✅ COMPLETE (flag default OFF)
