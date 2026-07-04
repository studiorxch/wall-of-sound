# PLAY Patch 0624B — Source Pool as Library Metadata Hotfix
**Completion Report · 2026-06-24**

---

## Summary

The 0624A Source Pools sidebar stack is removed. Source Pools now behave as library metadata groups (DJ-library crate model), not playlist-like navigation rows. Track-level `sourcePoolIds[]` membership is added so each track knows which groups it belongs to. All template/event/export relationships from 0624A are fully preserved.

---

## Product Model Corrected

| Before (0624A) | After (0624B) |
|---|---|
| PLAYLISTS + SOURCE POOLS as two competing sidebar stacks | PLAYLISTS only in sidebar |
| Source pool = another collection row | Source pool = library group / saved filter |
| "Create Source Pool" in action row | "Create Library Group" — same action, clearer label |
| Source Pools section in left panel | Compact "Library Groups · N" count under Library section |

---

## Updated: `src/data/trackTypes.ts`

New field:

```ts
sourcePoolIds?: string[];
```

Tracks now carry membership in library groups. A track may belong to multiple groups.

---

## Updated: `src/data/playProjectStorage.ts`

New repair rule in `repairStoredProject`:

```ts
sourcePoolIds: Array.isArray(track.sourcePoolIds) ? track.sourcePoolIds : [],
```

Backfills `[]` on load for all tracks that predate this field. Existing 0624A projects load cleanly.

---

## Updated: `src/App.tsx`

### `handleCreateSourcePoolFromPlaylist`

Now additionally stamps `sourcePoolIds` on each included track after creating the pool:

```ts
const trackIdSet = new Set(trackIds);
const nextTracks = libraryTracksRef.current.map((t) =>
  trackIdSet.has(t.trackId)
    ? { ...t, sourcePoolIds: [...new Set([...(t.sourcePoolIds ?? []), poolId])] }
    : t,
);
libraryTracksRef.current = nextTracks;
setLibraryTracks(nextTracks);
savePlayProject(makeProj(playlistsRef.current, nextTracks));
```

Uses `Set` dedup to avoid duplicate pool IDs if "Create Library Group" is clicked twice on the same playlist. Track-level membership round-trips through project export/import automatically.

---

## Updated: `src/ui/FileManager.tsx`

### Removed

The full "Source Pools" sidebar section (separate list of pool rows below Playlists) is removed.

### Added (under Library section)

```tsx
{sourcePools.length > 0 && (
  <div className="fm-item fm-library-groups">
    <span className="fm-icon fm-icon-pool">◈</span>
    <span className="fm-label">Library Groups</span>
    <span className="fm-count">{sourcePools.length}</span>
  </div>
)}
{onCreateSourcePoolFromPlaylist && (
  <button className="fm-item fm-item-action" onClick={...} title="Save active playlist tracks as a reusable library group">
    <span className="fm-icon fm-icon-plus">+</span>
    <span className="fm-label">Create Library Group</span>
  </button>
)}
```

A single compact non-clickable count row shows when groups exist. "Create Library Group" action remains accessible without adding sidebar clutter.

---

## Updated: `src/ui/PlaylistHeader.tsx`

Label changes only:

- "Create Source Pool" button → "Create Library Group"
- Settings dropdown label "Source Pool" → "Library Group"

The source pool dropdown in template settings continues to work — it populates from `sourcePools[]` prop unchanged. Internal `MusicSourcePool` type name is preserved.

---

## Updated: `src/styles.css`

```css
.fm-library-groups { opacity: 0.7; cursor: default; pointer-events: none; }
.fm-item-action { opacity: 0.6; font-style: italic; }
.fm-item-action:hover { opacity: 1; font-style: normal; }
```

---

## What Is Preserved from 0624A

| Feature | Status |
|---|---|
| `src/logic/sourcePoolFill.ts` | ✅ Unchanged |
| `playlistRole` (static/template/event_generated) | ✅ Unchanged |
| `sourcePoolId` on playlists/templates | ✅ Unchanged |
| `targetTrackCount`, `regenerationMode` | ✅ Unchanged |
| Create Playlist from Template | ✅ Unchanged |
| Event inheritance of `playlistTemplateId`/`sourcePoolId` | ✅ Unchanged |
| `sourcePools[]` in project state/export/import | ✅ Unchanged |
| Role badges (TEMPLATE / GENERATED) in FileManager + PlaylistHeader | ✅ Unchanged |

---

## What Round-Trips Through Export/Import

| Field | Preserved |
|---|---|
| `sourcePools[]` | ✅ |
| `playlistRole` per playlist | ✅ |
| `sourcePoolId` per playlist | ✅ |
| `targetTrackCount`, `regenerationMode` | ✅ |
| `broadcastEvents[]` with `playlistTemplateId`/`sourcePoolId` | ✅ |
| `track.sourcePoolIds[]` (new in 0624B) | ✅ |

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
