# 0618C_PLAY_FlowCurvePlaylistBuilder_v1.1.0_PATCH

## Project

**Project Title:** 0618C_PLAY_FlowCurvePlaylistBuilder_v1.1.0_PATCH  
**Purpose:** Apply a focused UX patch to the existing Flow Curve Playlist Builder after the Phase 1 build.

---

## Environmental Assumptions

- Existing project: `flow-curve-builder/`
- Runtime: Vite + React + TypeScript
- The app is already running end-to-end.
- Do not change the core Phase 1 architecture.
- Do not add playback, waveform rendering, transition timing, OBS, mixer controls, or audio analysis inside the React app.

---

## Patch Goals

1. Make locking songs immediate from the playlist timeline.
2. Remove or demote unnecessary manual regeneration.
3. Simplify target duration controls.
4. Keep the UI focused on curve editing, playlist order, warnings, orphans, and export.

---

## Task 1 — Inline Lock Controls

### Problem

Current workflow is too indirect:

```text
Playlist row
↓
Locks tab
↓
Find same song
↓
Choose dropdown
↓
Click lock
```

### Required Behavior

Add a lock/unlock button directly beside each assigned playlist row.

### V1.1 Behavior

- Click unlocked icon = create a `position` lock for that track at that slot.
- Click locked icon = remove the lock.
- Locked rows must show a clear visual locked state.
- Locked rows must remain fixed after:
  - preset changes
  - target duration changes
  - curve point edits
  - excluded/restored track changes
  - export
  - JSON reload

### Keep Existing Locks Tab

The existing Locks tab may remain for advanced lock management, but it should no longer be the primary workflow.

---

## Task 2 — Remove Primary Regenerate Playlist Button

### Problem

The large Regenerate Playlist button is unnecessary if presets, duration, and curve edits already regenerate correctly.

### Required Behavior

Auto-regenerate after:

```text
preset change
duration change
curve point edit
lock/unlock
exclude/restore
new import
```

### UI Requirement

- Remove the large primary Regenerate Playlist button.
- If a manual action is still useful for debugging, keep a small secondary `Recalculate` button in a utility area.
- Do not make recalculation the main CTA.

---

## Task 3 — Simplify Target Duration Controls

### Required UI

Show only:

```text
1 hr | 2 hr | 3 hr | Custom minutes
```

### Required Behavior

- `1 hr` sets `60` minutes.
- `2 hr` sets `120` minutes.
- `3 hr` sets `180` minutes.
- Custom minutes supports all other durations.
- Existing custom duration behavior must continue to work.
- The tool must remain flexible; do not hard-code the app around these three durations.

---

## Task 4 — Preserve Current Working Features

Do not break:

- CSV import
- visible Flow Curve
- curve presets
- curve editing
- playlist assignment
- warnings
- orphans
- JSON export/import
- CSV export
- M3U export
- locking behavior
- excluded/restored tracks

---

## Acceptance Criteria

The patch is complete when:

1. Every assigned playlist row has a lock icon.
2. Clicking the icon toggles a position lock.
3. Locked songs remain fixed after curve and preset changes.
4. The large Regenerate Playlist button is removed or demoted.
5. Auto-regeneration works after user edits.
6. Target duration buttons show only `1 hr`, `2 hr`, and `3 hr`.
7. Custom minutes still works.
8. Existing export/import behavior remains intact.

---

## Test Path

```text
1. npm run dev
2. Import sample CSV.
3. Click lock icon on a playlist row.
4. Change curve preset.
5. Confirm locked row stays fixed.
6. Unlock row.
7. Confirm it can move after preset/curve changes.
8. Test 1 hr / 2 hr / 3 hr duration buttons.
9. Test custom 90 minutes.
10. Export JSON.
11. Reload JSON.
12. Confirm locks and curve restore.
```

---

## Implementation Guide

- **Where:** Patch `src/ui/PlaylistTimeline.tsx`, `src/ui/TargetDurationPanel.tsx`, and regeneration wiring in `src/App.tsx`.
- **What:** Add inline position-lock toggling, remove the primary regenerate CTA, simplify duration presets.
- **Expect:** The interface becomes faster to use while preserving the existing Phase 1 Flow Curve behavior.
