---
location: Specs
title: PLAY StudioRich Catalog Import + Analyzer First Pass
date: 2026-07-01
status: implementation-spec
scope: "PLAY / StudioRich catalog import / analyzer groundwork"
target_executor: Claude
tags:
  - play
  - catalog
  - studiorich
  - analyzer
  - import
  - mechanical-moods
  - implementation
  - claude
---

# PLAY StudioRich Catalog Import + Analyzer First Pass

## Purpose

Before integrating the 8x24 mood chart, make sure the StudioRich catalog is actually inside PLAY and begin the analyzer workflow.

The mood chart should wait. The immediate priority is:

```text
1. Import the StudioRich catalog into PLAY.
2. Preserve all existing catalog fields.
3. Confirm StudioRich source ownership and source policy behavior.
4. Build the analyzer entrypoint/workflow first.
5. Begin producing or preparing mechanical mood analysis from catalog/audio features.
```

Do not integrate the 8x24 mood chart in this pass.

---

## Source File

Use the existing StudioRich catalog CSV:

```text
/Users/studio/Projects/wall-of-sound/data/catalog/studiorich/catalog_v2.csv
```

Expected row count:

```text
358 tracks
```

Default import metadata:

```ts
sourceOwner = "studiorich";
sourceLibrary = "StudioRich Catalog";
platformUse = ["internal", "studiorich_stream"];
analysisStatus = "partial";
analysisSources = ["import", "external_tool"];
```

`analysisStatus: partial` must be stored as catalog data, not only a comment.

---

## Core Decision

```text
Catalog first.
Analyzer second.
8x24 mood chart later.
```

Mechanical moods should be developed first as analyzer output or analyzer-ready output. The 8x24 mood chart should not be touched until the catalog + analyzer path is stable.

---

## Required Changes

## 1. Import StudioRich Catalog Into PLAY

Create or update the PLAY catalog import path so `catalog_v2.csv` can be loaded into the PLAY catalog.

Acceptance:

```text
StudioRich Catalog appears in PLAY.
StudioRich Catalog count equals 358 tracks.
All imported tracks are sourceOwner=studiorich.
All imported tracks are sourceLibrary="StudioRich Catalog".
No imported StudioRich track is treated as external/reference/unknown unless source data explicitly requires it.
```

---

## 2. Preserve CSV Columns

Preserve all useful CSV fields, even if PLAY does not fully use them yet.

Known fields include:

```text
Suno ID
Title
Audio Filename
Duration
BPM
Key
Scale
Loudness
Rhythm Density
Percussive Shape
Energy Level
groove
Phrase Length
Album Artist
Grouping
Genre
Album/EP
Artist
Year
Has Cover
Mood Coverage
Focus Category
coord_x
coord_y
energy_norm
brightness_norm
mood_1
mood_2
mood_3
mood_confidence
mood_1_color
last_updated
```

If a field does not have a first-class model property yet, preserve it under an import/source metadata object.

Recommended:

```ts
importMetadata?: Record<string, string | number | boolean | null>;
```

Acceptance:

```text
No useful catalog columns are silently discarded.
Unmapped fields are reported in the completion report.
```

---

## 3. Map Core Fields

Map the obvious fields into first-class catalog properties:

```text
Suno ID -> sunoId and/or catalogId
Title -> title
Artist -> artist
Album Artist -> albumArtist
Album/EP -> album
Genre -> genre
Year -> year
Duration -> durationSeconds
BPM -> bpm
Key -> musicalKey
Scale -> scale
Audio Filename -> fileName
Has Cover -> artworkStatus / hasCover
Focus Category -> focusCategory
Grouping -> grouping
last_updated -> catalogUpdatedAt or analysisUpdatedAt
```

Also map analysis-like fields:

