# 0621E_PLAY_PlaylistSourceGroupIsolationPatch_v1.0.0_PATCH

## Project

PLAY / PLAYLIST

## Patch Type

P0/P1 Product Trust Patch

## Status

Ready for Claude / Codex implementation

## Purpose

Prevent playlist contamination by ensuring automatic playlist building, fill, and regeneration only pull tracks from the active playlist's own source group unless the user explicitly allows cross-group sourcing.

This patch protects stream-safe playlists from accidentally importing unrelated tracks from the global library or other playlist groups.

## Product Rule

```text
A playlist should only auto-fill / regenerate / pull tracks from its own source group unless the user explicitly allows cross-group sourcing.
```

## Background

PLAY now supports multiple playlists, shared library behavior, Fill Missing Time, Regenerate From Curve, and browser playback. The current risk is that automatic playlist construction can pull eligible tracks from the broader library based on BPM, key, and energy without respecting whether those tracks belong to the intended source group.

That creates a trust problem:

- stream-safe playlists can accidentally receive non-stream-safe music
- curated groups can be diluted by unrelated tracks
- hidden automatic imports are harder to audit than manual drag/drop
- flow-curve scoring can make musically logical but contextually wrong choices

The near-term fix is not advanced rule filtering. The near-term fix is source-group isolation.

## Non-Goal

Do not build a full recommendation/rules engine in this patch.

Deferred:

- artist filters
- genre filters
- rating filters
- listen-count filters
- advanced mood filtering
- licensing policy engine
- per-playlist smart criteria builder
- global recommender logic

## Current Known Good State To Preserve

0621C restored persistence across browser reload.

0621D cleared Broadcast HUD into:

```text
full-bleed atmosphere surface + compact operator row + bottom playback/program line
```

Do not disturb:

- playlist persistence
- active playlist persistence
- Broadcast HUD stage clearance
- BroadcastSecondaryLayer timing
- BroadcastGridLayer toggle
- Flow-Curve Editor behavior except for source eligibility

## Required Behavior

### 1. Source Group Ownership

Each playlist must have a source boundary.

Recommended minimal model:

```ts
type PlaylistSourcePolicy = {
  sourceGroupId: string;
  allowCrossGroupAutofill: boolean;
};
```

Recommended playlist fields:

```ts
type PlaylistRecord = {
  playlistId: string;
  title: string;
  sourceGroupId: string;
  allowCrossGroupAutofill?: boolean;
  // existing fields stay unchanged
};
```

Recommended track field:

```ts
type Track = {
  trackId: string;
  sourceGroupId?: string;
  // existing fields stay unchanged
};
```

If the current data model already has equivalent fields, reuse them instead of adding duplicates.

### 2. Import Directly To Playlist

The user must be able to import tracks directly into the active playlist/source group.

Expected behavior:

```text
Import to active playlist
↓
tracks are assigned the active playlist's sourceGroupId
↓
tracks become eligible for that playlist's Fill Missing Time / Regenerate From Curve
↓
tracks do not silently become eligible for unrelated playlists
```

This import may still store tracks in the project, but eligibility must be scoped by source group.

### 3. Automatic Generation Must Be Source-Scoped

The following automatic actions must use source-group eligibility:

- Fill Missing Time
- Regenerate From Curve
- Fill Gap
- any flow-curve assignment / auto-pull behavior

Default eligibility:

```ts
track.sourceGroupId === activePlaylist.sourceGroupId
```

If `allowCrossGroupAutofill === true`, broader sourcing may be allowed, but default must be false.

### 4. Manual Cross-Group Movement Is Allowed

Manual user action remains valid.

Allowed explicit actions:

- drag track from one playlist/group into another playlist
- import file/CSV into a selected playlist
- duplicate playlist as a new version
- intentionally move/copy tracks between groups

When manually adding a track to another playlist, the app must make that track eligible for the destination playlist.

Recommended simple behavior:

- copy the track reference into the destination playlist slots/pool
- assign or mirror the destination playlist `sourceGroupId` for that playlist-specific membership
- do not rely on automatic global pull

### 5. Backward Compatibility / Migration

Existing saved projects must not break.

On load:

- if a playlist lacks `sourceGroupId`, assign one deterministically
- if a track lacks `sourceGroupId`, assign it to the source group of the playlist where it already appears when possible
- if a track appears in multiple playlists, do not destructively rewrite it in a way that breaks existing playlists
- if ambiguity exists, assign to a safe default group and warn in console

Recommended deterministic group ID:

```ts
sourceGroupId = `source-${playlist.playlistId}`
```

### 6. UI Must Indicate Source Boundary Lightly

Do not overbuild UI.

Minimum readable cues:

- active playlist has a source group label or tooltip
- import action makes clear whether it imports to Library or Active Playlist
- Fill/Regenerate should operate within active playlist source group by default

Suggested compact label:

```text
Source: This Playlist
```

Optional tooltip:

```text
Automatic fill and regeneration only use tracks imported or assigned to this playlist group.
```

## Source Eligibility Helper

Create one helper instead of scattering filtering logic.

Recommended file:

```text
src/logic/sourceEligibility.ts
```

Recommended API:

```ts
export function isTrackEligibleForPlaylist(params: {
  track: Track;
  playlist: PlaylistRecord;
}): boolean {
  if (playlist.allowCrossGroupAutofill === true) {
    return true;
  }

  return track.sourceGroupId === playlist.sourceGroupId;
}

export function filterTracksForPlaylist(params: {
  tracks: Track[];
  playlist: PlaylistRecord;
}): Track[] {
  return params.tracks.filter((track) =>
    isTrackEligibleForPlaylist({ track, playlist: params.playlist })
  );
}
```

Adapt names to the existing app types.

## Implementation Notes

### Data Layer

Update project/playlist/track types with source-group fields.

Add migration/repair logic in the existing storage loader that was stabilized by 0621C.

Do not let migration overwrite valid saved project data.

### Logic Layer

Patch all automatic track-pull paths to filter through the source eligibility helper before scoring.

Likely targets:

- Fill Missing Time
- Regenerate From Curve
- Fill Gap
- playlist assignment
- unused eligible track selectors

### Interface Layer

Patch import behavior so active playlist import assigns the active playlist source group.

Add minimal UI copy/tooltip only. Avoid a full source management dashboard in this patch.

## Acceptance Criteria

1. Existing projects load without data loss.
2. Existing playlists receive deterministic `sourceGroupId` values if missing.
3. New playlists receive a unique source group on creation.
4. Imported tracks into an active playlist are assigned to that playlist source group.
5. Fill Missing Time only uses tracks from the active playlist source group by default.
6. Regenerate From Curve only uses tracks from the active playlist source group by default.
7. Tracks from Playlist A are not automatically pulled into Playlist B.
8. Manual drag/add into Playlist B still works as an explicit user action.
9. `allowCrossGroupAutofill` defaults to false.
10. Browser reload still preserves playlists, active playlist, tracks, and source groups.
11. Broadcast HUD remains visually unchanged.
12. TypeScript build passes.

## Regression Tests

### Test 1 — Source Isolation

```text
1. Create Playlist A.
2. Import 3 tracks into Playlist A.
3. Create Playlist B.
4. Import 3 different tracks into Playlist B.
5. Make Playlist A active.
6. Run Fill Missing Time / Regenerate From Curve.
7. Confirm Playlist A only uses Playlist A tracks.
8. Make Playlist B active.
9. Run Fill Missing Time / Regenerate From Curve.
10. Confirm Playlist B only uses Playlist B tracks.
```

### Test 2 — Stream-Safe Protection

```text
1. Create playlist: Stream Safe.
2. Import stream-safe tracks into it.
3. Create playlist: Private / Unsafe.
4. Import non-stream-safe tracks into it.
5. Run automatic fill/regenerate on Stream Safe.
6. Confirm no Private / Unsafe tracks appear.
```

### Test 3 — Manual Explicit Movement

```text
1. Drag one track from Private / Unsafe into Stream Safe manually.
2. Confirm that track appears only because of the explicit user action.
3. Reload browser.
4. Confirm the manual assignment persists.
```

### Test 4 — Reload Persistence

```text
1. Create two playlists with different source groups.
2. Import tracks into each.
3. Reload browser.
4. Confirm both playlists persist.
5. Confirm active playlist persists.
6. Confirm sourceGroupId values persist.
7. Confirm fill/regenerate still respects groups.
```

## Do Not Reopen

Do not reopen these in this patch:

- default Broadcast HUD chart removal
- permanent queue rail removal
- large HUD header removal
- playlist persistence hotfix architecture
- full advanced library rules engine

## Completion Report Requirements

Write a completion report after implementation:

```text
REPORTS/2026-06-21_PLAY_0621E_PlaylistSourceGroupIsolationPatch_COMPLETION_REPORT.md
```

Include:

- files changed
- migration behavior
- source eligibility behavior
- browser persistence verification
- source isolation verification
- TypeScript result
- known risks
- next recommended patch

## Expected Result

PLAYLIST can now protect playlist integrity by ensuring automatic flow-curve actions only use the active playlist's own source group. The user can still manually move music between groups, but hidden automatic playlist generation no longer contaminates stream-safe or tightly curated playlist blocks.

## Implementation Guide

- **Where:** Update playlist/track/project types, storage migration/repair, import handlers, Fill Missing Time, Regenerate From Curve, Fill Gap, playlist assignment, and source eligibility logic.
- **What:** Add source-group IDs, default automatic fill/regeneration to active playlist source only, preserve manual cross-group drag/add, then run `npm run build`.
- **Expect:** Playlist A never auto-pulls from Playlist B unless explicitly allowed; reload persistence survives; Broadcast HUD remains unchanged.
