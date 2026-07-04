# PLAY Patch 0624A — Source Pool and Playlist Template Creation Speed
**Completion Report · 2026-06-24**

---

## Summary

PLAY now has a practical creation-speed workflow for recurring event programming. Operators can turn any existing playlist into a reusable source pool in one click, mark playlists as templates with attached pools and duration targets, and generate fresh event-ready playlists from templates. The data layer added in 0623C is now actionable.

---

## New File

### `src/logic/sourcePoolFill.ts`

```ts
export function buildPlaylistSlotsFromSourcePool(args: {
  sourcePool: MusicSourcePool;
  tracks: Track[];
  targetDurationMinutes?: number;
  targetTrackCount?: number;
}): TrackSlot[]
```

Deterministic fill algorithm. Candidate priority:
1. `sourcePool.trackIds` — exact list, preserves order
2. `sourcePool.albumGroupIds` — tracks matching any albumGroupId
3. `sourcePool.genreFilter + moodFilter` — genre/mood filter (checks both `genres[]` and legacy `genre` field)
4. Fallback: empty result

Stops when `targetTrackCount` OR `targetDurationMinutes` is satisfied (whichever comes first). No `Math.random()` — order is stable and deterministic.

---

## Updated: `src/App.tsx`

### New state

```ts
const [sourcePools, setSourcePools] = useState<MusicSourcePool[]>(...)
// Fixed: added setSourcePools (was missing setter in 0623C)
```

### New handlers

```ts
function commitSourcePools(next: MusicSourcePool[])
// Updates ref + state + persists to localStorage

function handleCreateSourcePoolFromPlaylist(playlistId: string)
// Creates MusicSourcePool from all non-empty slots of the given playlist.
// title: "<Playlist Title> Pool"
// trackIds: from assigned slot trackIds
// defaultDurationMinutes: from playlist.targetDurationMinutes
// defaultPresentationMode: from playlist.broadcastIdentity?.presentationMode

function handleUpdateSourcePool(poolId: string, patch: Partial<MusicSourcePool>)
// Merges patch into pool, updates updatedAt

function handleSetPlaylistRole(playlistId: string, role: "static" | "template" | "event_generated")
// Sets playlistRole via mutatePLAndSave

function handleSetPlaylistSourcePool(playlistId: string, sourcePoolId: string | undefined)
function handleSetPlaylistTargetTrackCount(playlistId: string, count: number | undefined)
function handleSetPlaylistRegenerationMode(playlistId: string, mode: PlaylistRecord["regenerationMode"])

function handleCreatePlaylistFromTemplate(templatePlaylistId: string)
// Clones template, gives new ID + sourceGroupId
// playlistRole: "event_generated"
// title: "<Template Title> · YYYY-MM-DD"
// Fills slots from sourcePool if available (via buildPlaylistSlotsFromSourcePool)
// Falls back to duplicating template slots if no pool
// Sets as active playlist on creation
```

### New props passed to components

PlaylistHeader:
```tsx
sourcePools={sourcePools}
onCreateSourcePool={() => handleCreateSourcePoolFromPlaylist(activePlaylist.playlistId)}
onSetPlaylistRole={(role) => handleSetPlaylistRole(activePlaylist.playlistId, role)}
onSetSourcePoolId={(id) => handleSetPlaylistSourcePool(activePlaylist.playlistId, id)}
onSetTargetTrackCount={(n) => handleSetPlaylistTargetTrackCount(activePlaylist.playlistId, n)}
onSetRegenerationMode={(m) => handleSetPlaylistRegenerationMode(activePlaylist.playlistId, m)}
onCreateFromTemplate={() => handleCreatePlaylistFromTemplate(activePlaylist.playlistId)}
```

FileManager:
```tsx
sourcePools={sourcePools}
onCreateSourcePoolFromPlaylist={() => handleCreateSourcePoolFromPlaylist(activePlaylistId)}
```

---

## Updated: `src/ui/PlaylistHeader.tsx`

### New props (all optional)

