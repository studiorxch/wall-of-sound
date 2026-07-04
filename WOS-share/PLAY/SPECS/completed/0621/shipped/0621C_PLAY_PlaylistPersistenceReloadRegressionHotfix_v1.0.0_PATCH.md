# 0621C_PLAY_PlaylistPersistenceReloadRegressionHotfix_v1.0.0_PATCH

## Project

PLAY / PLAYLIST

## Patch Type

Regression hotfix

## Status

Ready for implementation

## Priority

P0

## Purpose

Restore playlist persistence across browser reloads.

A recent change appears to have broken the previously working autosave / reload behavior. Playlists that used to survive browser reload now disappear or reset. This must be fixed before continuing Broadcast Card, Grid, or HUD polish.

The product rule is simple:

```text
Playlist records must survive browser reload.
```

## Current Problem

After reloading the browser, user-created playlists are no longer persisting as expected.

This is a regression because PLAYLIST already depends on local autosave as the main save workflow. JSON export / backup remains useful, but it must not be required for normal browser reload survival.

## Product Lock

```text
Autosave persistence is core workflow.
JSON export is backup / archive / debug.
Browser reload must not destroy playlist state.
```

## Scope

Fix persistence only.

### Included

- Restore project hydration on app boot.
- Preserve multiple playlist records after reload.
- Preserve `activePlaylistId` after reload.
- Preserve tracks inside playlists after reload.
- Preserve playlist slot / curve state after reload if already stored.
- Preserve playlist identity metadata if already stored:
  - title
  - description
  - cover image
  - background image
  - mood metadata
  - target duration
  - created / updated timestamps
- Prevent empty/default boot state from overwriting a valid saved project.
- Add storage schema guards.
- Add defensive fallback when saved data is malformed.
- Add console warnings for hydration failures.
- Keep manual backup / restore behavior intact.

### Excluded

- Do not redesign the playlist model.
- Do not change Broadcast HUD visuals.
- Do not change `BroadcastSecondaryLayer` timing behavior.
- Do not change `BroadcastGridLayer` behavior.
- Do not change Flow Curve scoring or assignment logic.
- Do not add backend persistence.
- Do not require JSON import/export for normal persistence.
- Do not clear existing local storage without explicit user action.

## Suspected Failure Areas

Check these first:

| Area | Risk |
|---|---|
| `src/data/projectStorage.ts` | storage key changed, save/load mismatch, malformed schema guard |
| app initialization | default project may overwrite saved project before load completes |
| autosave effect | may fire too early and save empty/default state |
| playlist reducer/state initialization | playlist array may reset on mount |
| active playlist selection | `activePlaylistId` may point to missing playlist and trigger reset |
| backup/restore edits | schema mismatch may break hydration |
| recent Broadcast HUD state | broadcast state may be coupled into project state unexpectedly |

## Required Behavior

### Boot Order

The app must load saved state before creating a new default project.

Correct order:

```text
1. Read saved project from storage.
2. Validate saved project shape.
3. If valid, hydrate app from saved project.
4. If invalid or missing, create default project.
5. Enable autosave only after hydration/default creation is complete.
```

Forbidden order:

```text
1. Create default project.
2. Autosave default project.
3. Try to load previous project.
```

This can overwrite the user's saved project with an empty/default one.

## Storage Guard Requirement

Add a hydration guard so autosave cannot overwrite a valid saved project during the first render.

Suggested state:

```ts
const [hasHydratedProject, setHasHydratedProject] = useState(false);
```

Autosave should not run until `hasHydratedProject === true`.

## Validation Requirement

Before accepting stored data, validate at minimum:

```text
project exists
project.playlists is an array
project.playlists.length >= 1 OR project.libraryTracks exists
project.activePlaylistId is a string
activePlaylistId points to an existing playlist OR can be safely repaired
```

If `activePlaylistId` is missing or invalid, repair it by selecting the first playlist instead of discarding the project.

