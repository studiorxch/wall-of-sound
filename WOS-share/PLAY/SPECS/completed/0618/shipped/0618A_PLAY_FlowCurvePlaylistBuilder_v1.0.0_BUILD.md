# 0618A_PLAY_FlowCurvePlaylistBuilder_v1.0.0

## Project Title

**0618A_PLAY_FlowCurvePlaylistBuilder_v1.0.0**

## Purpose

Build Phase 1 of the **Flow Curve Playlist Builder**: a flexible playlist planning tool where a user imports a pool of songs, generates or edits a visible Flow Curve, and the playlist self-adjusts around that curve while respecting locked songs, identifying orphan tracks, and warning where the library cannot satisfy the intended flow.

The goal is not playback, mixing, waveform analysis, or transition automation yet. Phase 1 produces a better playlist order than simple BPM/key sorting.

---

## Environmental Assumptions

- Runtime: local web app prototype.
- Recommended stack: **Vite + React + TypeScript**.
- Styling can be plain CSS or Tailwind if already available.
- No backend required for Phase 1.
- No audio decoding required for Phase 1.
- Track data enters through CSV import.
- Export targets are JSON, CSV, and M3U.
- Energy is required for Phase 1, but can be manually supplied or estimated from BPM if missing.
- Camelot key is the primary harmonic key format.
- Traditional key display can be added later, but is not required for Phase 1.

---

## Product Definition

The Flow Curve Playlist Builder is a playlist composition tool.

It treats the playlist as a **visible energy container**. Songs are placed into the container only if they fit the curve, locks, BPM movement, Camelot movement, and target duration.

The user should be able to:

1. Import a song pool.
2. Choose a target duration.
3. Generate a default Flow Curve.
4. See a visible macro arc with nested local curves.
5. Generate an ordered playlist from the curve.
6. Drag/edit the curve and watch the playlist reorder.
7. Lock songs so human decisions are preserved.
8. Remove, restore, or exclude songs.
9. See red/yellow warning areas.
10. See orphan songs that do not fit the current curve.
11. Export the final playlist.

---

## Core Concept

The playlist should not be treated as one large BPM/key sort.

The correct model is:

```text
Set
└── Macro Flow Curve
    └── Nested Local Curves
        └── Track Slots
            └── Assigned Tracks
```

The macro curve gives the whole set an elegant DJ arc. Nested curves create smaller up/down and down/up movements so listeners experience energy motion within shorter listening windows.

The curve must support any target duration, not only 2-hour mixes.

---

## Phase 1 Scope

### Included

| Feature | Required | Notes |
|---|---:|---|
| CSV import | Yes | Minimum track metadata only |
| Track validation | Yes | Missing BPM/key/duration warnings |
| Target duration | Yes | Flexible duration, not hard-coded |
| Flow Curve presets | Yes | Generate usable starting curves |
| Visible curve view | Yes | Main control surface |
| Playlist assignment | Yes | Reorder songs to match curve |
| Lock songs | Yes | Preserve human decisions |
| Orphan panel | Yes | Songs that do not fit current curve |
| Red/yellow warnings | Yes | Bad or weak flow zones |
| Add/remove/exclude songs | Yes | Editable song pool |
| Export JSON/CSV/M3U | Yes | Output usable outside app |

### Excluded

| Feature | Reason |
|---|---|
| Waveform view | Later phase |
| Beatgrid detection | Requires audio analysis |
| Bar/phrase transition planning | Later phase |
| Automatic transition timing | Later phase |
| Live playback control | Later phase |
| Custom mixer | Later phase |
| Mood intelligence | Metadata incomplete |
| Density analysis | More useful for transition mapping |
| Vocal clash detection | Requires waveform/section analysis |

---

## Required Track Metadata

CSV import should support at minimum:

```text
title
artist
bpm
camelotKey
durationSeconds
energy
filePath
```

`filePath` is optional for CSV display, but required for useful M3U export.

Energy should be normalized from `0.0` to `1.0`.

If energy is missing, estimate it from BPM normalization and mark it as estimated.

---

## Data Layer

Build the data layer first. Do not start with UI.

### `src/data/trackTypes.ts`

```ts
export type CamelotLetter = "A" | "B";

export type CamelotKey = `${number}${CamelotLetter}`;

export type TrackEnergySource = "manual" | "estimated";

export type Track = {
  trackId: string;
  title: string;
  artist: string;
  bpm: number;
  camelotKey: CamelotKey;
  durationSeconds: number;
  energy: number;
  energySource: TrackEnergySource;
  filePath?: string;
  genre?: string;
  sourcePlaylist?: string;
};
```

### `src/data/flowCurveTypes.ts`

