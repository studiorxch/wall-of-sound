---
build: 0702A
name: Playlist Identity Modal Redesign
date: 2026-07-02
status: COMPLETE
tsc: PASS
---

# 0702A — Playlist Identity Modal Redesign

## Summary

Completely rewrote the Playlist Identity modal. Removed all broadcast/theme/color controls. Replaced the single-column stacked form with a clean two-column layout: Artwork left, Details right.

## Files Changed

| File | Change |
|---|---|
| `play/src/ui/PlaylistIdentityPanel.tsx` | Full rewrite — two-column layout, removed all broadcast/theme/accent/presentation controls |
| `play/src/styles.css` | Added `pip-*` CSS classes for the new two-column layout; collapsed legacy `id-*` rules to one-liners |

## Removed Controls

- Accent Color (color picker)
- Presentation Mode (select)
- Map Color Themes (swatch grid, tab bar, export/import/duplicate/reset/copy CSS actions)
- Extracted Theme section and auto-extraction `useEffect`
- Broadcast Preview button and `BroadcastCardPreview` modal
- Created / Updated footer dates
- All `colorLab`, `mapThemeExport`, `BroadcastCardPreview` imports

## New Layout

```
┌─────────────────────────────────────────────────────────────┐
│ Playlist Identity                                        ✕  │
├──────────────────┬──────────────────────────────────────────┤
│ COVER            │ TITLE                                     │
│ [128×128 thumb]  │ [input]                                   │
│ Change / Clear   │                                           │
│                  │ DESCRIPTION / MOOD NOTE                   │
│ BACKGROUND       │ [textarea — min 180px, full-height flex]  │
│ [128×128 thumb]  │                                           │
│ Change / Clear   │ MOOD TAGS                                 │
│                  │ [input] [tag chips]                       │
├──────────────────┴──────────────────────────────────────────┤
│                               [Cancel]  [Save Changes]      │
└─────────────────────────────────────────────────────────────┘
```

## Props — Removed from PlaylistIdentityPanel

- `onAccentColorChange` — removed
- `onBroadcastIdentityChange` — removed
- `onColorThemesChange` — removed
- `totalTrackCount` — removed (was only used for BroadcastCardPreview)
- `totalDurationSeconds` — removed (same)

Call site in `PlaylistHeader.tsx` updated to remove those three prop passdowns.

## Preserved Behavior

- Title edits save live via `onTitleChange`
- Description edits save live via `onDescriptionChange`
- Cover image: Choose File (reads as data URL) or paste URL via onBlur/Enter
- Background image: same
- Mood tags: comma-separated input, saves on blur or Enter, chips displayed below
- All saved to `PlaylistRecord` via existing handlers in `PlaylistHeader` → `App.tsx`

## Verification

`tsc --noEmit` exits 0. Layout confirmed via preview injection.

## Do Not Reopen

- Do not restore Accent Color to the Playlist Identity modal
- Do not restore Presentation Mode to the Playlist Identity modal
- Do not restore Map Color Themes / Extracted Theme / Broadcast Preview to the modal
