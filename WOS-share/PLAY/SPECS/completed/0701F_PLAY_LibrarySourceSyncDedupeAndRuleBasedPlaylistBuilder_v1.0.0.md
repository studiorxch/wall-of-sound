---
location: Specs
title: PLAY Library Source Sync + Deduplication + Rule-Based Playlist Builder
date: 2026-07-01
status: implementation-spec
scope: "PLAY / library source sync / catalog dedupe / audio folder linking / playlist creation"
target_executor: Claude
tags:
  - play
  - library
  - sync
  - dedupe
  - catalog
  - playlist-builder
  - studiorich
  - implementation
  - claude
---

# PLAY Library Source Sync + Deduplication + Rule-Based Playlist Builder

## Purpose

Correct the current import/source model after 0701E.

The destination-scoped import direction is correct, but the current implementation still behaves like one-time CSV appends. This caused the StudioRich Catalog to duplicate from 358 to 716 after using `Load Seed Data`.

The next pass must turn library imports into **source syncs**, not blind appends, and introduce a way to create playlists from StudioRich Catalog using rules/filters instead of only importing playlist CSVs.

---

## Current Problems

```text
StudioRich Catalog duplicated from 358 to 716 after Load Seed Data.
Load Seed Data appears to append instead of upsert.
CSV import is still a one-time import, not a linked source that can update.
There is no proper directory/audio folder link for source scanning.
Some tracks show NO PATH because audio files are not linked.
Analyze Library is visible, but its expected behavior is unclear.
Playlist creation currently depends too much on importing CSVs.
There is no clear way to build a playlist from StudioRich Catalog using rules/filters.
```

---

## Core Decisions

```text
Library source import must be sync/upsert, not append.
Each source needs a defined catalog path and optional audio folder path.
Scan/Re-scan should update the existing source without duplicating tracks.
Load Seed Data must not duplicate existing seed rows.
Audio folder linking is separate from catalog CSV import.
Playlists should be creatable from StudioRich Catalog rules/filters.
```

---

# Part 1 — Fix StudioRich Duplication

## 1. Add Stable Catalog Identity / Upsert Key

Every imported StudioRich row needs a stable identity.

Preferred upsert key order:

```text
1. catalogId / Suno ID
2. Audio Filename
3. normalized title + normalized artist + duration
4. generated stable import key from sourceId + row hash
```

Recommended helper:

```ts
getTrackUpsertKey(track, sourceDefinition)
```

Acceptance:

```text
Loading the same StudioRich catalog twice does not duplicate tracks.
StudioRich Catalog remains 358 tracks after repeated Load Seed Data / Scan / Re-scan.
```

---

## 2. Replace Append With Upsert For Source Imports

For source library imports:

```text
existing row with same upsert key -> update
new row with no match -> insert
missing row from source -> mark missing/stale, do not delete automatically
```

Do not blindly append.

Recommended scan result fields:

```ts
importedCount: number; // new rows
updatedCount: number;  // existing rows updated
unchangedCount: number;
staleCount: number;
duplicateSkippedCount: number;
rejectedCount: number;
```

Acceptance:

```text
Importing catalog_v2.csv again updates/skips existing rows.
No duplicate StudioRich tracks are created.
```

---

## 3. Add Dedupe Repair Action

Because current local state may already have duplicates, add a repair action.

StudioRich Catalog menu:

```text
Repair Duplicates
```

Behavior:

```text
detect duplicate tracks by upsert key
merge duplicate records
preserve user edits where possible
preserve playlist references where possible
remove duplicate rows from active library
```

Merge priority:

```text
1. user-corrected fields
2. latest analysis fields
3. linked audio path
4. imported metadata
5. seed/default values
```

Acceptance:

```text
StudioRich Catalog can be repaired from 716 back to 358 unique rows.
Duplicate repair report shows merged/removed counts.
```

---

# Part 2 — Define Source Sync Instead Of One-Time CSV Import

## 4. Library Source Definition Must Store Paths

StudioRich source definition should store:

```ts
catalogCsvPath = "/Users/studio/Projects/wall-of-sound/data/catalog/studiorich/catalog_v2.csv";
audioFolderPath?: string;
```

