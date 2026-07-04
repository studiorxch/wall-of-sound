# PLAY 0619C — Curve Regeneration Controls Patch — Completion Report

**Date:** 2026-06-20
**Patch:** `0619C_PLAY_CurveRegenerationControlsPatch_v1.0.0_PATCH`
**Status:** PASS

---

## 1. Summary

Added explicit, confirmation-guarded curve regeneration controls to the PLAY playlist workspace. Users now have deliberate buttons for both additive repair (Fill Missing Time) and full rebuild (Regenerate From Curve). Curve template application no longer silently overwrites playlist slot order. Removed implicit auto-regeneration from target duration and preset changes.

---

## 2. Files Modified

| File | Changes |
|------|---------|
| `src/ui/PlaylistHeader.tsx` | Added `onRegenerateFromCurve` prop; `Regenerate From Curve` button; `confirmRegen` state; confirmation modal with locked-track disclosure |
| `src/App.tsx` | Added `handleRegenerateFromCurve` (runs `assignPlaylistToCurve`, sets `manualOrderDirty = false`, autosaves, toast); removed implicit `assignPlaylistToCurve` from `handlePresetChange` and `handleTargetDurationChange`; `handlePresetChange` now calls `showFlashMsg` after curve replacement; wired `onRegenerateFromCurve` into `<PlaylistHeader>` |

---

## 3. Behavior Changes

### Regenerate From Curve (new)
- Button in PlaylistHeader row, between Fill Missing Time and Export M3U
- Clicking opens a confirmation modal: "This will rebuild track assignments from the active flow curve. Manual edits and slot order will be replaced. Locked tracks will stay fixed."
- On confirm: runs `assignPlaylistToCurve` directly with current playlist curve, locks, and excludedTrackIds; sets `manualOrderDirty = false`; autosaves; shows toast with assigned track count
- Locked playlist: rejected with toast "Playlist is locked. Duplicate or unlock to edit."

### Curve Template Application (fixed)
- **Before:** Applying a preset template while `manualOrderDirty === false` silently ran `assignPlaylistToCurve` and replaced all slot assignments.
- **After:** Applying a template only updates the curve shape. Playlist slots are untouched. A flash message appears: "Curve updated — click Regenerate From Curve or Fill Missing Time to update playlist."
- Confirmation modal before replace was already present (from 0619A) and is preserved.

### Target Duration Change (fixed)
- **Before:** Changing target duration while `manualOrderDirty === false` silently regenerated slots.
- **After:** Only updates `targetDurationMinutes` and rescales the curve. No slot changes.

### Fill Missing Time (unchanged)
- Already implemented in 0619A. Sets `manualOrderDirty = true` (additive, not rebuild). No changes.

### Duration Status (unchanged)
- Already matches spec: `"22 tracks · 1h19m · target 2h 0m · missing 41m"` / `"+8m buffer"` / `"✓ on target"`

---

## 4. Architecture Notes

- `handleRegenerateFromCurve` reads state from refs (`libraryTracksRef`, `excludedTrackIdsRef`, `activePlaylistIdRef`) to avoid stale closures inside `setPlaylists`.
- The `manualOrderDirty = false` flag after regeneration restores the auto-regenerate-on-curve-drag behavior for fresh playlists (only kicks in when `!manualOrderDirty`).
- The notify toast count reads from `playlistsRef.current` after the state update via `setTimeout(0)` — same pattern used for drag-to-playlist in 0619B.

---

## 5. Acceptance Criteria

| # | Criterion | Status |
|---|-----------|--------|
| 1 | Duration status shows readable track count and time | PASS (0619A, unchanged) |
| 2 | Missing time is visible when under target | PASS (0619A, unchanged) |
| 3 | Fill Missing Time button exists and works | PASS (0619A, unchanged) |
| 4 | Removed/excluded tracks do not return via Fill | PASS (0619A, unchanged) |
| 5 | Regenerate From Curve button exists | PASS |
| 6 | Clicking Regenerate asks for confirmation | PASS |
| 7 | Cancelling confirmation leaves playlist unchanged | PASS |
| 8 | Confirming rebuilds slots from curve | PASS |
| 9 | Locked tracks preserved after regeneration | PASS (honored by `assignPlaylistToCurve` via locks array) |
| 10 | Removed/excluded tracks blocked after regeneration | PASS (honored by `excludedTrackIds` param) |
| 11 | Regeneration sets `manualOrderDirty = false` | PASS |
| 12 | Regeneration autosaves | PASS |
| 13 | Templates are in Curve Tools menu | PASS (0619A, unchanged) |
| 14 | Applying a template to edited curve asks confirmation | PASS (0619A, unchanged) |
| 15 | Applying template does not silently regenerate playlist | PASS (fixed) |
| 16 | User told to Regenerate/Fill after curve replacement | PASS (flash message) |
| 17 | Target duration change does not silently regenerate | PASS (fixed) |
| 18 | Existing playlist switching works | PASS |
| 19 | Existing M3U export works | PASS |
| 20 | Existing drag/reorder works | PASS |
| 21 | Existing autosave/migration works | PASS |

---

## 6. Out of Scope (deferred)

- Undo for regeneration/fill/template (optional per spec, not implemented)
- Playlist lock UI toggle (locked field exists on PlaylistRecord, drag-to-playlist checks it, but no UI to set it)
- Advanced fill strategy (curve-fit insertion positions — append-to-end used per spec v1 guidance)
- `lastRegeneratedAt` field on PlaylistRecord (not in current schema, deferred)

---

## 7. TypeScript

`npx tsc --noEmit` — clean, no errors.
