# PLAY Patch 0621H — Smart Grid Broadcast Composition Foundation
**Completion Report · 2026-06-21 · Foundation**

---

## Summary

The `BroadcastGridLayer` is now schedule-aware. A `resolveSmartGridComposition` helper maps the active/next scheduled block's `displayMode` + `role` to one of five layout presets, and the grid overlay renders subtle, non-interactive composition regions when toggled on. Atmosphere stays dominant; HUD stage clearance and secondary cards are untouched.

```
Scheduler decides WHAT plays · Smart Grid decides WHERE/HOW · HUD is the surface
```

---

## Files Changed

### NEW: `src/data/smartGridTypes.ts`
- `SmartGridPreset`, `SmartGridRegionType`, `SmartGridRegion`, `SmartGridComposition` (per spec).
- `REGION_LABELS` map.

### NEW: `src/logic/smartGridResolver.ts`
- `pickPreset(active)` — role/displayMode → preset (role `bumper` wins; else by displayMode).
- `resolveSmartGridComposition({resolvedSchedule, columns?, rows?})` → composition with regions laid out on the 4×6 grid. Never throws; defaults to `full_scene` with no active block.

### `src/ui/BroadcastGridLayer.tsx`
- Added optional `composition?: SmartGridComposition` prop.
- Composition grid dims drive the drawn cells so regions align.
- Renders dashed region outlines + tiny technical labels for non-atmosphere regions. Stays `pointer-events: none`; still off by default and gated by the `⊞` toggle.

### `src/ui/BroadcastHudShell.tsx`
- Threaded optional `gridComposition?: SmartGridComposition` to `BroadcastGridLayer`. No layout change.

### `src/App.tsx`
- Captures the full `resolvedSchedule` (reused for the 0621G buffet `later`) and computes `gridComposition = resolveSmartGridComposition({ resolvedSchedule })`, passed to the HUD.

### `src/styles.css`
- `.bgl-region-rect` / `.bgl-region-label` (subtle dashed outlines, ~2px mono labels); stronger purple treatment for `map_placeholder`, tighter dashes for `bumper_card`.

---

## Presets Implemented

| Preset | Regions drawn (beyond atmosphere) |
|--------|-----------------------------------|
| `full_scene` | none — atmosphere only (default, least invasive) |
| `lower_third` | bottom-row PROGRAM lane |
| `guide_preview` | top-right NEXT preview (only when a next block exists) |
| `map_channel` | full-width upper WOS / MAP placeholder |
| `bumper_card` | centered BUMPER region |

### Mapping (active block → preset)
| Input | Preset |
|-------|--------|
| no active block | `full_scene` |
| role `bumper` | `bumper_card` (role wins) |
| displayMode `full_scene` | `full_scene` |
| displayMode `overlay` | `lower_third` |
| displayMode `map_channel` | `map_channel` |
| displayMode `grid` + role `event` | `guide_preview` |
| displayMode `grid` (other roles) | `bumper_card` |

## Scheduler Fields Used (0621G)
`ResolvedSchedule.now` / `.next`; `ScheduleBlock.displayMode`, `.role`, `.blockId`. (Implemented field names — spec referenced `scheduleRole`/`startTime`; mapped to the actual `role`/`startTimeIso`.)

---

## Tests Performed (browser, port 5173)

- ✅ **Test 1 — Default no schedule:** HUD + grid on → passive grid, **0 region outlines** (`full_scene`). No extra panels, no crash.
- ✅ **Test 3 — Map channel:** active block `displayMode: map_channel` → grid shows a "WOS / MAP" placeholder region (purple dashed, upper full-width). Screenshot confirms atmosphere dominant, no live WOS.
- ✅ **Test 4 — Bumper role:** active block `role: bumper` (with `displayMode: overlay`) → centered "BUMPER" region; role correctly takes precedence over displayMode.
- ✅ **Test 5 — Persistence:** schedule + grid survived repeated reloads; block data intact; no malformed-slot crash, no empty overwrite.
- ✅ Secondary cards / `upcoming_buffet` (0621B/G) remain independent of grid composition.
- ✅ HUD stage clearance (0621D) intact — single top row, atmosphere surface, bottom program line.
- ✅ `npx tsc --noEmit` clean; no console errors across editor/scheduler/HUD.

**Acceptance criteria 1–13: all met.**

---

## Preserved (confirmed)

- 0621C persistence + hydration guard, 0621D HUD stage clearance, 0621E source-group isolation, 0621F malformed-slot repair, 0621G schedule persistence — all intact.
- Grid remains `pointer-events: none`, off by default, toggle-gated; not part of `BroadcastSecondaryMode`.

---

## Deferred / Notes

- Region rendering is **structure only** — no content cards inside regions (secondary cards own content). Future patches can populate regions.
- WOS/map region is a **placeholder outline**; no live WOS runtime integration (per scope).
- Static-clock caveat from 0621G still applies: composition re-resolves on render, not on a live timer.
- No drag/resize, no user-authored templates, no animation — deferred per non-goals.

---

## Next Recommended Patch

`0621I` — live composition tick + first real region content (e.g. render the `schedule_preview` region's next-block mini-card), or begin WOS/map feed wiring into the `map_placeholder` region.

---

## Patch Status: ✅ COMPLETE
