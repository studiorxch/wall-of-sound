# 0624G_PLAY_PreExistingTypeScriptBuildHealthRecoveryPatch_v1.0.0_PATCH

## Status

Ready for implementation.

## Priority

P0 / Build Health Recovery

This patch is a build-health-only recovery pass.

The goal is to eliminate the 15 pre-existing TypeScript/build errors that have been carried through 0624C–0624F, without adding product features or changing UX behavior.

After this patch, future work should be able to report:

```text
TypeScript exits 0
```

without qualifiers.

---

## Active Project Paths

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

Do not use:

```text
/Users/studio/Projects/play
```

That path is legacy/inactive.

---

## Current State

Recent patch chain:

```text
0624C = catalog metadata + moods
0624D = library filters + playlist source rules
0624E = analyzer fields + mood suggestions bridge
0624F = import destinations + Archive + Library Group governance + Flow Graph protection
```

Each recent patch reported:

```text
Zero new TypeScript errors
but 15 pre-existing build errors remain
```

This debt now needs to be cleared before more feature patches.

---

## Problem

The project currently has pre-existing TypeScript/build errors.

This makes it harder to know whether new patches introduce regressions.

The build needs a clean baseline.

---

## Goal

Run the build, capture the current errors, and fix only the type/build issues required to make the project compile.

Target command:

```bash
cd /Users/studio/Projects/wall-of-sound/play/flow-curve-builder
npm run build
```

Expected final result:

```text
TypeScript exits 0
```

---

## Strict Scope

This is not a product feature patch.

Do not add:

```text
new UI features
new catalog behavior
new mood rules
new import destinations
new playlist generation logic
new WOS integration
new scheduler behavior
new visual systems
```

Only fix build/type errors.

---

## Required Procedure

### 1. Capture current build errors

Run:

```bash
npm run build
```

Save or report:

```text
exact error count
file path
line/column
error code
error message
```

Preferred completion report format:

```text
Before:
15 TypeScript errors

After:
0 TypeScript errors
```

If the count differs from 15, report the actual number.

---

### 2. Categorize errors before editing

Likely error categories:

```text
stale prop names
missing handler props
type drift after Track expansion
PlaylistRecord / templateSourceFilters mismatches
TrackArchiveStatus import/export mismatch
LibraryTrackFilters import location mismatch
unused imports under noUnusedLocals
implicit any
component prop type mismatch
sourcePool/template compatibility type mismatch
audioAnalysis / moodSuggestions typing mismatch
```

Do not blindly suppress errors.

---

### 3. Fix types at their source

Preferred fixes:

```text
update shared types
update component prop contracts
update handler signatures
update import paths
narrow optional values safely
remove unused imports
add safe defaults in storage repair
```

Avoid:

```text
as any
// @ts-ignore
// @ts-expect-error
turning off TypeScript strictness
editing tsconfig to hide errors
removing useful fields to satisfy compiler
```

Use `as any` only if absolutely unavoidable, and document why.

---

## Known High-Risk Areas

Review these files first because recent patches touched them heavily:

```text
src/data/trackTypes.ts
src/data/playProjectTypes.ts
src/data/playProjectStorage.ts
src/data/importCsv.ts
src/logic/libraryFilters.ts
src/logic/sourcePoolFill.ts
src/logic/trackMetadata.ts
src/logic/moodSuggestions.ts
src/ui/MainTrackWindow.tsx
src/ui/PlaylistHeader.tsx
src/ui/FileManager.tsx
src/ui/FlowCurveCanvas.tsx
src/App.tsx
```

---

## Product Invariants To Preserve

Do not regress these 0624C–F behaviors:

### Catalog metadata

```text
moodTags
moodSuggestions
audioAnalysis
grouping
rating
sourceOwner
archiveStatus
```

must persist.

### Import destinations

```text
Library
Archive
Playlist
Group
```

must remain distinct.

### Flow Graph

```text
add node
remove node
drag node
```

must continue working after large CSV import.

### Library Groups

```text
view
rename
remove record
clean empty groups
```

must remain available.

### Smart Fill language

User-facing labels should remain:

