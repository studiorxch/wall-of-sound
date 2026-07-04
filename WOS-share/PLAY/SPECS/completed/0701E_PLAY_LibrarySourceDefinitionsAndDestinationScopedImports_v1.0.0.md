---
location: Specs
title: PLAY Library Source Definitions + Destination-Scoped Imports
date: 2026-07-01
status: implementation-spec
scope: "PLAY / libraries / imports / source definitions / scan-rescan"
target_executor: Claude
tags:
  - play
  - library
  - imports
  - catalog
  - studiorich
  - external
  - source-definition
  - implementation
  - claude
---

# PLAY Library Source Definitions + Destination-Scoped Imports

## Purpose

Reset the import model.

The previous generic import behavior is hard to find and easy to route incorrectly. Imports should be paired directly with their destination. A user should never have to guess where imported tracks will land.

Each library, playlist, and group should own its own import actions.

---

## Core Decision

```text
Imports are destination-scoped.
A StudioRich import goes to StudioRich Catalog.
An External import goes to External.
A Reference import goes to Reference.
A playlist import goes to that playlist.
A group import goes to that group.
```

Do not use one ambiguous global import action as the primary workflow.

---

## Current Problem

The app currently has library source rows, but importing is not obvious or destination-safe.

Observed issue:

```text
StudioRich Catalog source row exists, but selecting it shows no tracks.
The Import button has been moved somewhere hard to find.
The user cannot tell whether an import will affect StudioRich, External, Reference, a Playlist, or a Group.
```

This blocks catalog work and analyzer work.

---

## Required UX Model

## 1. Each Library Source Has Its Own Import / Scan Controls

In the left panel, each source library should expose contextual controls.

Recommended:

```text
LIBRARIES
  StudioRich Catalog    [count]   ⋯
  External              [count]   ⋯
  Reference             [count]   ⋯
  Unknown Review        [count]
  All Tracks            [count]
```

Each `⋯` menu should include destination-specific actions.

For StudioRich Catalog:

```text
Import Catalog CSV
Link Audio Folder
Scan
Re-scan
Analyze Library
Import Report
Source Settings
```

For External:

```text
Import External CSV
Link Audio Folder
Scan
Re-scan
Analyze Library
Import Report
Source Settings
```

For Reference:

```text
Import Reference CSV
Import M3U / Playlist
Scan
Re-scan
Import Report
Source Settings
```

Unknown Review should not import directly unless explicitly needed. It is a review bucket.

Acceptance:

```text
User can import directly into StudioRich Catalog.
User can import directly into External.
User can import directly into Reference.
No ambiguity about destination.
```

---

## 2. Define Library Sources Before Importing

Add a source-definition model.

Recommended type:

```ts
export type LibrarySourceKind =
  | "studiorich_catalog"
  | "external_library"
  | "reference_library"
  | "playlist"
  | "group"
  | "unknown_review";

export interface LibrarySourceDefinition {
  id: string;
  label: string;
  kind: LibrarySourceKind;
  sourceOwner: "studiorich" | "external" | "reference" | "unknown";
  sourceLibrary: string;
  catalogCsvPath?: string;
  audioFolderPath?: string;
  allowedImportTypes: Array<"csv" | "audio_folder" | "m3u" | "json">;
  defaultPlatformUse: string[];
  defaultAnalysisStatus: "not_analyzed" | "partial" | "analyzed" | "stale" | "failed";
  lastScannedAt?: string;
  lastImportReportId?: string;
}
```

Seed definitions:

```ts
StudioRich Catalog:
  kind = "studiorich_catalog"
  sourceOwner = "studiorich"
  sourceLibrary = "StudioRich Catalog"
  catalogCsvPath = "/Users/studio/Projects/wall-of-sound/data/catalog/studiorich/catalog_v2.csv"
  defaultPlatformUse = ["internal", "studiorich_stream"]
  defaultAnalysisStatus = "partial"

External:
  kind = "external_library"
  sourceOwner = "external"
  sourceLibrary = "External"
  defaultPlatformUse = ["mixcloud", "reference_only"]
  defaultAnalysisStatus = "partial"

Reference:
  kind = "reference_library"
  sourceOwner = "reference"
  sourceLibrary = "Reference"
  defaultPlatformUse = ["reference_only"]
  defaultAnalysisStatus = "partial"
```

