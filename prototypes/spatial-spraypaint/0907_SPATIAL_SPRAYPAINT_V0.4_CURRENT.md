# Spatial Spraypaint V0.4 Current Status

Date: 2026-09-07

Status: PARTIAL — the canvas-first product shell, centralized commands, canonical-stroke Undo, compact looping player, mixed recording, and Physical input workflow pass on the current host. Hand/camera behavior remains to be revalidated on the camera-equipped MacBook Pro.

## Canvas-First Startup

The app now opens directly into the drawing surface. There is no startup panel, Performance Mode, fullscreen step, exposed Hold to Spray control, or visible tracking diagnostics. Persistent UI presents state and immediate actions in small edge islands:

- **Input island:** `Physical | Hand` plus compact readiness/error state.
- **Art island:** current-color button and cap icon only.
- **Session island:** one row containing Undo, Record, Member placeholder, and Settings icons.
- **Player island:** separate from session controls; collapsed to a music/load icon until a track is loaded.

The Member icon is an intentionally nonfunctional placeholder. No Members/auth implementation or dependency was introduced.

## Physical And Hand Input

`Physical` is the product term for mouse, trackpad, and future pointer/stylus input. Apple Pencil pressure is not implemented.

`Hand` owns camera startup. Selecting it switches the input model, initializes MediaPipe, and starts the camera without a second persistent Start Camera control. Camera failure is surfaced next to the Hand state as `RETRY CAMERA`, while the existing detailed error is exposed in the temporary Settings surface. Returning to Physical stops an active camera.

The existing hand mapping, pinch detection, MediaPipe dependency, tracking diagnostics, and spray delivery implementation were not retuned.

## Art Island

- Persistent art state is represented by a current-color disc and a cap/nozzle icon.
- The color button opens the existing 11-color graffiti palette; choosing a color updates the disc and closes the chooser.
- The cap icon opens all 11 established cap names with compact relative-width samples; choosing a cap updates the icon tooltip and closes the chooser.
- Cap names, every color swatch, radius, smoothing, and technical values are not permanently displayed.
- The V0.3 cap definitions, deposition, smoothing math, and drip behavior remain unchanged.

## Session And Settings Islands

The persistent session island is exactly one compact icon row:

- Undo symbol with shortcut tooltip
- record dot with red active state and stop-square transition
- Member/profile placeholder
- Settings cog

Settings opens temporarily and closes via its button, the comma toggle, Escape, or beginning a Physical canvas stroke. It is organized as:

- **Drawing:** smoothing, stationary drips, radius override/reset, background
- **Input:** camera treatment and tracking diagnostics
- **Sound:** spray status and temporary can-rattle test
- **Shortcuts:** generated from the centralized command registry
- **Advanced:** confirmed Clear Canvas action

Clear has no easy keyboard shortcut and requires confirmation.

## Centralized Command Registry

One `CommandRegistry` owns all user-facing keyboard commands. No other `keydown` handler exists in the prototype.

| Command | Shortcut |
| --- | --- |
| Undo last stroke | Command/Ctrl + Z |
| Play / pause soundtrack | Space |
| Start / stop recording | R |
| Toggle Settings | `,` |
| Close Settings | Escape |

Space-to-spray is retired, removing its conflict with soundtrack playback. Shortcut definitions, labels, categories, descriptions, and actions are sourced through the same registry used to build the Settings reference. Conflict detection tests pass.

Reserved for V0.5 documentation only; not implemented or shown as inactive controls:

- Space + drag — Pan
- Z — Quick Zoom
- `+` — Precision Zoom In
- `-` — Precision Zoom Out
- `0` — Reset View / 100%

Space playback will need an intentional command-context decision when real canvas pan arrives. No fake pan or zoom was added in V0.4.

## Canonical-Stroke Undo

- Each spray activation begins one recorded stroke containing cap identity, color, canonical/interpolated points, and any drip seeds.
- Finalized strokes enter a bounded 40-stroke undoable window. Older strokes become locked paint history so later Undo replay does not erase them.
- Undo removes the most recent finalized stroke and reconstructs the persistent paint canvas from retained canonical strokes.
- Background, player, input, settings, and recording state are outside paint replay and remain unchanged.
- Completed drip seeds replay with their owning stroke.
- Undo is available from the icon and Command/Ctrl+Z; repeated Undo is supported. Redo is not implemented.

The optional Undo/rattle acknowledgement experiment was not enabled. Undo remains immediate and silent. The existing rattle remains available in Settings and is not attached to Record.

## Compact Soundtrack Player

- The empty player collapses to one soundtrack-load icon.
- Loading expands a single row containing load, play/pause, truncated track title, progress/seek, elapsed/duration, and loop.
- Loop defaults on for long drawing sessions and can be toggled.
- Space invokes play/pause when focus is not inside an interactive form control.
- Uploaded music continues through the established `SprayCanAudio` music bus into local output and the recorder mix. No MUSIC player or second audio engine was created.

## Automated Verification