```text
Energy Level -> energyLevel
energy_norm -> energy
brightness_norm -> brightness
Rhythm Density -> rhythmDensity
Percussive Shape -> percussiveShape
groove -> groove
Phrase Length -> phraseLength
mood_1 / mood_2 / mood_3 -> importedMoodCandidates
mood_confidence -> importedMoodConfidence
Mood Tags -> importedMoodTags or moodTags
Primary Mood -> primaryMood
Mood Coverage -> moodCoverage
```

Acceptance:

```text
TrackEditorPanel can display imported values.
Playlist generation can access BPM, duration, energy, sourceOwner, and rating where available.
```

---

## 4. Analyzer Workflow Before Mood Chart

Replace disabled placeholder-only behavior with an analyzer workflow shell.

Required UI actions:

```text
Analyze Track
Analyze Selected
Analyze Library
Reanalyze
```

If no audio analyzer exists yet, the actions should run a safe stub that updates a clear job state, not fake musical results.

Analyzer job states:

```ts
type AnalyzerJobStatus =
  | "idle"
  | "queued"
  | "running"
  | "complete"
  | "failed"
  | "not_connected";
```

Track-level analyzer state:

```ts
analysisStatus?: "not_analyzed" | "partial" | "analyzed" | "stale" | "failed";
analysisUpdatedAt?: string;
analysisVersion?: string;
analysisErrors?: string[];
```

Acceptance:

```text
Analyzer actions are real UI actions.
If the analyzer is unavailable, the UI reports "Analyzer not connected yet."
No fake BPM/key/mood output is generated.
```

---

## 5. Analyzer First Pass: Catalog-Derived Mechanical Mood Preparation

Begin the mechanical mood analyzer as a catalog-derived analyzer, using existing imported catalog fields only.

This first pass does not need to inspect audio yet.

Use fields like:

```text
BPM
Duration
energy_norm
brightness_norm
Energy Level
Rhythm Density
Percussive Shape
groove
Phrase Length
Loudness
Focus Category
Primary Mood
Mood Tags
mood_1 / mood_2 / mood_3
mood_confidence
```

Produce or prepare:

```ts
mechanicalMoodTags?: MechanicalMoodTag[];
mechanicalMoodConfidence?: Record<string, number>;
mechanicalAnalysisStatus?: "not_analyzed" | "partial" | "analyzed" | "stale" | "failed";
mechanicalAnalysisSources?: Array<"catalog_import" | "play_catalog_analyzer" | "manual_correction">;
mechanicalAnalysisNotes?: string[];
```

MechanicalMoodTag type:

```ts
export type MechanicalMoodTag =
  | "opener"
  | "closer"
  | "bridge"
  | "reset"
  | "lift"
  | "drop"
  | "hold"
  | "drift"
  | "pulse"
  | "tension"
  | "release"
  | "build"
  | "plateau"
  | "recovery"
  | "transition"
  | "anchor"
  | "disruptor"
  | "deepener"
  | "brightener"
  | "shadow";
```

Acceptance:

```text
Mechanical mood analysis can run from catalog fields.
Output is marked partial unless enough confidence exists.
The analyzer shows which source fields informed the result.
No 8x24 mood chart fields are produced in this pass.
```

---

## 6. Analyzer Must Be Inspectable

For any analyzed track, the editor should expose:

```text
mechanicalMoodTags
mechanicalMoodConfidence
mechanicalAnalysisStatus
mechanicalAnalysisSources
mechanicalAnalysisNotes
```

The UI should make clear:

```text
These are analyzer-derived.
Edit only to correct.
```

Acceptance:

```text
User can see why a track received mechanical tags.
User can correct mechanical tags later.
Analyzer-derived values are not presented as unquestionable truth.
```

---

## 7. Keep 8x24 Mood Chart Out

Do not implement these fields yet:

```text
moodChartGroups
moodChartIntensity
moodChartCandidates
moodChartIds
8x24 color routing
8x24 chart import
```

Those belong to a later integration after the StudioRich catalog and analyzer path are stable.

