# 0623C_PLAY_EventFirstProgrammingAndLibraryFoundationPatch_v1.0.0_PATCH

## Status

Ready for implementation.

## Priority

P0 / Product Architecture Foundation

This patch reframes PLAY from a playlist scheduler into an event-first programming system.

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

## Product Reframe

The old model was:

```text
make playlist → schedule playlist
```

The new model is:

```text
create event → attach playlist logic → broadcast event → archive/promote event
```

This is now the correct 24/7 channel model.

---

## Product Lock

```text
Events are what we promote.
Playlists are reusable engines.
Library is the central music source.
Scheduler is the event calendar.
Broadcast HUD is the live stage.
WOS is the spatial visual world.
```

A playlist can still exist independently, but scheduled programming should now be event-first.

---

## Problem

PLAY currently treats playlists as the main scheduled object.

That is limiting because:

- playlists are weak promotional objects unless users can directly click/listen
- events are easier to promote on calendars, social posts, Pinterest, Instagram, and YouTube community pages
- recurring events can reuse dynamic playlist logic while generating fresh track orders
- 24/7 programming needs named events, not just playlist blocks
- the Scheduler should represent what listeners would attend, not just internal playlist slots

Example:

```text
Weak:
  Schedule playlist “Microhouse 04”

Strong:
  Schedule event “Midnight Grid”
  Every Thursday · 12 AM–2 AM
  Uses Microhouse 100 source pool
  Generates a fresh 15-track playlist each occurrence
  Broadcasts through Map Channel / Cyan Night Grid
```

---

## Goal

Create the foundation for event-first programming and centralized music library organization.

This patch should not build the entire recurrence engine or full library manager. It should establish the types, relationships, UI language, and minimal workflows needed so future patches can build on the right model.

---

## Required Concepts

### 1. Central Music Library

The library is the reusable track source.

A library track should eventually support:

```text
artist
title
album / release / group
source owner: StudioRich / external
genres
subgenres
mood tags
BPM
duration
energy
cover art
rights/status
last used
usage count
```

For this patch, do not rewrite all track handling. Add lightweight foundations only.

Required minimum additions to track/library typing if not already present:

```ts
artist?: string;
albumTitle?: string;
albumGroupId?: string;
sourceOwner?: "studiorich" | "external" | "unknown";
genres?: string[];
moodTags?: string[];
```

If equivalent fields already exist, reuse them.

---

### 2. Source Pools / Album Groups

A source pool is a reusable group of tracks that a playlist/event can pull from.

Examples:

```text
Microhouse 100
Stranger Vibes Collection
StudioRich Originals
Late Night Map Drift
NYC Grid Music
External Artist Picks
```

Add a basic type:

```ts
export type MusicSourcePool = {
  id: string;
  title: string;
  description?: string;
  artistFilter?: string[];
  genreFilter?: string[];
  moodFilter?: string[];
  albumGroupIds?: string[];
  trackIds?: string[];
  defaultDurationMinutes?: number;
  defaultPresentationMode?: string;
  defaultMapStyleId?: string;
  createdAt: string;
  updatedAt: string;
};
```

This does not need a full editor yet. Seed support and project persistence are enough.

---

### 3. Playlist Template / Dynamic Playlist Role

A playlist can be:

```text
static playlist
dynamic playlist template
event-attached generated playlist
```

Add or prepare playlist fields:

```ts
playlistRole?: "static" | "template" | "event_generated";
sourcePoolId?: string;
targetDurationMinutes?: number;
targetTrackCount?: number;
regenerationMode?: "manual" | "per_event_occurrence" | "daily" | "weekly";
```

For this patch, existing playlists should default to:

```text
playlistRole = "static"
```

Do not break existing playlists.

---

### 4. Broadcast Event

Add a first-class event type.

```ts
export type BroadcastEvent = {
  id: string;
  title: string;
  description?: string;

  startIso: string;
  endIso: string;

  recurrence?: BroadcastEventRecurrence;

  playlistId?: string;
  playlistTemplateId?: string;
  sourcePoolId?: string;

  presentationMode?: string;
  mapStyleId?: string;
  smartGridPresetId?: string;

  promoImageUrl?: string;
  coverImageUrl?: string;
  backgroundImageUrl?: string;

  tags?: string[];
  genres?: string[];
  moodTags?: string[];
  locationTags?: string[];

  status: "draft" | "scheduled" | "live" | "completed" | "archived";

  createdAt: string;
  updatedAt: string;
};
```