External and Reference should have their own separate source definitions and paths.

Acceptance:

```text
Each source knows where its catalog data comes from.
Each source can be scanned/re-scanned without asking the user to re-pick the same CSV every time.
```

---

## 5. Source Actions

Each library source menu should show:

For StudioRich Catalog:

```text
Set Catalog CSV Path
Scan Catalog
Re-scan Catalog
Link Audio Folder
Scan Audio Folder
Re-scan Audio Folder
Analyze Library
Repair Duplicates
Import Report
Source Settings
```

For External:

```text
Set External CSV Path
Scan Catalog
Re-scan Catalog
Link Audio Folder
Scan Audio Folder
Analyze Library
Import Report
Source Settings
```

For Reference:

```text
Set Reference CSV Path
Scan Catalog
Re-scan Catalog
Import M3U
Import Report
Source Settings
```

Acceptance:

```text
The user can set source paths once, then scan/re-scan from the source menu.
```

---

## 6. Audio Folder Linking

Catalog CSV import should not be expected to provide playable paths unless the CSV has valid file paths.

Add source-specific audio folder linking.

Matching order:

```text
1. Audio Filename exact match
2. Suno ID contained in filename
3. normalized title exact match
4. normalized title + normalized artist
```

Track fields:

```ts
filePath?: string;
fileName?: string;
fileExtension?: string;
audioLinked?: boolean;
audioMissing?: boolean;
audioLastScannedAt?: string;
```

Acceptance:

```text
NO PATH appears only for tracks whose audio file is not linked.
Scan Audio Folder updates audioLinked/audioMissing.
Missing audio count appears in source import report.
```

---

## 7. Clarify Analyze Library Behavior

Analyze Library should operate on the selected source.

For StudioRich Catalog:

```text
run catalog-derived mechanical mood analyzer on StudioRich rows
use imported fields
do not fake audio analysis
mark mechanicalAnalysisStatus partial/analyzed based on available signals
```

If audio is not linked:

```text
catalog-derived analysis can still run
audio-derived analysis is skipped/unavailable
```

Acceptance:

```text
Analyze Library can run before audio files are linked, but only as catalog-derived analysis.
The UI clearly says whether results are catalog-derived or audio-derived.
```

---

# Part 3 — Rule-Based Playlist Creation From Catalog

## 8. Add “Create Playlist From Catalog” Flow

The user should not need to import a playlist CSV to make playlists.

Add a playlist creation path:

```text
Create New Playlist
Create From StudioRich Catalog
Create From External
Create From Current Library Filter
Create Empty Playlist
```

The StudioRich path should open a builder panel.

---

## 9. Rule-Based Playlist Builder

The builder should allow selecting rules/filters from the catalog.

Minimum filters:

```text
sourceOwner
sourceLibrary
duration target
BPM range
key / scale
energy range
rating minimum
mechanicalMoodTags
primaryMood
moodTags
focusCategory
genre
grouping
hasCover
audioLinked / noPath
analysisStatus
mechanicalAnalysisStatus
```

Minimum playlist rules:

```text
target duration
track count
curve shape
allowed source owners
required mechanical moods
excluded moods/tags
min/max BPM
min/max energy
allow unknown metadata yes/no
prefer audioLinked yes/no
```

Acceptance:

```text
User can create a playlist from StudioRich Catalog without importing a playlist CSV.
Playlist rows are selected from catalog tracks using filters/rules.
```

---

## 10. Flow Curve Integration

When creating from rules, allow:

```text
Create Playlist
Create + Fit To Current Flow Curve
Create + Fill Time
```

Behavior:

```text
rules produce candidate pool
Flow Curve assignment orders/selects candidates
source policy still applies
locked/excluded tracks still respected
```

Acceptance:

```text
Rule-built playlists can use Flow Curve.
Flow Curve does not need to import CSV to build a playlist.
```

---

## 11. Prevent Catalog Pollution From Playlist Creation

Playlist creation from rules should reference catalog tracks.

It should not duplicate catalog tracks into the library.

Acceptance:

```text
Creating playlists does not increase StudioRich Catalog count.
Playlist contains references to existing catalog tracks.
```

---

