# PLAY Patch 0621N — Current Architecture README & Continuity (DOC)
**Completion Report · 2026-06-21 · Documentation / Continuity**

---

## Summary

Documentation-only patch. Updated PLAY's docs to reflect the actual post-0621M architecture: a programmable music channel system built from **Playlist Builder → Scheduler → Smart Grid → Broadcast HUD (output surface)**. No code changed.

The spec assumed a `PLAY/CURRENT/` pack and `PLAY/REPORTS/rollups/` already existed — they did not. Both were created under the play root (`/Users/studio/Projects/play`).

---

## Files Created

### Updated PLAYLIST README
- `0621N_PLAYLIST_README_UPDATED_v1.1.0.md` — supersedes the 0621A v1.0.0 README (kept as history). Sections: Current Product Model, Playlist Builder, Playlist Scheduler / TV Guide, Smart Grid Broadcast Composition, Broadcast HUD Output Surface, Source Group Isolation, Map / WOS Feed Source Contract, Current Build State, Near-Term Roadmap.

### Current source pack — `CURRENT/`
- `CURRENT/PLAY_CURRENT.md` — focus statement, architecture stack, active build state, subsystem summaries, deferred list.
- `CURRENT/PLAY_BUILD_STATUS.md` — full chain through 0621D + **0621E–0621M with exact build IDs** and per-build summaries.
- `CURRENT/PLAY_DECISIONS.md` — locked decisions (source groups, scheduler timing authority, single shared clock, region-type routing, label suppression, typed default-safe map feed, mood-first HUD).
- `CURRENT/PLAY_DO_NOT_REOPEN.md` — closed directions (no default FlowCurveCanvas in HUD, no permanent queue rail, no large header, no permanent/live map by default, no label-text routing, no cross-group auto-pull, no multiple clocks, don't move 0621x reports).
- `CURRENT/PLAY_SOURCE_INDEX.md` — data / logic / UI / config file map + exact 0621E–0621M report paths.

### Rollup — `REPORTS/rollups/`
- `REPORTS/rollups/2026-06-21_PLAY_CONTINUITY_ROLLUP.md` — new dated rollup (none existed to overwrite). Captures post-0621M architecture, builds added, stable decisions, deferred items, next work.

---

## Required Architecture Language (recorded verbatim)

```text
PLAY is now a programmable music channel system.
PLAYLIST creates trusted program blocks.
SCHEDULER places those blocks on a live TV-guide timeline.
SMART GRID routes visual content into schedule-aware regions.
BROADCAST HUD presents the result as a clean OBS-friendly output surface.
```

Source-group, Scheduler, Smart Grid, and Map/WOS summaries included verbatim per spec.

---

## Testing Checklist (spec §Testing — verified)

- ✅ `FlowCurveCanvas` / flow curve described as **editor-only** (HUD only as explicit optional operator overlay); no doc frames it as a HUD default.
- ✅ `queue rail` appears only as "do not restore the permanent queue rail" / "does not default to … permanent queue rail" — never as permanent default UI.
- ✅ `Mapbox` / `WOS` / `live_wos` all marked future/deferred/non-live; default `none`; mock is explicitly a safe non-live renderer.
- ✅ `Scheduler` described as the **timing authority**.
- ✅ `Smart Grid` described as a **compositor**, not decoration.
- ✅ Exact build IDs **0621E–0621M** present in `PLAY_BUILD_STATUS.md` (and `PLAY_SOURCE_INDEX.md`).

## Acceptance Criteria (1–10): all met

1. README reflects the triad ✅ · 2. HUD no longer framed as primary product ✅ · 3. Honest map/WOS feed contract ✅ · 4. Source pack includes 0621E–0621M ✅ · 5. Decisions + Do-Not-Reopen preserve current locks ✅ · 6. Source index identifies data/logic/UI/config ✅ · 7. Rollup captures post-0621M ✅ · 8. No doc claims live WOS/Mapbox exists ✅ · 9. No doc claims grid is permanent-by-default ✅ · 10. No doc encourages chart-led HUD ✅

---

## Notes

- **0621A README preserved** as history (`0621A_PLAYLIST_README_UPDATED_v1.0.0.md`); the v1.1.0 file is the active README.
- **Existing 0621x reports not moved** (per the do-not-move-midstream rule); only the new `CURRENT/` pack and `rollups/` dir were added.
- No code changes; no build run needed. (App remains TypeScript-clean as of 0621M.)

---

## Patch Status: ✅ COMPLETE (documentation)
