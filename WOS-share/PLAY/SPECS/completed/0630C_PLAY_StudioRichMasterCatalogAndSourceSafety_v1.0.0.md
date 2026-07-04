---
location: Specs
title: PLAY StudioRich Master Catalog + Source Safety
date: 2026-06-30
status: implementation-spec
scope: "PLAY / library / StudioRich catalog / external references / metadata editing"
target_executor: Claude
tags:
  - play
  - library
  - studiorich
  - catalog
  - metadata
  - source-safety
  - implementation
  - claude
---

# PLAY StudioRich Master Catalog + Source Safety

## Purpose

Establish a safe, editable master catalog system inside PLAY.

The immediate goal is to clearly separate:

```text
StudioRich-owned music
external/reference music
mixed playable playlists
unknown/unclassified tracks
```

PLAY must make it hard to accidentally build the wrong kind of playlist from the wrong source pool.

This spec also begins the path toward making the StudioRich catalog editable enough that the full catalog can eventually live inside PLAY.

---

## Current Context

The Flow Curve tool is now working again after recent fixes:

```text
node deletion works
node guardrails exist
Shift+Click node creation exists
Fill Time no longer freezes curve reaction
curve edits now reassign unlocked playlist slots
manualOrderDirty no longer blocks curve-reactive assignment
```

A future `Reset From Curve` or `Rebuild From Curve` button remains on the watch list, but this pass should focus on catalog safety.

---

## Core Product Rule

PLAY playlists must know what source pool they are allowed to pull from.

A playlist may be:

```text
StudioRich only
external/reference only
mixed StudioRich + external
platform-designated mix, such as Mixcloud-safe/reference-supported
unknown/unclassified review list
```

The user must be able to see and control this source boundary.

---

## Definitions

## StudioRich Master Catalog

Tracks owned/created by StudioRich.

These should be safe for StudioRich-controlled playlists, streams, identity work, archive development, and internal catalog analysis.

## External Reference Catalog

Tracks not owned by StudioRich.

These may be useful for:

```text
listening comparison
reference playlists
Mixcloud-style hosted mixes
mood/mechanical analysis
prompt development
DJ-style research
```

External tracks must not be accidentally treated as owned StudioRich music.

## Mixed Playlist

A playlist intentionally using both StudioRich and external/reference tracks.

Mixed playlists require clear labeling because use cases may differ by platform.

## Unknown Catalog

Tracks with unknown ownership, unknown artist/title, missing metadata, or incomplete source classification.

Unknown tracks should be treated as unsafe until reviewed.

---

## Required Data Model

Add or confirm a source ownership field on Track.

Recommended model:

```ts
export type TrackSourceOwner =
  | "studiorich"
  | "external"
  | "reference"
  | "unknown";
```

Track should support:

```ts
sourceOwner: TrackSourceOwner;
sourceLibrary?: string;
catalogId?: string;
isPlayableOwned?: boolean;
platformUse?: PlatformUse[];
coverImagePath?: string;
mechanicalMoodTags?: string[];
```

Recommended platform use type:

```ts
export type PlatformUse =
  | "internal"
  | "studiorich_stream"
  | "mixcloud"
  | "reference_only"
  | "do_not_publish";
```

Do not overbuild rights management in this pass. This is source safety and catalog separation.

---

## Required Playlist Source Policy

Each playlist should have a source policy.

Recommended:

```ts
export type PlaylistSourcePolicy =
  | "studiorich_only"
  | "external_only"
  | "mixed"
  | "unknown_review";
```

Playlist should support:

```ts
sourcePolicy: PlaylistSourcePolicy;
allowedSourceOwners: TrackSourceOwner[];
```

Examples:

```json
{
  "playlistId": "robot-blips-and-quips",
  "sourcePolicy": "mixed",
  "allowedSourceOwners": ["studiorich", "external", "reference"]
}
```

```json
{
  "playlistId": "studio-rich-only-night-drive",
  "sourcePolicy": "studiorich_only",
  "allowedSourceOwners": ["studiorich"]
}
```

---

## Required UI

## 1. Library Source Filters

Add a clear source filter area:

```text
All
StudioRich
External
Reference
Unknown
```

The user should be able to filter the master library by ownership.

Acceptance:

```text
StudioRich tracks can be isolated.
External/reference tracks can be isolated.
Unknown tracks can be reviewed separately.
```

---

## 2. Playlist Source Policy Control

Each playlist needs a visible source policy.

Recommended placement:

```text
playlist profile / Form
playlist header badge
playlist settings
```

Controls:

```text
Source Policy:
- StudioRich only
- External/reference only
- Mixed
- Unknown review
```

Acceptance:

```text
User can set whether a playlist pulls from StudioRich only, external/reference only, or mixed.
Playlist generation respects the selected policy.
```

---

## 3. Visible Source Badges

Track rows should show source ownership clearly.

Badges:

```text
SR
EXT
REF
UNK
```

Suggested meaning:

```text
SR = StudioRich
EXT = external
REF = reference
UNK = unknown
```

Acceptance:

```text
User can visually tell which rows are StudioRich vs external/reference/unknown.
```

---

## 4. Guard Against Wrong Source Pulls

Playlist generation must respect source policy.

If a playlist is `studiorich_only`, external/reference/unknown tracks should not be assigned unless the user explicitly changes the policy.

If a playlist is `mixed`, the system can use both but should show the mix clearly.

Acceptance:

```text
StudioRich-only playlist cannot accidentally pull external tracks.
Mixed playlist clearly shows mixed source tracks.
Unknown tracks are not used unless policy allows unknown/review.
```

---

## 5. Song Row Edit Panel

Clicking a song row should open an editable track properties panel.

Minimum editable fields:

