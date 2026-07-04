# PLAY Continuity Rollup — 0621E → 0621M
**2026-06-21**

This rollup captures the post-0621M state. It summarizes the builds added since the prior 0621 work, the current architecture model, stable decisions, deferred items, and next recommended work. Source-of-truth detail lives in the per-patch completion reports under `REPORTS/` root and the `CURRENT/` pack.

---

## Current Architecture Model

```text
PLAY is now a programmable music channel system.

PLAYLIST creates trusted program blocks.
SCHEDULER places those blocks on a live TV-guide timeline.
SMART GRID routes visual content into schedule-aware regions.
BROADCAST HUD presents the result as a clean OBS-friendly output surface.
```

```text
PLAY
├── PLAYLIST    — creates trusted playlist/program blocks
├── SCHEDULER   — places blocks on a live clock / TV-guide timeline
├── SMART GRID  — routes visual content into schedule-aware broadcast regions
└── BROADCAST HUD — clean, OBS-friendly output surface
```

Broadcast HUD is no longer the central product — it is the output surface.

---

## Builds Added Since Previous Rollup

| Build | Summary |
|-------|---------|
| 0621E | Playlist source-group isolation prevents cross-group contamination during automatic fill/regeneration. |
| 0621F | Slot warning messages defensively normalized to prevent malformed-data crashes. |
| 0621G | Scheduler / TV-guide foundation: timed playlist blocks + Now / Next / Later resolution, persisted in project. |
| 0621H | Smart Grid became schedule-aware; resolves composition presets from the active schedule block. |
| 0621I | Shared live schedule clock (30s) auto-updates Scheduler, HUD, and Smart Grid. |
| 0621J | Schedule-preview region renders live TV-guide content inside the Smart Grid. |
| 0621K | Smart Grid region-content router: schedule preview, map placeholder, bumper/program card, reserved regions — routed by region type. |
| 0621L | Flagged mock WOS/map feed spike proved map-like content can live inside a Smart Grid region. |
| 0621M | Map feed boolean replaced with a typed source selector: `none`, `mock`, `snapshot`, `iframe`, `live_wos` (default `none`). |

All PASS. TypeScript clean; no known console errors on normal use.

---

## Stable Decisions (locked)

- Playlist source groups isolate automatic fill/regeneration; manual cross-group movement stays explicit.
- Scheduler is the timing authority; one shared live clock drives all schedule-aware surfaces.
- Smart Grid routes by `region.regionType`, not label text; technical labels yield to content labels.
- WOS/map content enters through Smart Grid regions, never as a permanent HUD layer; map feed source is typed and default-safe (`none`).
- Broadcast HUD is mood-first, no-chart by default; Flow Curve stays in the editor.

(See `CURRENT/PLAY_DECISIONS.md` and `CURRENT/PLAY_DO_NOT_REOPEN.md`.)

---

## Deferred (not missing)

Live WOS / Mapbox integration · WOS iframe integration · map controls · schedule recurrence · multi-day calendar · drag-resize schedule blocks · drag-resize Smart Grid regions · full report hierarchy cleanup · dead `.hud-header*` CSS pruning.

---

## Next Recommended Work

Pick by where the next pressure is:
1. **Real map source** behind the existing typed feed contract (`snapshot` static route image → `iframe` WOS preview → `live_wos`).
2. **Scheduler usability** — block editing, move/duplicate UX, recurrence groundwork.
3. **Broadcast guide-mode** layout/readability refinement.

---

## Provenance

Per-patch completion reports: `REPORTS/2026-06-21_PLAY_0621{E..M}_*_COMPLETION_REPORT.md`.
Current pack: `CURRENT/PLAY_CURRENT.md`, `PLAY_BUILD_STATUS.md`, `PLAY_DECISIONS.md`, `PLAY_DO_NOT_REOPEN.md`, `PLAY_SOURCE_INDEX.md`.
