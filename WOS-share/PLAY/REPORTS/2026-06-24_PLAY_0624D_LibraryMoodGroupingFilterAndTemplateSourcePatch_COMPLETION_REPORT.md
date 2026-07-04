# PLAY Patch 0624D — Library Mood Grouping Filter and Template Source
**Completion Report · 2026-06-24**

---

## Summary

0624C metadata is now operational. The Library has a full catalog filter bar (search, mood, grouping, genre, owner, min rating) with options derived from the actual track library. "Select Filtered" adds visible tracks to the selection. "Create Library Group" stamps `grouping` on selected tracks and creates a MusicSourcePool for template dropdown compatibility. Playlist templates have a Template Source Filters section (grouping, mood, genre, owner, min rating) that drives slot fill when generating a playlist from template — no explicit Source Pool row required.

---

## New File: `src/logic/libraryFilters.ts`

```ts
export type LibraryTrackFilters = {
  search?: string;
  moodTags?: string[];
  grouping?: string;
  genre?: string;
  sourceOwner?: TrackSourceOwner | "any";
  minRating?: number;
};

export function isFiltersEmpty(f: LibraryTrackFilters): boolean

export function filterTracksByLibraryFilters(tracks: Track[], filters: LibraryTrackFilters): Track[]
// search: matches title, artist, albumTitle, grouping, genre, genres[], moodTags[] (substring)
// moodTags: any-match (case-insensitive)
// grouping: exact match (case-insensitive)
// genre: substring match against genre + genres[]
// sourceOwner: exact unless "any"
// minRating: tracks with rating >= n; missing rating fails if minRating > 0

export function buildFilterOptions(tracks: Track[]): {
  moods: string[];    // unique moodTags, sorted
  groupings: string[]; // unique grouping values, sorted
  genres: string[];   // unique genres + genre splits, sorted
  owners: TrackSourceOwner[]; // present in library, sorted
}
```

---

## Updated: `src/data/playProjectTypes.ts`

Added import for `LibraryTrackFilters` and new field on `PlaylistRecord`:

```ts
templateSourceFilters?: LibraryTrackFilters;
```

No repair rule needed — `undefined` is the safe default and old projects load without modification.

---

## Updated: `src/logic/sourcePoolFill.ts`

New arg:

```ts
buildPlaylistSlotsFromSourcePool(args: {
  ...
  templateSourceFilters?: LibraryTrackFilters;  // new (0624D)
}): TrackSlot[]
```

Updated candidate selection priority:

```
1. sourcePool.trackIds (explicit list — unchanged)
2. templateSourceFilters (LibraryTrackFilters — new)
3. sourcePool.albumGroupIds
4. sourcePool.genreFilter + moodFilter
5. empty
```

When `templateSourceFilters` is non-empty and no `trackIds` are set, `filterTracksByLibraryFilters` is applied to the full library. Existing pool-based playlists are unaffected.

`handleCreatePlaylistFromTemplate` in App.tsx now also handles the case where `template.templateSourceFilters` exists but no `sourcePoolId` is set — creates an ephemeral empty pool and fills from filters.

---

## Updated: `src/ui/MainTrackWindow.tsx`

### Catalog filter bar (new, in `LibraryRows`)

Compact row above the track table with dynamically-built options:

```
[Search________] [Mood: All v] [Group: All v] [Genre: All v] [Owner: Any v] [Rating: Any v]
[Select Filtered] [Clear Filters?] [Create Library Group?]
```

- All dropdowns built from `buildFilterOptions(tracks)` — no hard-coded lists
- Filtering applied via `filterTracksByLibraryFilters` on top of the existing quick-filter (`lib-filter-bar`)
- Filter count updated: `48 / 211 · 12 selected`
- `hasCatalogFilter` guard shows "Clear Filters" only when active
- "Create Library Group" shows only when `selectedIds.size > 0` and `onCreateLibraryGroup` prop provided

### "Select Filtered" behavior

Adds all currently visible filtered rows to `selectedIds` (union, doesn't clear existing selections).

### "Create Library Group" inline prompt

Clicking shows an inline input row. On Enter or "Create":
1. Calls `onCreateLibraryGroup(selectedTrackIds, groupName)`
2. Input clears and hides

Escape cancels without action.

### New props added to `LibraryRows` and outer `MainTrackWindow`

```ts
onCreateLibraryGroup?: (trackIds: string[], groupName: string) => void;
```

---

## Updated: `src/ui/PlaylistHeader.tsx`

### New prop

```ts
onSetTemplateSourceFilters?: (f: LibraryTrackFilters) => void;
```

### Template Source Filters section (shown when `role === "template"`)

Appears after Regeneration Mode selector, before "Create Playlist from Template":

```
Template Source Filters
  Grouping:  [text input]
  Mood:      [text input]
  Genre:     [text input]
  Owner:     [Any / StudioRich / External / Unknown]
  Min Rating:[Any / ★+ / ★★+ / …]
```

Each field updates `templateSourceFilters` via `onSetTemplateSourceFilters`, which persists via `mutatePLAndSave`.

Existing Library Group dropdown and Target Tracks/Regen Mode fields are preserved above this section.

---

## Updated: `src/App.tsx`

### `handleSetTemplateSourceFilters`

```ts
function handleSetTemplateSourceFilters(playlistId: string, filters: LibraryTrackFilters)
// → mutatePLAndSave → updates templateSourceFilters, saves to localStorage
```

### `handleCreateLibraryGroupFromSelection`

```ts
function handleCreateLibraryGroupFromSelection(trackIds: string[], groupName: string)
```

1. Stamps `grouping = groupName` on all selected tracks
2. Stamps `sourcePoolIds` to include new pool id (deduped)
3. Creates a `MusicSourcePool` record with the group name and selected trackIds
4. Persists both library tracks and source pools

Result: `grouping` becomes the user-facing Library Group label; `sourcePools[]` retains the record for template dropdown compatibility. No sidebar stack created.

Passed to MainTrackWindow as `onCreateLibraryGroup`.

---

## Updated: `src/styles.css`

```css
.cat-filter-bar       /* catalog filter row */
.cat-filter-search    /* search input */
.cat-filter-sel       /* dropdown selects */
.cat-group-input-row  /* inline group name input */
.ph-template-filters  /* template source filter grid */
.ph-tf-row            /* label + input row */
.ph-tf-label          /* right-aligned label */
```

---

## Workflow Enabled

```
Library: filter by mood = Hypnotic, grouping = Microhouse 100, owner = studiorich
→ Select Filtered (48 tracks selected)
→ Create Library Group "Night Grid" → stamps grouping + creates pool
→ Open template playlist → Settings → Role: Template
→ Template Source: grouping = Night Grid, minRating = 4
→ Create Playlist from Template → fills from library filtered tracks
→ Export Project JSON → templateSourceFilters preserved
→ Import → same filters restored, template still works
```

---

## What Survives Export/Import

| Field | Preserved |
|---|---|
| `templateSourceFilters` per playlist | ✅ |
| `grouping` per track | ✅ (0624C) |
| `moodTags` per track | ✅ (0624C) |
| `sourcePoolIds` per track | ✅ (0624B) |
| `sourcePools[]` | ✅ (0624A) |

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