Acceptance:

```text
PLAY has explicit source definitions.
Imports read destination defaults from the selected source definition.
```

---

## 3. StudioRich Catalog Import Path

StudioRich Catalog must know its catalog path:

```text
/Users/studio/Projects/wall-of-sound/data/catalog/studiorich/catalog_v2.csv
```

StudioRich import defaults:

```ts
sourceOwner = "studiorich";
sourceLibrary = "StudioRich Catalog";
platformUse = ["internal", "studiorich_stream"];
analysisStatus = "partial";
analysisSources = ["import", "external_tool"];
```

Acceptance:

```text
Click StudioRich Catalog -> Import Catalog CSV imports into StudioRich Catalog.
Click StudioRich Catalog -> Scan/Re-scan reloads or refreshes that source.
StudioRich Catalog count becomes 358 after successful import.
Clicking StudioRich Catalog shows the imported StudioRich rows.
```

---

## 4. External / Reference Must Have Separate Paths

External and Reference must not share the StudioRich defaults.

External defaults:

```ts
sourceOwner = "external";
sourceLibrary = "External";
platformUse = ["mixcloud", "reference_only"];
analysisStatus = "partial";
analysisSources = ["import", "external_tool"];
```

Reference defaults:

```ts
sourceOwner = "reference";
sourceLibrary = "Reference";
platformUse = ["reference_only"];
analysisStatus = "partial";
analysisSources = ["import", "external_tool"];
```

Acceptance:

```text
External imports land in External.
Reference imports land in Reference.
External/reference tracks never become StudioRich-owned unless explicitly changed.
```

---

## 5. Playlist Imports Are Playlist-Scoped

A playlist import should be attached to the current playlist, not to the whole library by default.

Playlist import actions:

```text
Import M3U to this playlist
Import CSV to this playlist
Add tracks from library
```

Playlist import should preserve source ownership of existing catalog tracks.

If an imported playlist references tracks not in the catalog, create them as:

```ts
sourceOwner = "unknown";
sourceLibrary = "Playlist Import";
platformUse = ["do_not_publish"];
analysisStatus = "not_analyzed";
```

Acceptance:

```text
Playlist imports populate the selected playlist.
They do not pollute StudioRich Catalog unless explicitly matched to StudioRich tracks.
```

---

## 6. Group Imports Are Group-Scoped

Groups should have their own import/add workflow.

Group actions:

```text
Import CSV to group
Add selected tracks to group
Scan group source
Re-scan group source
```

Acceptance:

```text
Group imports attach tracks to the group context.
They do not change sourceOwner unless explicitly intended.
```

---

## 7. Scan / Re-scan Model

Every source should support scan state.

Recommended:

```ts
export interface LibraryScanReport {
  id: string;
  sourceId: string;
  startedAt: string;
  completedAt?: string;
  status: "running" | "complete" | "failed";
  importedCount: number;
  updatedCount: number;
  rejectedCount: number;
  missingAudioCount?: number;
  unmappedFields?: string[];
  errors?: string[];
}
```

Actions:

```text
Scan = read source path and import/update rows
Re-scan = refresh existing rows, preserve user corrections where possible
Analyze Library = run mechanical analyzer after import/scan
```

Acceptance:

```text
Scan/re-scan are visible per source.
Import reports show result counts.
Re-scan does not silently destroy corrections.
```

---

## 8. Audio Folder Linking Is Source-Scoped

Audio folders should attach to a library source.

StudioRich:

```text
StudioRich Catalog -> Link Audio Folder
```

External:

```text
External -> Link Audio Folder
```

Reference:

```text
Reference -> optional, if files exist
```

Matching order:

```text
1. Audio Filename exact match
2. Suno ID in filename
3. normalized title
4. normalized title + artist
```

Stored fields:

```ts
filePath?: string;
fileName?: string;
fileExtension?: string;
audioLinked?: boolean;
audioMissing?: boolean;
```

Acceptance:

```text
Audio linkage is source-specific.
Missing audio count is reported per source.
```

---

## 9. Remove or Demote Ambiguous Global Import

If a global Import button remains, it must open a destination picker first.

Required picker:

