# 0624E_PLAY_AudioAnalysisFieldsAndMoodSuggestionBridgePatch_v1.0.0_PATCH

## Status

Ready for implementation.

## Priority

P0 / Catalog Intelligence Bridge

This patch imports and exposes analyzer-derived audio fields from the StudioRich CSV catalog, then uses those fields to generate editable mood suggestions.

The key distinction:

```text
moodTags = confirmed catalog moods
moodSuggestions = analyzer-derived suggestions, not yet approved
```

Do not pretend analyzer fields are moods. Use them as a suggestion layer.

---

## Active Project Paths

Use the relocated PLAY location.

```text
WOS root:
  /Users/studio/Projects/wall-of-sound

PLAY root:
  /Users/studio/Projects/wall-of-sound/play

PLAY app:
  /Users/studio/Projects/wall-of-sound/play/flow-curve-builder

PLAY source:
  /Users/studio/Projects/wall-of-sound/play/flow-curve-builder/src
```

Do not write new PLAY changes to:

```text
/Users/studio/Projects/play
```

That path is legacy/inactive.

---

## Source Context

Continuity Rollup is current as of:

```text
PLAY/CURRENT/PLAY_CURRENT.md
PLAY/CURRENT/PLAY_BUILD_STATUS.md
PLAY/CURRENT/PLAY_DECISIONS.md
PLAY/CURRENT/PLAY_DO_NOT_REOPEN.md
PLAY/CURRENT/PLAY_SOURCE_INDEX.md
PLAY/REPORTS/rollups/2026-06-23_to_2026-06-24_PLAY_CONTINUITY_ROLLUP.md
```

Prior completed chain:

```text
0624A = Source Pool + Playlist Template creation
0624B = Source Pools corrected into Library Groups / metadata
0624C = Bulk metadata + mood catalog foundation
0624D = Library filters + template source filters
```

---

## Problem

The uploaded StudioRich analyzer CSV contains many useful audio-analysis fields, but it does **not** contain confirmed moods.

The catalog currently has:

```text
audio-character data
not mood labels
```

Analyzer fields may include:

```text
actual_bpm
bpm_confidence
actual_key
key_confidence
camelot
tempo_family
energy_score
energy_level
rms_mean
rms_peak
dynamic_range
onset_density
transient_density
spectral_centroid
spectral_rolloff
zero_crossing_rate
brightness
density
sample_rate
channels
beats_detected
analysis_version
```

These are useful for suggesting moods, but they are not moods themselves.

---

## Goal

Add an audio-analysis bridge:

```text
CSV analyzer fields
→ Track audioAnalysis fields
→ moodSuggestions
→ user applies suggestions to moodTags
→ moods become confirmed catalog metadata
```

This patch should make analyzer data visible and useful without turning it into irreversible automated mood tagging.

---

## Product Lock

```text
Library = central catalog
Mood Tags = confirmed user/catalog metadata
Mood Suggestions = analyzer-derived candidates
Rating = future generation weight
Grouping = Mixxx-compatible library group / crate marker
Source Owner = catalog ownership/source protection
Template Source Filters = operational catalog rules
```

---

## Data Model Updates

### 1. Add analyzer fields to `Track`

Target file:

```text
src/data/trackTypes.ts
```

Add fields:

```ts
export type TrackAudioAnalysis = {
  actualBpm?: number;
  bpmConfidence?: number;
  actualKey?: string;
  keyConfidence?: number;
  camelot?: string;
  tempoFamily?: string;

  energyScore?: number;
  energyLevel?: string | number;

  rmsMean?: number;
  rmsPeak?: number;
  dynamicRange?: number;

  onsetDensity?: number;
  transientDensity?: number;

  spectralCentroid?: number;
  spectralRolloff?: number;
  zeroCrossingRate?: number;

  brightness?: number;
  density?: number;

  sampleRate?: number;
  channels?: number;
  beatsDetected?: number;

  analysisVersion?: string;
};

export type Track = {
  // existing fields preserved

  audioAnalysis?: TrackAudioAnalysis;

  moodTags?: string[];          // confirmed moods
  moodSuggestions?: string[];   // generated suggestions, unconfirmed
};
```

