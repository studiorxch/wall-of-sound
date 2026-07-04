# PLAY Patch 0621C — Playlist Persistence Reload Regression Hotfix
**Completion Report · 2026-06-21 · P0**

---

## Summary

Restored playlist persistence across browser reloads. A mount-time autosave effect was overwriting the user's saved project with the default boot state before hydration could load it. Added a hydration guard and storage validation/repair.

---

## Root Cause

App state initializes to a **default** playlist via `useState(() => [makeDefaultPlaylist({ title: "My Mix" })])` ([App.tsx:67](flow-curve-builder/src/App.tsx:67)). Persistence is otherwise imperative — each mutation handler calls `savePlayProject(makeProj(...))`.

The break: a `useEffect` keyed on `trackPlaybackIssues` ([App.tsx:140](flow-curve-builder/src/App.tsx:140)) called `savePlayProject(...)` **unconditionally on mount**. React runs effects in definition order, so this effect (line 140) fired **before** the hydration effect (line 806):

```
1. Effect 140 fires → saves default [My Mix] empty playlist → OVERWRITES saved localStorage
2. Effect 806 fires → loadPlayProject() reads back the default it just wrote → user sees empty workspace
```

Every reload destroyed the saved project before it could be read.

---

## Fix

### `src/App.tsx`

1. Added hydration guard state:
   ```ts
   const [hasHydratedProject, setHasHydratedProject] = useState(false);
   ```
2. Guarded the mount-time save effect — the ref update still runs, but the save is blocked until hydration completes:
   ```ts
   useEffect(() => {
     trackPlaybackIssuesRef.current = trackPlaybackIssues;
     if (!hasHydratedProject) return;          // ← prevents default overwriting saved data
     savePlayProject(makeProj(...));
   }, [trackPlaybackIssues, hasHydratedProject]);
   ```
3. Set the flag at the end of the hydration effect:
   ```ts
   useEffect(() => {
     const saved = loadPlayProject();
     if (saved) applyProject(saved);
     setHasHydratedProject(true);              // ← autosave may now run
   }, []);
   ```

### `src/data/playProjectStorage.ts`

- Added `validateStoredProject(value)` — structural guard: must be an object, `schemaVersion === "play-project-v2"`, `playlists` is an array, and (playlists non-empty OR libraryTracks present).
- Added `repairStoredProject(project)` — non-destructive repair for minor issues:
  - normalizes `playlists` / `libraryTracks` / `excludedTrackIds` to arrays
  - repairs missing/dangling `activePlaylistId` → first playlist (with `console.warn`)
  - backfills missing `createdAt` / `updatedAt` on playlists
- `loadPlayProject()` now validates → repairs → returns; malformed v2 data logs a warning and falls back to v1/default instead of silently returning null; the catch block logs the parse error.

---

## Persistence Guard Added

`hasHydratedProject` gates all autosave. The default boot state can no longer be written to localStorage before the saved project is loaded.

---

## Storage Validation Behavior

| Condition | Behavior |
|-----------|----------|
| Valid v2 project | Loaded + repaired, no warning |
| `activePlaylistId` missing/dangling | Repaired to first playlist, warns, project kept |
| Missing timestamps | Backfilled silently |
| Malformed v2 JSON | Warns, falls back to v1 migration or default |
| Not an object / wrong schema | Validation fails → v1 fallback → default |
| Parse throw | Caught, warns, returns null → default created |

---

## Manual Reload Test Result (verified in browser)

**Test 1 — multi-playlist survival:** Seeded a project with 2 playlists (active = B), Playlist A holding 1 track + 1 library track. After `window.location.reload()`:
- ✅ Both playlists persist ("Persistence Test A", "Persistence Test B")
- ✅ `activePlaylistId` = `pl_persist_B` preserved
- ✅ Playlist A's track preserved (slot count = 1)
- ✅ Library track preserved (count = 1)
- ✅ UI renders both playlists
- ✅ No console warnings on the valid path

**Test 2 — repair path:** Seeded a project whose `activePlaylistId` pointed at a deleted playlist. After reload:
- ✅ Project NOT discarded — survivor playlist kept
- ✅ `activePlaylistId` repaired to `pl_keep`
- ✅ UI shows the survivor
- ✅ `console.warn` logged the repair (did not crash)

---

## TypeScript Result

`npx tsc --noEmit` — clean.

---

## Remaining Risks

- **Repair-warning multiplicity:** `loadPlayProject()` is called in three places per mount (two `useState` initializers for `trackPlaybackIssues`/`playbackErrors` at App.tsx:84/88, plus the hydration effect). On the *repair path only*, the `activePlaylistId` warning therefore logs up to 3× per mount. This is cosmetic, occurs only when stored data is actually broken, and was left as-is to avoid restructuring playback-issue initialization in a P0 hotfix. The normal (valid-data) path logs nothing.
- The imperative save-in-every-handler pattern remains. It is correct (handlers only fire post-hydration) but is the kind of pattern that reintroduced this bug; a future refactor to a single guarded `useEffect([project])` autosave would be more robust.

---

## Patch Status: ✅ COMPLETE