# Verification Checklist

Before reporting complete:

```text
[ ] App builds.
[ ] StudioRich Catalog duplicates are repairable.
[ ] Load Seed Data no longer duplicates StudioRich rows.
[ ] Scan Catalog uses upsert, not append.
[ ] Re-scan Catalog preserves user corrections where possible.
[ ] StudioRich Catalog can return to 358 unique rows.
[ ] Source definition stores catalogCsvPath.
[ ] Audio folder can be linked per source.
[ ] NO PATH is based on actual audio linkage state.
[ ] Analyze Library runs catalog-derived mechanical analysis.
[ ] Analyze Library does not fake audio-derived results.
[ ] Create Playlist From Catalog flow exists.
[ ] Rule-based playlist builder exists.
[ ] Playlist can be created from StudioRich Catalog without CSV import.
[ ] Creating playlist does not duplicate catalog tracks.
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
Mixxx database sync
new scheduler
WOS/WALL/MAPS work
OBS changes
Colorlab changes
Canvas/Studio changes
```

---

# Claude Completion Report Required

When complete, report:

```text
Status: complete / partial / blocked

Files changed:
- path
- path

Catalog/source sync:
- upsert key strategy
- duplicate repair behavior
- scan/re-scan behavior
- StudioRich count before/after repair
- path storage behavior

Audio folder linking:
- source-specific linking
- matching rules
- missing audio count

Analyzer:
- catalog-derived behavior
- audio-derived unavailable behavior

Playlist builder:
- create from catalog flow
- filters/rules available
- Flow Curve integration
- no catalog duplication

Verification:
- build result
- StudioRich count
- no duplicate import
- source policy regression
- Flow Curve regression

Remaining blockers:
- list or none

Do not reopen:
- Source imports must upsert, not append.
- Load Seed Data must not duplicate tracks.
- Source paths must be stored per library source.
- Audio folder linking is source-scoped.
- Playlists should be creatable from catalog rules, not only CSV import.
- 8x24 chart remains out of scope.
```

---

# Claude Prompt

Use this prompt with Claude from the main project folder:

```text
Implement 0701F_PLAY_LibrarySourceSyncDedupeAndRuleBasedPlaylistBuilder_v1.0.0.md.

Work in the active PLAY source.

Primary goals:
1. Fix StudioRich duplicate issue caused by Load Seed Data / import appending rows.
2. Add stable upsert keys for imported tracks using Suno ID/catalogId, Audio Filename, normalized title+artist+duration, then source row hash fallback.
3. Change source library imports/scans to upsert, not append.
4. Add Repair Duplicates action for StudioRich Catalog and source libraries.
5. Ensure StudioRich Catalog can return to 358 unique rows after repair.
6. Store catalogCsvPath and audioFolderPath per LibrarySourceDefinition.
7. Add source-scoped Set Catalog CSV Path, Scan Catalog, Re-scan Catalog, Link Audio Folder, Scan Audio Folder, Re-scan Audio Folder, Analyze Library, Repair Duplicates, Import Report, Source Settings actions.
8. Implement source-scoped audio folder linking with matching by Audio Filename, Suno ID, normalized title, normalized title+artist.
9. Clarify Analyze Library as catalog-derived mechanical analysis unless audio analyzer is connected.
10. Add Create Playlist From Catalog flow.
11. Add rule-based playlist builder using StudioRich Catalog filters/rules, including mechanicalMoodTags, BPM, energy, duration, mood tags, genre, grouping, rating, audioLinked, and analysis status.
12. Allow rule-built playlist to Create, Create + Fit To Current Flow Curve, or Create + Fill Time.
13. Ensure creating playlists references catalog tracks and does not duplicate catalog rows.
14. Preserve Flow Curve, source policy, TrackEditorPanel, mechanicalMoodAnalyzer, and analyzer job states.
15. Do not touch the 8x24 mood chart, WOS/WALL/MAPS, Scheduler, OBS, Colorlab, or Canvas/Studio.

Return a completion report with files changed, dedupe/upsert behavior, source path behavior, audio folder linking behavior, analyzer behavior, playlist builder behavior, verification results, blockers, and do-not-reopen notes.
```
