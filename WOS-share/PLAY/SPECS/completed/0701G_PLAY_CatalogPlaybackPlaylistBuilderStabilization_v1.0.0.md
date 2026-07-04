---
location: Specs
title: PLAY Catalog Playback + Playlist Builder Stabilization
date: 2026-07-01
status: implementation-spec
scope: "PLAY / catalog playback / playlist builder / suggested moods / NaN timing / source menu readability"
target_executor: Claude
tags:
  - play
  - catalog
  - playback
  - playlist-builder
  - audio-linking
  - suggested-moods
  - bugfix
  - implementation
  - claude
---

# PLAY Catalog Playback + Playlist Builder Stabilization

## Purpose

Stabilize the current StudioRich catalog workflow after source sync, dedupe, audio folder linking, and rule-based playlist creation.

The catalog is now imported, deduped, and audio-linked, but the user cannot reliably audition tracks, suggested moods disappeared after re-suggesting, playlists created from filters/rules do not play, one playlist shows `NaN`, and the StudioRich source action menu is unreadable because long labels stretch or clip the menu.

This pass is a stabilization pass. Do not touch the 8x24 mood chart.

---

## Current Problems

```text
1. StudioRich source menu options are unreadable because menu width/content is clipped or stretched by the first item.
2. Catalog tracks cannot be played/auditioned from the catalog table.
3. Linked audio cannot be confirmed by playback even after Link Audio Folder reports linked files.
4. Suggested moods were previously filled, but disappeared after Re-suggest Moods.
5. User cannot restore suggested moods after re-suggesting.
6. Playlists created from catalog filters/rules contain tracks but do not play.
7. One generated playlist shows NaN / NaN:NaN timing values.
8. Playlist builder can create playlists, but the result is not yet reliable enough for music selection.
```

---

## Core Decision

```text
Catalog must support auditioning.
Audio linkage must produce playable object URLs or playable local paths.
Playlist builder must reference catalog tracks without corrupting timing.
Suggested moods must be persistent, recoverable, and not cleared by failed re-suggestion.
NaN must never render in the playlist table or transport.
```

---

# Part 1 — Fix Source Menu Readability

## 1. Prevent Menu Clipping / Overstretching

The StudioRich source menu currently has unreadable items. The first item appears to stretch or clip the menu.

Required CSS/UX:

```text
menu has a readable min-width
menu has a max-width
long labels wrap or ellipsize safely
menu aligns inside viewport
menu is scrollable if too tall
menu does not get clipped by left sidebar overflow
```

Recommended CSS behavior:

```css
.fm-source-dropdown {
  min-width: 240px;
  max-width: 340px;
  white-space: normal;
  overflow-wrap: anywhere;
  z-index: high enough;
}

.fm-source-action {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
```

Acceptance:

```text
All StudioRich source menu options are readable.
Long labels like "Re-scan Audio Folder (354 linked, 4 missing)" do not break the menu.
```

---

# Part 2 — Catalog Track Audition Playback

## 2. Add Play/Audition From Catalog Rows

The user must be able to play tracks directly from the StudioRich Catalog table.

Required behavior:

```text
Click row play button -> plays that catalog track
Double-click row -> optional audition behavior
Player dock updates with title/artist/duration
If file is linked, audio plays
If file is missing, show clear error
```

Acceptance:

```text
A linked catalog track can be played directly from the catalog view.
A missing catalog track shows "Audio file not linked" or equivalent.
```

---

## 3. Make Audio Linking Actually Playable

Current linking may set `audioLinked`, but playback still fails. Fix the playback source resolution.

For browser folder linking, store:

```ts
audioFile?: File;
objectUrl?: string;
fileName?: string;
filePath?: string;
relativePath?: string;
audioLinked?: boolean;
audioMissing?: boolean;
```

If object URLs are used:

```text
create URL.createObjectURL(file)
revoke old URLs when replacing/removing
store object URL in runtime-only map if needed
```

If persistent local path is used through a dev backend, resolve through that backend.

Acceptance:

```text
Linked files become playable, not just labeled linked.
NO PATH and playback error states reflect real audio availability.
```

---

## 4. Audio Link Report Must Distinguish “Matched” From “Playable”

Update audio link report fields:

```ts
matchedCount: number;
playableCount: number;
missingCount: number;
duplicateFileMatches: number;
unmatchedFiles: number;
```

Acceptance:

```text
Report makes clear whether tracks are merely matched or actually playable.
```

---

# Part 3 — Fix Suggested Moods Loss

## 5. Re-suggest Moods Must Not Destructively Clear Existing Suggestions

Problem:

```text
Suggested moods were filled across the library.
After Re-suggest Moods, they disappeared and could not be restored.
```

Required behavior:

```text
Re-suggest should calculate new suggestions first.
If calculation succeeds, replace suggestions.
If calculation fails or returns empty, keep previous suggestions.
Do not clear existing suggestions unless user explicitly chooses Clear Suggested Moods.
```

Acceptance:

```text
Running Re-suggest Moods never wipes existing suggestions on failure.
```

---

## 6. Preserve Imported Mood Fields Separately From Suggested Moods

Separate fields:

```ts
importedMoodTags?: string[];
importedMoodCandidates?: string[];
importedMoodConfidence?: number | Record<string, number>;
suggestedMoodTags?: string[];
suggestedMoodConfidence?: Record<string, number>;
mechanicalMoodTags?: MechanicalMoodTag[];
mechanicalMoodConfidence?: Record<string, number>;
```

Important:

```text
Imported mood fields are source truth.
Suggested mood fields are PLAY-derived.
Mechanical mood fields are structural analyzer output.
```

Acceptance:

```text
Re-suggesting PLAY moods does not delete imported mood data.
```

---

## 7. Add Restore Suggested Moods Action

Add safe recovery actions:

```text
Restore Suggestions From Import
Restore Suggestions From Mechanical Moods
Clear Suggested Moods
Re-suggest Moods
```

Acceptance:

```text
User can recover useful suggestions without re-importing the catalog.
```

---

# Part 4 — Fix Playlist Playback From Catalog Builder

## 8. Generated Playlists Must Reference Real Catalog Tracks

Rule-built playlists should reference existing catalog tracks by `trackId`, not clone incomplete copies.

Required:

```text
playlist row stores trackId reference
track display resolves from catalog by trackId
playback resolves from catalog track audio
duration resolves from catalog track duration
BPM/key/energy resolves from catalog track fields
```

Acceptance:

```text
Creating playlist from catalog does not create duplicate or broken tracks.
Generated playlist tracks are playable if the catalog source track is playable.
```

---

## 9. Fix NaN Timing

NaN appears in at least one generated playlist.

Never render:

```text
NaN
NaN:NaN
undefined:undefined
```

Common causes:

```text
durationSeconds missing or string parsing failed
playlist slot start time not calculated
track duration field using "2:42" string without conversion
playlist row contains cloned object with missing duration
```

Required:

```text
normalize durationSeconds during import and playlist creation
support mm:ss string parsing
fallback to 0 only internally, but display "—" for unknown duration
skip time accumulation for invalid durations or show warning
```

Acceptance:

```text
No NaN appears in Time, Duration, transport, or playlist totals.
```

---

## 10. Playlist Builder Validation

Before creating a playlist, validate:

```text
tracks have valid trackId
duration is valid or marked unknown
audioLinked state is known
BPM/energy fields are valid or warning-marked
```

If invalid:

```text
show warnings in builder preview
allow creation if non-critical
do not produce NaN
```

Acceptance:

```text
Builder preview catches bad rows before playlist creation.
```

---

# Part 5 — Improve Catalog-Based Playlist Creation

## 11. Add “Audition + Add” Workflow

Catalog should allow:

```text
play/audition track
add to current playlist
replace selected playlist slot
lock into playlist
exclude from playlist
```

Acceptance:

```text
User can listen to a catalog track and add it to a playlist without CSV import.
```

---

## 12. Build From Catalog Should Support Playable Filter

