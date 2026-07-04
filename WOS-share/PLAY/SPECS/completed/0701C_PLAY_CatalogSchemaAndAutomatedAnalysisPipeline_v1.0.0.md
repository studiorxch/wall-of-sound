---
location: Specs
title: PLAY Catalog Schema + Automated Analysis Pipeline
date: 2026-07-01
status: implementation-spec
scope: "PLAY / catalog database / metadata schema / automated analysis placeholders / track editor"
target_executor: Claude
tags:
  - play
  - catalog
  - metadata
  - analyzer
  - mixxx
  - mechanical-moods
  - implementation
  - claude
---

# PLAY Catalog Schema + Automated Analysis Pipeline

## Purpose

Add the needed catalog properties now, without delaying the catalog foundation.

PLAY already has a catalog. The immediate need is to extend the catalog data model so StudioRich tracks can carry richer metadata, while recognizing that many fields should be filled by automated analysis later, not hand-entered one by one.

This pass should add the catalog fields, editing surfaces, and analysis-status structure. It should not require manual entry before tracks can be imported or used.

---

## Core Decision

```text
Add the fields now.
Allow editing for correction.
Do not require manual entry.
Automated analyzers should populate BPM, key, energy, mechanical moods, and similar derived fields.
```

Manual editing exists for correction and review, not as the primary data-entry workflow.

---

## Current Principle

Mixxx is a useful comparison:

```text
Mixxx supports manual/contextual analysis.
BPM and key are not normally entered manually track-by-track.
PLAY should follow the same expectation.
```

PLAY should support automated catalog analysis later through analyzer actions such as:

```text
Analyze Track
Analyze Selected
Analyze Library
Reanalyze
```

But this pass does not need to build the full audio analyzer unless one already exists.

---

## Required Catalog Fields

Add or confirm these fields on the Track/catalog model.

### 1. Identity Metadata

```ts
title?: string;
artist?: string;
album?: string;
albumArtist?: string;
genre?: string;
year?: number;
trackNumber?: number;
comment?: string;
notes?: string;
```

### 2. File / Asset Metadata

```ts
filePath?: string;
fileName?: string;
fileExtension?: string;
durationSeconds?: number;
coverImagePath?: string;
artworkStatus?: "missing" | "linked" | "embedded" | "generated" | "unknown";
```

### 3. DJ / Mixxx-Compatible Metadata

```ts
bpm?: number;
camelotKey?: string;
musicalKey?: string;
rating?: number;
cuePoints?: Array<{
  id: string;
  timeSeconds: number;
  label?: string;
  type?: "cue" | "loop" | "hotcue" | "marker";
}>;
```

### 4. PLAY Source Safety Metadata

```ts
sourceOwner: "studiorich" | "external" | "reference" | "unknown";
sourceLibrary?: string;
catalogId?: string;
platformUse?: Array<
  | "internal"
  | "studiorich_stream"
  | "mixcloud"
  | "reference_only"
  | "do_not_publish"
>;
```

### 5. Flow Curve / Playlist Metadata

```ts
energy?: number;
density?: number;
vocalPresence?: number;
introStrength?: number;
outroStrength?: number;
transitionUse?: "opener" | "bridge" | "hold" | "reset" | "closer" | "unknown";
```

### 6. Mechanical Mood Metadata

```ts
mechanicalMoodTags?: MechanicalMoodTag[];
mechanicalMoodConfidence?: Record<string, number>;
```

Recommended initial type:

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

### 7. Analysis Status Metadata

```ts
analysisStatus?: "not_analyzed" | "partial" | "analyzed" | "stale" | "failed";
analysisSources?: Array<"import" | "manual" | "mixxx" | "play_analyzer" | "external_tool">;
analysisUpdatedAt?: string;
analysisVersion?: string;
analysisErrors?: string[];
```

---

## Required Track Editor Behavior

The Track Editor should exist and be easy to open.

Required entrypoints:

```text
click track row
double-click track row
row action: Edit
```

The editor should allow changes to all catalog fields, but should visually separate:

```text
Editable identity fields
Automated analysis fields
Source safety fields
Mechanical mood fields
File/artwork fields
```

### Important UX Rule

Automated fields should be editable, but not treated as expected manual work.

For fields such as:

```text
BPM
Key
Energy
Density
Mechanical moods
Cue points
```

show a status such as:

```text
Not analyzed
Analyzed
Manual override
Stale
```

Acceptance:

```text
User can edit any field when needed.
User is not expected to manually fill analyzer-derived fields.
Automated/analyzed fields are clearly labeled.
```

---

## Required Analyzer Placeholder Actions

Add analyzer actions as UI placeholders if the actual analyzer does not exist yet.

Actions:

```text
Analyze Track
Analyze Selected
Analyze Library
Reanalyze
```

If the analyzer is not implemented, actions may be disabled or show:

