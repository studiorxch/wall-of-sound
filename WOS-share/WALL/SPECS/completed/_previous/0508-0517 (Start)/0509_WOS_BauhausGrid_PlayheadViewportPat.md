0509_WOS_BauhausGrid_PlayheadViewportPatch_v1.2.2

Goal:

Viewport follow should track the canonical playback event/playhead position,
not all active note-class blocks.
Send Claude this

# 0509_WOS_BauhausGrid_PlayheadViewportPatch_v1.2.2

## Goal

Fix Bauhaus viewport follow behavior.

Current problem:

The viewport follow mode appears to follow active note-class blocks. If B and D are playing, many B/D blocks flash or become candidates, so the viewport jumps like an LCD page refresh.

Correct behavior:

```txt
note pulse = note-class activity
viewport follow = exact playback/playhead position

The viewport should follow the current MIDI playback event/index, not every block sharing the same note class.

Files To Touch

Allowed:

wall/main.js
wall/engine/gridSystem.js

Do not touch:

wall/index.html
wall/ui/controls.js
wall/styles.css
registry
schemas
MIDI importer
transport timing
Forbidden Changes

Do not:

change MIDI playback timing
change MIDI import
change grid block count
change palette/finish system
add visible UI controls
add new layer types
remove note-class pulse
rewrite the renderer
Current Truth

These should remain working:

full grid view
portraitStudy / landscapeStudy viewport modes
viewport nudging
palette switching
finish switching
active note pulse
canonical MIDI playback
legacy walker audio muted by default
Required Concept Split

There are now two separate visual signals:

1. Note-class pulse

Used for:

note color activity
note meter
broad visual shimmer

This may still use:

noteActivity[noteClass]
2. Playback cursor

Used for:

viewport follow
exact current position in MIDI grid
playhead-like movement

This must use the most recent canonical MIDI playback event/index.

Required State Addition

Inside state.midiPlayback, add:

playheadEventIndex: null,
playheadEventId: null,
playheadBeat: 0

These are runtime-only.

Required MIDI Playback Update

Inside processMidiPlayback(), when notes are triggered, update the playhead fields using the latest triggered event.

If triggered is an array of normalized MIDI events, choose the event with the greatest startBeat crossed this frame.

Example:

if (triggered.length > 0) {
  var lastEvent = triggered[triggered.length - 1];

  state.midiPlayback.playheadEventIndex =
    lastEvent.index != null ? lastEvent.index : lastEvent.sourceIndex;

  state.midiPlayback.playheadEventId = lastEvent.id || null;
  state.midiPlayback.playheadBeat = lastEvent.startBeat || currentBeat;
}

Do not change how notes are played.

Only add runtime playhead truth.

Required Block Matching

A Bauhaus block should be considered the exact playhead block when:

block.sourceIndex === state.midiPlayback.playheadEventIndex

or:

block.sourceEventId === state.midiPlayback.playheadEventId

This is separate from block.active.

Add a temporary runtime field before rendering:

block.playhead = isBauhausBlockPlayhead(block);

Do not persist this field.

Required Viewport Follow Change

When viewport.followPlayback === true, follow the exact playhead block.

Do not follow the mean position of all active blocks.

Current bad behavior:

active blocks include many blocks sharing note class
viewport jumps between pages

Correct behavior:

find playhead block
center viewport around that one block
smoothly approach target startCol/startRow
Required Smooth Movement

Add smoothing/rate limiting to viewport follow.

The viewport should not hard jump every event.

Suggested config:

viewport.followSmoothing = 0.18;
viewport.targetStartCol = viewport.startCol;
viewport.targetStartRow = viewport.startRow;

On each render/update:

targetStartCol = clamp(playheadCol - Math.floor(cols / 2), 0, maxStartCol)
targetStartRow = clamp(playheadRow - Math.floor(rows / 2), 0, maxStartRow)

startCol += (targetStartCol - startCol) * followSmoothing
startRow += (targetStartRow - startRow) * followSmoothing

Before selecting blocks for rendering, use rounded/clamped values:

renderStartCol = Math.round(startCol)
renderStartRow = Math.round(startRow)

If fractional starts are too disruptive, keep internal float values and round only for rendering.

Required Debug API

Extend _wos.bauhaus.getViewport() to include:

playheadEventIndex
playheadEventId
playheadBeat
targetStartCol
targetStartRow

Extend _wos.debugGridStats() with:

playheadEventIndex
playheadBlockCol
playheadBlockRow
viewportFollowPlayback

Do not remove existing stats.

Required Behavior

When playback is off:

viewport stays where user nudged it

When playback is on and followPlayback is false:

viewport stays where user placed it

When playback is on and followPlayback is true:

viewport follows exact playhead block smoothly
Test Flow

Reload, drop MIDI, generate grid:

_wos.generateBauhausGrid()
_wos.bauhaus.setViewportMode("portraitStudy")
_wos.bauhaus.setViewport(7, 11, 0, 0)
_wos.bauhaus.setViewportFollowPlayback(true)
_wos.midiPlayback.enable()
_wos.midiPlayback.legacyWalkerAudio(false)

Press Play.

Check:

_wos.bauhaus.getViewport()
_wos.debugGridStats()
_wos.getSystemHudData().runtime.midiLastTriggered

Expected:

audio plays once, no doubled legacy path
playheadEventIndex changes during playback
viewport moves through grid more smoothly
viewport does not jump to every note-class cluster
note pulse still works separately
Stop Condition

Stop when:

Viewport follow uses exact playhead event/block.
Viewport movement is smoother than current page-jump behavior.
Note pulse still works.
MIDI timing is unchanged.
No visible UI controls were added.
```