```text
title
artist
sourceOwner
sourceLibrary
catalogId
bpm
camelotKey
durationSeconds
energy
filePath
coverImagePath
notes
```

Preferred extra fields:

```text
genre
mood tags
mechanical mood tags
density
vocal presence
rating
platform use
```

Acceptance:

```text
Clicking a row opens a track editor.
User can update title/artist/sourceOwner.
User can add or change cover image path/reference.
User can update metadata for unknown tracks.
Changes persist in project/catalog state.
```

---

## 6. Unknown Metadata Review

Unknown tracks need a dedicated review workflow.

Unknown if:

```text
title is missing
artist is missing
title is "?"
artist is "?"
title contains "unknown"
artist contains "unknown"
sourceOwner is "unknown"
```

Required:

```text
Unknown filter
editable row/profile panel
bulk ownership update
bulk artist/title update if already implemented
```

Acceptance:

```text
Unknown tracks can be found quickly.
Unknown metadata can be corrected.
Unknown tracks can be moved into StudioRich, external, or reference ownership.
```

---

## 7. Cover Support

StudioRich catalog entries should be able to hold a cover.

This can be lightweight in this pass.

Required field:

```ts
coverImagePath?: string;
```

UI:

```text
cover preview if available
cover path/input or attach/select control if existing asset picker exists
```

Do not build a full asset manager in this pass.

Acceptance:

```text
Track can store a cover image reference.
Cover survives save/load/export if those systems are touched.
```

---

## 8. Mechanical Mood Analysis Placeholder

The user wants automated analysis later to determine mechanical moods.

Do not implement analysis yet unless an existing local analyzer already exists.

Add safe fields/placeholders:

```ts
mechanicalMoodTags?: string[];
analysisStatus?: "not_analyzed" | "manual" | "auto_pending" | "auto_complete";
```

UI:

```text
show mood tags if present
allow manual tags if simple
button may be disabled/placeholder: Analyze later
```

Acceptance:

```text
Catalog has a place to store mechanical mood analysis later.
No fake analysis is generated.
```

---

## 9. Save / Export Safety

If the project has JSON save/export, preserve new fields:

```text
sourceOwner
sourceLibrary
catalogId
coverImagePath
platformUse
mechanicalMoodTags
analysisStatus
playlist sourcePolicy
allowedSourceOwners
```

Acceptance:

```text
Source ownership does not disappear after save/load.
Playlist policy does not disappear after save/load.
```

---

## 10. Preserve Existing Flow Curve Behavior

Do not regress:

```text
point select/delete
Shift+Click point add
Fill Time
curve-reactive reassignment
node guardrails
warning threshold changes
orphan behavior
locked songs
M3U export
```

Acceptance:

```text
Catalog work does not break Flow Curve planning.
```

---

## Verification Checklist

Before reporting complete:

```text
[ ] App builds.
[ ] Track model supports sourceOwner.
[ ] Playlist model supports sourcePolicy or allowed source owners.
[ ] Library can filter StudioRich tracks.
[ ] Library can filter external/reference tracks.
[ ] Library can filter unknown tracks.
[ ] Track rows show source badge.
[ ] Playlist generation respects StudioRich-only policy.
[ ] Mixed playlist can include StudioRich + external/reference tracks intentionally.
[ ] Unknown tracks are excluded unless allowed.
[ ] Clicking a song row opens track editor.
[ ] User can edit title/artist/sourceOwner.
[ ] User can add/edit cover image reference.
[ ] Mechanical mood fields/placeholders exist without fake analysis.
[ ] Save/load/export preserve new catalog fields if touched.
[ ] Flow Curve still edits and reassigns playlist normally.
```

---

## Explicit Non-Goals

Do not implement:

```text
audio analysis engine
automatic mood classification
waveform analysis
beatgrid analysis
rights management system
cloud database
full asset manager
OBS/WOS/WALL changes
Colorlab palette work
Scheduler redesign
```

---

## Claude Completion Report Required

When complete, report:

```text
Status: complete / partial / blocked

Files changed:
- path
- path

What changed:
- StudioRich master catalog structure
- external/reference separation
- playlist source policy
- row edit panel
- unknown metadata review
- cover support
- mechanical mood placeholders

Verification:
- build result
- StudioRich-only filter result
- mixed policy result
- unknown edit result
- row editor result
- save/load/export result if touched
- Flow Curve regression check

Remaining blockers:
- list or none

Do not reopen:
- StudioRich ownership must remain distinct from external/reference tracks.
- Unknown tracks must be reviewable and not silently treated as owned music.
- Playlist generation must respect source policy.
- Mechanical mood analysis is a placeholder unless a real analyzer exists.
```

---

## Claude Prompt

Use this prompt with Claude from the main project folder:

```text
Implement 0630C_PLAY_StudioRichMasterCatalogAndSourceSafety_v1.0.0.md.

Work in the active PLAY source.

Primary goals:
1. Establish a StudioRich master catalog distinction from external/reference music.
2. Add or confirm sourceOwner on tracks: studiorich, external, reference, unknown.
3. Add playlist source policies: StudioRich only, external/reference only, mixed, unknown review.
4. Make playlist generation respect source policy.
5. Add visible source badges on track rows.
6. Add library filters for StudioRich, external/reference, and unknown tracks.
7. Add row-click editable track properties for title, artist, sourceOwner, metadata, and cover reference.
8. Add safe placeholders for future mechanical mood analysis.
9. Preserve existing Flow Curve behavior.

Do not add audio analysis, waveform analysis, rights management, WOS/WALL/MAPS, Colorlab, Scheduler, or Canvas work.

Return a completion report with files changed, verification results, blockers, and do-not-reopen notes.
```