```text
Analyzer not connected yet.
```

Do not fake results.

Acceptance:

```text
The catalog UI makes room for automated analysis.
No fake BPM/key/mood data is generated.
```

---

## Mechanical Mood Tags Are Analysis Targets

Mechanical mood tags should be part of the catalog schema now.

They should be filled later by analysis using available features such as:

```text
BPM
energy
density
key behavior
duration
intro/outro shape
dynamic arc
spectral brightness
rhythmic steadiness
vocal presence
manual corrections
playlist performance history
```

Mechanical moods bridge into richer tags later:

```text
Mechanical Mood = what the track does in flow.
Emotional Mood = what the track feels like.
Visual Mood = what the track suggests visually.
```

Do not collapse these into one tag system.

---

## Import Behavior

When importing StudioRich catalog data, default missing fields safely.

StudioRich defaults:

```ts
sourceOwner = "studiorich";
sourceLibrary = "StudioRich Catalog";
analysisStatus = "not_analyzed";
platformUse = ["internal", "studiorich_stream"];
```

External/reference defaults:

```ts
sourceOwner = "reference";
sourceLibrary = "External Reference";
analysisStatus = "not_analyzed";
platformUse = ["reference_only", "mixcloud"];
```

Unknown defaults:

```ts
sourceOwner = "unknown";
analysisStatus = "not_analyzed";
platformUse = ["do_not_publish"];
```

Acceptance:

```text
Imported tracks can be used immediately.
Missing analyzer-derived data does not block import.
Unknown ownership is not silently treated as StudioRich-owned.
```

---

## Data Safety / Persistence

Preserve new catalog fields in:

```text
project state
save/load
export/import JSON
playlist records if track snapshots are stored
```

If fields are unsupported in a path, report the blocker.

Acceptance:

```text
Catalog fields survive refresh/save/load where persistence exists.
```

---

## Verification Checklist

Before reporting complete:

```text
[ ] App builds.
[ ] Track model includes catalog fields.
[ ] MechanicalMoodTag type exists.
[ ] analysisStatus fields exist.
[ ] Track editor opens from row click or action.
[ ] Track editor shows identity fields.
[ ] Track editor shows source safety fields.
[ ] Track editor shows analysis-derived fields with status.
[ ] Analyzer actions exist as real or disabled placeholders.
[ ] No fake analysis results are generated.
[ ] Imported StudioRich tracks default to sourceOwner=studiorich.
[ ] Unknown tracks default to do_not_publish.
[ ] Save/load/export preserves new fields if touched.
[ ] Flow Curve and playlist generation still work.
```

---

## Explicit Non-Goals

Do not implement in this pass unless already available:

```text
full audio analyzer
BPM detection
key detection
waveform rendering
beatgrid analysis
automatic mood classifier
cloud database
Mixxx database sync
rights management system
WOS/WALL/MAPS changes
OBS integration
Colorlab work
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
- catalog fields
- mechanical mood tag type
- analysis status model
- track editor exposure
- analyzer placeholder actions
- import defaults

Verification:
- build result
- row editor result
- field persistence result
- analyzer placeholder result
- import default result
- Flow Curve regression check

Remaining blockers:
- list or none

Do not reopen:
- Analyzer-derived fields should not require manual entry.
- Manual editing exists for correction, not first-pass catalog filling.
- Do not fake automated analysis.
- StudioRich ownership remains distinct from external/reference/unknown.
```

---

## Claude Prompt

Use this prompt with Claude from the main project folder:

```text
Implement 0701C_PLAY_CatalogSchemaAndAutomatedAnalysisPipeline_v1.0.0.md.

Work in the active PLAY source.

Primary goals:
1. Add the full catalog metadata properties needed for StudioRich and external/reference tracks.
2. Include Mixxx-compatible metadata fields such as title, artist, album, genre, BPM, key, rating, duration, comments, cover art, and cue points where safe.
3. Add PLAY-specific source safety fields: sourceOwner, sourceLibrary, catalogId, platformUse.
4. Add mechanicalMoodTags and mechanicalMoodConfidence fields.
5. Add analysisStatus / analysisSources / analysisUpdatedAt / analysisVersion / analysisErrors fields.
6. Make Track Editor clearly accessible from row click/double-click/action.
7. Show automated/analyzed fields as editable but analyzer-derived.
8. Add disabled or real analyzer actions: Analyze Track, Analyze Selected, Analyze Library, Reanalyze.
9. Set safe import defaults for StudioRich, external/reference, and unknown tracks.
10. Preserve Flow Curve behavior and playlist source policy behavior.

Do not implement fake analysis. Do not require manual entry for BPM/key/energy/mechanical moods before catalog import. Do not touch WOS/WALL/MAPS, Scheduler, OBS, Colorlab, or Canvas/Studio.

Return a completion report with files changed, verification results, blockers, and do-not-reopen notes.
```
