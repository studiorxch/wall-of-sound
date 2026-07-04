# PLAY Patch 0620A — Completion Report
**Patch:** `0620A_PLAY_PlaylistIntegrityAndPlaybackSafetyPatch_v1.0.0`
**Date:** 2026-06-20
**Status:** ✅ Complete

---

## Summary

Implemented all four hardening improvements specified in the 0620A patch. TypeScript check passes clean (`npx tsc --noEmit`), preview server loads with no console errors.

---

## Changes Delivered

### A — Empty Slot Repair (Fill Gap / Delete Gap)

**`src/App.tsx`**
- `handleFillGap(slotIndex)` — finds best energy-matching eligible track from library (excludes excluded/unplayable/duplicate), assigns via `replaceSlot` + `mutatePLAndSave`
- `handleDeleteGap(slotIndex)` — removes empty slot compactly via `removeSlotCompact` + `mutatePLAndSave`

**`src/ui/MainTrackWindow.tsx`**
- Added `onFillGap` and `onDeleteGap` to `Props`
- `PlaylistRows` renders a distinct `row-empty-slot` row for slots with no `assignedTrackId`, showing slot number, start time, "Empty Slot" label, and two action buttons: **Fill Gap** / **Delete Gap**
- Props threaded through `MainTrackWindow` → `PlaylistRows`

### B — Centralized Duplicate Prevention

**`src/logic/playlistIntegrity.ts`** (new file)
- `normalizeFilePath` — canonical path comparison helper
- `findPlaylistDuplicate` — checks by trackId and filePath (normalized)
- `getEligiblePlaylistCandidates` — central filter for fill/regen, blocks excluded/unplayable/duplicate/invalid-path tracks

### C — Playback Safety

**`src/data/playProjectTypes.ts`**
- Added `TrackPlaybackStatus`, `TrackPlaybackIssue` types
- Added `trackPlaybackIssues?: Record<string, TrackPlaybackIssue>` to `PlayProject`

**`src/App.tsx`**
- `trackPlaybackIssues` state initialized from saved project; ref kept in sync; persisted via `makeProj`
- `applyProject` restores `trackPlaybackIssues` and `playbackErrors`
- Audio error handler uses `markUnplayable(trackId, code, msg)`:
  - Sets `playbackErrors` + `trackPlaybackIssues`
  - If autoplay active: shows toast "Skipped unplayable track: {code}." and calls `nextActionRef.current()` after 150ms
  - Otherwise: sets error state and stops
- `handleClearPlaybackIssue(trackId)` — removes from both `playbackErrors` and `trackPlaybackIssues`
- `handleFillMissingTime` now passes `trackPlaybackIssues` to `fillMissingTime`
- `handleRegenerateFromCurve` combines unplayable IDs with `excludedTrackIds` before calling `assignPlaylistToCurve`

**`src/logic/fillMissingTime.ts`**
- Accepts `trackPlaybackIssues?` param; eligible filter excludes unplayable tracks
- Phase 1: fills existing empty slots in-place before Phase 2 appends new slots

**`src/ui/MainTrackWindow.tsx`**
- Added `onClearPlaybackIssue` to `Props` and `LibraryRows`
- Library row shows **Clear Issue** button when track has a playback error

### D — Flow Curve Drag Stability (Pointer Capture)

**`src/ui/FlowCurveCanvas.tsx`**
- `draggingIdx` ref → `draggingPointId` ref (string ID, not index — survives point array mutations)
- `getSvgCoords(clientX, clientY)` takes plain numbers
- `onPointPointerDown`: calls `svgRef.current?.setPointerCapture(e.pointerId)`
- `onPointerUp`: calls `releasePointerCapture`, clears `draggingPointId`
- `onPointerCancel`: clears `draggingPointId`
- SVG element: `onPointerMove`, `onPointerUp`, `onPointerCancel` handlers; `onMouseLeave` clears hover

---

## Files Modified

| File | Change |
|---|---|
| `src/data/playProjectTypes.ts` | Added `TrackPlaybackStatus`, `TrackPlaybackIssue`, `trackPlaybackIssues` field |
| `src/logic/playlistIntegrity.ts` | **New file** — duplicate detection + eligible candidate filter |
| `src/logic/fillMissingTime.ts` | `trackPlaybackIssues` param, Phase 1 empty-slot fill, Phase 2 append |
| `src/ui/FlowCurveCanvas.tsx` | Pointer capture drag, point tracking by ID |
| `src/App.tsx` | `trackPlaybackIssues` state/ref/persist, gap handlers, regen/fill exclusions, new props |
| `src/ui/MainTrackWindow.tsx` | Empty slot row UI, Clear Issue button, new props wired through |

---

## Verification

- `npx tsc --noEmit` — passed with zero errors
- Preview server started, app loads with no console errors