```text
Playlist Rules
Smart Fill
Source Rules
Generate Playlist
```

Do not re-expand `Template` as primary user-facing language.

---

## Type Cleanup Guidance

### `Track`

Ensure final `Track` supports:

```text
audioFilename
albumArtist
albumTitle
year
composer
grouping
key
sourceOwner
rating
archiveStatus
moodTags
moodSuggestions
moodConfidence
moodCoordX/Y/Z
albumArtUrl
albumArtDataUrl
groove
rhythmDensity
phraseLength
percussiveShape
energyLevel
audioAnalysis
sourcePoolIds
```

### `PlaylistRecord`

Ensure final `PlaylistRecord` supports:

```text
playlistRole
sourcePoolId
targetTrackCount
regenerationMode
templateSourceFilters
```

or whatever the current code actually requires.

### `LibraryTrackFilters`

Ensure there is exactly one canonical exported type.

Recommended location:

```text
src/logic/libraryFilters.ts
```

or, if needed for shared data usage:

```text
src/data/libraryFilterTypes.ts
```

Do not keep duplicate incompatible types.

### `TrackArchiveStatus`

Ensure it is exported from a stable type file and imported consistently.

Recommended location:

```text
src/data/trackTypes.ts
```

### `TrackSourceOwner`

Ensure owner values match everywhere:

```text
studiorich
external
unknown
```

and optional filter value:

```text
any
```

is only used in filters, not stored on tracks.

---

## UI Type Guidance

For React components:

```text
props should include every handler used
optional handlers should be checked before call
state setters should not accept incompatible partials
derived arrays should use typed helpers
```

Avoid passing large App state objects when a component only needs explicit props.

---

## Storage Repair Guidance

Storage repair should normalize old project files without crashing.

Ensure repair handles missing:

```text
tracks
playlists
sourcePools
broadcastEvents
archiveStatus
moodTags
moodSuggestions
audioAnalysis
templateSourceFilters
```

Do not overwrite existing metadata.

---

## Acceptance Criteria

### A. Build command exits clean

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

### B. No TypeScript suppressions

No new broad suppressions:

```text
// @ts-ignore
// @ts-expect-error
as any
```

unless explicitly documented in completion report.

---

### C. No feature behavior changes

No intentional product behavior changes.

This patch fixes build health only.

---

### D. 0624C–F workflows still compile

The compiled code must preserve types for:

```text
bulk metadata edit
library filters
mood suggestions
Apply Suggestions to Moods
import destination modal
Archive status
Library Groups manager
Smart Fill / Source Rules
Flow Graph controls
```

---

### E. Completion report includes before/after

Completion report must include:

```text
Before error count
After error count
Files changed
Categories fixed
Any remaining risks
```

---

## Manual Smoke Test After Build

After `npm run build` exits 0, run:

```bash
npm run dev
```

Smoke test:

```text
1. Open app
2. Import Music_Catalog_365.csv to Library
3. Confirm active playlist does not change
4. Confirm Flow Graph add/remove/drag works
5. Select tracks
6. Apply Suggestions to Moods
7. Create/rename/remove Library Group
8. Mark selected tracks Archive
9. Generate Playlist via Smart Fill / Source Rules
10. Export Project JSON
11. Clear LocalStorage
12. Import Project JSON
13. Confirm metadata survives
```

This smoke test should not expand scope; it only confirms build cleanup did not break current product.

---

## Non-Goals

Do not implement:

```text
rating-weighted generation
mood review queue
mood-driven visuals
WOS postMessage
snapshot button
old Mood Map UI
new scheduler behavior
new archive UI beyond what already exists
new import behavior beyond what already exists
```

---

## Expected Result

The PLAY codebase has a clean TypeScript baseline.

Future patch reports can distinguish new regressions from real prior debt.

---

## Implementation Guide

- **Where:** Run `npm run build`, then fix only the reported TypeScript errors in the exact files indicated.
- **What:** Resolve the 15 pre-existing build/type errors without product feature changes or broad suppressions.
- **Expect:** `npm run build` exits 0 and current 0624C–F workflows remain intact.
