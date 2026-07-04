# PLAY Patch 0623C — Event-First Programming and Library Foundation
**Completion Report · 2026-06-23**

---

## Summary

PLAY now carries the foundational data model for event-first programming. `BroadcastEvent` and `MusicSourcePool` types are established, the track library has been extended with `genres`, `moodTags`, `sourceOwner`, `albumTitle`, and `albumGroupId`, playlists carry `playlistRole` (defaulting to `"static"`), and the Scheduler has shifted its visible language from "blocks" to "events". Clicking a scheduled event row now opens the attached playlist in the editor. All existing playlist/schedule behavior is preserved without regression.

---

## Product Reframe Applied

| Old model | New model |
|---|---|
| schedule playlist | create event → attach playlist → broadcast |
| playlist is the main scheduled object | event is the promoted object; playlist is the music engine |
| "Add to Schedule" | "Add Event" |
| "Playlist / Program" | "Event / Program" |
| "NOW" / "NEXT" | "NOW EVENT" / "NEXT EVENT" |

---

## New Files

### `src/data/eventTypes.ts`

```ts
BroadcastEventStatus = "draft" | "scheduled" | "live" | "completed" | "archived"

BroadcastEventRecurrence = {
  frequency: "none" | "daily" | "weekly" | "monthly";
  interval?, byWeekday?, untilIso?, count?
}

BroadcastEvent = {
  id, title, description?,
  startIso, endIso,
  recurrence?,
  playlistId?, playlistTemplateId?, sourcePoolId?,
  presentationMode?, mapStyleId?, smartGridPresetId?,
  promoImageUrl?, coverImageUrl?, backgroundImageUrl?,
  tags?, genres?, moodTags?, locationTags?,
  status: BroadcastEventStatus,
  createdAt, updatedAt
}
```

### `src/data/sourcePoolTypes.ts`

```ts
MusicSourcePool = {
  id, title, description?,
  artistFilter?, genreFilter?, moodFilter?,
  albumGroupIds?, trackIds?,
  defaultDurationMinutes?, defaultPresentationMode?, defaultMapStyleId?,
  createdAt, updatedAt
}
```

---

## Updated: `src/data/trackTypes.ts`

Added library foundation fields:

```ts
albumTitle?: string;
albumGroupId?: string;
sourceOwner?: "studiorich" | "external" | "unknown";
genres?: string[];
moodTags?: string[];
```

---

## Updated: `src/data/playProjectTypes.ts`

Added to `PlaylistRecord`:
```ts
playlistRole?: "static" | "template" | "event_generated";
sourcePoolId?: string;
targetTrackCount?: number;
regenerationMode?: "manual" | "per_event_occurrence" | "daily" | "weekly";
```

Added to `PlayProject`:
```ts
sourcePools?: MusicSourcePool[];
broadcastEvents?: BroadcastEvent[];
```

Imports added: `MusicSourcePool` from `sourcePoolTypes`, `BroadcastEvent` from `eventTypes`.

---

## Updated: `src/data/playProjectStorage.ts`

New repair rules in `repairStoredProject`:
- `sourcePools`: backfill `[]` if missing
- `broadcastEvents`: backfill `[]` if missing
- `playlistRole`: backfill `"static"` per playlist if missing
- `genres`, `moodTags`: backfill `[]` per track if missing
- `sourceOwner`: backfill `"unknown"` per track if missing

---

## Updated: `src/App.tsx`

New state:
```ts
const [broadcastEvents, setBroadcastEvents] = useState<BroadcastEvent[]>(...)
const [sourcePools] = useState<MusicSourcePool[]>(...)
const broadcastEventsRef = useRef<BroadcastEvent[]>([])
const sourcePoolsRef = useRef<MusicSourcePool[]>([])
```

`makeProj` updated to include `sourcePools` and `broadcastEvents` so both round-trip through autosave and export (via 0623B).

`applyProject` updated to hydrate `broadcastEvents` on import/load.

New handler:
```ts
function handleAddBroadcastEvent(event: BroadcastEvent) {
  // appends to broadcastEventsRef + state + saves to localStorage
}
```

SchedulerGuideView call updated:
```tsx
<SchedulerGuideView
  ...
  broadcastEvents={broadcastEvents}
  onAddEvent={handleAddBroadcastEvent}
  onSelectPlaylist={setActivePlaylistId}
/>
```

---

## Updated: `src/ui/SchedulerGuideView.tsx`

### Language shift

| Before | After |
|---|---|
| "Add to Schedule" | "Add Event" |
| "Playlist / Program" | "Event / Program" |
| "NOW" card label | "NOW EVENT" |
| "NEXT" card label | "NEXT EVENT" |
| "No scheduled blocks yet. Add a playlist above..." | "No events scheduled yet. Add a playlist above..." |
| Remove "block" tooltip | "Remove event" |

### New props

```ts
broadcastEvents?: BroadcastEvent[]
onAddEvent?: (event: BroadcastEvent) => void
onSelectPlaylist?: (playlistId: string) => void
```

### Add Event behavior

"Add Event" now creates both:
1. A `ScheduleBlock` (existing path — feeds Now/Next resolution, HUD timing, Smart Grid)
2. A `BroadcastEvent` record (new — persisted in `broadcastEvents[]`, round-trips through export)

The `BroadcastEvent` captures: `title` (from playlist), `startIso`, `endIso` (start + 2h), `playlistId`, `presentationMode` (from playlist's `broadcastIdentity`), `status: "scheduled"`.

### Clickable event rows

```tsx
{b.playlistId && onSelectPlaylist ? (
  <button className="sched-pl-link" onClick={() => onSelectPlaylist(b.playlistId!)}>
    {b.title}
  </button>
) : b.title}
```

Clicking opens the attached playlist in the Flow-Curve editor. No crash if playlist is missing (falls back to text).

### Event count badge

```tsx
{broadcastEvents.length > 0 && (
  <div className="sched-event-count">{broadcastEvents.length} events</div>
)}
```

---

## Updated: `src/styles.css`

```css
.sched-pl-link { /* button styled as underlined text link */ }
.sched-pl-link:hover { color: var(--accent); }
.sched-event-count { /* pill badge in scheduler header */ }
```

---

## What Persists Through Export/Import

All new fields round-trip through the 0623B export/import path automatically:

| Field | Preserved |
|---|---|
| `broadcastEvents[]` | ✅ |
| `sourcePools[]` | ✅ |
| `playlistRole` per playlist | ✅ |
| `sourcePoolId` per playlist | ✅ |
| `genres`, `moodTags` per track | ✅ |
| `sourceOwner` per track | ✅ |
| `albumTitle`, `albumGroupId` per track | ✅ |

Repair applied on import: all missing fields backfilled without data loss.

---

## What Is NOT Implemented (Non-Goals in This Patch)

- Full recurrence expansion engine
- Calendar month/week/day redesign
- Auto-generation of dynamic playlists from source pools
- Central music library UI / album cover grid
- Map style editor
- Source pool editor UI
- Event status transitions
- Public event pages / cloud publishing

---

## TypeScript Verification

```bash
cd /Users/studio/Projects/wall-of-sound/play/flow-curve-builder
npx tsc --noEmit
# EXIT: 0 — clean
```

Build errors: same 10 pre-existing errors. Zero new errors introduced.

---

## Patch Status: ✅ COMPLETE
