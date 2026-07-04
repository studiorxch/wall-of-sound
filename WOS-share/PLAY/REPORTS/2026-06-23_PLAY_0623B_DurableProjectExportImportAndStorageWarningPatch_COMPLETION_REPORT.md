# PLAY Patch 0623B — Durable Project Export/Import and Storage Warning
**Completion Report · 2026-06-23**

---

## Summary

PLAY now has a durable project save path: **Export Project JSON** downloads a portable file, **Import Project JSON** restores from it with full repair, and a live storage status indicator in the TopBar shows whether the current project has been exported, is dirty, or has never been exported. LocalStorage remains the autosave/cache layer; the exported JSON file is now the explicit operator-owned source of truth.

---

## Root Cause

PLAY stored all playlist work exclusively in browser localStorage, which is origin-scoped (`localhost:5173` vs `localhost:5174` vs `127.0.0.1:5173` each see different storage). Moving PLAY into the WOS monorepo tree proved the risk: serious playlist work appeared lost after path/port changes. The existing "Backup" button was minimal (raw JSON, icon-only, no status) and was not surfaced as a primary save action.

---

## New File: `src/data/playProjectExport.ts`

### Constants

```ts
export const PLAY_PROJECT_EXPORT_KIND = "PLAY_PROJECT";
export const PLAY_PROJECT_EXPORT_VERSION = "1.0.0";
```

### Types

```ts
export type PlayProjectExport = {
  exportKind: "PLAY_PROJECT";
  exportVersion: "1.0.0";
  exportedAt: string;
  appBuild?: string;
  project: PlayProject;
};
```

### Functions

| Function | Purpose |
|---|---|
| `isPlayProjectExport(value)` | Type guard — checks `exportKind` + `project` presence |
| `createPlayProjectExport(project)` | Wraps project in export envelope with timestamp |
| `downloadPlayProjectExport(project)` | Downloads `PLAY_Project_<title>_YYYY-MM-DD_HH-mm.json`; returns `exportedAt` ISO string |
| `readPlayProjectExportFile(file)` | Async — parses export envelope or raw v2 project; rejects with user-readable message on failure |
| `stableProjectHash(project)` | Content hash for dirty tracking: covers playlist slots, track IDs, schedule block IDs, active playlist ID — excludes timestamps |

### Filename format

```
PLAY_Project_My_Mix_2026-06-23_14-30.json
```

---

## Updated: `src/data/playProjectStorage.ts`

Exported `repairStoredProject` (was internal):

```ts
export function repairStoredProject(project: PlayProject): PlayProject { ... }
```

This allows the import flow to repair a parsed project (backfill `sourceGroupId`, `preservedGapSlotIds`, schedule, etc.) using the same battle-tested repair logic as the storage load path.

---

## Updated: `src/ui/TopBar.tsx`

### Props changed

| Before | After |
|---|---|
| `project: PlayProject` | removed |
| — | `onExportProject: () => void` (new) |
| — | `lastExportedAt: string \| null` (new) |
| — | `isProjectDirty: boolean` (new) |
| `onProjectLoaded` | kept (now receives repaired project from App) |

### Import upgrade

Old: synchronous `loadPlayProjectFromJson` — returned null on any envelope/format mismatch.  
New: async `readPlayProjectExportFile` — handles both envelope and raw v2 format; rejects with `"Invalid PLAY project file."` + reason on failure.

### UI changes

- Replaced icon-only "Backup" button with text button **"Export Project JSON"**
- Replaced icon-only "Restore" with icon button **↺** (Import Project JSON) — tooltip updated
- Added `tb-save-status` span with live label:
  - `"Project not exported yet"` (dim) — when `lastExportedAt === null`
  - `"Unsaved to project file"` (yellow) — when `exportedProjectHash !== currentHash`
  - `"Project file exported · 2:30 PM"` (green) — when clean

---

## Updated: `src/App.tsx`

### New state

