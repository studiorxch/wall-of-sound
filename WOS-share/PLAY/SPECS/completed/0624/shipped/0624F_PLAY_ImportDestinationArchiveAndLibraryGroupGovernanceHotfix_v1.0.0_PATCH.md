# 0624F_PLAY_ImportDestinationArchiveAndLibraryGroupGovernanceHotfix_v1.0.0_PATCH

## Status

Ready for implementation.

## Priority

P0 / Product Architecture Correction + UX Hotfix

This patch corrects the import, Library Group, Flow Graph, and playlist-rules direction after 0624A–0624E.

The new structure is:

```text
Library
└── The Archive
    └── Playlists
```

Plain language:

```text
Library = everything imported / unorganized
The Archive = curated, cleaned, trusted subset
Playlists = specific programmed outputs drawn from the Archive
```

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

Do not use legacy path:

```text
/Users/studio/Projects/play
```

---

## Problems To Fix

### 1. Import destination is unclear

Importing a Music CSV Catalog should not be ambiguous.

The user needs clear import destinations:

```text
Library
Archive
Playlist
Group
```

Import must not silently dump tracks into the wrong working area.

---

### 2. Flow Graph regression

Reported:

```text
Flow Graph may have lost add/remove node ability.
Importing CSV disrupted Flow Curve responsiveness.
```

Flow Curve editing is core and must remain stable after importing a large catalog.

---

### 3. Library Groups are invisible/unmanageable

Reported:

```text
Ability to create groups exists.
No ability to see, edit, or remove groups.
There are 92 invisible groups.
```

Any object that can be created must be visible and manageable.

---

### 4. Settings is doing too much

The small Settings dropdown is overloaded with dynamic source/template/generation controls.

Dynamic controls should sit above the list they populate or filter so changes can be seen immediately.

---

### 5. Templates are the wrong product language

The app introduced `templates`, but the better user-facing model is probably:

```text
Playlist Rules
Smart Fill
Source Rules
Generate Playlist
```

Preserve internal compatibility if needed, but reduce user-facing template language.

---

## New Product Structure

Adopt this hierarchy:

```text
Library
├── All Tracks
├── Imports
├── Unorganized
└── Raw Catalog

The Archive
├── Curated
├── Cleaned
├── Trusted
├── Rated
├── Mooded
└── Grouped

Playlists
├── Static Playlists
├── Generated Playlists
└── Event Playlists
```

Working definition:

```text
Library = 100,000 possible tracks
The Archive = highly curated, cleaned-up subset of timeless classics / usable catalog
Playlists = specific vibes drawn from the Archive
```

---

## Data Model Updates

### Track archive status

Add:

```ts
export type TrackArchiveStatus =
  | "library"
  | "archive"
  | "needs_review"
  | "rejected";
```

Add to `Track`:

```ts
archiveStatus?: TrackArchiveStatus;
```

Repair default:

```text
archiveStatus = "library"
```

Meanings:

```text
library = imported but not curated
archive = approved for programming
needs_review = needs metadata/audio/mood review
rejected = keep but avoid programming
```

---

## Import Destination Model

Add explicit import destination:

```ts
export type ImportDestination =
  | "library"
  | "archive"
  | "playlist"
  | "group";
```

### Destination behavior

#### Library

```text
imports tracks into central Library
archiveStatus = library
does not add to active playlist
```

#### Archive

```text
imports tracks into central Library
archiveStatus = archive
does not add to active playlist unless explicitly chosen
```

#### Playlist

```text
imports tracks into central Library
adds imported trackIds to selected/new playlist
archiveStatus = library unless explicitly overridden
```

#### Group

```text
imports tracks into central Library
sets grouping = chosen/new group name
creates or updates manageable Library Group record if needed
archiveStatus = library unless explicitly overridden
```

---

## Import UI

Provide either destination-specific import buttons:

```text
Import to Library
Import to Archive
Import to Playlist
Import to Group
```

or a single import action that opens a destination prompt:

```text
Choose import destination:
- Library
- Archive
- Playlist
- Group
```

Do not leave one ambiguous import button.

---

## Flow Graph Regression Requirements

Target likely files:

```text
src/ui/FlowCurveCanvas.tsx
src/App.tsx
src/data/importCsv.ts
src/logic/slotGenerator.ts
src/logic/playlistAssigner.ts
```

Required:

```text
add node works after import
remove node works after import
drag node works after import
CSV import does not freeze/slow Flow Curve interaction
Library-only imports do not replace or contaminate active playlist
large catalog import does not trigger heavy reassignment on every render
```

Likely correction:

```text
Library tracks and active playlist tracks must be separated.
```

---

## Library Groups Governance

Add a compact Library Groups manager.

Do not reintroduce a large Source Pools sidebar stack.

Minimum group manager fields:

```text
Group name
Track count
Source / type
View
Rename
Remove
```

Minimum actions:

```text
View group tracks
Rename group
Remove group record
Clean Empty Groups
```

### Clean Empty Groups

Add action:

```text
Clean Empty Groups
```

Behavior:

```text
removes sourcePools/groups with 0 tracks
removes duplicate group records where safe
does not delete tracks
does not clear track grouping unless explicit
```

### Removing a group

Safe default:

```text
delete group record only
do not delete tracks
do not clear grouping unless explicitly chosen
```

---

## Settings Menu Correction

Move these out of the small Settings dropdown:

```text
source filters
grouping filter
mood filter
genre filter
owner filter
min rating
target tracks
regeneration mode
generate/regenerate action
```

Place them above the list they affect:

```text
Playlist Rules / Smart Fill bar
```

