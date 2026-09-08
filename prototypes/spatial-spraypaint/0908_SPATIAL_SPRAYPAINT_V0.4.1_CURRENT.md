# Spatial Spraypaint V0.4.1 Current Status

Date: 2026-09-08

Status: PASS for the bounded software checkpoint. Camera-specific behavior still requires the camera-equipped MacBook Pro and is not claimed as physically verified on this host.

## Implemented

- Selecting **Hand** still owns camera initialization/startup and now switches camera treatment to **Clean** before startup. Hidden remains available for deliberate selection. Physical preserves the current treatment and remains camera-free.
- Cap, color, background, smoothing, drip, and other art state are not reset by the Hand transition.
- A small first-use cue, `Pinch thumb + index finger to spray`, appears after a hand is detected and disappears for the rest of the session after the first pinch-spray signal.
- Settings uses a large accessible `×` close control. Escape remains registered as the close command.
- The persistent session island now contains compact Undo, Clear, Record, Member, and Settings controls.
- Clear removes painted strokes without changing the background and no longer presents a destructive confirmation.
- The existing bounded `StrokeHistory` owns one saved pre-clear state. Immediate Undo restores that complete state; subsequent normal stroke Undos continue in reverse order. No parallel or large history system was introduced.
- The centralized `CommandRegistry` owns `Shift + Delete = Clear Canvas`, including the Mac keyboard's Backspace event for the key labeled Delete. Bare Delete/C is not bound, and the generated Settings shortcut reference is authoritative.
- The existing can-rattle remains unchanged. No Undo rattle experiment was added.

## Automated Verification

- Focused tests: PASS — 3 files, 11 tests covering Hand/Clean treatment selection, undoable Clear restoration, continued normal Undo, Shift+Delete/Backspace handling, and shortcut conflicts.
- `npm test`: PASS — 12 test files, 36 tests.
- `npm run build`: PASS — TypeScript and Vite production build; 23 modules transformed.
- Existing background, spray rendering, smoothing, drip, cap, hand geometry, silhouette, player-state, recording-audio support, and spray-audio regression tests remain passing.

## Current-Host Browser Verification

- Settings `×` opens/closes correctly and retains the accessible label: PASS.
- Escape closes Settings through the centralized command system: PASS.
- Root Clear icon is present, compact, and disabled when there is no paint: PASS.
- Mouse spray rendering creates a normal finalized stroke: PASS.
- Root Clear removes painted strokes without a dialog: PASS.
- One Undo restores the visibly cleared wall: PASS.
- `Shift + Delete` on the Mac-labeled Delete key clears via the registry; Ctrl/Command+Z restores it: PASS.
- Three consecutive normal Undos reduced available history from 3 → 2 → 1 → 0 and disabled cleanly: PASS.
- Off-white background selection survived Clear, restoration, and normal Undo: PASS.
- Record entered active state and returned to idle/save state: PASS.
- Browser console warnings/errors after verification: none.

## MacBook Pro Validation Required

- Start from Hidden, select Hand, and confirm the camera becomes visibly Clean before/while startup completes.
- Confirm Hand still requests/starts the camera and Physical stops it.
- Confirm the first-use pinch cue appears after real hand detection, remains while no pinch-spray has occurred, and dismisses after the first successful pinch spray.
- Confirm Hidden and the other camera treatments remain selectable after startup.
- Recheck Clear/Undo and Shift+Delete during a real hand-tracking session.

## Deferred / Known Limitations

- Pinch responsiveness, choppy hand tracking, and hand-tracking performance investigation are explicitly deferred pending daylight testing on the MacBook Pro.
- The pre-clear restoration is intentionally single-level. New finalized strokes can be undone before the prior cleared wall is restored; a later Clear replaces the earlier clear snapshot.
- Redo and history persistence across reload remain out of scope.
- No cap, smoothing, audio, recording, MUSIC, AudioLab, Suno, Members, Subway, shell architecture, or Infinite Canvas behavior was redesigned in this patch.

## Exact V0.4.1 Files

Changed:

- `prototypes/spatial-spraypaint/index.html`
- `prototypes/spatial-spraypaint/package.json`
- `prototypes/spatial-spraypaint/package-lock.json`
- `prototypes/spatial-spraypaint/src/CommandRegistry.ts`
- `prototypes/spatial-spraypaint/src/CommandRegistry.test.ts`
- `prototypes/spatial-spraypaint/src/SettingsState.ts`
- `prototypes/spatial-spraypaint/src/SettingsState.test.ts`
- `prototypes/spatial-spraypaint/src/StrokeHistory.ts`
- `prototypes/spatial-spraypaint/src/StrokeHistory.test.ts`
- `prototypes/spatial-spraypaint/src/main.ts`

Added:

- `prototypes/spatial-spraypaint/0908_SPATIAL_SPRAYPAINT_V0.4.1_CURRENT.md`
