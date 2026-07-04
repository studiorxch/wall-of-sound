# 0624D_PLAY_LibraryMoodGroupingFilterAndTemplateSourcePatch_v1.0.0_PATCH

## Status

Ready for implementation.

## Priority

P0 / Catalog Metadata Activation

This patch turns the metadata foundation from 0624C into usable catalog filters and playlist-template source rules.

The goal is to make moods, grouping, rating, source ownership, and genre operational for finding tracks, creating Library Groups, and filling playlist templates.

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

## Product Lock

```text
Library = central catalog
Grouping = Mixxx-compatible library group / crate marker
Mood = first-class catalog intelligence
Rating = future generation weight
Source Owner = catalog ownership/source protection
Playlist Template = reusable programming engine
Event = promoted scheduled show
Broadcast HUD = live stage
WOS = spatial visual world
```

This patch should make catalog metadata usable before any visual mood experiment.

---

## Current State

0624C shipped:

```text
bulk track metadata editing
moodTags
grouping
rating
sourceOwner
album/artist/year/composer fields
legacy mood-map field preservation
CSV metadata import normalization
```

But metadata is not yet fully useful for selection and programming.

Current problem:

```text
Moods exist.
Grouping exists.
Ratings exist.
Source owner exists.
But the operator still needs fast filters and template source rules.
```

---

## Goal

Add a compact Library filter system and connect those filters to playlist-template creation/fill.

Required workflow:

```text
filter library by mood/grouping/genre/sourceOwner/rating
select filtered tracks
create Library Group from filtered selection
create or update playlist template from filtered catalog set
generate playlist from template using those metadata filters
```

This moves PLAY toward Mixxx/Rekordbox-style library work without expanding the left panel footprint.

---

## Required Behaviors

### 1. Add Library filter bar

Target likely file:

```text
src/ui/MainTrackWindow.tsx
```

Add compact filters for:

```text
moodTags
grouping
genre / genres
sourceOwner
rating
search text
```

Minimum UI:

```text
Search
Mood
Grouping
Genre
Owner
Rating
Clear Filters
```

Do not create a large new sidebar.

Preferred placement:

```text
inside MainTrackWindow above the track table
```

or as a compact row below the table heading.

---

### 2. Filter logic

Create a helper if useful:

```text
src/logic/libraryFilters.ts
```

Suggested types:

```ts
export type LibraryTrackFilters = {
  search?: string;
  moodTags?: string[];
  grouping?: string;
  genre?: string;
  sourceOwner?: "studiorich" | "external" | "unknown" | "any";
  minRating?: number;
};
```

Suggested helper:

```ts
export function filterTracksByLibraryFilters(
  tracks: Track[],
  filters: LibraryTrackFilters
): Track[];
```

Filtering rules:

- `search` should match title, artist, album, grouping, genre, moodTags.
- `moodTags` should match any selected mood by default.
- `grouping` should exact-match or normalized-match.
- `genre` should match either `genre` string or `genres[]`.
- `sourceOwner` should match unless `any`.
- `minRating` should include tracks with rating >= selected value.
- Missing rating should only pass if no rating filter is selected.

---

### 3. Filter options should derive from catalog

Do not hard-code moods/groups/genres.

Build options from current tracks:

```text
available moods = unique moodTags across tracks
available groupings = unique grouping values
available genres = unique genres across tracks
available owners = studiorich / external / unknown present in tracks
ratings = 1–5
```

Sort alphabetically, except ratings.

---

### 4. Add visible filtered count

Show:

```text
211 tracks
48 filtered
12 selected
```

or equivalent.

This is important for quick catalog work.

---

### 5. Add “Select Filtered” action

Required action:

```text
Select Filtered
```

Behavior:

- selects all currently visible filtered tracks
- respects current filters
- does not select tracks hidden by filters

Also add:

```text
Clear Selection
```

if not already present.

---

### 6. Create Library Group from filtered selection

0624B corrected Source Pools into Library Groups.

Add or preserve action:

```text
Create Library Group from Selection
```

Behavior:

- prompts or asks for group name using current input pattern
- sets `grouping` on selected tracks
- optionally creates/updates a `MusicSourcePool` record internally for template compatibility
- must not create a visible Source Pool sidebar stack

Recommended behavior:

```text
selected tracks → grouping = <group name>
selected tracks → sourcePoolIds includes group/pool id if needed
sourcePools[] retains record for template dropdown compatibility
```

This keeps both models aligned:

```text
user-facing = grouping / Library Group
internal compatibility = sourcePools[]
```

---

### 7. Template source rules from metadata

Playlist templates should be able to use Library metadata directly.

Target likely file:

```text
src/ui/PlaylistHeader.tsx
```

Add template source fields:

```text
Library Group / grouping
Mood filter
Genre filter
Owner filter
Min rating
```

These can be compact.

Do not remove the existing Library Group / Source Pool dropdown from 0624A/B if it still works.

But template source selection should no longer depend only on `sourcePoolId`.

Recommended fields on playlist/template if low-risk:

```ts
templateSourceFilters?: LibraryTrackFilters;
```

or explicit fields:

```ts
templateMoodTags?: string[];
templateGrouping?: string;
templateGenre?: string;
templateSourceOwner?: TrackSourceOwner | "any";
templateMinRating?: number;
```

Prefer one `templateSourceFilters` object if TypeScript integration is clean.

---

### 8. Update source-pool/template fill logic

Target file:

```text
src/logic/sourcePoolFill.ts
```

Current fill path from 0624A:

```text
trackIds → albumGroupIds → genre/mood → empty
```

Update to support template/library filters.

Suggested source priority:

```text
1. explicit sourcePool.trackIds
2. templateSourceFilters / LibraryTrackFilters
3. grouping match
4. albumGroupIds
5. genre/mood filters
6. empty result
```

Do not break existing sourcePool-based generated playlists.

---

### 9. Ratings are filters only for now

Use rating as a filter:

```text
minimum rating 4
```

Do not implement weighted generation yet.

Deferred:

```text
rating weight in shuffle/selection
recently-used avoidance
weighted mood balancing
```

---

### 10. Moods are filters only for now

Use moods to find/select/fill tracks.

Do not implement visual behavior yet.

Allowed:

```text
filter by mood
template source by mood
generated playlist from mood-filtered catalog
```

Deferred:

```text
mood-driven map colors
mood-driven Smart Grid gestures
mood anchor rendering
audio-reactive mood states
```

---

## Data Model Guidance

If adding `templateSourceFilters`, update:

```text
src/data/playlistTypes.ts
src/data/playProjectStorage.ts
src/data/playProjectExport.ts
```

Repair rule:

```text
templateSourceFilters: undefined or default empty object
```

Do not break old project JSON.

Suggested type:

```ts
export type LibraryTrackFilters = {
  search?: string;
  moodTags?: string[];
  grouping?: string;
  genre?: string;
  sourceOwner?: TrackSourceOwner | "any";
  minRating?: number;
};
```

Place the type in:

```text
src/logic/libraryFilters.ts
```

or if shared type imports become messy:

```text
src/data/libraryFilterTypes.ts
```

---

## UI Requirements

### MainTrackWindow filter row

Minimum layout:

```text
Search [________]
Mood [All v]
Grouping [All v]
Genre [All v]
Owner [Any v]
Rating [Any v]
[Select Filtered] [Clear Filters]
```

### Filter count

Display:

```text
48 / 211 tracks
```

### Mood chips

Existing mood chips from 0624C should remain.

### BulkEditBar

Existing bulk edit should still work with filtered selections.

---

## Library Group Action

Add or preserve:

```text
Create Library Group from Selection
```

Expected prompt/input:

```text
Group name:
```

When submitted:

```text
sets grouping on selected tracks
updates selected track metadata
persists via project storage
available in Grouping filter
available in template source settings
```

---

## Template UI

For playlists marked:

```text
playlistRole = "template"
```

show a compact source rule section:

```text
Template Source
Library Group: [All / group]
Mood: [All / mood]
Genre: [All / genre]
Owner: [Any / studiorich / external / unknown]
Min Rating: [Any / 1 / 2 / 3 / 4 / 5]
```

