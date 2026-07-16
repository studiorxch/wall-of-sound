# PLAYLIST
**Updated 2026-06-21 (post-0621M) · supersedes `0621A_PLAYLIST_README_UPDATED_v1.0.0.md`**

**PLAYLIST** is a playlist-channel authoring system for building adaptive music programs, broadcast-ready playlist identities, scheduled program blocks, and mood-first presentation surfaces for PLAY / WOS.

Most playlist tools treat a playlist as a static catalog: title, cover, tracks, play button. PLAYLIST treats a playlist as a programmable broadcast object: music, flow curve, mood, visuals, schedule role, and presentation state.

## Product Sentence

```text
PLAYLIST turns playlists into programmable broadcast channels.
```

Playlists are **not static catalogs.** Cover and background identity still matter — a playlist carries a record-sleeve cover and a broadcast background as part of its identity.

---

## Current Product Model

PLAY has moved beyond a playlist-builder-with-HUD model. It is now a programmable music channel system made of three coordinated layers plus an output surface:

```text
PLAY is now a programmable music channel system.

PLAYLIST creates trusted program blocks.
SCHEDULER places those blocks on a live TV-guide timeline.
SMART GRID routes visual content into schedule-aware regions.
BROADCAST HUD presents the result as a clean OBS-friendly output surface.
```

```text
PLAY
├── PLAYLIST    — program block authoring
├── SCHEDULER   — live TV-guide timing
├── SMART GRID  — schedule-aware visual compositor
└── BROADCAST HUD — clean output surface
```

### Core Rule

```text
Playlist Builder creates the content block.
Scheduler decides what is on now and what comes next.
Smart Grid decides where visual content appears.
Broadcast HUD remains the output surface.
```

---

## Playlist Builder

The playlist builder creates trusted program blocks: ordered tracks shaped by a **Flow Curve**, with identity (title, description, cover, background, accent, mood) and broadcast metadata.

The **Flow Curve remains the editor / composition authority.** It lives in the Flow-Curve editor — energy-over-time shaping, weak-area detection, and fill/regenerate guidance. It is not shown in the default Broadcast HUD.

---

## Playlist Scheduler / TV Guide

The Scheduler turns playlists into timed program blocks. It provides a TV-guide-like view with **Now / Next / Later** and persists schedule state inside the project. A shared live schedule clock updates the Scheduler, Broadcast HUD upcoming buffet, and Smart Grid composition automatically.

The Scheduler is the **timing authority** — Broadcast HUD does not own scheduling logic. A single shared clock drives every schedule-aware surface (no per-component clocks).

---

## Smart Grid Broadcast Composition

The Smart Grid is a **schedule-aware broadcast compositor.** It is off by default and toggled with the grid control (`⊞`). It can reserve regions for schedule previews, bumper/program cards, map placeholders, program lines, and atmosphere.

**Content is routed by region type, not label text.** Region content renderers are chosen from `region.regionType`; a content-bearing region suppresses its technical SVG label so it never collides with user-facing content. The Smart Grid is a compositor, not decoration, and never a permanent overlay.

---

## Broadcast HUD Output Surface

Broadcast HUD is no longer the central product — it is the clean, OBS-friendly surface where scheduled blocks and Smart Grid compositions are presented. It is **mood-first and no-chart by default.**

```text
Broadcast HUD = full-bleed atmosphere
              + compact operator row
              + bottom playback/program line
              + optional timed secondary layers
              + optional Smart Grid.
```

Broadcast HUD does **not** default to: flow curve chart · current-playing node · route line · axes · legend · permanent queue rail · large persistent playlist header. (The flow curve is editor-only; it may appear only as an explicit optional operator overlay.)

---

## Source Group Isolation

```text
Each playlist owns a source group. Automatic Fill Missing Time, Regenerate From
Curve, Fill Gap, and flow-curve assignment should only pull from the active
playlist's source group unless cross-group autofill is explicitly allowed.
Manual drag/add remains an explicit user action.
```

Legacy/unscoped tracks remain globally eligible so older projects do not regress.

---

## Map / WOS Feed Source Contract

```text
WOS/map content is not live-integrated yet. The Smart Grid has a typed map feed
source contract: none, mock, snapshot, iframe, live_wos. The shipped default is
none. Mock proves the host can render map-like content safely. Unsupported
sources fall back to a placeholder.
```

Map/WOS content must enter through Smart Grid regions, never as a new permanent HUD layer. No live Mapbox/WOS/iframe/network is wired — `mock` is a self-contained deterministic SVG.

---

## Current Build State (after 0621M)

All of 0621E–0621M are PASS:

- **0621E** — playlist source-group isolation.
- **0621F** — malformed slot warning hardening.
- **0621G** — Scheduler / TV-guide foundation.
- **0621H** — schedule-aware Smart Grid.
- **0621I** — shared live schedule clock.
- **0621J** — live schedule-preview region content.
- **0621K** — Smart Grid region-content routing.
- **0621L** — mock WOS/map feed spike.
- **0621M** — typed map feed source selector (default `none`).

See `CURRENT/PLAY_BUILD_STATUS.md` and `REPORTS/` for detail.

---

## Near-Term Roadmap

1. **Real map source** behind the existing typed feed contract (`snapshot` → `iframe` → `live_wos`).
2. **Scheduler usability** — block editing, move/duplicate, recurrence groundwork.
3. **Broadcast guide-mode** layout/readability refinement.

### Deferred (not missing)

Live WOS / Mapbox integration · WOS iframe integration · map controls · schedule recurrence · multi-day calendar · drag-resize schedule blocks · drag-resize Smart Grid regions · full report hierarchy cleanup · dead `.hud-header*` CSS pruning.

---

## Working Principle

```text
PLAY is not only a playlist builder.
PLAY is a programmable music channel system:
source-isolated playlists, a live scheduler, a schedule-aware Smart Grid,
and typed but non-live WOS/map feed sources — presented on a clean Broadcast HUD.
```