Recurrence foundation:

```ts
export type BroadcastEventRecurrence = {
  frequency: "none" | "daily" | "weekly" | "monthly";
  interval?: number;
  byWeekday?: Array<"MO" | "TU" | "WE" | "TH" | "FR" | "SA" | "SU">;
  untilIso?: string;
  count?: number;
};
```

For this patch, recurrence may be data-only. Full recurrence expansion can be a later patch.

---

## Scheduler Reframe

Scheduler UI language should begin shifting from playlist blocks to events.

Existing schedule blocks can remain internally, but they should be understood as event blocks.

Required visible language changes where low-risk:

```text
Schedule Block → Event
Add Block → Add Event
Now Playlist → Now Event
Next Playlist → Next Event
```

Do not rename every internal variable if that creates risk. Product language can shift first.

---

## Required Behavior

### 1. Existing projects must still load

All previous Project JSON and LocalStorage projects must repair cleanly.

Migration defaults:

```text
existing playlists → playlistRole: "static"
missing sourcePools → []
missing events → []
existing schedule blocks → preserved
```

If schedule blocks already exist, do not destroy them.

---

### 2. Project storage must include new foundations

Persist:

```text
sourcePools
broadcastEvents
playlistRole/sourcePool fields
track artist/genre/mood additions
```

Project export/import from 0623B must include these fields automatically.

If the project storage schema is versioned, bump or repair version as appropriate.

---

### 3. Add minimal event data path

Add data model support so an event can reference:

```text
playlistId
playlistTemplateId
sourcePoolId
presentationMode
mapStyleId
```

No full event editor is required yet, but at least one low-risk creation path should exist if feasible:

```text
Create Event from Playlist
```

or:

```text
Add Event
```

Minimum acceptable UI:

- Button in Scheduler: `Add Event`
- Creates a draft/scheduled event for the currently active playlist
- Uses playlist title as default event title
- Uses active playlist presentation mode
- Uses a default 2-hour duration

If that is too risky, add the type/persistence only and document as foundation. But prefer a small visible proof.

---

### 4. Make Scheduler clickable into playlist editing

If feasible in this patch:

```text
Click event/block → opens attached playlist in editor
```

This is important because event programming and playlist editing should stay connected.

Minimum:

- Scheduler row/card uses `playlistId`
- clicking it calls existing playlist selection handler
- workspace can remain Scheduler unless existing patterns allow switching to Flow-Curve

Do not overbuild routing.

---

### 5. Keep playlist scheduling behavior intact

Current Scheduler behavior must not regress.

Existing now/next resolution should continue to work.

Existing Broadcast HUD scheduled display should continue to work.

This patch is a model foundation, not a scheduler rewrite.

---

## Non-Goals

Do not implement these in this patch:

- full recurrence expansion engine
- full calendar month/week/day redesign
- drag/drop event calendar
- auto-generation of dynamic playlists
- recently-used avoidance
- full central music library UI
- album cover grid view
- map style editor
- snapshot button
- audio-reactive grid gestures
- swarm fish
- WOS postMessage control
- scheduler autoplay
- public event pages
- cloud publishing

Those are later patches.

---

## Implementation Targets

Likely files to inspect/change:

```text
src/data/playlistTypes.ts
src/data/scheduleTypes.ts
src/data/playProjectStorage.ts
src/data/playProjectExport.ts
src/App.tsx
src/ui/SchedulerGuideView.tsx
src/ui/TopBar.tsx
```

Possible new files:

```text
src/data/eventTypes.ts
src/data/sourcePoolTypes.ts
src/logic/eventResolver.ts
```

Keep this patch lean.

---

## Suggested Data Additions

### sourcePoolTypes.ts

```ts
export type MusicSourcePool = {
  id: string;
  title: string;
  description?: string;
  artistFilter?: string[];
  genreFilter?: string[];
  moodFilter?: string[];
  albumGroupIds?: string[];
  trackIds?: string[];
  defaultDurationMinutes?: number;
  defaultPresentationMode?: string;
  defaultMapStyleId?: string;
  createdAt: string;
  updatedAt: string;
};
```

