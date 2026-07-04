---
location: Specs
title: PLAY Library Mode + Catalog Table Usability Pass
date: 2026-07-01
status: implementation-spec
scope: "PLAY / library mode / catalog playback / table columns / nav density / mood display"
target_executor: Claude
tags:
  - play
  - library
  - catalog
  - ui
  - playback
  - table
  - moods
  - usability
  - implementation
  - claude
---

# PLAY Library Mode + Catalog Table Usability Pass

## Purpose

Stabilize the PLAY interface now that StudioRich Catalog import, audio linking, and basic playback are working.

The current issue is mostly workspace separation and catalog usability:

- Flow Curve is following into library views like a global asset.
- Library mode needs a full-window catalog table, not a playlist workspace.
- Playing a library track works, but it does not update the player clearly and opens the Track Editor unnecessarily.
- Play controls are too far right for fast auditioning.
- Suggested/mechanical moods are unclear or missing.
- Mood chips expand row height and reduce scanability.
- Left nav is too dense and tiny.
- Column width/position/view configuration is becoming necessary.

This pass is about making the catalog comfortable to use before returning to playlist generation.

---

## Core Decision

```text
Playlist view and Library view are different workspaces.

Playlist view:
- playlist identity
- Flow Curve
- playlist table
- playlist player

Library view:
- library/source identity
- full-height catalog table
- catalog filters
- catalog audition/player
- no Flow Curve unless explicitly building a playlist from catalog
```

Flow Curve is playlist-specific. It should not appear as a global surface when browsing libraries.

---

# Part 1 — Separate Playlist Workspace From Library Workspace

## 1. Hide Flow Curve In Library Views

When the user selects:

```text
StudioRich Catalog
External
Reference
Unknown Review
All Tracks
Library Groups
Orphans
Excluded
Locked Tracks
```

the Flow Curve should not remain visible as if it belongs to that view.

Required:

```text
Flow Curve appears only for playlist views, or inside a playlist-building modal/workflow.
Library views use the available vertical space for the catalog table.
```

Acceptance:

```text
Clicking a library source opens a full-window library/catalog table.
No playlist Flow Curve is visible in normal library browsing.
```

---

## 2. Keep Flow Curve Playlist-Specific

Each playlist may retain its own Flow Curve.

Required:

```text
Switching between playlists shows that playlist's curve.
Switching to a library hides the curve.
Returning to a playlist restores that playlist's curve.
```

Acceptance:

```text
Flow Curve state is playlist-specific, not global across libraries.
```

---

# Part 2 — Catalog Playback / Audition Behavior

## 3. Playing A Library Track Must Not Open Track Editor

Current issue:

```text
Clicking play on a library track plays audio but opens the edit track window unnecessarily.
```

Fix event handling:

```text
play button click must stop propagation
row click may select
row double-click may audition if desired
explicit edit action opens TrackEditorPanel
```

Acceptance:

```text
Clicking play previews the track only.
TrackEditorPanel opens only from explicit edit action or intended row interaction.
```

---

## 4. Library Playback Must Update Player Dock

When playing a catalog/library track:

```text
player dock updates title
artist
duration/current time
rating
play/pause state
```

Acceptance:

```text
The currently playing library track is visible in the player.
```

---

## 5. Move Play Button To Far Left

Play/audition controls must be immediately accessible.

Required table order for all track tables:

```text
Play
Add / Insert
#
Lock
Time
Title
Artist
BPM
Key
Energy
Duration
Rating
Mood / Suggested / Mechanical
Status
Actions
```

Minimum:

```text
Play button must be the first interactive column at far left.
Add-to-playlist can sit next to it.
Edit/exclude/delete can remain right-side actions.
```

Acceptance:

```text
User can preview tracks without horizontal scrolling.
This applies to library tables and playlist tables.
```

---

# Part 3 — Suggested Moods vs Mechanical Moods

## 6. Clarify Field Meaning

Suggested moods and mechanical moods are not the same thing.

Required distinction:

```text
Suggested moods:
- descriptive/expressive tags derived from imported catalog mood fields or PLAY suggestion logic
- examples: Chill, Dreamy, Nostalgic, Hopeful

Mechanical moods:
- structural playlist-function tags
- examples: opener, bridge, hold, drift, lift, reset, closer
```

Acceptance:

```text
UI labels clearly distinguish Suggested from Mechanical.
No code path overwrites one with the other.
```

---

## 7. Restore / Rebuild Suggested Moods

Current issue:

```text
Suggested moods disappeared and cannot be retrieved.
```

Required source order for restoring suggestions:

```text
1. importedMoodTags
2. importedMoodCandidates / mood_1 / mood_2 / mood_3
3. Primary Mood
4. Focus Category if useful
```

Add actions:

```text
Restore Suggested Moods From Import
Rebuild Suggested Moods
Clear Suggested Moods
```

Non-destructive rule:

```text
Rebuild must calculate first.
If result is empty/fails, preserve existing suggestions.
```

Acceptance:

```text
Suggested moods can be recovered from imported catalog data.
Rebuild does not wipe useful values.
```

---

## 8. Mechanical Mood Analysis Visibility

Mechanical moods should appear separately from suggested moods.

Required:

```text
Mechanical column optional / configurable
Track editor shows mechanical moods and confidence
Analyzer can run/re-run mechanical analysis
```

Acceptance:

```text
User can tell whether a track has suggested moods, mechanical moods, both, or neither.
```

---

# Part 4 — Mood Chip Scanability

## 9. Keep Mood Chips On One Line

Mood chips are expanding row height and hurting scanability.

Required:

```text
Mood chip rows stay single-line by default.
Overflow clips/fades or horizontal scrolls inside the cell.
Row height stays compact.
Tooltip/popover shows full mood list on hover/click.
```

Recommended:

```css
.mood-cell {
  display: flex;
  flex-wrap: nowrap;
  overflow: hidden;
  white-space: nowrap;
}

.mood-chip {
  flex: 0 0 auto;
}
```

Acceptance:

```text
Rows stay compact even when multiple moods exist.
The table remains easy to scan.
```

---

## 10. Mood Color Editing Later, But Prepare Structure

Do not build a full color editor yet, but ensure mood chip colors are data-driven.

Required:

```text
Mood chips should use a mood color lookup rather than hardcoded random colors where practical.
```

Acceptance:

```text
Future property color editing will not require replacing the table.
```

---

# Part 5 — Table Column Usability

## 11. Column Width / Position / View Presets

Column management is now necessary.

Add a basic view preset system:

```text
Compact
Playlist
Catalog
Analysis
Mood
Playback QA
```

Each preset controls visible columns and order.

Minimum for this pass:

```text
Catalog view shows: Play, Add, Title, Artist, Mood, Suggested, Mechanical, Grouping, Genre, BPM, Key, Energy, Duration, Rating, Status.
Playlist view shows: Play, #, Lock, Time, Title, Artist, BPM, Key, Energy, Duration, Rating, Warn.
```

Acceptance:

```text
Library view and playlist view can use different column layouts.
```

---

## 12. Improve Font Size / Density

The current UI is too tiny, especially in the left panel and catalog table.

Use the Notion catalog screenshot as the comfort reference:

```text
larger readable table text
clearer row height
stronger left nav labels
less micro-text in playlist nav
```

Required:

```text
increase base table font size slightly
increase left nav font size slightly
improve row padding enough for comfort
keep compact mode possible later
```

Acceptance:

```text
Catalog is more comfortable to read without becoming oversized.
```

---

# Part 6 — Left Nav Simplification

## 13. Playlist Items Should Be Less Verbose

Current issue:

```text
Left nav playlist items show too much detail.
```

Simplify playlist nav rows:

```text
cover/icon
playlist name
track count badge
```

Move details into playlist header after entering the playlist:

```text
duration
target
missing/buffer
updated
created
```

Acceptance:

```text
Left nav is less cluttered.
Playlist detail remains available in playlist view.
```

---

# Part 7 — NaN Guardrail

The NaN issue was not reproduced after recent fixes, but keep guardrails.

Required:

```text
No NaN in Time.
No NaN:NaN in player.
No NaN playlist totals.
Invalid duration displays "—".
```

Acceptance:

```text
NaN never renders in UI.
```

---

# Verification Checklist

Before reporting complete:

```text
[ ] App builds.
[ ] Library source view hides Flow Curve.
[ ] Playlist view shows playlist-specific Flow Curve.
[ ] Returning to playlist restores playlist curve.
[ ] Library table uses full vertical window.
[ ] Play button is far left in library table.
[ ] Play button is far left in playlist table.
[ ] Playing library track does not open TrackEditorPanel.
[ ] Playing library track updates player dock.
[ ] Suggested moods can be restored from import.
[ ] Rebuild Suggested Moods is non-destructive.
[ ] Mechanical moods are separate from suggested moods.
[ ] Mood chips stay one line.
[ ] Full mood list is accessible by tooltip/popover.
[ ] Table font size is more comfortable.
[ ] Left nav playlist rows are simplified.
[ ] No NaN appears.
[ ] Source policy still works.
[ ] Flow Curve playlist generation still works.
[ ] 8x24 mood chart remains untouched.
```

---

# Explicit Non-Goals

Do not implement:

```text
8x24 mood chart integration
full mood color editor
Mixxx database sync
new audio analyzer
waveform editor
WOS/WALL/MAPS changes
OBS changes
Colorlab changes
Canvas/Studio changes
Scheduler redesign
```

---

# Claude Completion Report Required

When complete, report:

```text
Status: complete / partial / blocked

Files changed:
- path
- path

Workspace separation:
- library mode behavior
- playlist mode behavior
- Flow Curve visibility

Playback:
- far-left play column
- catalog audition
- player dock updates
- track editor event handling

Moods:
- suggested restore behavior
- mechanical vs suggested distinction
- one-line mood display

Table/nav usability:
- column presets or layout changes
- font size changes
- left nav simplification

Verification:
- build result
- catalog playback test
- playlist playback test
- NaN check
- source policy regression
- Flow Curve regression

Remaining blockers:
- list or none

Do not reopen:
- Flow Curve is playlist-specific, not global library chrome.
- Catalog playback must not open TrackEditorPanel.
- Play buttons belong at the far left.
- Suggested moods and mechanical moods are separate.
- Mood chips should not expand row height by default.
- Left nav should not carry full playlist metadata.
- 8x24 mood chart remains out of scope.
```

---

# Claude Prompt

Use this prompt with Claude from the main project folder:

```text
Implement 0701H_PLAY_LibraryModeCatalogTableUsability_v1.0.0.md.

Work in the active PLAY source.

Primary goals:
1. Separate Playlist workspace from Library workspace.
2. Hide Flow Curve when viewing StudioRich Catalog, External, Reference, Unknown Review, All Tracks, groups, or utility library views.
3. Keep Flow Curve playlist-specific and restore it when returning to a playlist.
4. Give library/catalog views a full-height table.
5. Move play/audition button to the far-left column in all track tables.
6. Playing a library track must not open TrackEditorPanel; fix event propagation.
7. Playing a library track must update the player dock.
8. Clarify Suggested moods vs Mechanical moods as separate fields.
9. Add/restore actions to restore suggested moods from imported catalog data and rebuild non-destructively.
10. Keep mood chips on one line by default with tooltip/popover for full list.
11. Begin basic table view presets or column layout separation for Catalog vs Playlist views.
12. Increase font/readability for catalog table and left nav, using the uploaded Notion catalog screenshot as a comfort reference.
13. Simplify left nav playlist rows to cover/icon, playlist name, and track count badge only.
14. Preserve Flow Curve generation, source policy, TrackEditorPanel, analyzer job states, catalog playback, and playlist playback.
15. Do not touch the 8x24 mood chart, WOS/WALL/MAPS, Scheduler, OBS, Colorlab, or Canvas/Studio.

Return a completion report with files changed, workspace separation behavior, playback behavior, mood restore behavior, table/nav readability changes, verification results, blockers, and do-not-reopen notes.
```
