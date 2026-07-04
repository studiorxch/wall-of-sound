# PLAY Patch 0620E — Now / Next Queue Panel
**Completion Report · 2026-06-21**

---

## Summary

Added the Now / Next / Up Next queue panel to Broadcast HUD Mode. The panel is a compact read-only right side rail that gives the operator instant awareness of what is playing, what comes next, and what is coming after that — including playback safety awareness (unplayable track skipping, empty slot skipping, end-of-playlist state).

---

## Deliverables

### New Files
- **`src/logic/nowNextQueue.ts`** — `buildNowNextQueueState()` pure function. Accepts playlist, tracksById, currentSlotIndex, playbackIssues, autoplayEnabled, maxUpNextItems. Returns `NowNextQueueState` with `now`, `next`, `upNext[]`, skip counts, and remaining playable count. Skips unplayable and empty slots from next/upNext by default.
- **`src/ui/NowNextQueuePanel.tsx`** — Compact panel component with `TrackRow` sub-component. Renders NOW / NEXT / UP NEXT sections with slot numbers, title, artist, duration, inline progress bar under NOW, autoplay-off indicator, skipped summary footer.

### Modified Files
- **`src/ui/BroadcastHudShell.tsx`** — Added `trackPlaybackIssues` prop, imported `NowNextQueuePanel` + `buildNowNextQueueState`, restructured middle zone from single `.hud-canvas-zone` to `.hud-body` flex row containing `.hud-canvas-zone` (curve) + `.hud-queue-rail` (panel). Removed redundant inline "Next up" display from transport strip.
- **`src/App.tsx`** — Added `trackPlaybackIssues={trackPlaybackIssues}` to `<BroadcastHudShell>`.
- **`src/styles.css`** — Added `.hud-body`, updated `.hud-canvas-zone` (two-column flex child), added `.hud-queue-rail` (220px fixed-width side rail with blur/dark bg), and full `.nnq-*` CSS block for panel layout.

---

## Queue Computation Logic

```
currentSlotIdx → NOW
slots after current:
  - skip empty → counted in skippedEmptyCount
  - skip unplayable (issue.status === "unplayable") → counted in skippedUnplayableCount
  - first playable → NEXT
  - next 3 playable → UP NEXT
```

Edge cases handled: no playlist, empty playlist, no current playback, all-empty slots, all-unplayable, end of playlist, autoplay off.

---

## Panel Layout (220px right rail)

```
┌──────────────────────────┐
│ NOW                       │  ← accent color
│ #08  Track Title          │
│      Artist               │
│ ████░░░░░░░░░  (progress) │
├──────────────────────────┤
│ NEXT                      │
│ #09  Next Track           │
│      Artist · 4:11        │
├──────────────────────────┤
│ UP NEXT                   │
│ #10  Track A · 3:58       │  ← dimmed
│ #11  Track B · 6:14       │
│ #12  Track C · 4:44       │
│                           │
│ 2 unplayable · 1 empty    │  ← skipped summary
│ skipped                   │
└──────────────────────────┘
```

---

## Verification

- `npx tsc --noEmit` — clean
- Browser: Broadcast HUD shows two-column layout (curve left, queue rail right)
- Queue rail renders "NOW / Not playing" and "NEXT / End of playlist" correctly for empty playlist
- Accent color applied to NOW label and section dividers
- "← Editor" button and transport strip unaffected
- No regressions in Flow-Curve editor or HUD mode

---

## Patch Status: ✅ COMPLETE