```ts
export type CurvePresetType =
  | "elegant_nested_arc"
  | "rolling_waves"
  | "mountain"
  | "valley_rebuild"
  | "ramp";

export type FlowPoint = {
  pointId: string;
  timePercent: number;
  energy: number;
};

export type FlowCurve = {
  curveId: string;
  name: string;
  presetType: CurvePresetType;
  targetDurationSeconds: number;
  points: FlowPoint[];
};
```

### `src/data/playlistTypes.ts`

```ts
export type WarningLevel = "none" | "yellow" | "red";

export type TrackSlot = {
  slotId: string;
  slotIndex: number;
  startTimeSeconds: number;
  targetEnergy: number;
  targetBpm: number;
  assignedTrackId?: string;
  warningLevel: WarningLevel;
  warningMessages: string[];
};

export type TrackLockType = "position" | "opener" | "closer";

export type TrackLock = {
  trackId: string;
  lockType: TrackLockType;
  slotIndex?: number;
};

export type OrphanReason =
  | "BPM_TOO_LOW"
  | "BPM_TOO_HIGH"
  | "ENERGY_TOO_LOW"
  | "ENERGY_TOO_HIGH"
  | "KEY_TOO_RISKY"
  | "NO_VALID_SLOT"
  | "LOCK_CONFLICT";

export type OrphanTrack = {
  trackId: string;
  reasons: OrphanReason[];
  explanation: string;
};

export type PlaylistProject = {
  projectId: string;
  title: string;
  targetDurationSeconds: number;
  tracks: Track[];
  flowCurve: FlowCurve;
  slots: TrackSlot[];
  locks: TrackLock[];
  orphans: OrphanTrack[];
  excludedTrackIds: string[];
  createdAt: string;
  updatedAt: string;
};
```

---

## Logic Layer

Build the logic layer after the data layer and before UI.

### Required Modules

```text
src/logic/camelot.ts
src/logic/energy.ts
src/logic/curvePresets.ts
src/logic/curveSampler.ts
src/logic/slotGenerator.ts
src/logic/trackScoring.ts
src/logic/playlistAssigner.ts
src/logic/orphanDetector.ts
src/logic/warningEngine.ts
```

---

## Camelot Logic

### `src/logic/camelot.ts`

Rules:

- Same key is safest.
- Same number with opposite letter is safe.
- Adjacent number with same letter is safe.
- Adjacent number with opposite letter is moderate.
- Distant number movement is risky.

Expected API:

```ts
export function parseCamelotKey(key: string): { number: number; letter: "A" | "B" } | null;

export function getCamelotPenalty(fromKey: string, toKey: string): number;
```

Penalty guidance:

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

## Energy Logic

### `src/logic/energy.ts`

Expected API:

```ts
export function clampEnergy(value: number): number;

export function estimateEnergyFromBpm(bpm: number, minBpm: number, maxBpm: number): number;
```

Rules:

- Energy must stay between `0.0` and `1.0`.
- Estimated energy should be marked as `energySource: "estimated"`.
- Manual energy should always win over estimated energy.

---

## Curve Presets

### `src/logic/curvePresets.ts`

Required presets:

1. `elegant_nested_arc`
2. `rolling_waves`
3. `mountain`
4. `valley_rebuild`
5. `ramp`

Default preset: `elegant_nested_arc`.

### Preset Behavior

#### Elegant Nested Arc

One macro DJ arc with smaller internal up/down and down/up curves.

Use this as the default because it supports long-form narrative while keeping local movement alive.

#### Rolling Waves

Consistent local rise/release motion.

Useful for Twitch-style streams where listeners may enter at random times.

#### Mountain

Single major build and cooldown.

Useful for cinematic or YouTube-first mixes, but should not be default.

#### Valley Rebuild

Drop first, then rebuild.

Useful for room recovery or resetting after high energy.

#### Ramp

Steady rise.

Useful for closing sequences.

### Expected API

```ts
export function generateFlowCurve(params: {
  presetType: CurvePresetType;
  targetDurationSeconds: number;
  curveDensity: "low" | "medium" | "high";
}): FlowCurve;
```

---

## Curve Count Rules

Do not hard-code the tool for 2-hour sets.

Use target duration and curve density to estimate nested curve count.

Suggested default behavior:

| Target Duration | Low Density | Medium Density | High Density |
|---:|---:|---:|---:|
| 30 min | 1 | 2 | 3 |
| 60 min | 2 | 3 | 4 |
| 120 min | 4 | 5 | 6 |
| 180 min | 5 | 7 | 9 |
| 240 min | 7 | 9 | 12 |

For unknown durations, estimate:

```text
curveCount = round(targetDurationMinutes / 24)
```

Clamp to at least `1`.

---

## Curve Sampling

### `src/logic/curveSampler.ts`

Expected API:

```ts
export function sampleCurveEnergy(curve: FlowCurve, timePercent: number): number;
```

Rules:

- Sort points by `timePercent`.
- Clamp `timePercent` to `0.0` through `1.0`.
- Linearly interpolate between surrounding points.
- Return normalized energy.

---

## Slot Generation

### `src/logic/slotGenerator.ts`

Slots are time-based, not fixed track-count based.

Expected API:

```ts
export function generateTrackSlots(params: {
  curve: FlowCurve;
  tracks: Track[];
  targetDurationSeconds: number;
}): TrackSlot[];
```

Rules:

- Estimate slot count using average track duration.
- Slot count should not exceed available usable tracks.
- Each slot gets a `startTimeSeconds` value.
- Each slot samples the Flow Curve for `targetEnergy`.
- Each slot should estimate `targetBpm` from the track pool range and sampled energy.

Target BPM formula:

```text
targetBpm = minBpm + targetEnergy * (maxBpm - minBpm)
```

---

## Track Scoring

### `src/logic/trackScoring.ts`

Expected API:

```ts
export function scoreTrackForSlot(params: {
  track: Track;
  slot: TrackSlot;
  previousTrack?: Track;
}): number;
```

V1 score:

```text
fitScore =
  energyDistance * 40
+ bpmDistance * 25
+ camelotPenalty * 25
+ durationPenalty * 5
+ artistRepeatPenalty * 5
```

Rules:

- Lower score is better.
- Use normalized energy distance.
- Use normalized BPM distance where possible.
- Apply Camelot penalty only if there is a previous track.
- Apply artist repeat penalty if previous track has same artist.
- Do not hard-fail risky Camelot moves; score them higher.

---

## Playlist Assignment

### `src/logic/playlistAssigner.ts`

Expected API:

```ts
export function assignPlaylistToCurve(params: {
  tracks: Track[];
  curve: FlowCurve;
  locks: TrackLock[];
  excludedTrackIds: string[];
  targetDurationSeconds: number;
}): {
  slots: TrackSlot[];
  orphans: OrphanTrack[];
};
```

Assignment rules:

1. Excluded tracks are ignored.
2. Locked opener is placed first.
3. Locked closer is placed last.
4. Position-locked tracks are placed into their assigned slots.
5. Unlocked tracks are scored against remaining slots.
6. Best-scoring tracks fill available slots.
7. Tracks that cannot be placed cleanly become orphans.
8. Do not force every song into the playlist if it damages the curve.

V1 can use a greedy assignment algorithm.

Do not build a complex optimizer yet.

---

## Orphan Logic

### `src/logic/orphanDetector.ts`

Expected API:

```ts
export function buildOrphanTrack(params: {
  track: Track;
  reasons: OrphanReason[];
}): OrphanTrack;
```

Orphan examples:

- BPM too low for all curve zones.
- BPM too high for all curve zones.
- Energy too low for all available slots.
- Energy too high for all available slots.
- Key movement is too risky near all possible neighbors.
- Track conflicts with a lock.
- No valid slot remains.

Orphan tracks must be shown in red.

---

## Warning Engine

### `src/logic/warningEngine.ts`

Expected API:

```ts
export function evaluateSlotWarnings(params: {
  slots: TrackSlot[];
  tracksById: Map<string, Track>;
}): TrackSlot[];
```

Warning levels:

| Level | Meaning |
|---|---|
| `none` | Clean fit |
| `yellow` | Usable but weak |
| `red` | Breaks intended flow or has no clean match |

Warning categories:

- BPM gap.
- Energy gap.
- Camelot risk.
- Empty slot.
- Lock conflict.
- Duration drift.

Each warning should provide a readable message.

Example:

```text
Need a track around 104–108 BPM, 8A or 9A, energy 0.45–0.55.
```

---

## UI Layer

Build UI only after the data and logic layers pass basic tests.

### Required Components

```text
src/ui/ImportPanel.tsx
src/ui/TargetDurationPanel.tsx
src/ui/CurvePresetPanel.tsx
src/ui/FlowCurveCanvas.tsx
src/ui/PlaylistTimeline.tsx
src/ui/TrackTable.tsx
src/ui/LockControls.tsx
src/ui/WarningPanel.tsx
src/ui/OrphanPanel.tsx
src/ui/ExportPanel.tsx
```

---

## UI Layout

Recommended layout:

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

---

## Flow Curve Canvas Requirements

The curve must remain visible.

Required visual elements:

- Time axis.
- Energy axis.
- Editable curve points.
- Line connecting curve points.
- Red zones where warnings occur.
- Locked song markers.
- Current preset name.

Interactions:

- Drag point up/down to change energy.
- Drag point left/right to change timing.
- Add point.
- Remove point.
- Reset to preset.
- Regenerate playlist after edit.

Do not overbuild drawing tools in V1. Point editing is enough.

---

## Playlist Timeline Requirements

Each track block should show:

```text
slot number
title
artist
BPM
Camelot key
duration
energy
lock status
warning color
```

Suggested display:

```text
[03] Artist - Title | 126 BPM | 8A | E 0.72 | 5:43 | 🔒
```

Use color status:

- Normal: no warning.
- Yellow: weak fit.
- Red: bad fit or missing track.

---

## Locking Requirements

V1 lock types:

1. Lock opener.
2. Lock closer.
3. Lock position.
4. Unlock.

Behavior:

- Locked tracks must not move during regeneration.
- If a lock cannot be honored, show a red lock conflict.
- Locks must persist in JSON project export.

---

## Add / Remove / Exclude Requirements

The user must be able to:

- Add tracks from a new CSV import.
- Remove tracks from project.
- Exclude a track from current generation.
- Restore an excluded track.
- Restore an orphan back into the pool.
- Regenerate after changes.

Do not permanently delete tracks unless user explicitly removes them from the project.

---

## Export Requirements

### JSON Project Export

Must preserve:

- Tracks.
- Flow Curve points.
- Target duration.
- Locks.
- Excluded tracks.
- Current playlist slots.
- Orphans.

### CSV Export

Columns:

```text
slotIndex,title,artist,bpm,camelotKey,durationSeconds,energy,startTimeSeconds,warningLevel,warningMessages
```

### M3U Export

Use `filePath` if available.

If `filePath` is missing, skip the track and show export warning.

---

## Acceptance Criteria

Phase 1 is complete when all criteria are true:

1. User can import a valid CSV track pool.
2. User can choose a target duration.
3. User can generate the default Elegant Nested Arc.
4. The visible Flow Curve appears on screen.
5. Songs are ordered against the curve using BPM, Camelot key, duration, and energy.
6. Dragging/editing the curve reorders unlocked songs.
7. Locked songs stay fixed.
8. Bad fits appear as red warnings.
9. Unusable songs appear in the Orphans panel.
10. The tool does not force every song into the playlist.
11. The user can add, remove, exclude, and restore songs.
12. The user can export JSON, CSV, and M3U.
13. JSON export can be loaded back with the same curve, locks, slots, and orphan state.

---

## Non-Goals

Do not implement these in Phase 1:

- Audio playback.
- Crossfading.
- Waveform rendering.
- Beatgrid analysis.
- Phrase analysis.
- Automatic transition in/out point selection.
- OBS overlay.
- Mixxx API integration.
- Real-time crowd response.
- AI mood classification.

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

## Development Order

Follow this order strictly:

### 1. Data Layer

Build:

- Types.
- CSV import.
- Track validation.
- JSON project save/load.
- CSV/M3U export.

### 2. Logic Layer

Build:

- Camelot scoring.
- Energy normalization.
- Curve preset generator.
- Curve sampler.
- Slot generator.
- Track scorer.
- Playlist assignment.
- Orphan detector.
- Warning engine.

### 3. Interface Layer

Build:

- Import panel.
- Target duration controls.
- Curve preset controls.
- Flow Curve canvas.
- Playlist timeline.
- Track table.
- Lock controls.
- Warning panel.
- Orphan panel.
- Export panel.

---

## Testing Requirements

Use small hard-coded test data before UI testing.

Minimum test cases:

1. Valid Camelot keys score correctly.
2. Invalid Camelot keys return high penalty.
3. Missing energy is estimated.
4. Curve sampler interpolates correctly.
5. Target duration creates reasonable slot count.
6. Locked opener remains first.
7. Locked closer remains last.
8. Position lock remains fixed.
9. Excluded tracks are not assigned.
10. Bad tracks become orphans.
11. Red warnings appear for empty or bad slots.
12. JSON project saves and reloads without losing locks or curve points.

---

## Design Notes

- The curve is the main object. Do not bury it below the table.
- Red warnings should be immediate and visible.
- Orphans are not errors. They are tracks that do not fit the current container.
- The user is shaping the set, not asking the algorithm for a final answer.
- Human locks override automatic ordering.
- V1 should remain simple enough to test playlist quality quickly.

---

## Expected Phase 1 Result

At the end of Phase 1, the user can import songs, generate an Elegant Nested Arc, adjust the curve visually, lock songs, identify orphan tracks, and export a playlist that has stronger flow than BPM/key sorting.

The output should make it possible to test multiple curve patterns and compare whether listener movement improves over one giant bell curve.

---

## Implementation Guide

- **Where:** Create the project in `flow-curve-builder/`, then implement `src/data/` first, `src/logic/` second, and `src/ui/` third.
- **What:** Run `npm create vite@latest flow-curve-builder -- --template react-ts`, then build the modules in the order listed above.
- **Expect:** A local app where editing the visible Flow Curve reorders unlocked songs, keeps locked songs fixed, marks red gaps/orphans, and exports JSON, CSV, and M3U playlists.
