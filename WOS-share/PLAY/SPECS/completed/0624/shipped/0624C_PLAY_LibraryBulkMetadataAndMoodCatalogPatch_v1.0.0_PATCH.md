# 0624C_PLAY_LibraryBulkMetadataAndMoodCatalogPatch_v1.0.0_PATCH

## Status

Ready for implementation.

## Priority

P0 / Central Library Metadata Foundation

This patch begins the real StudioRich catalog-management layer inside PLAY.

The goal is to make moods, grouping, source ownership, ratings, and core track metadata usable as first-class library properties before they are used for playlist generation, event identity, or broadcast visuals.

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
Playlist Template = reusable programming engine
Event = promoted scheduled show
Broadcast HUD = live stage
WOS = spatial visual world
```

Source Pools / Library Groups must not become a second playlist stack.

---

## Background

Earlier PLAY documents treated mood as deferred because Phase 1 required stable metadata first. That was correct for the original Flow Curve builder. PLAY is now beyond the original Phase 1 boundary and is becoming a music programming catalog.

The old standalone Mood Map experiment is not the product direction for this patch. It may return later as a visualization, but the immediate need is to make moods work inside the central catalog.

Current accepted direction:

```text
Mood Map = archived visualization experiment
Mood Catalog = active PLAY intelligence layer
```

---

## Problem

PLAY now has:

```text
sourcePools / Library Groups
playlist roles
template playlists
generated playlists
event-first scheduling
Project JSON export/import
```

But the Library does not yet act like a real DJ/music catalog.

The StudioRich catalog needs bulk-editable metadata:

```text
title
artist
album_artist
album
year
composer
genre
mood
grouping
rating
bpm
key
duration
source_owner
album art
groove
rhythm_density
phrase_length
percussive_shape
energy_level
```

Moods are the most important near-term metadata because they can later drive:

```text
playlist generation
event identity
map style
Smart Grid behavior
audio-reactive gestures
broadcast visual states
```

Impact is unknown, so this patch should implement moods as robust catalog metadata without overpromising visual output.

---

## Required CSV / Catalog Columns

Support this incoming column shape:

```csv
audio_filename,title,mood,album_artist,grouping,genre,album,rating,bpm,key,duration,year,composer,artist,groove,rhythm_density,phrase_length,percussive_shape,energy_level
```

Recommended expanded support:

```csv
audio_filename,title,artist,album_artist,album,year,composer,genre,mood,grouping,rating,bpm,key,duration,source_owner,album_art,groove,rhythm_density,phrase_length,percussive_shape,energy_level
```

Do not require all columns. Import what is present and repair missing values safely.

---

## Data Model Updates

### 1. Update `Track`

Target file:

```text
src/data/trackTypes.ts
```

Add or normalize these fields:

```ts
export type TrackSourceOwner = "studiorich" | "external" | "unknown";

