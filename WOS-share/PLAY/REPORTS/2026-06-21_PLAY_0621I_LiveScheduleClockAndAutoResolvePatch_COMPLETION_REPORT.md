# PLAY Patch 0621I — Live Schedule Clock & Auto-Resolve
**Completion Report · 2026-06-21 · Foundation / Hotfix**

---

## Summary

Replaced the static render-time clock with a single shared `scheduleNow` state in `App` that ticks every 30 seconds. All schedule-aware surfaces — Scheduler guide, Broadcast HUD `upcoming_buffet`, and Smart Grid composition — already derived from one `renderNowIso` value, so pointing that value at the ticking clock makes the entire system advance on its own with no operator interaction.

```
scheduleNow (ticks 30s) → renderNowIso → resolveSchedule → { resolvedSchedule → buffet later, SchedulerGuideView }
                                                          → resolveSmartGridComposition → grid
```

---

## Files Changed

### `src/App.tsx` (only file changed)
- Added constant `SCHEDULE_CLOCK_TICK_MS = 30_000`.
- Added shared clock state: `const [scheduleNow, setScheduleNow] = useState<Date>(() => new Date())`.
- Added a tick effect with cleanup:
  ```ts
  useEffect(() => {
    const id = window.setInterval(() => setScheduleNow(new Date()), SCHEDULE_CLOCK_TICK_MS);
    return () => window.clearInterval(id);
  }, []);
  ```
- Changed `renderNowIso` from `nowIso()` (fresh per-render) to `scheduleNow.toISOString()` (shared, ticking).

No other files required changes: `resolveSchedule`, `resolveSmartGridComposition`, `SchedulerGuideView`, `BroadcastHudShell`, and `BroadcastSecondaryLayer` all already consume the App-resolved `renderNowIso` / `resolvedSchedule` / `gridComposition`, so the tick propagates to every surface automatically.

---

## Tick Interval

**30 seconds** (`SCHEDULE_CLOCK_TICK_MS = 30_000`) — responsive to block boundaries without noisy render churn, per spec recommendation. Interval is created once on mount and cleared on unmount.

---

## How `scheduleNow` Is Shared

`App` owns the single `scheduleNow` Date. Every schedule-aware computation flows from it:
- `renderNowIso = scheduleNow.toISOString()`
- `resolvedSchedule = resolveSchedule({ schedule, nowIso: renderNowIso })`
- `scheduledLater = resolvedSchedule.later` → HUD `upcoming_buffet`
- `gridComposition = resolveSmartGridComposition({ resolvedSchedule })` → `BroadcastGridLayer`
- `nowIso={renderNowIso}` → `SchedulerGuideView` (clock + internal resolve)

No component calls `new Date()` for its own schedule state.

---

## Verification (browser, port 5173)

### Scheduler auto-advance (criteria 1, 2)
Seeded two blocks: "Block Alpha" spanning now but ending ~6s after load, "Block Beta" starting immediately after.
- At load: NOW card = **Block Alpha**.
- After the first 30s tick, with **no interaction**: NOW card = **Block Beta**, clock display re-rendered (09:49 AM).
- ✅ Now/Next advanced automatically across the block boundary.

### HUD buffet + Smart Grid re-resolve (criteria 3, 4)
Both `scheduledLater` (buffet) and `gridComposition` (grid) are computed from the same `resolvedSchedule` that drove the verified scheduler transition — they re-resolve on the identical tick. Smart Grid preset/region behavior (0621H: `full_scene` default, `map_channel` placeholder, `bumper_card`) is unchanged in logic and now re-evaluates per tick.

### Persistence (criterion 7)
- After reload: schedule persisted (2 blocks), resolver returned correct NOW, live clock resumed ticking.

### Preserved
- ✅ Grid remains off by default and `⊞`-gated (criterion 5).
- ✅ Broadcast HUD stage clearance from 0621D intact (criterion 6).
- ✅ Source-group isolation (0621E) and warning-message hardening (0621F) untouched (criteria 8, 9) — no logic in those paths changed.
- ✅ `resolveSchedule` / `resolveSmartGridComposition` defensiveness unchanged.

### Build / console
- ✅ `npx tsc --noEmit` clean (criterion 10).
- ✅ No console errors during editor / scheduler / HUD use (criterion 11).

**Acceptance criteria 1–11: all met.**

---

## Notes / Deferred

- The visible guide clock shows `HH:MM`; with a 30s tick it updates within ≤30s of a minute boundary. A 60s tick would also satisfy the spec but be slightly less responsive at boundaries — 30s chosen per recommendation.
- No recurrence, multi-day, drag-resize, WOS feed, or PIP content — all deferred per non-goals.

---

## Patch Status: ✅ COMPLETE