If adding nested `audioAnalysis` creates too much TypeScript churn, flat fields are acceptable, but nested is preferred for clarity.

---

## CSV Import Updates

Target file:

```text
src/data/importCsv.ts
```

Map analyzer CSV columns into `audioAnalysis`.

Column mapping:

| CSV Column | Internal Field |
|---|---|
| `actual_bpm` | `audioAnalysis.actualBpm` |
| `bpm_confidence` | `audioAnalysis.bpmConfidence` |
| `actual_key` | `audioAnalysis.actualKey` |
| `key_confidence` | `audioAnalysis.keyConfidence` |
| `camelot` | `audioAnalysis.camelot` |
| `tempo_family` | `audioAnalysis.tempoFamily` |
| `energy_score` | `audioAnalysis.energyScore` |
| `energy_level` | `audioAnalysis.energyLevel` |
| `rms_mean` | `audioAnalysis.rmsMean` |
| `rms_peak` | `audioAnalysis.rmsPeak` |
| `dynamic_range` | `audioAnalysis.dynamicRange` |
| `onset_density` | `audioAnalysis.onsetDensity` |
| `transient_density` | `audioAnalysis.transientDensity` |
| `spectral_centroid` | `audioAnalysis.spectralCentroid` |
| `spectral_rolloff` | `audioAnalysis.spectralRolloff` |
| `zero_crossing_rate` | `audioAnalysis.zeroCrossingRate` |
| `brightness` | `audioAnalysis.brightness` |
| `density` | `audioAnalysis.density` |
| `sample_rate` | `audioAnalysis.sampleRate` |
| `channels` | `audioAnalysis.channels` |
| `beats_detected` | `audioAnalysis.beatsDetected` |
| `analysis_version` | `audioAnalysis.analysisVersion` |

Also continue preserving 0624C metadata fields:

```text
title
artist
album_artist
album
year
composer
genre
grouping
rating
duration
source_owner
moodTags
```

---

## Storage Repair

Target file:

```text
src/data/playProjectStorage.ts
```

Repair rules:

```text
audioAnalysis: existing value or undefined
moodSuggestions: existing array or []
moodTags: existing array or []
```

Do not overwrite confirmed moods.

Do not convert moodSuggestions into moodTags during repair.

---

## Mood Suggestion Logic

Add new helper:

```text
src/logic/moodSuggestions.ts
```

Suggested API:

```ts
export function suggestMoodsFromAnalysis(track: Track): string[];
```

Rules:

- Suggestions are deterministic.
- Suggestions are explainable.
- Suggestions should use only local audio-analysis metadata.
- No AI classification.
- No external lookup.
- Return a small list: 1–4 suggestions.
- Do not overwrite `moodTags`.

Suggested heuristic starting points:

```text
high energy + high density + high brightness
→ Energetic / Intense / Restless

low energy + low density + low brightness
→ Quiet / Still / Subdued

medium energy + high brightness + low density
→ Dreamy / Ethereal / Weightless

high transient_density or onset_density
→ Mechanical / Restless / Percussive

low dynamic_range + high density
→ Hypnotic / Mechanical

high spectral_centroid or brightness
→ Radiant / Luminous / Bright

low brightness + medium/high density
→ Dark / Brooding / Haunting

tempo_family = fast
→ Energetic / Restless

tempo_family = slow
→ Calm / Quiet
```

Use existing mood vocabulary where possible:

```text
Dreamy
Ethereal
Hypnotic
Mechanical
Restless
Intense
Quiet
Still
Subdued
Dark
Haunting
Radiant
Calm
```

Avoid overfitting.

---

## Suggestion Confidence / Explanation

Optional if low-risk:

```ts
export type MoodSuggestionResult = {
  mood: string;
  reason: string;
};
```

If this becomes too large, only store `moodSuggestions: string[]`.

Do not block this patch on explanations.

---

## UI Updates

Target file:

```text
src/ui/MainTrackWindow.tsx
```

### 1. Add Mood column

Fix the visible issue from 0624D:

Current:

```text
Title / Mood
```

Required:

```text
Title | Artist | Mood | Suggested | Grouping | Genre | BPM | Key | E | Dur
```

Mood must be its own column.

### 2. Add Suggested column

Show analyzer-derived suggestions separately from confirmed moods.

Example:

```text
Mood: —
Suggested: Hypnotic · Mechanical
```

or:

```text
Mood: Dreamy
Suggested: Ethereal · Weightless
```

Do not style suggestions as confirmed mood tags.

Use a dimmer chip style.

### 3. Add mood coverage count

Show catalog coverage:

```text
Mooded: 0 / 393
Suggested: 393 / 393
Unmooded: 393
```

or compact:

```text
0 mooded · 393 suggested · 393 unmooded
```

### 4. Add Unmooded filter

Add filter button/dropdown:

```text
Unmooded
```

Meaning:

```text
tracks where moodTags is empty
```

This helps the user work through the catalog.

### 5. Add Apply Suggestions action

Add action for selected tracks:

```text
Apply Suggestions to Moods
```

Behavior:

```text
selected tracks
→ moodTags += moodSuggestions
→ Set-deduped
→ moodSuggestions remain or can remain visible
```

Do not replace existing moods unless user explicitly chooses replace later.

---

## App Handlers

Target file:

```text
src/App.tsx
```

Add handlers:

```ts
handleGenerateMoodSuggestionsForTracks(trackIds?: string[]): void;
handleApplyMoodSuggestionsToTracks(trackIds: string[]): void;
```

Minimum:

- Generate suggestions on import/repair automatically if `audioAnalysis` exists and `moodSuggestions` missing/empty.
- Apply suggestions only through explicit user action.

---

## Import-Time Suggestion Generation

When CSV imports analyzer fields:

```text
if track has audioAnalysis and no confirmed moodTags:
  generate moodSuggestions
```

Do not auto-fill `moodTags`.

If `moodTags` already exist:

```text
keep moodTags
still allow moodSuggestions if useful
```

---

## Template / Generation Behavior

Do not use moodSuggestions for template filters by default.

Template source filters should match confirmed `moodTags`.

Optional toggle later:

```text
include suggestions
```

Not in this patch.

This prevents unapproved suggestions from steering generated playlists.

---

## Library Filters

Target file:

```text
src/logic/libraryFilters.ts
```

Update filters:

- `mood` filter should use confirmed `moodTags`.
- Add optional `hasMood?: boolean`.
- Add optional `hasMoodSuggestions?: boolean`.

Suggested type addition:

```ts
hasMood?: "any" | "mooded" | "unmooded";
hasMoodSuggestions?: boolean;
```

Minimum required:

```text
Unmooded filter in UI
```

---

## Non-Goals

Do not implement these in this patch:

- old Mood Map canvas
- mood terrain visualization
- automatic confirmed mood tagging
- AI mood classification
- external music lookup
- album art upload
- full Mixxx DB import
- rating-weighted generation
- recently-used avoidance
- mood-driven visuals
- Smart Grid mood behavior
- WOS postMessage
- snapshot button
- waveform or beatgrid display

---

## Implementation Targets

Likely files:

```text
src/data/trackTypes.ts
src/data/importCsv.ts
src/data/playProjectStorage.ts
src/logic/trackMetadata.ts
src/logic/libraryFilters.ts
src/logic/moodSuggestions.ts
src/ui/MainTrackWindow.tsx
src/App.tsx
src/styles.css
```

Optional:

```text
src/data/audioAnalysisTypes.ts
```

if Track type becomes too large.

---

## Acceptance Criteria

### A. Analyzer fields import

