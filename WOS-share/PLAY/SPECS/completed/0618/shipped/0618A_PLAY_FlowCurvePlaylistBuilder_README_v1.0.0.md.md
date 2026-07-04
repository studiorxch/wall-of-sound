# 0618A_PLAY_FlowCurvePlaylistBuilder_README_v1.0.0

## Project

**Flow Curve Playlist Builder** is a Phase 1 playlist planning prototype for building better DJ-style playlist order from a song pool.

The app imports track metadata, generates a visible Flow Curve, assigns songs to that curve, allows the user to adjust the curve, preserves locked songs, flags weak sections, moves bad fits into an Orphans panel, and exports the final playlist.

This is not a mixer, player, waveform editor, or live transition system yet.

---

## Environmental Assumptions

- Runtime: local web app prototype.
- Recommended stack: **Vite + React + TypeScript**.
- No backend is required for Phase 1.
- No audio decoding is required for Phase 1.
- Input is playlist metadata from CSV.
- Output formats are JSON, CSV, and M3U.
- Camelot key is the primary harmonic key format.
- Energy is required from `0.0` to `1.0`; if missing, it may be estimated from BPM.
- Phase 1 focuses on playlist order, not transition timing.

---

## Core Idea

Most playlist builders sort by BPM and key, which often creates one large climb or one simple bell curve.

The Flow Curve Playlist Builder treats the playlist as a visible energy container:

```text
Song Pool
  ↓
Flow Curve
  ↓
Track Slot Targets
  ↓
Playlist Assignment
  ↓
Warnings + Orphans
  ↓
Exported Playlist
```

The default model is **one macro DJ arc with nested local curves**. The macro arc gives the set a larger story. The nested curves create repeated rises, dips, resets, and rebuilds so listeners experience movement inside shorter listening windows.

---

## Phase 1 Goals

Phase 1 should prove one thing:

> The tool can create a better playlist flow than simple BPM/key sorting.

The user should be able to:

1. Import tracks from CSV.
2. Choose a target duration.
3. Generate a default Flow Curve.
4. View the curve clearly.
5. Generate a playlist order from the curve.
6. Edit curve points and regenerate the playlist.
7. Lock opener, closer, or fixed positions.
8. Add, remove, exclude, and restore songs.
9. See red/yellow warning areas.
10. See orphan tracks that do not fit.
11. Export JSON, CSV, and M3U.

---

## Phase 1 Non-Goals

Do not build these yet:

- Audio playback.
- Crossfading.
- Waveform rendering.
- Beatgrid analysis.
- Bar or phrase detection.
- Automatic transition in/out points.
- OBS overlay.
- Mixxx API integration.
- Real-time crowd response.
- AI mood classification.
- Custom mixer.

---

## Required CSV Columns

Minimum supported columns:

```csv
title,artist,bpm,camelotKey,durationSeconds,energy,filePath
```

### Required Fields

| Field | Required | Notes |
|---|---:|---|
| `title` | Yes | Track title |
| `artist` | Yes | Artist name |
| `bpm` | Yes | Numeric BPM |
| `camelotKey` | Yes | Example: `8A`, `9B` |
| `durationSeconds` | Yes | Track duration in seconds |
| `energy` | Preferred | Normalized `0.0` to `1.0`; may be estimated if missing |
| `filePath` | Optional | Required for useful M3U export |

---

## Recommended File Structure

```text
flow-curve-builder/
  package.json
  tsconfig.json
  vite.config.ts
  index.html
  src/
    data/
      trackTypes.ts
      flowCurveTypes.ts
      playlistTypes.ts
      importCsv.ts
      exportPlaylist.ts
      projectStorage.ts

    logic/
      camelot.ts
      energy.ts
      curvePresets.ts
      curveSampler.ts
      slotGenerator.ts
      trackScoring.ts
      playlistAssigner.ts
      orphanDetector.ts
      warningEngine.ts

    ui/
      ImportPanel.tsx
      TargetDurationPanel.tsx
      CurvePresetPanel.tsx
      FlowCurveCanvas.tsx
      PlaylistTimeline.tsx
      TrackTable.tsx
      LockControls.tsx
      WarningPanel.tsx
      OrphanPanel.tsx
      ExportPanel.tsx

    App.tsx
    main.tsx
    styles.css
```