Add filter:

```text
Playable only
Audio linked only
Missing audio
```

Acceptance:

```text
User can build playlists only from playable/linked StudioRich tracks.
```

---

# Verification Checklist

Before reporting complete:

```text
[ ] App builds.
[ ] StudioRich source menu is readable.
[ ] Long source menu labels do not clip/stretch.
[ ] Linked catalog tracks can play from catalog view.
[ ] Missing audio tracks show clear playback error.
[ ] Audio link report distinguishes matched vs playable.
[ ] Re-suggest Moods does not wipe existing suggestions on failure.
[ ] Imported mood fields remain preserved.
[ ] Restore Suggestions actions exist.
[ ] Generated playlists reference catalog trackIds.
[ ] Generated playlists can play linked tracks.
[ ] NaN never appears in table/transport/totals.
[ ] Duration parsing supports seconds and mm:ss strings.
[ ] Builder preview flags invalid rows.
[ ] Playable-only/audio-linked filter exists.
[ ] Flow Curve still works.
[ ] Source policy still works.
[ ] 8x24 mood chart remains untouched.
```

---

# Explicit Non-Goals

Do not implement:

```text
8x24 mood chart integration
mood chart color routing
full audio waveform analysis
beatgrid editor
Mixxx database sync
WOS/WALL/MAPS changes
OBS changes
Colorlab changes
Canvas/Studio changes
Scheduler redesign
```

---

# Claude Completion Report Required

When complete, report:

```text
Status: complete / partial / blocked

Files changed:
- path
- path

Menu readability:
- source menu clipping fix
- long label behavior

Playback:
- catalog audition behavior
- audio source resolution
- matched vs playable behavior
- missing audio error behavior

Suggested moods:
- destructive re-suggest prevention
- restore suggestion actions
- imported vs suggested vs mechanical field separation

Playlist builder:
- track reference behavior
- NaN fix
- duration normalization
- playable-only filter
- generated playlist playback result

Verification:
- build result
- catalog playback test
- generated playlist playback test
- NaN regression check
- source policy regression
- Flow Curve regression

Remaining blockers:
- list or none

Do not reopen:
- Source menu must remain readable.
- Linked audio must be playable, not just marked linked.
- Re-suggest Moods must not destructively clear existing suggestions.
- Generated playlists must reference catalog tracks and must not produce NaN.
- 8x24 mood chart remains out of scope.
```

---

# Claude Prompt

Use this prompt with Claude from the main project folder:

```text
Implement 0701G_PLAY_CatalogPlaybackPlaylistBuilderStabilization_v1.0.0.md.

Work in the active PLAY source.

Primary goals:
1. Fix StudioRich source menu readability so all source actions are readable and long labels do not clip/stretch.
2. Add playable audition from catalog rows.
3. Make linked audio actually playable, not just marked audioLinked.
4. Distinguish matched tracks from playable tracks in the audio link report.
5. Fix Re-suggest Moods so it never wipes existing suggestions on failure or empty result.
6. Preserve imported mood fields separately from suggested moods and mechanical moods.
7. Add Restore Suggestions From Import / Restore Suggestions From Mechanical Moods / Clear Suggested Moods actions.
8. Ensure rule-built playlists reference existing catalog trackIds rather than cloning incomplete tracks.
9. Fix NaN timing by normalizing durationSeconds and parsing mm:ss strings.
10. Ensure generated playlists can play linked catalog tracks.
11. Add builder filters for Playable only / Audio linked / Missing audio.
12. Add audition + add workflow from catalog to playlist.
13. Preserve Flow Curve, source policy, TrackEditorPanel, mechanicalMoodAnalyzer, analyzer job states.
14. Do not touch the 8x24 mood chart, WOS/WALL/MAPS, Scheduler, OBS, Colorlab, or Canvas/Studio.

Return a completion report with files changed, menu fixes, playback behavior, suggested mood safeguards, playlist builder fixes, NaN verification, generated playlist playback verification, blockers, and do-not-reopen notes.
```
