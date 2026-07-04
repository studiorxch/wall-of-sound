# PLAY Patch 0621K — WOS/Map Region Placeholder & Grid Content Routing
**Completion Report · 2026-06-21 · Foundation**

---

## Summary

Generalized the 0621J one-off `schedule_preview` rendering into a single content router keyed on `region.regionType`. The Smart Grid now routes content per region type: schedule preview (existing), a WOS/map placeholder for map regions, and a program-card placeholder for bumper regions. No live WOS/Mapbox — placeholders only. Grid stays off-by-default, `⊞`-gated, and `pointer-events: none`.

```
Scheduler decides what · Smart Grid decides where · Region type decides what renderer
```

---

## Files Changed

### `src/ui/BroadcastGridLayer.tsx`
- Added `renderRegionContent(region)` — a single router that switches on `region.regionType` (not label text):
  - `schedule_preview` → live Now/Next/Later items via `buildSchedulePreviewItems` (0621J behavior preserved).
  - `map_placeholder` → `WOS / MAP · spatial feed placeholder · awaiting live world source`.
  - `bumper_card` → `PROGRAM · <title> · <mood> · <duration>`, preferring the active schedule block, falling back to the active playlist.
  - `atmosphere` / `program_line` (lower_third) → `null` (outline-only).
- Added `CONTENT_REGION_TYPES` set; the SVG technical label is suppressed for **any** content-bearing region (was schedule_preview-only) so labels never collide with content.
- Generalized the overlay loop: maps all non-atmosphere regions, renders a positioned `.bgl-region-overlay` only when the router returns content.
- New props: `activePlaylist?: PlaylistRecord` (for the bumper fallback).

### `src/ui/BroadcastHudShell.tsx`
- Passed `activePlaylist={playlist}` into `BroadcastGridLayer`.

### `src/styles.css`
- Split positioning into `.bgl-region-overlay` (absolute, `pointer-events: none`); `.bgl-preview` is now an inner flex column.
- Added `.bgl-region-content` / `.bgl-rc-*`, map-placeholder accent treatment, and centered bumper-card text.

No type changes were needed — the shipped 0621H `SmartGridRegionType` names (`schedule_preview`, `map_placeholder`, `bumper_card`, `program_line`, `atmosphere`) already cover the routing. (Field names kept per the spec's "do not rename" rule.)

---

## Region Routing Behavior

| Region type | Preset that produces it | Content rendered |
|-------------|-------------------------|------------------|
| `schedule_preview` | `guide_preview` | live NOW/NEXT/LATER guide |
| `map_placeholder` | `map_channel` | WOS/MAP placeholder (non-live) |
| `bumper_card` | `bumper_card` | PROGRAM card (block → playlist fallback) |
| `program_line` | `lower_third` | none (outline only) |
| `atmosphere` | all | none (full-bleed surface) |

Router switches on `regionType`; content is `pointer-events: none`.

---

## Scenarios Verified (browser, port 5173)

- ✅ **map_channel** (`displayMode: map_channel`): grid on → "WOS / MAP / spatial feed placeholder / awaiting live world source" in the reserved upper region. SVG technical label suppressed (no collision). Screenshot confirms subtle, clearly-a-placeholder, atmosphere dominant.
- ✅ **bumper** (`role: bumper`): grid on → centered "PROGRAM / A Playlist for Nappers / soft / ambient · 1h 20m" — block title + active-playlist mood + block duration.
- ✅ **guide_preview** (`displayMode: grid` + `role: event`): schedule preview still renders NOW/NEXT (0621J unbroken).
- ✅ **full_scene** (no/empty schedule): grid on → 0 region overlays, atmosphere clean, no crash.
- ✅ **Secondary independence**: verified in 0621J flow — secondary cards and grid content coexist; unchanged here.
- ✅ **Live clock (0621I)**: content derives from the App `resolvedSchedule` on the shared tick — no second timer added.
- ✅ Grid off by default, `⊞`-gated; HUD stage clearance (0621D) intact; persistence (0621C) and source-group isolation (0621E) untouched.
- ✅ `npx tsc --noEmit` clean; no console errors.

**Acceptance criteria 1–14: all met.**

---

## Live WOS Integration — Not Done (by design)

No Mapbox instantiation, no WOS fetch, no map controls. The `map_placeholder` region renders static placeholder copy explicitly labeled "placeholder / awaiting live world source" — it proves the region can host a future feed without implying one exists.

---

## Console Status

No errors or warnings across editor, scheduler, and HUD use during verification.

---

## Follow-up Recommendations

- `0621L` — WOS/Map feed integration spike: mount a real (or mock) map into the `map_placeholder` region behind a flag.
- The router is intentionally inline and small; if a fourth/fifth content renderer is added, extract per-type components under `src/ui/smartGrid/` as the spec suggested.
- `lower_third` (`program_line`) is currently outline-only — a future patch could add minimal content if it proves useful without duplicating the bottom transport row.

---

## Patch Status: ✅ COMPLETE