### eventTypes.ts

```ts
export type BroadcastEventStatus =
  | "draft"
  | "scheduled"
  | "live"
  | "completed"
  | "archived";

export type BroadcastEventRecurrence = {
  frequency: "none" | "daily" | "weekly" | "monthly";
  interval?: number;
  byWeekday?: Array<"MO" | "TU" | "WE" | "TH" | "FR" | "SA" | "SU">;
  untilIso?: string;
  count?: number;
};

export type BroadcastEvent = {
  id: string;
  title: string;
  description?: string;
  startIso: string;
  endIso: string;
  recurrence?: BroadcastEventRecurrence;
  playlistId?: string;
  playlistTemplateId?: string;
  sourcePoolId?: string;
  presentationMode?: string;
  mapStyleId?: string;
  smartGridPresetId?: string;
  promoImageUrl?: string;
  coverImageUrl?: string;
  backgroundImageUrl?: string;
  tags?: string[];
  genres?: string[];
  moodTags?: string[];
  locationTags?: string[];
  status: BroadcastEventStatus;
  createdAt: string;
  updatedAt: string;
};
```

---

## Suggested Migration / Repair Rules

In `repairStoredProject`:

```text
if sourcePools missing → []
if broadcastEvents missing → []
for each playlist:
  if playlistRole missing → "static"
  if targetDurationMinutes missing and duration exists → preserve existing behavior
for each track:
  if genres missing → []
  if moodTags missing → []
  if sourceOwner missing → "unknown"
```

Do not wipe existing unknown fields.

---

## Acceptance Criteria

### A. Existing projects still load

Import or load a 0623B project JSON.

Expected:

```text
project loads
playlists remain
tracks remain
Map Channel remains
scheduler remains
no data loss
```

---

### B. New fields persist

After a save/export/import cycle, project JSON includes:

```text
sourcePools
broadcastEvents
playlistRole
track artist/genre/mood/source owner fields when present
```

---

### C. Scheduler language begins event shift

Scheduler visible UI should reference events where practical:

```text
Add Event
Now Event
Next Event
```

Do not break existing schedule behavior.

---

### D. Event can reference playlist

At minimum, event model supports attaching:

```text
playlistId
sourcePoolId
presentationMode
```

If UI creation is implemented, created event should reference the active playlist.

---

### E. Click event/block opens playlist

If clickable row/card is implemented:

```text
click scheduled event/block
→ active playlist changes to the attached playlist
```

No crash if playlist is missing.

---

### F. TypeScript clean for touched files

Run:

```bash
cd /Users/studio/Projects/wall-of-sound/play/flow-curve-builder
npm run build
```

Expected:

```text
no new TypeScript errors from this patch
```

Existing unrelated build issues may remain only if already known.

---

## Manual Test Checklist

1. Start PLAY.

```bash
cd /Users/studio/Projects/wall-of-sound/play/flow-curve-builder
npm run dev
```

2. Import a known-good 0623B Project JSON.

3. Confirm playlists still load.

4. Open Scheduler.

5. Confirm event language appears where implemented.

6. Create an event from active playlist if UI was added.

7. Export Project JSON.

8. Inspect JSON for:

```text
sourcePools
broadcastEvents
playlistRole
```

9. Clear LocalStorage.

10. Import the new JSON.

11. Confirm event/playlist relationship survives.

12. Confirm Broadcast HUD still works.

13. Confirm Map Channel still shows WOS.

---

## Expected Result

PLAY begins operating as an event-first programming system without breaking the current playlist editor or scheduler.

The system becomes ready for the next layer:

```text
recurring events
source pools
dynamic playlist generation
calendar views
event promotion images
map style presets
```

---

## Implementation Guide

- **Where:** Work inside `/Users/studio/Projects/wall-of-sound/play/flow-curve-builder`, mainly data types/storage repair plus Scheduler foundation UI.
- **What:** Add BroadcastEvent and MusicSourcePool foundations, shift Scheduler language toward events, and preserve all existing playlist/schedule behavior.
- **Expect:** PLAY can now model promoted recurring events as the real programming object while playlists become reusable music engines attached to those events.