- `npm test`: PASS — 12 test files, 33 tests.
- `npm run build`: PASS — TypeScript and Vite production build; 23 modules transformed.
- New focused tests cover command resolution and shortcut conflicts, player load/play/pause/seek/loop transitions, settings state, bounded canonical stroke history, consecutive Undo behavior, defensive history snapshots, and retention of older paint beyond the undo window.
- Existing cap, stroke interpolation, smoothing, drip, background, hand geometry, silhouette, and spray-audio regression tests remain passing.

## Current-Host Browser Verification

- Canvas-first startup with no large panels: PASS.
- Compact `Physical | Hand` island and Physical-ready state: PASS.
- Two-icon art island, temporary color chooser, and temporary named/sample cap chooser: PASS.
- Color selection and automatic chooser dismissal: PASS — Blue exercised.
- Cap selection and automatic chooser dismissal: PASS — Needle and New York Fat exercised.
- One-row Undo/Record/Member/Settings session island: PASS.
- Player collapsed while empty, then expanded as its own one-row island: PASS.
- Settings opened/closed by icon and close button; comma/Escape commands also verified: PASS.
- Smoothing, drips, radius/background, tracking diagnostics, Sound, Shortcuts, and Advanced organization present in Settings: PASS.
- Mouse spray rendering with Needle and New York Fat: PASS; V0.3 spray behavior remained visually intact.
- Two finalized strokes entered Undo independently: PASS.
- Visible Undo removed the newest stroke while retaining the older stroke: PASS.
- Command-Z removed the next stroke; repeated Undo disabled cleanly when empty: PASS.
- Off-white background survived both Undo reconstruction and empty history: PASS.
- Loaded `01. Soulphiction - White Ropes.mp3`: PASS — title displayed, duration resolved to 3:55.
- Play/pause: PASS.
- Progress/seek: PASS — scrubbed to 1:57.
- Loop off/on state: PASS.
- Long-duration playback soak: NOT PERFORMED; native loop behavior and reducer end-state coverage pass.
- Spray hiss start/stop during Physical drawing: PASS.
- Manual can-rattle test and quiet-state recovery: PASS.
- Recording with loaded soundtrack plus spray: PASS — one mixed audio track and a non-empty 23,606-byte `video/webm` export.
- Final browser console warnings/errors: none.

## MacBook Pro Validation Required

- Select Hand and confirm camera permission/startup is owned by that control.
- Confirm the `RETRY CAMERA` path is usable if permission is denied or startup fails.
- Confirm fingertip cursor, pinch spray, and accidental-hand-mark recovery through Undo.
- Confirm Command-Z remains comfortable during real hand drawing.
- Confirm camera treatment, diagnostics, soundtrack, spray audio, and mixed recording work together.
- Confirm returning to Physical stops the camera cleanly.
- Confirm the compact islands remain legible without materially blocking the MacBook canvas.

## Known Limitations

- Member/profile is a placeholder only.
- Undo depth is 40 finalized strokes; redo and persistence across reload are not implemented.
- Canonical replay preserves retained stroke structure, color, cap, and drips, but fine stochastic overspray particles may not land at identical pixels after reconstruction.
- The player supports one local session soundtrack and is intentionally not a MUSIC library/player.
- A long-duration audio soak was not run during this checkpoint.
- Physical names the future-compatible input family, but Apple Pencil pressure/tilt and touch-specific ergonomics are deferred.
- Hand/camera behavior was not physically tested on this host during closure.

## Future Multi-Tool Entry

Graffiti Wall must eventually support Spray Can, Mop, Fire Extinguisher, Sticker, other marking tools, and Black Book as a related creative space. V0.4 deliberately does not build that launcher or permanently encode the two-button art island as a spray-only application boundary. A transient spray-can entry visual may be explored with the future tool system.

## Next Technical Checkpoint

**V0.5 — Infinite Canvas / Pan / Zoom / Wall Coordinates.**

Do not simulate this with transforms over the fixed V0.4 canvas. The next checkpoint should establish real world coordinates and decide the interaction boundary between soundtrack Space and canvas Pan before activating navigation shortcuts.

## Exact V0.4 Files

Changed:

- `prototypes/spatial-spraypaint/index.html`
- `prototypes/spatial-spraypaint/package.json`
- `prototypes/spatial-spraypaint/package-lock.json`
- `prototypes/spatial-spraypaint/src/SprayBrushEngine.ts`
- `prototypes/spatial-spraypaint/src/main.ts`

Added:

- `prototypes/spatial-spraypaint/src/CommandRegistry.ts`
- `prototypes/spatial-spraypaint/src/CommandRegistry.test.ts`
- `prototypes/spatial-spraypaint/src/PlayerState.ts`
- `prototypes/spatial-spraypaint/src/PlayerState.test.ts`
- `prototypes/spatial-spraypaint/src/SettingsState.ts`
- `prototypes/spatial-spraypaint/src/SettingsState.test.ts`
- `prototypes/spatial-spraypaint/src/StrokeHistory.ts`
- `prototypes/spatial-spraypaint/src/StrokeHistory.test.ts`
- `prototypes/spatial-spraypaint/0907_SPATIAL_SPRAYPAINT_V0.4_CURRENT.md`
