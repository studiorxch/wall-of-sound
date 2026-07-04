# PLAY Patch 0621J — Schedule Preview Region Content
**Completion Report · 2026-06-21 · Foundation**

---

## Summary

The Smart Grid's `schedule_preview` region now renders compact, live Now / Next / Later content using the shared 0621I clock. The grid stays off by default and `⊞`-gated; preview content appears only when the active composition produces a `schedule_preview` region. No second timer, no new HUD clutter.

```
Scheduler decides what is coming · Smart Grid decides where · HUD is the surface
```

---

## Files Changed

### `src/logic/scheduleResolver.ts`
- Added `formatScheduleTime(iso)` — `h:mm AM/PM`, `--:--` on invalid input.
- Added `SchedulePreviewItem` type and `buildSchedulePreviewItems(resolved, laterLimit = 1)` — builds NOW / NEXT / LATER items with the spec's fallbacks:
  - no blocks → `NO SCHEDULE · Add blocks in Scheduler`
  - now + next → NOW (+ end time) and NEXT
  - now, no next → NOW + `NEXT · No upcoming block`
  - no now, future exists → `STANDBY · <next title>`
  - appends up to `laterLimit` LATER items.

### `src/ui/BroadcastGridLayer.tsx`
- Added optional `resolvedSchedule?: ResolvedSchedule` prop.
- Builds preview items via `buildSchedulePreviewItems(resolvedSchedule, 1)`.
- For each `schedule_preview` region, renders a positioned **HTML overlay** (left/top/width from region coords) with NOW/NEXT/LATER labels, titles (truncated), and times. `pointer-events: none`.
- Suppresses the 0621H technical SVG label for `schedule_preview` regions (the HTML content supplies its own labels) to avoid a label collision.

### `src/ui/BroadcastHudShell.tsx`
- Threaded optional `resolvedSchedule?: ResolvedSchedule` → `BroadcastGridLayer`.

### `src/App.tsx`
- Passed the already-computed `resolvedSchedule` (from the 0621I shared clock) into `BroadcastHudShell`.

### `src/styles.css`
- `.bgl-preview*` — small mono glass text, NOW green / NEXT·STANDBY accent labels, truncated titles, no panels/scrollbars.

---

## Live Updating

The preview uses the App-level `resolvedSchedule`, which derives from the single 0621I `scheduleNow` clock. **No timer was added to `BroadcastGridLayer`** — it re-renders on the shared 30s tick like every other schedule-aware surface.

```
scheduleNow (0621I, 30s) → resolvedSchedule → BroadcastGridLayer preview
```

---

## Tests Performed (browser, port 5173)

### Test 2 — Now / Next / Later (criteria 3, 4)
Seeded an active block `displayMode: grid` + `role: event` (→ `guide_preview` preset → `schedule_preview` region) with two future blocks. Grid on:
```
NOW   A Playlist for Nappers   9:51 AM – 11:11 AM
NEXT  Robot Blips & Quips       11:11 AM
LATER Night Signal              1:11 PM
```
- ✅ Matches the spec's content hierarchy; screenshot confirms top-right placement, atmosphere dominant, bottom row clear, no scrollbars, no label collision.

### Test 1 — Empty schedule (criteria 6, 7)
Cleared schedule, grid on → `full_scene`, **no** `schedule_preview` region, **0** preview overlays, no crash, no error boundary.

### Test 3 — Live rollover (criterion 5)
By construction: the preview consumes the App `resolvedSchedule` driven by the 0621I clock — verified in 0621I that the shared tick advances Now/Next without interaction; the preview updates on the same render. No second timer.

### Test 4 — Secondary card independence (criterion 8)
`upcoming_buffet` secondary card + grid preview both present simultaneously (`bothCoexist: true`), independent state; secondary pin/auto-dismiss unaffected.

### Preserved
- ✅ Grid off by default, `⊞`-gated (criteria 1, 2).
- ✅ HUD stage clearance from 0621D intact (criterion 9).
- ✅ Source-group isolation (0621E) untouched (criterion 10) — no logic in those paths changed.
- ✅ `resolveSchedule` / `resolveSmartGridComposition` defensiveness unchanged.

### Build / console
- ✅ `npx tsc --noEmit` clean (criterion 11).
- ✅ No console errors (criterion 12).

**Acceptance criteria 1–12: all met.**

---

## Notes / Deferred

- `schedule_preview` regions are produced by the `guide_preview` preset (active block `displayMode: grid` + `role: event`). Other presets don't request a preview region, so content appears only when the composition asks for it — consistent with the product rule.
- `laterLimit` is 1 (NOW/NEXT + one LATER) to keep the region compact; trivially raised later.
- No WOS/map feed, drag-resize, recurrence, or track lists — deferred per non-goals.

---

## Patch Status: ✅ COMPLETE