Acceptance:

```text
No 8x24 mood chart integration appears in this pass.
```

---

## Verification Checklist

Before reporting complete:

```text
[ ] App builds.
[ ] catalog_v2.csv imports into PLAY.
[ ] StudioRich Catalog count is 358.
[ ] Imported tracks are sourceOwner=studiorich.
[ ] Imported tracks are sourceLibrary="StudioRich Catalog".
[ ] analysisStatus is stored as "partial".
[ ] Core fields map correctly.
[ ] Unmapped fields are preserved or reported.
[ ] TrackEditorPanel shows imported catalog data.
[ ] Analyzer actions exist and run safe job states.
[ ] Analyzer unavailable state is clear if no analyzer is connected.
[ ] No fake BPM/key/mood data is generated.
[ ] Mechanical mood analyzer/prep can run from catalog fields.
[ ] Mechanical analysis output is marked partial when appropriate.
[ ] 8x24 mood chart is not integrated.
[ ] Flow Curve still works.
[ ] Source policy still works.
```

---

## Explicit Non-Goals

Do not implement:

```text
8x24 mood chart integration
mood chart color routing
full audio analysis if not already available
waveform rendering
beatgrid editor
Mixxx database sync
WOS/WALL/MAPS work
OBS integration
Colorlab work
Scheduler redesign
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

Catalog import:
- source path
- imported row count
- rejected row count
- StudioRich Catalog count
- unmapped fields

Analyzer:
- actions added
- job state behavior
- connected / not connected behavior
- mechanical mood output behavior

Verification:
- build result
- import result
- editor display result
- Flow Curve regression check
- source policy regression check

Remaining blockers:
- list or none

Do not reopen:
- 8x24 mood chart is not part of this pass.
- Catalog import comes before mood chart integration.
- Analyzer-derived values should not require manual entry.
- Do not fake analysis output.
- StudioRich ownership must remain distinct from external/reference/unknown.
```

---

## Claude Prompt

Use this prompt with Claude from the main project folder:

```text
Implement 0701D_PLAY_StudioRichCatalogImportAndAnalyzerFirstPass_v1.0.0.md.

Work in the active PLAY source.

Primary goals:
1. Import /Users/studio/Projects/wall-of-sound/data/catalog/studiorich/catalog_v2.csv into PLAY as the StudioRich Catalog.
2. Confirm StudioRich Catalog count is 358.
3. Set sourceOwner=studiorich, sourceLibrary="StudioRich Catalog", platformUse=["internal","studiorich_stream"], analysisStatus="partial", analysisSources=["import","external_tool"] for imported rows.
4. Map core catalog fields into first-class track fields.
5. Preserve useful unmapped CSV columns in importMetadata or report them.
6. Make TrackEditorPanel show imported catalog data clearly.
7. Add real analyzer workflow actions/job states for Analyze Track, Analyze Selected, Analyze Library, Reanalyze.
8. If analyzer is not connected, report "Analyzer not connected yet" and do not generate fake results.
9. Begin a catalog-derived mechanical mood analyzer/prep path using existing fields such as BPM, energy_norm, brightness_norm, groove, Percussive Shape, Phrase Length, Focus Category, Primary Mood, Mood Tags, mood_1/mood_2/mood_3, and mood_confidence.
10. Store mechanicalMoodTags, mechanicalMoodConfidence, mechanicalAnalysisStatus, mechanicalAnalysisSources, and mechanicalAnalysisNotes when available.
11. Do not integrate the 8x24 mood chart in this pass.
12. Preserve Flow Curve and source policy behavior.

Do not fake BPM/key/mood analysis. Do not touch WOS/WALL/MAPS, Scheduler, OBS, Colorlab, Canvas/Studio, or the 8x24 mood chart.

Return a completion report with files changed, import counts, field mapping summary, analyzer behavior, verification results, blockers, and do-not-reopen notes.
```
