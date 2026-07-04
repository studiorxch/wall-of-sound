# 0623B_PLAY_DurableProjectExportImportAndStorageWarningPatch_v1.0.0_PATCH

## Status

Ready for implementation.

## Priority

P0 — protect playlist work before further feature expansion.

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

## Problem

PLAY currently relies too heavily on browser storage for real playlist work.

LocalStorage is useful for prototype autosave, but it is not durable enough to be the only source of truth because it is tied to browser origin:

```text
http://localhost:5173
http://localhost:5174
http://127.0.0.1:5173
```

Each of those can see different storage.

Moving PLAY into the WOS project tree proved the risk: serious playlist work can appear lost after path/port/origin changes.

This patch makes explicit Project JSON export/import the durable save path.

---

## Product Lock

```text
LocalStorage = autosave/cache
Project JSON = durable source of truth
```

PLAY is now the programming desk for a live music channel. Playlist work is no longer disposable prototype data.

---

## Required Behavior

### 1. Add first-class Export Project JSON

Add a visible export action in the main project controls.

Likely existing areas:

```text
src/App.tsx
src/ui/TopBar.tsx
src/data/playProjectStorage.ts
```

The export should download a `.json` file containing the full PLAY project state.

Suggested filename format:

```text
PLAY_Project_YYYY-MM-DD_HH-mm.json
```

or:

```text
PLAY_Project_<projectTitle>_YYYY-MM-DD_HH-mm.json
```

Sanitize filename text.

---

### 2. Add first-class Import Project JSON

Add a visible import/restore action that allows selecting a `.json` file.

Import behavior:

1. Read selected JSON.
2. Validate structure.
3. Repair known missing/legacy fields.
4. Load into app state.
5. Save repaired project into LocalStorage autosave.
6. Show success status.

Import must not silently fail.

If import fails, show a clear reason:

```text
Invalid PLAY project file.
Missing playlists/tracks/project schema.
```

---

### 3. Export full project state

The JSON must preserve at minimum:

```text
project metadata
playlists
tracks
playlist slots
sourceGroupId values
scheduler state
Smart Grid settings/state if present
Broadcast HUD relevant settings
playlist presentation modes
cover/background references
warnings/warningMessages
active editor playlist id
playing playlist id only if currently serialized safely
```

Do not omit `sourceGroupId`. It is now important because 0621E isolated playlist source groups.

Do not omit scheduler blocks. Scheduler is part of the programming model.

---

### 4. Add explicit schema/version metadata

Project JSON should include a wrapper if the existing storage format does not already do this cleanly.

Example:

```ts
export type PlayProjectExport = {
  exportKind: "PLAY_PROJECT";
  exportVersion: "1.0.0";
  exportedAt: string;
  appBuild?: string;
  project: StoredPlayProject;
};
```

If current storage already has a root project format, keep it, but ensure imports can identify that this is a PLAY project.

Required constants:

```ts
export const PLAY_PROJECT_EXPORT_KIND = "PLAY_PROJECT";
export const PLAY_PROJECT_EXPORT_VERSION = "1.0.0";
```

---

### 5. Treat LocalStorage as autosave only

Keep the current LocalStorage save/load behavior, but update language and UX.

Do not call it durable backup.

Use labels like:

```text
Autosaved locally
Last export: never
Last export: 6:42 PM
```

The UI should make it clear when the user has not exported a durable file.

---

### 6. Add storage warning/status

Add a visible but non-invasive project safety indicator.

Recommended behavior:

- If project has never been exported:

```text
Project not exported yet
```

- If project changed after last export:

```text
Unsaved to project file
```

- If project exported after the latest change:

```text
Project file exported
```

This does not need a modal. It can live in the TopBar or project controls.

---

### 7. Track dirty state after edits

Track whether the current project differs from the last exported snapshot.

Minimal acceptable implementation:

```ts
lastExportedAt: string | null
lastExportedProjectHash: string | null
currentProjectHash: string
isProjectFileDirty: boolean
```

The hash can be a simple stable JSON string checksum or basic deterministic string compare for now.

Do not overbuild.

Acceptable near-term version:

```text
set dirty true whenever project-changing handlers run
set dirty false after successful export/import
```

---

### 8. Image persistence behavior

For this patch, keep image handling practical.

If cover/background imports already store data URLs in state, ensure export/import preserves them.

If image references are object URLs or browser-only temporary URLs, convert imported images to durable data URLs before storing them.

Required rule:

```text
Exported Project JSON must restore playlist cover/background visuals after reimport.
```

Near-term acceptable:

```text
embed cover/background data URLs inside JSON
```

Later project-folder assets can be separate.

Do not implement the project-folder asset system in this patch unless it already exists.

---

## Non-Goals

Do not implement these in this patch:

- desktop filesystem project folders
- Electron/Tauri
- backend database
- cloud sync
- Google Drive direct write
- audio file persistence
- asset folder export
- scheduler autoplay
- WOS command protocol
- Map Channel changes
- redesigning playlist UX

This patch is about durability and recovery only.

---

## Implementation Targets

Inspect likely files:

```text
src/data/playProjectStorage.ts
src/App.tsx
src/ui/TopBar.tsx
src/data/playlistTypes.ts
src/data/scheduleTypes.ts
src/data/smartGridTypes.ts
```

Touch only what is necessary.

Possible new helper file:

```text
src/data/playProjectExport.ts
```

Recommended contents:

```text
createProjectExport()
downloadProjectExport()
parseProjectImport()
validateProjectExport()
repairImportedProject()
stableProjectHash()
```

---

## Suggested API

```ts
export function createPlayProjectExport(project: StoredPlayProject): PlayProjectExport;

export function downloadPlayProjectExport(project: StoredPlayProject): void;

export async function readPlayProjectExportFile(file: File): Promise<StoredPlayProject>;

export function isPlayProjectExport(value: unknown): value is PlayProjectExport;
```

If `StoredPlayProject` is named differently, use the current existing project type.

---

## UI Requirements

Add or update controls so the operator can clearly access:

```text
Export Project
Import Project
```

Do not bury export behind debug-only backup language.

Preferred labels:

```text
Export Project JSON
Import Project JSON
```

Existing Backup/Restore buttons may be reused if renamed or clarified.

The UI may use compact icons, but tooltip/title text must be clear.

---

## Safety Requirements

### Export

- Export should not mutate project state except export-status metadata.
- Export should not remove LocalStorage.
- Export should not stop playback.

### Import

- Import should ask for a file.
- Import should replace current project state only after successful parse/validation.
- Import should repair legacy/missing fields where current storage repair already knows how.
- Import should not crash on malformed JSON.
- Import should reset or safely reconcile active playlist selection if imported active id is missing.
- Import should not attempt to resume audio playback automatically.

---

## Acceptance Criteria

### A. Export file downloads

Given a project with multiple playlists, tracks, slots, schedule blocks, and Map Channel settings:

```text
Export Project JSON
```

downloads a readable `.json` file.

---

### B. Import restores playlists

After clearing or changing LocalStorage, importing the exported JSON restores:

```text
playlists
track assignments
playlist slot timing
presentation mode
sourceGroupId isolation
schedule blocks
cover/background data when available
```

---

### C. LocalStorage no longer presented as durable

The UI communicates:

```text
Autosaved locally
```

and separately:

```text
Last export
```

or:

```text
Project not exported yet
```

---

### D. Port/path changes are survivable

User can move from:

```text
localhost:5173
```

to:

```text
localhost:5174
```

and restore the project by importing JSON.

---

### E. Malformed import fails cleanly

Importing a bad file shows a useful error and does not wipe the current project.

---

### F. TypeScript clean for touched files

Run:

```bash
cd /Users/studio/Projects/wall-of-sound/play/flow-curve-builder
npm run build
```

Existing unrelated build errors may remain, but this patch must not introduce new TypeScript errors.

---

## Manual Test Checklist

1. Start PLAY from active location.

```bash
cd /Users/studio/Projects/wall-of-sound/play/flow-curve-builder
npm run dev
```

2. Create or load a project with at least:

```text
2 playlists
3+ tracks
one Map Channel playlist
one scheduled block if scheduler exists
one cover/background image if available
```

3. Click:

```text
Export Project JSON
```

4. Confirm `.json` downloads.

5. Open JSON in a text editor and verify it includes:

```text
PLAY_PROJECT
exportVersion
playlists
tracks
schedule
sourceGroupId
presentationMode
```

6. In browser devtools, temporarily clear localStorage for PLAY origin.

7. Reload app.

8. Import the exported project JSON.

9. Confirm playlists return.

10. Confirm Map Channel playlist still exists.

11. Confirm cover/background visuals restore if they existed.

12. Import malformed JSON and confirm current project is not wiped.

---

## Expected Result

PLAY gains a durable project save/restore path.

The operator workflow becomes:

```text
Build playlists
Autosave continues locally
Export Project JSON regularly
Restore from JSON after moves/ports/browser changes
```

This protects playlist work and clears the path for deeper playlist creation features.

---

## Implementation Guide

- **Where:** Work inside `/Users/studio/Projects/wall-of-sound/play/flow-curve-builder`, mainly `src/data/playProjectStorage.ts`, optional new `src/data/playProjectExport.ts`, `src/App.tsx`, and the project controls UI.
- **What:** Add durable Project JSON export/import, visible last-export/dirty status, and preserve images/project metadata through import/export.
- **Expect:** LocalStorage remains autosave cache, while exported Project JSON becomes the reliable source of truth for serious playlist work.