## Safe Repair Rules

If stored project is mostly valid but has minor issues, repair instead of resetting.

### Repairable

- missing `activePlaylistId`
- `activePlaylistId` points to deleted/missing playlist
- missing optional playlist metadata
- missing `updatedAt`
- missing `createdAt`
- missing optional image fields
- missing optional mood fields

### Not Repairable

- invalid JSON
- project root is not an object
- playlists is missing and no legacy playlist data exists
- stored value is empty string or `null`

When not repairable, log a warning and create a default project.

## Acceptance Criteria

This hotfix passes when all criteria are true:

1. Create a new playlist.
2. Add at least one track to the playlist.
3. Rename the playlist.
4. Switch active playlist.
5. Reload browser.
6. Playlist still exists.
7. Playlist name persists.
8. Playlist tracks persist.
9. Active playlist selection persists.
10. Create a second playlist.
11. Reload browser again.
12. Both playlists persist.
13. Backup / Restore still works.
14. TypeScript build passes.
15. Console has no normal-path errors.
16. Invalid saved data logs a warning instead of crashing.
17. Empty/default state does not overwrite valid saved state during initial mount.

## Manual Test Script

```text
1. Open PLAY.
2. Create playlist: Persistence Test A.
3. Add one or more tracks.
4. Create playlist: Persistence Test B.
5. Switch to Persistence Test B.
6. Reload browser.
7. Confirm both playlists still exist.
8. Confirm Persistence Test B remains active.
9. Switch to Persistence Test A.
10. Confirm its tracks remain present.
11. Backup project.
12. Restore project.
13. Reload browser again.
14. Confirm restored project persists.
```

## Suggested Implementation Notes

### `projectStorage.ts`

Recommended responsibilities:

```text
loadProjectFromStorage()
saveProjectToStorage(project)
validateStoredProject(value)
repairStoredProject(project)
createDefaultProject()
```

Keep storage logic isolated. Do not spread `localStorage` reads/writes across unrelated UI components.

### Autosave Effect

Use a hydration guard:

```ts
useEffect(() => {
  if (!hasHydratedProject) {
    return;
  }

  saveProjectToStorage(project);
}, [hasHydratedProject, project]);
```

### Boot Hydration

Initialize once:

```ts
useEffect(() => {
  const loadedProject = loadProjectFromStorage();
  setProject(loadedProject ?? createDefaultProject());
  setHasHydratedProject(true);
}, []);
```

If the app currently initializes default project state directly in `useState`, ensure that default state does not autosave before the load attempt completes.

## Do Not Regress

- Do not restore permanent queue rail.
- Do not restore default Broadcast FlowCurveCanvas.
- Do not remove the 0621A grid toggle.
- Do not remove the 0621B timed secondary layer.
- Do not make user manually export/import JSON to persist work.

## Verification Command

```bash
npm run build
```

Optional if tests exist:

```bash
npm test
```

## Completion Report Requirement

After implementation, write:

```text
REPORTS/2026-06-21_PLAY_0621C_PlaylistPersistenceReloadRegressionHotfix_COMPLETION_REPORT.md
```

Include:

- files changed
- root cause
- persistence guard added
- storage validation behavior
- manual reload test result
- TypeScript result
- remaining risks

## Expected Result

PLAY once again behaves as a reliable local playlist workspace.

User-created playlists, playlist contents, active playlist selection, and playlist metadata survive browser reload without requiring manual backup / restore.

## Implementation Guide

- **Where:** Start with `src/data/projectStorage.ts`, app boot/hydration state, autosave `useEffect`, playlist reducer/state initialization, and backup/restore handlers.
- **What:** Load and validate stored project before default creation, add a hydration guard before autosave, repair minor schema issues, and run `npm run build`.
- **Expect:** Playlists, tracks, active playlist, and metadata persist after reload; empty/default state no longer overwrites valid saved project data.
