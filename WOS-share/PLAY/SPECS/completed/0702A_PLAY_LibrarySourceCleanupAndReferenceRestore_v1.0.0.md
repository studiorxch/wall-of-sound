---
location: Specs
title: PLAY Library Source Cleanup + Reference Library Restore
date: 2026-07-02
status: implementation-spec
scope: "PLAY / libraries / external source / reference source / left nav cleanup"
target_executor: Claude
tags:
  - play
  - library
  - source-management
  - external
  - reference
  - field-recordings
  - cleanup
  - implementation
  - claude
---

# PLAY Library Source Cleanup + Reference Library Restore

## Purpose

Clean up PLAY library sources now that the source model is clearer.

The working model is:

```text
StudioRich Catalog = owned music catalog
External = outside/commercial/DJ/reference music library
Reference = field recordings, sound effects, special effects, samples, non-song audio references
```

Also remove `All Tracks` from the left navigation and remove the combined/global library count line from catalog headers. These global views are not needed in the primary UI.

---

## Current Problems

```text
1. External library now shows 0 even though it was previously linked/imported.
2. The user tried to add a field recording into StudioRich Catalog, but that belongs in a different library.
3. Reference library is needed after all, but not as a vague music reference bucket.
4. Reference should represent field recordings, sound effects, special effects, samples, and non-song source material.
5. All Tracks is not needed in the left nav.
6. Catalog header currently shows global library totals such as 454 tracks, which confuses the selected source view.
```

---

## Core Decision

```text
StudioRich Catalog = StudioRich-owned music.
External = external music/reference music.
Reference = field recordings, sound effects, samples, special effects, and non-song audio material.
All Tracks = removed from left nav.
Global library totals = removed from source headers.
```

---

# 1. Left Navigation

## Required Left Nav

Use this structure:

```text
LIBRARIES
  StudioRich Catalog    [count]
  External              [count]
  Reference             [count]

PLAYLISTS
  playlist rows...
  + Create New Playlist
```

Remove:

```text
All Tracks
Unknown Review
Groups
Library Groups
Utility
Orphans
Excluded
Locked Tracks
```

`Unknown Review` can remain internal, but it should not be presented as a primary library.

Acceptance:

```text
Left nav shows only StudioRich Catalog, External, Reference, and Playlists.
All Tracks is gone.
```

---

# 2. Remove Global Count Line

Catalog headers should show selected-source counts only.

For StudioRich:

```text
358 tracks · 354 linked · 4 missing audio
```

For External:

```text
N tracks · N linked · N missing audio
```

For Reference:

```text
N items · N linked · N missing audio
```

Remove combined/global text such as:

```text
454 tracks
550 tracks
358 / 454
all-library totals
```

Acceptance:

```text
Selected library page does not show global all-track counts.
```

---

# 3. Restore / Fix External Library

External should not be stuck at 0 if a source was linked or imported.

Audit:

```text
sourceOwner=external
sourceLibrary=External
librarySourceDefinition for External
external audio folder path
external catalog CSV path if any
import/sync persistence
local/session state hydration
filters that may be hiding External rows
```

Required behavior:

```text
Click External -> shows only external tracks.
External count equals sourceOwner=external track count.
External source menu can import/link/scan External without affecting StudioRich.
```

If external tracks are lost due to state not being persisted, fix persistence/hydration.

Acceptance:

```text
External count is source-specific and survives refresh.
External rows are not mixed with StudioRich.
External does not show 0 unless there are truly no external tracks.
```

---

# 4. Reference Library Purpose

Reference is needed, but define it narrowly.

Reference means:

```text
field recordings
sound effects
special effects
samples
spoken-word fragments
texture recordings
non-song source audio
```

Reference is not the main outside-music library. External owns that.

Reference defaults:

```ts
sourceOwner = "reference";
sourceLibrary = "Reference";
platformUse = ["reference_only"];
analysisStatus = "not_analyzed";
```

Optional future tags:

```text
field-recording
sfx
texture
voice
environment
street
subway
weather
machine
ambience
```

Do not build a full taxonomy in this pass.

Acceptance:

```text
Reference appears as its own library source.
Reference imports/links do not pollute StudioRich or External.
```

---

# 5. Reference Import / Link Behavior

Reference should allow audio-folder import as new reference items.

Source menu for Reference:

```text
Import Audio Folder as Reference Items
Link/Re-scan Audio Folder
Source Settings
```

If no CSV exists, audio-folder import should create rows from files.

Created rows:

```ts
sourceOwner = "reference";
sourceLibrary = "Reference";
audioLinked = true;
fileName = file.name;
relativePath = webkitRelativePath;
title = filenameWithoutExtension;
artist = "";
analysisStatus = "not_analyzed";
platformUse = ["reference_only"];
```

Acceptance:

```text
User can add field recordings/sound effects to Reference.
Reference items show in Reference library.
No field recording is forced into StudioRich Catalog.
```

---

# 6. StudioRich Must Stay Music-Owned

StudioRich Catalog should remain for owned StudioRich music.

Do not import field recordings or SFX into StudioRich by default.

StudioRich source menu should continue to support:

```text
Scan Catalog
Re-scan Audio Folder
Analyze Mechanical Moods
Source Settings
```

Acceptance:

```text
StudioRich remains clean as music catalog.
```

---

# 7. Source Menus

Keep source menus short.

StudioRich:

```text
Scan Catalog
Re-scan Audio Folder
Analyze Mechanical Moods
Source Settings
```

External:

```text
Import Audio Folder as External Tracks
Scan Catalog CSV
Re-scan Audio Folder
Source Settings
```

Reference:

```text
Import Audio Folder as Reference Items
Re-scan Audio Folder
Source Settings
```

Avoid duplicate menu items.

Acceptance:

```text
Menus are readable and source-specific.
```

---

# 8. Preserve Existing Behavior

Do not break:

```text
catalog playback
playlist playback
TrackEditorPanel
playlist identity modal
Flow Curve playlist-only behavior
source-specific audio linking
objectUrl playback
mechanicalMoodAnalyzer
playlist creation
```

Do not touch:

```text
8x24 mood chart
WOS/WALL/MAPS
Scheduler
OBS
Colorlab
Canvas/Studio
```

---

# Verification Checklist

Before reporting complete:

```text
[ ] App builds.
[ ] Left nav shows StudioRich, External, Reference, Playlists only.
[ ] All Tracks is removed from left nav.
[ ] Global library count line is removed from source headers.
[ ] StudioRich count is source-specific.
[ ] External count is source-specific.
[ ] Reference count is source-specific.
[ ] External no longer incorrectly shows 0 if external tracks exist.
[ ] External import/link persists after refresh.
[ ] Reference can import/link audio folder as reference items.
[ ] Reference rows use sourceOwner=reference.
[ ] StudioRich rows remain sourceOwner=studiorich.
[ ] External rows remain sourceOwner=external.
[ ] Catalog playback still works.
[ ] Playlist playback still works.
[ ] TypeScript passes.
```

---

# Claude Completion Report Required

When complete, report:

```text
Status: complete / partial / blocked

Files changed:
- path
- path

Left nav:
- removed items
- remaining structure

External:
- cause of count loss
- fix applied
- persistence result

Reference:
- definition implemented
- import/link behavior
- count result

Verification:
- build result
- source counts
- source isolation check
- playback regression check

Do not reopen:
- All Tracks should not return to the left nav.
- Unknown Review should not be presented as a primary library.
- StudioRich is owned music.
- External is outside music.
- Reference is field recordings/SFX/samples/non-song audio.
- Source headers should show selected-source stats only.
```

---

# Claude Prompt

Use this prompt with Claude from the main project folder:

```text
Implement 0702A_PLAY_LibrarySourceCleanupAndReferenceRestore_v1.0.0.md.

Work in the active PLAY source.

Primary goals:
1. Update the library model:
   - StudioRich Catalog = owned StudioRich music
   - External = outside/commercial/reference music
   - Reference = field recordings, sound effects, special effects, samples, and non-song audio material
2. Restore Reference as a visible library source.
3. Remove All Tracks from the left nav.
4. Remove global/all-library count lines from catalog headers.
5. Fix External library showing 0 after it was linked/imported. Audit sourceOwner=external, External source definition, import/link persistence, hydration, and active filters.
6. External selected view must show only sourceOwner=external tracks and source-specific counts.
7. Reference selected view must show only sourceOwner=reference tracks and source-specific counts.
8. Add Reference audio-folder import/link behavior that creates sourceOwner=reference rows from files when no CSV exists.
9. Ensure field recordings/SFX do not go into StudioRich by default.
10. Keep source menus short and source-specific.
11. Preserve catalog playback, playlist playback, TrackEditorPanel, playlist identity modal, objectUrl playback, source linking, and Flow Curve playlist-only behavior.
12. Do not touch 8x24 mood chart, WOS/WALL/MAPS, Scheduler, OBS, Colorlab, or Canvas/Studio.

Return a completion report with files changed, left nav result, External fix/cause, Reference behavior, source counts, verification, and do-not-reopen notes.
```