Also preserve:

```text
Target tracks
Regeneration mode
Create Playlist from Template
```

---

## Non-Goals

Do not implement these in this patch:

- old Mood Map canvas
- mood terrain visualization
- AI mood classification
- automatic mood inference
- album art upload pipeline
- full Mixxx DB import
- full library manager redesign
- weighted generation
- recently-used avoidance
- recurrence/calendar redesign
- mood-driven visuals
- WOS postMessage
- snapshot button
- audio analysis
- waveform/beatgrid/phrase detection

---

## Implementation Targets

Likely files:

```text
src/ui/MainTrackWindow.tsx
src/ui/PlaylistHeader.tsx
src/logic/sourcePoolFill.ts
src/data/playlistTypes.ts
src/data/playProjectStorage.ts
src/App.tsx
src/styles.css
```

Suggested new file:

```text
src/logic/libraryFilters.ts
```

Optional type file:

```text
src/data/libraryFilterTypes.ts
```

---

## Acceptance Criteria

### A. Library filters work

User can filter tracks by:

```text
mood
grouping
genre
sourceOwner
minRating
search text
```

and visible rows update.

---

### B. Filter options derive from catalog

Mood/grouping/genre dropdowns are built from current track metadata.

No hard-coded mood list is required.

---

### C. Select Filtered works

Clicking:

```text
Select Filtered
```

selects the currently visible filtered tracks.

---

### D. Create Library Group from Selection works

Given selected tracks:

```text
Create Library Group from Selection
```

sets their `grouping` value and makes that group available as a filter/template source.

---

### E. Template can use metadata filters

A template playlist can specify source rules such as:

```text
grouping = Microhouse 100
mood = Hypnotic
minRating = 4
sourceOwner = studiorich
```

---

### F. Generated playlist uses template source filters

Creating a playlist from template fills from tracks matching the template filters, without requiring a visible Source Pool sidebar object.

---

### G. 0624A/B/C behavior does not regress

Must still work:

```text
Project JSON export/import
sourcePools[] compatibility
Library Groups compact row
playlistRole template/generated/static
Create Playlist from Template
bulk metadata edit
mood chips
Broadcast HUD
Map Channel
```

---

### H. TypeScript clean

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

2. Confirm library has tracks with moods, grouping, source owner, and ratings.

3. Filter by mood:

```text
Hypnotic
```

4. Confirm table updates and count changes.

5. Filter by grouping:

```text
Microhouse 100
```

6. Filter by owner:

```text
studiorich
```

7. Filter by min rating:

```text
4
```

8. Click:

```text
Select Filtered
```

9. Bulk add mood:

```text
Night Grid
```

10. Create Library Group from selection:

```text
Microhouse 100
```

11. Mark playlist as Template.

12. Set template source filters:

```text
grouping = Microhouse 100
minRating = 4
sourceOwner = studiorich
```

13. Click:

```text
Create Playlist from Template
```

14. Confirm generated playlist uses matching tracks.

15. Export Project JSON.

16. Clear LocalStorage.

17. Import Project JSON.

18. Confirm filters, groupings, moods, ratings, and template source rules survive.

19. Confirm Broadcast HUD / Map Channel still works.

---

## Expected Result

PLAY gains operational catalog filtering.

Moods become useful for finding and generating playlists, not just stored metadata.

Grouping becomes the Mixxx-compatible Library Group mechanism.

Ratings and source ownership become practical filters.

This sets up future weighted generation and mood-driven visuals without overbuilding either yet.

---

## Implementation Guide

- **Where:** Work mainly in `MainTrackWindow.tsx`, `PlaylistHeader.tsx`, `sourcePoolFill.ts`, playlist types/storage repair, and a new `libraryFilters.ts` helper.
- **What:** Add catalog filters, Select Filtered, Library Group from Selection, and template source rules based on mood/grouping/genre/owner/rating.
- **Expect:** PLAY can create generated playlists from filtered catalog metadata, making moods operational before visual experiments.
