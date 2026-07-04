---
date_generated: 2026-06-30
project: PLAY
report_type: continuity_rollup
coverage_start: 2026-06-28
coverage_end: 2026-06-30
---

# PLAY Continuity Rollup — 2026-06-28

## Summary

One build shipped on 2026-06-28 as part of the WALL Orbital Earth broadcast chain: `0628A` repositioned the `TypedTrackIndexOverlay` (track title/artist reveal) from B1 (left of Earth) to B3 (right of Earth center). The persistent compact identity in `BroadcastMicrographicsGrid` (CHANNEL / TRACK ## at A3) was already correctly positioned — no change needed there. `tsc -b` exits 0. Prior PLAY state (0624G) is otherwise unchanged.

---

## Completion Reports Covered

| Build | Name | Date | File |
|---|---|---|---|
| 0628A | BroadcastNowPlayingA3Placement | 2026-06-28 | `WALL/REPORTS/2026-06-28_WALL_0628A_BroadcastNowPlayingA3Placement_COMPLETION_REPORT.md` |

Note: 0628A is filed under WALL/REPORTS because the spec originated from the WALL Orbital broadcast composition work (0627J). PLAY-side files edited.

---

## Change Detail

### `TypedTrackIndexOverlay` → B3 (right of Earth)

| Property | Before | After |
|---|---|---|
| `.bti-overlay` | `left: var(--obs-safe-x, 14px)` | `right: var(--obs-safe-x, 14px); left: auto` |
| `.bti-overlay` | — | `text-align: right` |
| `.bti-meta` | implicit left-aligned | `align-items: flex-end; padding-right: 2px` |
| `.bti-title` | — | `direction: rtl; unicode-bidi: plaintext` |

`direction: rtl` ensures long track names overflow from the left edge — most readable part stays right-anchored. `unicode-bidi: plaintext` preserves natural reading order.

### Persistent now-playing identity (A3 — unchanged)

`BroadcastMicrographicsGrid` in `hud-right-cluster`:
- `STATUS` — ROUTES LIVE
- `TRACK` — 01 / 12
- `SOURCE` — WOS LOCAL
- `CHANNEL` — playlist title

Already at A3. No change needed.

---

## Files Edited

| File | Change |
|---|---|
| `play/flow-curve-builder/src/styles.css` | `.bti-overlay`, `.bti-meta`, `.bti-title` position/alignment |
| `play/flow-curve-builder/src/ui/BroadcastHudShell.tsx` | Added `window.PLAY.BroadcastComposition.getNowPlayingA3Report()` diagnostic |

## Build Health

- `tsc -b` exits 0 — no new type errors
- `npm run build` (Vite): Node 18 environment — Vite requires Node 20+ (pre-existing env issue, not introduced by this change)

---

## Current PLAY State (carried from 0624G)

Last substantive build: **0624G** (TypeScript build health recovery — 2026-06-24)

Product model:
```text
PLAYLIST    — trusted program blocks, source-grouped tracks
SCHEDULER   — event-first TV-guide; BroadcastEvent + ScheduleBlock dual record
LIBRARY     — mood-tagged catalog, source pools, audio analysis, archive/group governance
SMART GRID  — schedule-aware broadcast compositor (⊞-gated)
BROADCAST HUD — clean OBS-friendly output surface
  ├── hud-right-cluster (A3): CHANNEL/TRACK identity + CAM/POV/SKY telemetry
  └── bti-overlay (B3): track title/artist reveal on track change  ← moved from B1 by 0628A
```

Key new types (0623C–0624A): `BroadcastEvent`, `MusicSourcePool`, `TrackAudioAnalysis`, `buildPlaylistSlotsFromSourcePool`

---

## Blockers / Risks

- `npm run build` (Vite) fails: Node 18, Vite requires Node 20+ — pre-existing environment issue
- Live WOS iframe integration: dev opt-in only (`source: "none"` committed default)
- Source pool editor UI: data model ready, UI not built
- Event recurrence expansion: type defined, no engine

## Next Recommended Step

1. Source pool editor UI
2. Event recurrence expansion
3. Node.js upgrade to 20+
4. Promote WOS iframe integration to user toggle