Expected UX:

```text
change filter → visible list/result changes
change target count → visible result changes
generate → inspect rows
```

---

## Template Demotion / Rename

Do not expand `Template` as a product concept.

Preserve internal `playlistRole: "template"` only if needed for compatibility.

Preferred user-facing labels:

```text
Playlist Rules
Smart Fill
Source Rules
Generate Playlist
Generated Playlist
```

Suggested label replacements:

```text
Template Source Filters → Playlist Source Rules
Create Playlist from Template → Generate Playlist
Playlist Role: Template → Smart Fill / Rules
```

---

## Archive-Aware Generation

Playlist generation should prefer:

```text
archiveStatus = archive
```

unless the user explicitly includes Library/unreviewed tracks.

Add source scope:

```text
Source Scope:
- Archive only
- Library + Archive
- Needs Review
```

Default:

```text
Archive only if Archive has tracks.
If Archive is empty, fall back to Library with visible warning.
```

---

## Non-Goals

Do not implement:

```text
full smart playlist engine
rating-weighted generation
AI mood classification
mood-driven visuals
old Mood Map UI
full Mixxx DB import
advanced duplicate detection
album art bulk upload
event recurrence/calendar redesign
WOS postMessage
snapshot button
waveform/beatgrid/phrase analysis
```

---

## Implementation Targets

Likely files:

```text
src/data/trackTypes.ts
src/data/importCsv.ts
src/data/playProjectStorage.ts
src/data/playProjectTypes.ts
src/ui/MainTrackWindow.tsx
src/ui/FileManager.tsx
src/ui/PlaylistHeader.tsx
src/ui/FlowCurveCanvas.tsx
src/logic/libraryFilters.ts
src/logic/sourcePoolFill.ts
src/App.tsx
src/styles.css
```

Possible new files:

```text
src/data/importDestinationTypes.ts
src/ui/ImportDestinationDialog.tsx
src/ui/LibraryGroupsPanel.tsx
```

---

## Acceptance Criteria

### A. Import destination is explicit

Import flow asks or clearly shows destination:

```text
Library
Archive
Playlist
Group
```

---

### B. Import to Library does not disrupt active playlist

Importing `Music_Catalog_365.csv` to Library should not replace/damage the current playlist or Flow Graph.

---

### C. Flow Graph node controls work

After import:

```text
add node works
remove node works
drag node works
curve responds normally
```

---

### D. Library Groups are manageable

User can:

```text
view groups
see track counts
rename group
remove group record
clean empty groups
```

---

### E. Invisible group problem is addressed

Existing hidden/empty groups become visible/manageable or removable.

---

### F. Settings is simplified

Playlist source/generation controls are visible near the affected list, not buried only in Settings.

---

### G. Template wording is reduced

UI prefers:

```text
Playlist Rules
Smart Fill
Source Rules
Generate Playlist
```

---

### H. Archive status exists

Tracks can be marked:

```text
library
archive
needs_review
rejected
```

and filtered by that status.

---

### I. Project JSON round-trip

After import/group/archive edits:

```text
export Project JSON
clear LocalStorage
import Project JSON
```

archive status, groups, and playlist rules survive.

---

### J. 0624A–E behavior does not regress

Must still work:

```text
bulk metadata edit
moodSuggestions
Apply Suggestions to Moods
library filters
grouping
sourceOwner
rating
generated playlists
Broadcast HUD
Map Channel
```

---

### K. TypeScript clean

Run:

```bash
cd /Users/studio/Projects/wall-of-sound/play/flow-curve-builder
npm run build
```

Expected:

```text
TypeScript exits 0 or only pre-existing errors remain with no new errors
```

If pre-existing errors remain, report exact count.

---

## Manual Test Checklist

1. Start PLAY.

```bash
cd /Users/studio/Projects/wall-of-sound/play/flow-curve-builder
npm run dev
```

2. Import `Music_Catalog_365.csv`.

3. Choose:

```text
Library
```

4. Confirm active playlist is not destroyed.

5. Confirm Flow Curve add/remove/drag works.

6. Import a small CSV to:

```text
Playlist
```

7. Confirm it adds to selected/new playlist.

8. Create Library Group from selection.

9. Open Library Groups manager.

10. Confirm group appears with track count.

11. Rename group.

12. Remove group record.

13. Run:

```text
Clean Empty Groups
```

14. Confirm empty/invisible group count decreases.

15. Mark selected tracks as:

```text
Archive
```

16. Filter Archive.

17. Use Playlist Rules / Smart Fill controls above the list to generate from Archive/group/mood filters.

18. Export Project JSON.

19. Clear LocalStorage.

20. Import Project JSON.

21. Confirm archive status, groups, filters, rules, mood suggestions, and confirmed moods survive.

---

## Expected Result

PLAY stops treating import, groups, and templates as hidden or ambiguous systems.

The app moves toward the intended catalog hierarchy:

```text
Library = everything imported
The Archive = curated usable catalog
Playlists = programmed outputs from the Archive
```

The user can import with intent, manage groups visibly, keep the Flow Graph stable, and iterate playlist rules where results are visible.

---

## Implementation Guide

- **Where:** Work mainly in import flow, `MainTrackWindow`, `FileManager`, `PlaylistHeader`, `FlowCurveCanvas`, group management, and storage repair.
- **What:** Add explicit import destinations, restore Flow Graph responsiveness, make Library Groups visible/manageable, move generation rules out of hidden Settings, and introduce Archive status.
- **Expect:** The catalog architecture becomes clearer: Library for everything, Archive for curated music, Playlists for programmed outputs.