Given `Music_Catalog_365.csv`, PLAY imports audio-analysis fields into tracks.

At least these fields should be visible in Project JSON:

```text
actualBpm
bpmConfidence
actualKey
keyConfidence
tempoFamily
energyScore
energyLevel
brightness
density
onsetDensity
transientDensity
dynamicRange
analysisVersion
```

---

### B. Confirmed moods stay separate

Imported analyzer fields must not automatically become confirmed `moodTags`.

Expected:

```text
moodTags: []
moodSuggestions: ["Hypnotic", "Mechanical"]
```

---

### C. Mood suggestions generate

Tracks with analyzer fields receive 1–4 `moodSuggestions`.

---

### D. Mood column is separate

Track table must show:

```text
Title | Mood | Suggested
```

not:

```text
Title / Mood
```

---

### E. Unmooded filter works

User can filter tracks with no confirmed moods.

---

### F. Apply Suggestions works

Selecting tracks and applying suggestions should add suggestions into confirmed `moodTags`.

Expected:

```text
before:
moodTags: []
moodSuggestions: ["Hypnotic", "Mechanical"]

after:
moodTags: ["Hypnotic", "Mechanical"]
moodSuggestions: ["Hypnotic", "Mechanical"]
```

---

### G. Project JSON round-trip

After applying suggestions:

```text
export Project JSON
clear LocalStorage
import Project JSON
```

confirmed moods and suggestions survive.

---

### H. Template filters still use confirmed moods

Template mood filters should match `moodTags`, not `moodSuggestions`.

---

### I. 0624A/B/C/D behavior does not regress

Must still work:

```text
Project JSON export/import
Library Groups compact row
playlistRole template/generated/static
templateSourceFilters
Create Playlist from Template
bulk metadata edit
library filters
Broadcast HUD
Map Channel
```

---

### J. TypeScript clean

Run:

```bash
cd /Users/studio/Projects/wall-of-sound/play/flow-curve-builder
npm run build
```

Expected:

```text
TypeScript exits 0
```

---

## Manual Test Checklist

1. Start PLAY.

```bash
cd /Users/studio/Projects/wall-of-sound/play/flow-curve-builder
npm run dev
```

2. Import `Music_Catalog_365.csv`.

3. Confirm table shows separate columns:

```text
Title
Mood
Suggested
```

4. Confirm confirmed Mood column is empty for analyzer-only tracks.

5. Confirm Suggested column has suggested mood chips.

6. Confirm mood coverage count shows unmooded tracks.

7. Click:

```text
Unmooded
```

8. Select several tracks.

9. Click:

```text
Apply Suggestions to Moods
```

10. Confirm Mood column now shows confirmed mood chips.

11. Filter by one newly confirmed mood.

12. Confirm those tracks appear.

13. Mark playlist as Template.

14. Set template mood filter to the confirmed mood.

15. Create Playlist from Template.

16. Confirm generated playlist uses confirmed moodTags.

17. Export Project JSON.

18. Clear LocalStorage.

19. Import Project JSON.

20. Confirm moodTags and moodSuggestions survive.

21. Confirm TypeScript exits 0.

---

## Expected Result

PLAY can now ingest analyzer-rich CSV catalogs and produce editable mood suggestions.

The catalog remains honest:

```text
confirmed moods are confirmed
suggested moods are suggestions
```

This creates a bridge from audio analysis to catalog intelligence, allowing moods to become useful without overclaiming their accuracy.

---

## Implementation Guide

- **Where:** Work mainly in `trackTypes.ts`, CSV import, `moodSuggestions.ts`, `libraryFilters.ts`, `MainTrackWindow.tsx`, `App.tsx`, and storage repair.
- **What:** Import analyzer fields, generate separate moodSuggestions, add a real Mood column plus Suggested column, and allow explicit Apply Suggestions to Moods.
- **Expect:** The StudioRich analyzer catalog becomes mood-ready without pretending analyzer fields are already verified moods.