export type Track = {
  // existing fields preserved
  trackId: string;
  title: string;
  artist: string;
  bpm: number;
  camelotKey?: string;
  durationSeconds: number;
  energy: number;

  // catalog fields
  audioFilename?: string;
  albumArtist?: string;
  albumTitle?: string;
  album?: string; // keep existing if already used
  year?: number;
  composer?: string;
  genre?: string;
  genres?: string[];
  grouping?: string;
  rating?: number;
  sourceOwner?: TrackSourceOwner;

  // mood catalog fields
  moodTags?: string[];
  moodConfidence?: number;
  moodCoordX?: number;
  moodCoordY?: number;
  moodCoordZ?: number;

  // optional album art foundation
  albumArtUrl?: string;
  albumArtDataUrl?: string;

  // music-shape / future generation fields
  groove?: string;
  rhythmDensity?: string;
  phraseLength?: string;
  percussiveShape?: string;
  energyLevel?: string | number;

  // library grouping foundation from 0624B
  sourcePoolIds?: string[];
};
```

Do not break existing references. If `albumTitle` already exists, use it as canonical and map CSV `album` into it.

---

## Field Normalization Rules

### `title`

Required for display.

If missing:

```text
title = cleaned audio_filename or trackId
```

### `audio_filename`

Maps to:

```ts
audioFilename
```

If existing code uses `filePath`, preserve both if possible:

```ts
filePath = filePath || audioFilename
```

### `artist`

Artist identity.

Do not use `artist` to determine ownership.

### `source_owner`

Use:

```text
studiorich
external
unknown
```

If missing, default:

```text
unknown
```

Do not infer `studiorich` solely from artist unless explicitly configured later.

### `grouping`

Use the Mixxx-compatible field name.

```text
grouping = library group / crate / collection marker
```

Examples:

```text
Memory in Motion
Opening Air
Microhouse 100
Stranger Vibes
StudioRich Originals
```

Do not replace it with visible Source Pool sidebar objects.

### `genre`

If CSV value is comma-separated:

```text
"ambient, jungle, lo-fi"
```

store both:

```ts
genre: "ambient, jungle, lo-fi"
genres: ["ambient", "jungle", "lo-fi"]
```

### `mood`

If CSV value is comma-separated or pipe-separated:

```text
Dreamy, Hypnotic, Mechanical
```

store:

```ts
moodTags: ["Dreamy", "Hypnotic", "Mechanical"]
```

Accept aliases:

```text
mood
moods
moodTags
```

### `rating`

Store as numeric.

Recommended UI scale:

```text
1–5
```

Accept imported values:

```text
0–5
1–5
0–100
```

If imported value is greater than 5, normalize to 1–5 or preserve raw in a future field only if easy.

For now:

```text
rating = clamp to 0–5
```

### `duration`

Normalize internally to:

```ts
durationSeconds
```

Accept formats:

```text
482
8:02
00:08:02
```

Do not store UI-only duration strings as the authoritative value.

### `year`

Numeric if valid.

### `key`

Map incoming `key` to existing key field.

If existing code uses `camelotKey`, do not destroy it.

Rules:

```text
if key looks like Camelot key → camelotKey
else preserve as musicalKey or keyDisplay if existing
```

If no such field exists, add:

```ts
key?: string;
```

but do not break Camelot scoring.

---

## Mood Catalog Rules

### 1. Treat moods as first-class metadata

Moods must be editable and visible as catalog fields.

Minimum:

```text
Track row shows mood chips/tags
Bulk editor can add/remove moods
CSV import maps mood → moodTags[]
Project JSON export/import preserves moodTags
```

### 2. Do not revive the old Mood Map UI

Do not build:

```text
mood terrain
24-anchor canvas
density overlay
mood coordinate map
standalone mood visualization
```

Those are non-goals for this patch.

### 3. Preserve old mood-map fields if imported

If imported catalog JSON has:

```text
moods
confidence
coord_x
coord_y
coord_z
```

map to:

```ts
moodTags
moodConfidence
moodCoordX
moodCoordY
moodCoordZ
```

This keeps old work alive without making the old visualization the product surface.

### 4. No AI mood classification yet

Do not classify moods automatically.

Only support import, display, bulk edit, and preservation.

---

## Bulk Metadata Editing

Add a lightweight bulk-edit path in the Library / Track Table.

Target likely files:

```text
src/ui/TrackTable.tsx
src/ui/FileManager.tsx
src/App.tsx
src/styles.css
```

Minimum interaction:

```text
select multiple tracks
open Bulk Metadata panel/action
apply fields to selected tracks
```

Required bulk-edit fields:

```text
moodTags
grouping
genre / genres
rating
sourceOwner
albumTitle / album
albumArtist
year
```

Optional if low-risk:

```text
composer
albumArtUrl
groove
rhythmDensity
phraseLength
percussiveShape
energyLevel
```

---

## Bulk Edit Behavior

### Moods

Support:

```text
Add mood
Remove mood
Replace moods
```

If only one mode is feasible, implement:

```text
Add mood
```

because this is safest for catalog enrichment.

### Grouping

Support replace/set:

```text
Set grouping = Memory in Motion
```

### Rating

Support set:

```text
Set rating = 4
```

### Source Owner

Support set:

```text
studiorich / external / unknown
```

### Album Art

Foundation only is acceptable:

```text
albumArtUrl field
```

Do not build image upload if it risks scope.

---

## Library Table Display

Track rows should show more catalog context without becoming cluttered.

Minimum visible fields:

```text
title
artist
album
grouping
genre
mood chips
rating
duration
source owner
```

Use compact chips for:

```text
moods
grouping
source owner
rating
```

Do not expand the left panel footprint.

---

## CSV / JSON Import Support

Find current import path. Likely files:

```text
src/data/importCsv.ts
src/data/playProjectStorage.ts
src/data/playProjectExport.ts
```

If CSV import is currently elsewhere, update the actual importer.

Required mappings:

| Incoming Column | Internal Field |
|---|---|
| `audio_filename` | `audioFilename`, maybe `filePath` |
| `title` | `title` |
| `artist` | `artist` |
| `album_artist` | `albumArtist` |
| `album` | `albumTitle` / existing album field |
| `year` | `year` |
| `composer` | `composer` |
| `genre` | `genre`, `genres[]` |
| `mood` | `moodTags[]` |
| `grouping` | `grouping` |
| `rating` | `rating` |
| `bpm` | `bpm` |
| `key` | `key` / `camelotKey` if valid |
| `duration` | `durationSeconds` |
| `source_owner` | `sourceOwner` |
| `album_art` | `albumArtUrl` |
| `groove` | `groove` |
| `rhythm_density` | `rhythmDensity` |
| `phrase_length` | `phraseLength` |
| `percussive_shape` | `percussiveShape` |
| `energy_level` | `energyLevel` / possible energy helper |

---

## Storage Repair

Target file:

```text
src/data/playProjectStorage.ts
```

Backfill missing values safely:

```ts
moodTags: []
genres: []
sourcePoolIds: []
sourceOwner: "unknown"
rating: undefined
grouping: ""
albumArtist: ""
albumTitle: existing album value if present
durationSeconds: existing durationSeconds or parsed duration if present
```

Do not overwrite existing user metadata.

---

## Playlist Generation Use

Do not make moods affect generation yet except for preservation and simple filters if already available.

Allowed in this patch:

```text
Template/source pool filter can recognize moodTags
Library search can match moodTags
```

Not allowed yet:

```text
weighted generation by mood
visual styling by mood
audio-reactive behavior by mood
automatic mood inference
```

---

## Visual/Broadcast Use

Do not implement mood-driven visuals yet.

Add only a future-safe contract field if low-risk:

```ts
primaryMood?: string;
```

or derive on demand:

```ts
primaryMood = moodTags[0]
```

Visual impact remains unknown and should be tested later.

---

## Non-Goals

Do not implement these in this patch:

- old Mood Map canvas
- mood terrain visualization
- automatic mood classification
- AI tagging
- BPM/key/audio analysis
- album art upload pipeline
- full Discogs/MusicBrainz lookup
- full Mixxx database import
- ratings-based weighted generation
- mood-driven map styles
- mood-driven Smart Grid gestures
- event recurrence/calendar redesign
- WOS postMessage
- snapshot button

---

## Implementation Targets

Likely files:

```text
src/data/trackTypes.ts
src/data/importCsv.ts
src/data/playProjectStorage.ts
src/data/playProjectExport.ts
src/ui/TrackTable.tsx
src/ui/FileManager.tsx
src/ui/PlaylistHeader.tsx
src/App.tsx
src/styles.css
```

Optional new file:

```text
src/logic/trackMetadata.ts
```

Suggested helpers:

```ts
export function parseDurationToSeconds(value: unknown): number | undefined;