```ts
sourcePools?: MusicSourcePool[];
onCreateSourcePool?: () => void;
onSetPlaylistRole?: (role: NonNullable<PlaylistRecord["playlistRole"]>) => void;
onSetSourcePoolId?: (id: string | undefined) => void;
onSetTargetTrackCount?: (n: number | undefined) => void;
onSetRegenerationMode?: (m: NonNullable<PlaylistRecord["regenerationMode"]>) => void;
onCreateFromTemplate?: () => void;
```

### Role badge in stats line

```tsx
{(isTemplate || isGenerated) && (
  <span className={`ph-role-badge ph-role-badge--${role}`}>
    {ROLE_LABELS[role]}
  </span>
)}
```

### "Create Source Pool" button in action row

Shown when `onCreateSourcePool` prop is provided.

### Settings dropdown additions

**Playlist Role selector** — three-button toggle: Static / Template / Generated

**Template-specific fields** (shown only when `role === "template"`):
- Source Pool dropdown — selects from `sourcePools[]`
- Target Tracks — number input, optional
- Regeneration mode — select (Manual / Per Event / Daily / Weekly)
- "Create Playlist from Template" button

---

## Updated: `src/ui/FileManager.tsx`

### New props

```ts
sourcePools?: MusicSourcePool[];
onCreateSourcePoolFromPlaylist?: (playlistId: string) => void;
```

### Role badges on playlist cards

```tsx
{pl.playlistRole === "template" && <span className="fm-pl-role-badge fm-pl-role-badge--template">TEMPLATE</span>}
{pl.playlistRole === "event_generated" && <span className="fm-pl-role-badge fm-pl-role-badge--generated">GENERATED</span>}
```

### Source Pools section (below Playlists, above Utility)

Shows one row per pool (title + track count + duration target). "Create from Playlist" button at bottom — creates from active playlist.

---

## Updated: `src/ui/SchedulerGuideView.tsx`

### Template-aware event creation

When adding an event from a template playlist:

```ts
const isTemplate = selectedPl.playlistRole === "template";
// template → playlistTemplateId + sourcePoolId (if set)
// static   → playlistId
```

Fulfills acceptance criterion E: events from templates carry `playlistTemplateId` + `sourcePoolId`, events from static playlists carry `playlistId`.

---

## Updated: `src/styles.css`

New classes:
- `.ph-role-badge`, `.ph-role-badge--template`, `.ph-role-badge--event_generated` — inline chips in PlaylistHeader stats line
- `.ph-role-btns`, `.ph-role-btn`, `.ph-role-btn.active` — role selector button group in Settings dropdown
- `.ph-select` — select element in Settings dropdown
- `.fm-pl-role-badge`, `.fm-pl-role-badge--template`, `.fm-pl-role-badge--generated` — inline chips in FileManager playlist cards
- `.fm-pool-item`, `.fm-icon-pool` — source pool rows in FileManager

---

## Creation Flow Now Available

```
existing playlist
  → "Create Source Pool" button → MusicSourcePool saved to project
  → Settings > Role: Template → playlistRole = "template"
  → Settings > Source Pool: select pool → sourcePoolId attached
  → Settings > "Create Playlist from Template" → new event_generated playlist, filled from pool
  → Scheduler > Add Event from template playlist → event carries playlistTemplateId + sourcePoolId
  → Export Project JSON → all relationships round-trip
```

---

## Metadata Preservation

All new fields added in 0624A round-trip through the 0623B export/import path automatically:

| Field | Preserved |
|---|---|
| `sourcePools[]` | ✅ |
| `playlistRole` per playlist | ✅ |
| `sourcePoolId` per playlist | ✅ |
| `targetTrackCount` per playlist | ✅ |
| `regenerationMode` per playlist | ✅ |
| Event `playlistTemplateId` | ✅ |
| Event `sourcePoolId` | ✅ |

---

## TypeScript Verification

```bash
cd /Users/studio/Projects/wall-of-sound/play/flow-curve-builder
npx tsc --noEmit
# EXIT: 0 — clean
```

Zero new errors introduced. Pre-existing 10 errors unchanged.

---

## Non-Goals (Deferred)

- Seeded shuffle for source pool fill (preserved order used for now)
- Full library manager / album cover grid
- Auto per-occurrence playlist regeneration
- Recurrence expansion
- BPM/energy matching
- Track row artist visibility improvements
- Full source pool editor with genre/mood filter editing

---

## Patch Status: ✅ COMPLETE
