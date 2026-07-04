# PLAY Patch 0621B — Broadcast Secondary Timing + Playlist Event
**Completion Report · 2026-06-21**

---

## Summary

Added timed auto-dismiss, pin state, rundown line, and updated content to the BroadcastSecondaryLayer. The Broadcast HUD now breathes: it idles as atmosphere, interrupts itself briefly with a compact now/playlist/next/upcoming card, then returns to mood.

---

## Broadcast HUD Rhythm (after patch)

```
Atmosphere (idle)
↓ operator cycles or event triggers
Compact card appears with rundown line
↓ timer expires (7–16s, mode-dependent)
Return to atmosphere
```

---

## Changes

### `src/ui/BroadcastSecondaryLayer.tsx`

**New exports:**
```ts
export type BroadcastSecondaryTimingConfig = Record<Exclude<BroadcastSecondaryMode, "none">, number>

export const DEFAULT_SECONDARY_TIMING_MS: BroadcastSecondaryTimingConfig = {
  now_playing:        7000,
  playlist_identity: 10000,
  next_up:            8000,
  upcoming_buffet:   16000,
}

export type BroadcastUpcomingItem = {
  itemId: string; title: string; durationSeconds?: number;
  startsInSeconds?: number; moodLabel?: string; type: "track" | "playlist" | "event";
}
```

**Removed:** `grid_preview` from `BroadcastSecondaryMode` (grid is controlled independently via BroadcastGridLayer toggle)

**New `modeKey` prop:** changes on every mode activation, used to key/restart CSS rundown animation.

**New `timerDurationMs` prop:** passed to `RundownLine` to set `animation-duration`.

**New `allPlaylists` prop:** used by `upcoming_buffet` to derive items from other project playlists.

**`now_playing` card updates:**
- Added playlist title line (`.bsl-np-playlist`) — spaced uppercase, low contrast
- Rundown line at bottom of card

**`playlist_identity` card updates:**
- Mood line: uses `mood.tags.join(" · ")` OR `description` as fallback
- Rundown line at bottom of card

**`next_up` card:**
- Returns `null` if `queue.next` is absent (graceful no-op, not an error state)
- Rundown line at bottom of card

**`upcoming_buffet` card:**
- Derives `BroadcastUpcomingItem[]` from `allPlaylists`, excluding active playlist, max 3
- Shows item index, title, mood label if available
- Rundown line at bottom of card

**`RundownLine` component:**
- 1px line, depletes left-to-right via `bsl-rundown-deplete` CSS keyframe animation
- `animation-duration` set to `timerDurationMs`
- Keyed by `modeKey` so the animation restarts on every new mode activation

### `src/ui/BroadcastHudShell.tsx`

- Added `allPlaylists: PlaylistRecord[]` prop
- Added `modeKeyRef` / `modeKey` state — increments on every `activateMode()` call
- Added `pinned` state (default `false`)
- Added pin button `◫` in header-right (between cycle button and grid toggle)
  - Glows accent when active
  - Title: "Pin secondary layer (prevent auto-dismiss)" / "Unpin secondary layer"
- Added `useEffect` for timed auto-dismiss:
  ```ts
  useEffect(() => {
    if (secondaryMode === "none" || pinned) return;
    const ms = DEFAULT_SECONDARY_TIMING_MS[secondaryMode];
    const id = window.setTimeout(() => setSecondaryMode("none"), ms);
    return () => window.clearTimeout(id);
  }, [secondaryMode, pinned]);
  ```
- `cycleSecondaryMode` now calls `activateMode()` which updates both mode and modeKey atomically
- `next_up` skip: if `queue.next` is null, cycles past `next_up` to next valid mode
- Passes `allPlaylists`, `modeKey`, `timerDurationMs` to BroadcastSecondaryLayer

### `src/App.tsx`

- Added `allPlaylists={playlists}` to `<BroadcastHudShell>` call

### `src/styles.css`

New rules:
- `.bsl-rundown` — 1px container bar, rgba(255,255,255,0.08)
- `.bsl-rundown-fill` — depleting fill, `animation: bsl-rundown-deplete linear forwards`
- `@keyframes bsl-rundown-deplete` — `width: 100% → 0%`
- `.bsl-np-playlist` — playlist title in now_playing card, 9px spaced uppercase, 22% white

---

## Mode Timing

| Mode | Duration | Auto-dismiss |
|------|---------|--------------|
| `none` | indefinite | never |
| `now_playing` | 7s | → `none` |
| `playlist_identity` | 10s | → `none` |
| `next_up` | 8s | → `none` |
| `upcoming_buffet` | 16s | → `none` |

Pin (`◫`) prevents auto-dismiss for any mode. Unpin resumes timed behavior.

---

## Verification

- `npx tsc --noEmit` — clean
- Broadcast HUD default: atmosphere only, no secondary card
- `now_playing`: bottom-left card — NOW PLAYING, title, elapsed/duration, playlist title, rundown line
- `playlist_identity`: centered card — PLAYLIST, title, mood/description, track count · duration, rundown line
- `next_up`: returns null gracefully when no tracks queued (mode skipped in cycle)
- `upcoming_buffet`: bottom-right panel — COMING UP, other playlists from project, max 3
- Auto-dismiss: 7s after `now_playing` activates (unpinned), HUD returns to atmosphere — confirmed
- Pin: mode persists indefinitely when `◫` is active
- Grid toggle: independent, unaffected by secondary mode changes
- Flow-Curve Editor: no regression

---

## Patch Status: ✅ COMPLETE
