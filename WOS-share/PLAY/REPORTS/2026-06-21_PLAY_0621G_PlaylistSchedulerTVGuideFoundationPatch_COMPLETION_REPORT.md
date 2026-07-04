# PLAY Patch 0621G — Playlist Scheduler / TV Guide Foundation
**Completion Report · 2026-06-21 · Foundation**

---

## Summary

Added PLAY's first scheduler layer: schedule data types, a now/next/later resolver, a TV-guide-style view, a third "Scheduler" workspace mode, storage migration/persistence, and a low-risk feed of scheduled blocks into the Broadcast HUD's `upcoming_buffet`. Broadcast HUD layout and source-group isolation are unchanged.

```
Playlist Builder → Scheduler / TV Guide → (future) Smart Grid
```

---

## Files Changed

### NEW: `src/data/scheduleTypes.ts`
- `ScheduleBlockRole`, `ScheduleDisplayMode`, `ScheduleBlock`, `ScheduleState`, `ResolvedSchedule` (per spec).
- Label maps + ordered constant arrays for dropdowns (`SCHEDULE_BLOCK_ROLES`, `SCHEDULE_DISPLAY_MODES`, `ROLE_LABELS`, `DISPLAY_MODE_LABELS`).

### NEW: `src/logic/scheduleResolver.ts`
- `isValidScheduleBlock` — defensive guard (valid ISO start/end, end after start).
- `sortScheduleBlocks` — filters invalid, sorts by start.
- `blocksOverlap` / `findOverlappingBlockIds` — conflict detection.
- `resolveSchedule({schedule, nowIso?})` → `{ now, next, later }`. `now` = block spanning current time; `next` = first block starting after now; `later` = next 5 after that. Expired blocks never appear as next.
- `createScheduleBlockFromPlaylist(...)` — duration = target → computed slot seconds → 60 min fallback; computes `endTimeIso`.

### NEW: `src/ui/SchedulerGuideView.tsx`
- TV-guide view: title, current date/time, Now/Next cards, add-block controls (playlist select, datetime-local start, role, display mode, Add), and a guide table (Time / Dur / Playlist / Role / Display Mode / actions).
- NOW/NEXT pills, conflict rows marked with "Schedule overlap", per-block move ±30m and remove.

### `src/data/playProjectTypes.ts`
- Added optional `schedule?: ScheduleState` to `PlayProject`.

### `src/data/playProjectStorage.ts`
- `repairStoredProject` backfills a default empty schedule (`PLAY Schedule`, `blocks: []`) when missing, and drops malformed blocks via `isValidScheduleBlock` (warns with count). Runs alongside the existing 0621C/0621E/0621F repairs.
- Added `makeDefaultSchedule()`.

### `src/App.tsx`
- `schedule` state + `scheduleRef`; ref sync effect; `applyProject` hydrates schedule; `makeProj` persists `schedule: scheduleRef.current`.
- Handlers: `handleAddScheduleBlock`, `handleRemoveScheduleBlock`, `handleMoveScheduleBlock` (via `commitSchedule`, which updates the ref synchronously so autosave persists immediately).
- Computes `renderNowIso` + `scheduledLater = resolveSchedule(...).later`; renders `SchedulerGuideView` when `workspaceMode === "scheduler"`; passes `scheduleLater` to the HUD.

### `src/ui/TopBar.tsx`
- `WorkspaceMode` extended to `"flow_curve" | "scheduler" | "broadcast_hud"`; added the "Scheduler" mode button (Flow-Curve | Scheduler | Broadcast HUD).

### `src/ui/BroadcastHudShell.tsx` + `src/ui/BroadcastSecondaryLayer.tsx`
- Threaded optional `scheduleLater?: ScheduleBlock[]` to the secondary layer.
- `upcoming_buffet` now **prefers scheduled future blocks** (title + start time) and falls back to other-playlist guesses only when no schedule exists. Visual behavior unchanged.

### `src/styles.css`
- `.sched-*` block (cards, controls, guide table, conflict/now/next styling).

---

## Verification (browser, port 5173)

Seeded a project with 2 playlists and 4 schedule blocks (one spanning now, one next, two later that overlap):

- ✅ **Migration / nav:** three-mode nav renders (`Flow-Curve | Scheduler | Broadcast HUD`); scheduler view mounts.
- ✅ **Resolver:** NOW = Code & Caffeine (08:40–10:40), NEXT = Static Horizon (10:40, 1h 30m); later rows show NOW/NEXT pills correctly.
- ✅ **Overlap safety:** the two overlapping later blocks both render and are marked "Schedule overlap" (red) — no crash.
- ✅ **Add + persistence:** "+ Add to Schedule" grew blocks 4 → 5; after reload, 5 blocks persisted with computed `endTimeIso` + `durationMinutes`.
- ✅ **Upcoming buffet:** in Broadcast HUD, `upcoming_buffet` showed scheduled blocks ("Station ID" 12:10 PM, "Overlap Block" 12:15 PM) — scheduled data preferred over playlist fallback.
- ✅ **HUD unchanged:** single top row, atmosphere surface, operator controls, bottom row "Not playing / Code & Caffeine" — 0621D stage clearance intact.
- ✅ Empty-project path: with no saved schedule, state inits to `makeDefaultSchedule()` (empty) — Scheduler shows empty state.
- ✅ `npx tsc --noEmit` clean; no console errors.

**Acceptance criteria 1–11: all met.**

---

## Preserved (confirmed)

- 0621C hydration guard, 0621E source-group migration, 0621F warning-message repair all still run in `repairStoredProject` alongside the new schedule repair.
- Broadcast HUD visuals (0621A/B/D), source-group eligibility (0621E), playlist regeneration, and warning scoring — unchanged.
- Dead HUD CSS left in place (out of scope).

---

## Smart Grid Readiness

`ScheduleBlock` carries `role` + `displayMode`, and `resolveSchedule` exposes `now`/`next`/`later`. A future Smart Grid patch can read active block, next block, display mode, and role directly — no further data work needed.

---

## Known Risks / Notes

- **Static clock:** the view's "now" reference and Now/Next resolution are computed at render time (no live ticking timer). Adequate for a foundation patch; a future enhancement could add a 30–60s interval to re-resolve without interaction.
- **Timezone:** uses local browser time (per spec). `ScheduleState.timezone` exists but is not yet applied.
- **No recurrence / multi-day / drag-resize** — intentionally deferred per scope.

---

## Next Recommended Patch

`0621H` — Smart Grid foundation: read the active/next schedule block + `displayMode` to drive a basic multi-cell broadcast composition over the existing `BroadcastGridLayer`.

---

## Patch Status: ✅ COMPLETE