export function parseDelimitedTags(value: unknown): string[];

export function normalizeRating(value: unknown): number | undefined;

export function normalizeSourceOwner(value: unknown): TrackSourceOwner;

export function normalizeTrackMetadata(track: Track): Track;
```

---

## Acceptance Criteria

### A. Track type supports catalog metadata

Track supports:

```text
audioFilename
albumArtist
albumTitle
year
composer
genre/genres
grouping
rating
sourceOwner
moodTags
moodConfidence
moodCoordX/Y/Z
albumArtUrl
groove
rhythmDensity
phraseLength
percussiveShape
energyLevel
```

without breaking existing playlists.

---

### B. CSV import maps metadata

Given CSV columns:

```csv
audio_filename,title,mood,album_artist,grouping,genre,album,rating,bpm,key,duration,year,composer,artist,groove,rhythm_density,phrase_length,percussive_shape,energy_level
```

PLAY imports and preserves the mapped metadata.

---

### C. Mood tags are visible

Track rows show mood tags/chips or a compact mood field.

---

### D. Bulk mood edit works

User can select multiple tracks and add or set mood tags.

Minimum passing behavior:

```text
select tracks → add mood → selected tracks receive moodTags update
```

---

### E. Grouping is retained as library grouping

`grouping` remains the catalog grouping field.

It is not converted into a left-panel duplicate playlist section.

---

### F. Source owner works

Tracks can be marked:

```text
studiorich
external
unknown
```

and this survives export/import.

---

### G. Ratings persist

Ratings can be imported and/or edited, and survive export/import.

No weighted generation yet.

---

### H. Old mood-map catalog fields are preserved

If importing JSON/catalog rows with:

```text
moods
confidence
coord_x
coord_y
coord_z
```

they map into catalog fields and survive Project JSON export/import.

---

### I. Project JSON round-trip

After editing catalog metadata:

```text
export Project JSON
clear LocalStorage
import Project JSON
```

metadata survives.

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

2. Import or load catalog tracks.

3. Confirm mood tags appear in Library / Track Table.

4. Select multiple tracks.

5. Bulk add mood:

```text
Hypnotic
```

6. Confirm selected tracks show `Hypnotic`.

7. Bulk set grouping:

```text
Microhouse 100
```

8. Bulk set source owner:

```text
studiorich
```

9. Bulk set rating:

```text
4
```

10. Export Project JSON.

11. Clear LocalStorage.

12. Import Project JSON.

13. Confirm moodTags, grouping, sourceOwner, and rating survive.

14. Confirm playlist templates and generated playlists from 0624A/0624B still work.

15. Confirm Broadcast HUD / Map Channel still works.

---

## Expected Result

PLAY begins acting like a real StudioRich music catalog.

The app can now manage track metadata in bulk, especially moods, grouping, ratings, and ownership.

Moods are not yet proven visually, but they are now available as structured catalog intelligence for later experiments.

---

## Implementation Guide

- **Where:** Work primarily in `trackTypes.ts`, CSV/import normalization, storage repair, TrackTable/Library UI, and App metadata-update handlers.
- **What:** Add bulk catalog metadata editing with moods as the highest-priority field, plus grouping, source owner, ratings, title/year/duration normalization, and old mood-map field preservation.
- **Expect:** StudioRich tracks become editable central-library records, setting up future playlist weighting and visual experiments without reviving the dated Mood Map UI.