```text
Import into:
- StudioRich Catalog
- External
- Reference
- Current Playlist
- Selected Group
```

No file picker should open before destination selection.

Acceptance:

```text
Global import cannot import without explicit destination.
```

---

## 10. Preserve Existing Behavior

Do not regress:

```text
Flow Curve
playlist generation
source policy enforcement
TrackEditorPanel
mechanicalMoodAnalyzer
analyzer job states
left panel source filters
M3U export
```

Do not touch:

```text
8x24 mood chart
WOS/WALL/MAPS
Scheduler
OBS
Colorlab
Canvas/Studio
```

---

## Verification Checklist

Before reporting complete:

```text
[ ] App builds.
[ ] Library source definitions exist.
[ ] StudioRich Catalog has destination-scoped import controls.
[ ] External has destination-scoped import controls.
[ ] Reference has destination-scoped import controls.
[ ] Global Import is removed or requires destination selection first.
[ ] StudioRich Catalog imports from catalog_v2.csv.
[ ] StudioRich Catalog count becomes 358.
[ ] Clicking StudioRich Catalog shows tracks.
[ ] External import does not create StudioRich tracks.
[ ] Reference import does not create StudioRich tracks.
[ ] Playlist import attaches to selected playlist only.
[ ] Source scan/re-scan actions are visible.
[ ] Import report shows counts/errors/unmapped fields.
[ ] Analyze Library can run after StudioRich import.
[ ] 8x24 mood chart remains untouched.
```

---

## Explicit Non-Goals

Do not implement:

```text
8x24 mood chart integration
mood chart color routing
full audio analyzer
Mixxx database sync
new scheduler
WOS/WALL/MAPS work
OBS changes
Colorlab changes
Canvas/Studio changes
new playlist assignment algorithm
```

---

## Claude Completion Report Required

When complete, report:

```text
Status: complete / partial / blocked

Files changed:
- path
- path

Source definitions:
- StudioRich Catalog
- External
- Reference
- Playlist
- Group

Import behavior:
- destination-specific buttons/menus
- global import removal/demotion
- StudioRich import result
- External/reference routing
- scan/re-scan behavior
- import report behavior

Verification:
- build result
- StudioRich count
- StudioRich visible rows
- no source ownership contamination
- analyzer still works
- Flow Curve regression check

Remaining blockers:
- list or none

Do not reopen:
- Imports must be destination-scoped.
- StudioRich import must land only in StudioRich Catalog.
- External import must land only in External.
- Reference import must land only in Reference.
- Global import must not open a file picker before destination selection.
- 8x24 mood chart remains out of scope.
```

---

## Claude Prompt

Use this prompt with Claude from the main project folder:

```text
Implement 0701E_PLAY_LibrarySourceDefinitionsAndDestinationScopedImports_v1.0.0.md.

Work in the active PLAY source.

Primary goals:
1. Reset the import model so imports are destination-scoped.
2. Add explicit library source definitions for StudioRich Catalog, External, Reference, playlist, group, and unknown review.
3. Give StudioRich Catalog its own import/scan/re-scan/analyze controls.
4. Give External and Reference their own import/scan/re-scan/analyze controls.
5. Use /Users/studio/Projects/wall-of-sound/data/catalog/studiorich/catalog_v2.csv as the StudioRich source path.
6. StudioRich imports must set sourceOwner=studiorich and sourceLibrary="StudioRich Catalog".
7. External imports must set sourceOwner=external and sourceLibrary="External".
8. Reference imports must set sourceOwner=reference and sourceLibrary="Reference".
9. Playlist imports must target the selected playlist and not pollute StudioRich Catalog.
10. Group imports must target the selected group.
11. Remove or demote ambiguous global Import. If it remains, it must ask for destination before any file picker opens.
12. Add scan/re-scan/import report behavior per source.
13. After StudioRich import, clicking StudioRich Catalog must show 358 tracks.
14. Preserve TrackEditorPanel, mechanicalMoodAnalyzer, analyzer job states, source policy behavior, and Flow Curve.
15. Do not touch 8x24 mood chart, WOS/WALL/MAPS, Scheduler, OBS, Colorlab, or Canvas/Studio.

Return a completion report with files changed, source definitions, import behavior, scan/re-scan behavior, verification results, blockers, and do-not-reopen notes.
```