```ts
const [lastExportedAt, setLastExportedAt] = useState<string | null>(null);
const [exportedProjectHash, setExportedProjectHash] = useState<string | null>(null);
```

### New handlers

```ts
function handleExportProject() {
  const exportedAt = downloadPlayProjectExport(playProject);
  setLastExportedAt(exportedAt);
  setExportedProjectHash(stableProjectHash(playProject));
}

function handleImportProject(p: PlayProject) {
  const repaired = repairStoredProject(p);
  applyProject(repaired);
  savePlayProject(repaired);
  setExportedProjectHash(stableProjectHash(repaired));
  // lastExportedAt NOT set — import ≠ export
}
```

### Dirty derivation (render)

```ts
const isProjectDirty = exportedProjectHash !== null && stableProjectHash(playProject) !== exportedProjectHash;
```

### TopBar call updated

```tsx
<TopBar
  onTracksImported={handleTracksImported}
  onProjectLoaded={handleImportProject}   // was: applyProject
  onExportProject={handleExportProject}   // new
  lastExportedAt={lastExportedAt}         // new
  isProjectDirty={isProjectDirty}         // new
  // project={playProject} — removed
  ...
/>
```

---

## Updated: `src/styles.css`

```css
.tb-save-status { font-size: 11px; white-space: nowrap; letter-spacing: 0.01em; }
.tb-save-status--never { color: var(--text-dim); }
.tb-save-status--dirty { color: var(--yellow, #e6b84a); }
.tb-save-status--clean { color: var(--green, #4caf72); }
```

---

## Export Envelope Schema

```json
{
  "exportKind": "PLAY_PROJECT",
  "exportVersion": "1.0.0",
  "exportedAt": "2026-06-23T14:30:00.000Z",
  "project": {
    "schemaVersion": "play-project-v2",
    "playlists": [...],
    "libraryTracks": [...],
    "schedule": { "blocks": [...] },
    "activePlaylistId": "...",
    "excludedTrackIds": [...],
    ...
  }
}
```

The `exportKind` field allows future import tools to identify PLAY project files without inspecting deep schema keys.

---

## Dirty State Semantics

| State | `lastExportedAt` | `exportedProjectHash` | Status label |
|---|---|---|---|
| Fresh boot, no export | `null` | `null` | "Project not exported yet" (dim) |
| After export | ISO string | content hash | "Project file exported · HH:MM" (green) |
| After edit post-export | ISO string | stale hash | "Unsaved to project file" (yellow) |
| After import | `null` | content hash of imported file | "Project not exported yet" (dim) |
| After import + export | ISO string | current hash | "Project file exported · HH:MM" (green) |

Note: import sets the content hash baseline (so edits after import are correctly detected as dirty) but does not set `lastExportedAt` (the user has not written a file; they loaded one).

---

## TypeScript Verification

```bash
cd /Users/studio/Projects/wall-of-sound/play/flow-curve-builder
npx tsc --noEmit
# EXIT: 0 — clean
```

Build errors: same 10 pre-existing unused-var / missing-prop errors from before this patch. Zero new errors introduced.

---

## What Is Preserved Through Export/Import

| Data | Preserved |
|---|---|
| Playlists (title, slots, curve, locks, orphans) | ✅ |
| `sourceGroupId` isolation | ✅ |
| `presentationMode` (Map Channel etc.) | ✅ |
| Schedule blocks | ✅ |
| Library tracks | ✅ |
| Cover/background images (if stored as data URLs) | ✅ |
| `preservedGapSlotIds` | ✅ |
| Excluded track IDs | ✅ |
| Active playlist selection | ✅ (repaired if stale) |
| Playback state | ✗ (runtime-only, not persisted) |

---

## Non-Goals (Not Implemented in This Patch)

- Desktop filesystem project folders
- Cloud sync / Google Drive
- Audio file persistence
- Asset folder export
- Scheduler autoplay
- WOS command protocol

---

## Patch Status: ✅ COMPLETE