---

## Build Order

### 1. Data Layer

Build first:

- Track types.
- Flow Curve types.
- Playlist project types.
- CSV import.
- Track validation.
- JSON project save/load.
- CSV/M3U export.

### 2. Logic Layer

Build second:

- Camelot scoring.
- Energy normalization.
- Curve preset generation.
- Curve sampling.
- Slot generation.
- Track scoring.
- Playlist assignment.
- Orphan detection.
- Warning engine.

### 3. Interface Layer

Build third:

- Import panel.
- Target duration controls.
- Curve preset selector.
- Flow Curve canvas.
- Playlist timeline.
- Track table.
- Lock controls.
- Warning panel.
- Orphan panel.
- Export panel.

---

## Main Data Objects

### Track

```ts
export type Track = {
  trackId: string;
  title: string;
  artist: string;
  bpm: number;
  camelotKey: CamelotKey;
  durationSeconds: number;
  energy: number;
  energySource: "manual" | "estimated";
  filePath?: string;
  genre?: string;
  sourcePlaylist?: string;
};
```

### Flow Curve

```ts
export type FlowCurve = {
  curveId: string;
  name: string;
  presetType: CurvePresetType;
  targetDurationSeconds: number;
  points: FlowPoint[];
};
```

### Track Slot

```ts
export type TrackSlot = {
  slotId: string;
  slotIndex: number;
  startTimeSeconds: number;
  targetEnergy: number;
  targetBpm: number;
  assignedTrackId?: string;
  warningLevel: "none" | "yellow" | "red";
  warningMessages: string[];
};
```

### Track Lock

```ts
export type TrackLock = {
  trackId: string;
  lockType: "position" | "opener" | "closer";
  slotIndex?: number;
};
```

### Orphan Track

```ts
export type OrphanTrack = {
  trackId: string;
  reasons: OrphanReason[];
  explanation: string;
};
```

---

## Flow Curve Presets

Phase 1 must include these presets:

| Preset | Purpose |
|---|---|
| `elegant_nested_arc` | Default macro DJ arc with nested curves |
| `rolling_waves` | Repeated rise/release movement for stream-style listening |
| `mountain` | One large build and cooldown |
| `valley_rebuild` | Drop first, then rebuild |
| `ramp` | Steady rise, useful for closing sequences |

Default: `elegant_nested_arc`.

---

## Assignment Rules

Playlist assignment should follow this order:

1. Ignore excluded tracks.
2. Place locked opener first.
3. Place locked closer last.
4. Place position-locked tracks into their fixed slots.
5. Score unlocked tracks against remaining slots.
6. Assign best-scoring tracks to slots.
7. Mark weak slots with yellow or red warnings.
8. Move unusable tracks into Orphans.
9. Do not force every track into the playlist.

V1 can use a greedy algorithm. Do not build a complex optimizer yet.

---

## Scoring Model

Use a simple weighted score:

```text
fitScore =
  energyDistance * 40
+ bpmDistance * 25
+ camelotPenalty * 25
+ durationPenalty * 5
+ artistRepeatPenalty * 5
```

Lower score is better.

### Camelot Penalties

| Move | Penalty |
|---|---:|
| Same key | 0 |
| Same number, A/B flip | 4 |
| Adjacent number, same letter | 6 |
| Adjacent number, opposite letter | 12 |
| Two numbers away | 18 |
| Distant key | 30 |
| Invalid key | 40 |

---

## Warning System

Warnings must be visible and readable.

| Level | Meaning |
|---|---|
| `none` | Clean fit |
| `yellow` | Usable but weak |
| `red` | Bad fit, missing track, or broken flow |

### Warning Types

- BPM gap.
- Energy gap.
- Camelot risk.
- Empty slot.
- Lock conflict.
- Duration drift.

Example warning:

```text
Need a track around 104–108 BPM, 8A or 9A, energy 0.45–0.55.
```

