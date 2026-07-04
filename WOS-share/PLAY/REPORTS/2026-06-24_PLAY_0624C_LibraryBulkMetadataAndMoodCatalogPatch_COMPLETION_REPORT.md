# PLAY Patch 0624C — Library Bulk Metadata and Mood Catalog
**Completion Report · 2026-06-24**

---

## Summary

PLAY now functions as a real StudioRich music catalog. Tracks carry a full set of DJ-catalog metadata fields (mood tags, grouping, rating, source owner, album artist, year, composer, groove/rhythm shape fields, album art URL). CSV import maps all new columns without breaking existing playlists. The Library view has multi-select + a BulkEditBar for editing moods, grouping, rating, and source owner across multiple tracks. Legacy mood-map fields (moods, confidence, coord_x/y/z) from earlier exports are transparently preserved.

---

## Updated: `src/data/trackTypes.ts`

### New exported type

```ts
export type TrackSourceOwner = "studiorich" | "external" | "unknown";
```

### New fields on `Track`

```ts
audioFilename?: string;          // maps CSV audio_filename
albumArtist?: string;            // maps CSV album_artist
year?: number;
composer?: string;
grouping?: string;               // Mixxx-compatible crate/collection marker
key?: string;                    // raw non-Camelot key if present
moodConfidence?: number;
moodCoordX?: number;             // legacy mood-map coordinate preservation
moodCoordY?: number;
moodCoordZ?: number;
albumArtUrl?: string;
albumArtDataUrl?: string;
groove?: string;
rhythmDensity?: string;
phraseLength?: string;
percussiveShape?: string;
energyLevel?: string | number;
```

All existing fields preserved without breakage. `sourceOwner` type narrowed to `TrackSourceOwner` (was inline union — functionally identical).

---

## New File: `src/logic/trackMetadata.ts`

Parse/normalize helpers:

```ts
parseDurationToSeconds(value: unknown): number | undefined
// Accepts: 482 (seconds), "8:02" (M:SS), "00:08:02" (H:MM:SS)

parseDelimitedTags(value: unknown): string[]
// Splits on "|" (if present) or "," — trims and filters blanks

normalizeRating(value: unknown): TrackRating | undefined
// 0–5 → stored as-is; 0–100 → scaled to 0–5 via /20

normalizeSourceOwner(value: unknown): TrackSourceOwner
// "studiorich" | "external" → matched; else "unknown"

normalizeTrackMetadata(track: Track): Track
// Maps legacy mood-map fields: moods→moodTags, confidence→moodConfidence,
// coord_x/y/z → moodCoordX/Y/Z. Applied during storage repair.
```

---

## Updated: `src/data/importCsv.ts`

### New column mappings

| CSV Column | Track Field |
|---|---|
| `audio_filename` | `audioFilename` |
| `album` / `album_title` | `albumTitle` |
| `album_artist` | `albumArtist` |
| `year` | `year` |
| `composer` | `composer` |
| `grouping` | `grouping` |
| `mood` / `moods` / `moodtags` | `moodTags[]` (via `parseDelimitedTags`) |
| `genre` | `genre` + `genres[]` |
| `rating` | `rating` (via `normalizeRating` — scales 0–100 → 0–5) |
| `source_owner` | `sourceOwner` (via `normalizeSourceOwner`) |
| `album_art` | `albumArtUrl` |
| `groove` | `groove` |
| `rhythm_density` | `rhythmDensity` |
| `phrase_length` | `phraseLength` |
| `percussive_shape` | `percussiveShape` |
| `energy_level` | `energyLevel` |
| `key` | `camelotKey` (if Camelot-valid) or `key` (raw) |
| `duration` | `durationSeconds` (via `parseDurationToSeconds` — MM:SS, H:MM:SS, raw seconds) |

### Relaxed validation

- `title`: falls back to `audio_filename` value; defaults to `"Track N"` rather than erroring
- `camelotKey`: no longer required — tries `camelotkey`, `camelot_key`, `camelot`, then `key` column; defaults to `"1A"` if none found (no error); stores raw key in `track.key`
- `duration`: accepts MM:SS and H:MM:SS formats via `parseDurationToSeconds`

Backward compat: existing CSV imports that had camelotKey as a required field still work identically.

---

