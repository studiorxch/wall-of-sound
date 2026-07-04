# 0620B_PLAY_PlaylistIdentityPatch_v1.0.0_PATCH

## Patch Name

**PLAY Playlist Identity Patch**

## Version

`v1.0.0`

## Date

2026-06-20

## Status

Draft for implementation

---

# 1. Purpose

PLAY now has the core playlist workbench and first reliability layer working:

```text
0619A — multi-playlist workspace
0619B — drag-to-playlist
0619C — explicit Fill Missing Time / Regenerate From Curve controls
0620A — playlist integrity + playback safety
```

0620B shifts the playlist from being only a technical container into a recognizable **playlist-channel identity object**.

This patch adds the first practical metadata and UI layer for:

```text
cover image
background image
description / mood note
created / updated dates
playlist card treatment
broadcast identity metadata stub
```

The goal is not to build the broadcast scene yet. The goal is to make each playlist feel like an authored music object that can later become a channel, release, schedule block, or stream scene.

Core principle:

```text
A playlist is not just a track list.
A playlist is a music identity object.
```

---

# 2. Product Context

Most playlist systems treat playlists as flat catalog rows:

```text
title
cover
track list
play button
```

PLAY should treat playlists as programmable channel objects:

```text
music
flow curve
mood
cover art
background art
map/world treatment
now-playing style
schedule role
```

This patch implements the first visible layer of that model.

---

# 3. Scope

## Included

### A. Playlist Identity Fields

Add or finalize playlist metadata fields:

- `description`
- `coverImage`
- `backgroundImage`
- `accentColor`
- `createdAt`
- `updatedAt`
- optional `moodTags`
- optional `broadcastIdentity` stub

### B. Playlist Header Identity UI

Improve active playlist header:

- cover thumbnail / placeholder
- playlist title
- description / mood note
- readable track count + duration
- created / updated date
- basic identity actions

### C. File Manager Playlist Cards

Improve playlist rows/cards in the left file manager:

- thumbnail placeholder or cover image
- playlist title
- track count
- duration
- updated date or created year
- active state

### D. Cover Image Support

Allow user to set or clear a playlist cover image.

Minimum v1:

- paste image URL or select local file if already easy
- store image reference in playlist record
- show cover in header and file manager

### E. Background Image Support

Allow user to set or clear a playlist background image.

Minimum v1:

- paste image URL or select local file if already easy
- store image reference in playlist record
- show as subtle header/background preview if safe
- do not implement full broadcast background rendering yet

### F. Broadcast Identity Stub

Add metadata fields now for future broadcast use, without building the broadcast window.

---

# 4. Non-Goals

Do not implement in this patch:

- 24-hour scheduler
- 7-day scheduler
- actual Broadcast window channel rendering
- OBS overlay output
- playlist cover generator
- AI image generation
- image cropping/editor UI
- per-track cover art
- Now Playing metadata editor
- mood vector analysis
- valence/density analyzer
- waveform mixer
- cloud upload/storage
- public sharing
- user accounts

This is a metadata + UI foundation patch.

---

# 5. Data Model

Update `PlaylistRecord` to include identity fields.

If these already exist from 0619A, formalize and wire them into UI.

Recommended types:

```ts
export type PlaylistImageSource =
  | "uploaded"
  | "url"
  | "generated"
  | "imported"
  | "none";

export type PlaylistImage = {
  src: string;
  source: PlaylistImageSource;
  createdAt: string;
  alt?: string;
};

export type PlaylistMood = {
  description?: string;
  tags?: string[];
  energyBias?: number;
  valenceBias?: number;
  densityBias?: number;
  confidence?: number;
};

export type PlaylistBroadcastIdentity = {
  presentationMode?: "card" | "overlay" | "full_scene" | "map_channel";
  mapPreset?: string;
  cameraPreset?: string;
  overlayPreset?: string;
  nowPlayingStyle?: string;
  backgroundFit?: "cover" | "contain" | "tile" | "blurred";
};

export type PlaylistRecord = {
  playlistId: string;
  title: string;
  description?: string;

  slots: PlaylistSlot[];
  curvePoints: FlowCurvePoint[];

  targetDurationMinutes: number;
  mixBufferMinutes?: number;

  coverImage?: PlaylistImage;
  backgroundImage?: PlaylistImage;
  accentColor?: string;

  mood?: PlaylistMood;
  broadcastIdentity?: PlaylistBroadcastIdentity;

  createdAt: string;
  updatedAt: string;

  locked?: boolean;
  manualOrderDirty?: boolean;
  lastFillReport?: PlaylistFillReport;
};
```

Use existing project type names if they differ.

---

# 6. Migration

Existing playlists may not have identity fields.

On load/migration:

- preserve existing title
- preserve existing description if present
- add `createdAt` if missing
- add `updatedAt` if missing
- leave `coverImage` undefined
- leave `backgroundImage` undefined
- leave `accentColor` undefined or set safe default
- do not break old saved projects

If a playlist lacks `createdAt`:

```text
createdAt = project.createdAt || now
```

If a playlist lacks `updatedAt`:

```text
updatedAt = project.updatedAt || now
```

---

# 7. Playlist Header UI

The active playlist header should become an identity strip.

Recommended layout:

```text
[Cover]  Mapgasm v2.4.0
         22 tracks · 1h19m · target 2h00m
         Updated today · Created Jun 2026
         Description / mood note

         [Fill Missing Time] [Regenerate From Curve] [Export M3U] [Identity]
```

## Cover Thumbnail

Show:

- playlist cover image if present
- otherwise placeholder block with initials or icon

Placeholder examples:

```text
MG
PLAY
```

## Description Field

The description should be editable inline or via Identity panel.

Placeholder:

```text
Describe this playlist mood, use, or broadcast identity…
```

Autosave on change.

## Date Display

Show compact date info.

Examples:

```text
Updated today
Created Jun 20, 2026
```

or:

```text
Created 2026 · Updated today
```

Do not overcrowd the header.

---

# 8. File Manager Playlist Cards

Upgrade playlist rows from plain rows into compact identity cards.

Recommended compact card:

```text
[thumb] Mapgasm v2.4.0
        22 tracks · 1h19m
        Updated today
```

Active playlist card should have clear selected state.

If cover image exists, show it.

If no cover image exists, show placeholder.

## Card Interaction

Must preserve existing behavior:

- click selects playlist
- drag/drop onto playlist still works
- duplicate/delete/rename context menu still works
- keyboard access remains if currently implemented
- no regression to 0619B drag-to-playlist

---

# 9. Identity Panel / Settings

Add an `Identity` or `Playlist Identity` action.

Location:

```text
Active playlist header → [Identity]
```

or:

```text
Playlist Settings → Identity
```

Minimum panel fields:

```text
Title
Description
Cover image URL
Background image URL
Accent color
Mood tags
Clear cover
Clear background
```

If local file selection is easy, allow:

```text
Choose Cover Image
Choose Background Image
```

If not, URL input is acceptable for v1.

## Image Handling

For v1, storing image `src` is enough.

If a local file is selected and existing app storage cannot persist blobs safely, prefer URL input or data URL only if low-risk.

Do not add complex file upload infrastructure.

---

# 10. Cover Image Rules

Cover art is the playlist’s record-sleeve identity.

Used in:

- file manager playlist cards
- active playlist header
- future archive/share cards
- future broadcast intro card

Recommended aspect:

```text
1:1 square
```

But do not enforce cropping in v1.

If image fails to load:

- show placeholder
- optionally badge `image unavailable`
- do not crash

---

# 11. Background Image Rules

Background art is the playlist’s broadcast environment.

Used in future:

- full stream scene
- 10-second playlist bumper
- playlist overlay background
- record-release style event
- channel identity layer

Recommended aspect:

```text
16:9 widescreen
```

In v1:

- store it
- preview it in Identity panel
- optionally show subtle header background with dark overlay
- do not make it visually overpower the flow curve or controls

If image fails to load:

- show fallback
- do not crash

---

# 12. Accent Color

Add optional accent color per playlist.

Purpose:

- card border
- selected state
- future broadcast palette
- future now-playing overlay
- playlist identity continuity

Minimum UI:

```text
Accent color input
```

Could use:

```html
<input type="color">
```

Default can remain app theme color.

Do not over-style.

---

# 13. Mood Tags

Add simple text tags if low-risk.

Example:

```text
urban, map, night, lofi, transit, club, dawn
```

Store as array:

```ts
tags: string[]
```

Input can be comma-separated string.

Do not implement automatic mood analysis.

## Valence / Density Note

Do not build mood vector analysis yet.

But leave fields available in type:

```ts
energyBias
valenceBias
densityBias
```

These can be unused for now.

---

# 14. Broadcast Identity Stub

Add metadata only.

No broadcast rendering yet.

Recommended default:

```ts
broadcastIdentity: {
  presentationMode: "card",
  backgroundFit: "cover"
}
```

Optional UI:

```text
Presentation Mode: Card / Overlay / Full Scene / Map Channel
```

If adding UI is too much, store defaults only.

Future use:

```text
Playlist → Broadcast Window scene config
```

---

# 15. Persistence

Autosave must persist:

- description
- cover image
- background image
- accent color
- mood tags
- broadcast identity
- createdAt / updatedAt

Reload must restore all identity data.

Backup JSON must include all identity fields.

Restore JSON must restore all identity fields.

---

# 16. Export Impact

M3U export does not need to include images.

Optional:

- include playlist title as M3U comment if already supported
- no requirement to include cover/background in M3U

Backup JSON should include identity.

Future export package can include assets later, but not this patch.

---

# 17. Accessibility / Safety

- Image inputs should be labeled.
- Buttons should have text labels or accessible names.
- Broken images should not collapse layout.
- Card click target should remain clear.
- Drag/drop should not be broken by adding image thumbnails.
- Header should remain usable on smaller browser widths.

---

# 18. Expected Files To Touch

Likely files:

```text
src/App.tsx
src/components/LeftDrawer.tsx
src/components/TopBar.tsx
src/components/MainTrackWindow.tsx
src/styles.css
src/playlistTypes.ts
src/playlistProjectStorage.ts
```

Possible new files:

```text
src/components/PlaylistIdentityPanel.tsx
src/playlistIdentity.ts
src/dateFormat.ts
```

Use actual project paths.

---

# 19. Acceptance Criteria

## Data

- Playlist records support `description`.
- Playlist records support `coverImage`.
- Playlist records support `backgroundImage`.
- Playlist records support `accentColor`.
- Playlist records support `createdAt` and `updatedAt`.
- Backup JSON includes identity fields.
- Reload preserves identity fields.

## Header

- Active playlist header shows cover placeholder or cover image.
- Header shows playlist title.
- Header shows readable track count and duration.
- Header shows created/updated date info.
- Description can be edited and persists.

## File Manager

- Playlist rows/cards show thumbnail or placeholder.
- Playlist rows/cards show title.
- Playlist rows/cards show track count and duration.
- Active playlist state remains obvious.
- Drag-to-playlist still works.
- Playlist selection still works.

## Identity Panel

- User can set cover image URL or clear cover image.
- User can set background image URL or clear background image.
- User can set description.
- User can set accent color if implemented.
- Changes autosave.

## No Regressions

- Create playlist still works.
- Import/browse Library still works.
- Drag tracks into playlist still works.
- Fill Missing Time still works.
- Regenerate From Curve still works.
- Export M3U still works.
- Empty slot repair still works.
- Playback issue persistence still works.
- Reload persistence still works.

---

# 20. Manual Test Plan

## Test 1 — Description Persistence

1. Select playlist.
2. Add description:
   ```text
   Night map drift / urban electronic set
   ```
3. Reload.
4. Confirm description remains.

Expected:

```text
Description persists.
```

## Test 2 — Cover Image

1. Open Playlist Identity panel.
2. Add cover image URL.
3. Confirm cover appears in active playlist header.
4. Confirm thumbnail appears in file manager row.
5. Reload.
6. Confirm cover remains.
7. Clear cover.
8. Confirm placeholder returns.

Expected:

```text
Cover image is stored, displayed, and removable.
```

## Test 3 — Background Image

1. Add background image URL.
2. Confirm preview appears in Identity panel or header.
3. Reload.
4. Confirm background image remains.
5. Clear background.
6. Confirm safe fallback.

Expected:

```text
Background image metadata persists without disrupting UI.
```

## Test 4 — Playlist Cards

1. Create multiple playlists.
2. Add different covers/descriptions.
3. Confirm file manager cards remain compact and readable.
4. Select different playlists.
5. Confirm active playlist card state updates.

Expected:

```text
Playlist manager feels like managing music objects, not plain rows.
```

## Test 5 — Drag Regression

1. Drag Library track onto playlist with cover thumbnail.
2. Confirm track is added.
3. Drag duplicate.
4. Confirm duplicate is blocked.

Expected:

```text
Identity thumbnails do not break drag/drop.
```

## Test 6 — Backup / Restore

1. Add description, cover, background, accent color.
2. Backup JSON.
3. Restore JSON.
4. Confirm identity fields are restored.

Expected:

```text
Playlist identity travels with project backup.
```

---

# 21. Implementation Order

Recommended order:

```text
1. Add/finalize identity fields in PlaylistRecord
2. Add migration defaults for createdAt/updatedAt
3. Add date formatting helper
4. Upgrade active playlist header
5. Add PlaylistIdentityPanel
6. Upgrade file manager playlist cards
7. Wire autosave
8. Verify drag/drop regressions
9. Verify backup/restore
```

---

# 22. Claude / Codex Notes

Keep this patch focused on identity metadata and UI.

Do not start the scheduler.

Do not build image generation.

Do not attempt per-track artwork.

Do not implement full broadcast scene rendering.

The important result is:

```text
A playlist now has a visible identity.
```

This prepares the next layer:

```text
playlist → broadcast card
playlist → channel scene
playlist → schedule block
playlist → release/event object
```

---

# 23. Product Principle

```text
PLAYLIST turns playlists into programmable broadcast channels.
```

0620B gives each playlist the first visible signs of becoming a channel:

```text
title
description
cover
background
dates
visual identity
```