---

## Orphan Rules

An orphan is a song that does not fit the current Flow Curve container.

A track may become an orphan because:

- BPM is too low.
- BPM is too high.
- Energy is too low.
- Energy is too high.
- Camelot movement is too risky.
- No valid slot remains.
- A lock conflict prevents placement.

Orphans must be shown in red with a readable explanation. Orphans are not errors; they reveal which songs do not belong in the current playlist shape.

---

## UI Layout

```text
┌──────────────────────────────────────────────┐
│ Header: Project title / duration / export    │
├──────────────────────────────────────────────┤
│ Flow Curve Canvas                            │
│ Macro curve + nested curve points            │
├──────────────────────────────────────────────┤
│ Playlist Timeline                            │
│ Track blocks under curve                     │
├───────────────────────┬──────────────────────┤
│ Track Table            │ Warnings / Orphans   │
└───────────────────────┴──────────────────────┘
```

The curve must stay visible. It is the main control surface.

---

## Flow Curve Canvas Requirements

The canvas must show:

- Time axis.
- Energy axis.
- Editable curve points.
- Curve line.
- Red warning zones.
- Locked song markers.
- Current preset name.

Interactions:

- Drag point up/down to change energy.
- Drag point left/right to change timing.
- Add point.
- Remove point.
- Reset to preset.
- Regenerate playlist after edit.

Point editing is enough for V1. Do not overbuild drawing tools yet.

---

## Export Requirements

### JSON Project Export

Preserve:

- Tracks.
- Flow Curve points.
- Target duration.
- Locks.
- Excluded tracks.
- Playlist slots.
- Orphans.

### CSV Export

Required columns:

```csv
slotIndex,title,artist,bpm,camelotKey,durationSeconds,energy,startTimeSeconds,warningLevel,warningMessages
```

### M3U Export

Use `filePath` if available. If `filePath` is missing, skip the track and show an export warning.

---

## Acceptance Criteria

Phase 1 is complete when:

1. A valid CSV track pool can be imported.
2. Target duration can be changed.
3. The default Elegant Nested Arc can be generated.
4. The Flow Curve is visible.
5. Songs are ordered using BPM, Camelot key, duration, and energy.
6. Editing the curve reorders unlocked songs.
7. Locked songs stay fixed.
8. Bad fits show red warnings.
9. Unusable songs appear in Orphans.
10. The tool does not force every song into the playlist.
11. Songs can be added, removed, excluded, and restored.
12. JSON, CSV, and M3U export works.
13. JSON project import restores the same curve, locks, slots, and orphan state.

---

## Testing Checklist

Minimum tests:

- Valid Camelot keys score correctly.
- Invalid Camelot keys return high penalty.
- Missing energy is estimated.
- Curve sampler interpolates correctly.
- Target duration creates reasonable slot count.
- Locked opener remains first.
- Locked closer remains last.
- Position lock remains fixed.
- Excluded tracks are not assigned.
- Bad tracks become orphans.
- Red warnings appear for empty or bad slots.
- JSON project saves and reloads without losing locks or curve points.

---

## Quick Start

```bash
npm create vite@latest flow-curve-builder -- --template react-ts
cd flow-curve-builder
npm install
npm run dev
```

Then implement the project in this order:

```text
src/data → src/logic → src/ui
```

---

## Expected Result

The completed Phase 1 prototype should let a user import a song pool, generate a nested Flow Curve, edit that curve visually, lock key songs, identify weak sections, move bad fits to Orphans, and export a playlist with stronger energy movement than simple BPM/key sorting.

## Implementation Guide

- **Where:** Create the app in `flow-curve-builder/`; implement `src/data/` first, `src/logic/` second, and `src/ui/` third.
- **What:** Run `npm create vite@latest flow-curve-builder -- --template react-ts`, then build the modules listed in the roadmap/spec.
- **Expect:** A local React app where editing the visible Flow Curve reorders unlocked songs, keeps locked songs fixed, marks red gaps/orphans, and exports JSON, CSV, and M3U playlists.