## Updated: `src/data/playProjectStorage.ts`

New repair rules in `repairStoredProject`:

```ts
grouping: track.grouping ?? "",
albumArtist: track.albumArtist ?? "",
```

Plus `normalizeTrackMetadata(backfilled)` applied to each track — maps legacy mood-map JSON fields transparently on load.

---

## Updated: `src/ui/MainTrackWindow.tsx`

### New components

**`BulkEditBar`** — appears above the table when ≥1 track is selected (and `onBulkUpdate` is provided):
- Shows selection count + "Bulk Edit" toggle + "Deselect All"
- Expanded panel with four field groups:
  - **Moods** — Add or Replace mode; comma input; Enter to apply
  - **Grouping** — set/replace; text input
  - **Rating** — set 0–5; number input
  - **Owner** — select studiorich / external / unknown

Add-mood mode uses Set-merge to accumulate tags without duplicates.

**`MoodChips`** — renders up to 3 mood tag chips inline in the title cell; "+N" overflow chip for more.

### Library table changes

- New columns: **Grouping**, **Genre** (between Artist and BPM)
- New **checkbox column** (left of #) with select-all header checkbox
- Selected rows highlighted with `row-selected` class
- Source owner badge: **SR** (teal) shown when `sourceOwner === "studiorich"`
- Mood chips appear below track title when `moodTags` present

### New prop

```ts
onBulkUpdate?: (trackIds: string[], patch: Partial<Track>) => void;
```

---

## Updated: `src/App.tsx`

### `handleBulkUpdateTracks`

```ts
function handleBulkUpdateTracks(trackIds: string[], patch: Partial<Track>)
```

- Add-mood mode (when `_bulkMoodMode: "add"` present in patch): merges tags via `Set` dedup
- Replace/set mode: spreads patch directly onto each selected track
- Strips internal `_bulkMoodMode` marker before applying
- Saves to localStorage and updates state

Passed as `onBulkUpdate={handleBulkUpdateTracks}` to MainTrackWindow.

---

## Updated: `src/styles.css`

New classes:
- `.mood-chip`, `.mood-chips`, `.mood-chip-more` — compact tag pills in library rows
- `.bulk-bar`, `.bulk-bar-header`, `.bulk-bar-count`, `.bulk-bar-fields` — bulk edit panel
- `.bulk-field`, `.bulk-field-label`, `.bulk-input`, `.bulk-input-sm` — field rows in bulk panel
- `.col-check`, `.col-grouping`, `.col-genre` — new table columns
- `.row-selected` — highlight for selected library rows
- `.badge-teal` — SR source-owner badge

---

## Legacy Mood-Map Field Preservation

If importing project JSON that was exported from the old Mood Map experiment with fields:

| Legacy field | Mapped to |
|---|---|
| `moods` (string or array) | `moodTags[]` |
| `confidence` | `moodConfidence` |
| `coord_x` | `moodCoordX` |
| `coord_y` | `moodCoordY` |
| `coord_z` | `moodCoordZ` |

Applied via `normalizeTrackMetadata` during storage repair — old exports load without data loss.

---

## What Round-Trips Through Export/Import

All new track fields survive `Export Project JSON → clear localStorage → Import Project JSON`:

| Field | Preserved |
|---|---|
| `moodTags[]` | ✅ |
| `grouping` | ✅ |
| `rating` | ✅ |
| `sourceOwner` | ✅ |
| `albumArtist` | ✅ |
| `year`, `composer` | ✅ |
| `audioFilename`, `albumArtUrl` | ✅ |
| `groove`, `rhythmDensity`, etc. | ✅ |
| `moodConfidence`, `moodCoordX/Y/Z` | ✅ |
| `sourcePoolIds[]` (0624B) | ✅ |

---

## Non-Goals (Not Implemented)

- Automatic mood classification or AI tagging
- Old Mood Map canvas / terrain visualization
- Album art upload pipeline
- Weighted generation by mood
- BPM/key audio analysis
- Discogs/MusicBrainz lookup
- Full Mixxx database import

---

## TypeScript Verification

```bash
cd /Users/studio/Projects/wall-of-sound/play/flow-curve-builder
npx tsc --noEmit
# EXIT: 0 — clean
```

Zero new errors introduced.

---

## Patch Status: ✅ COMPLETE
