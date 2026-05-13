 0509_WOS_BauhausGrid_LinearPlayheadViewport_v1.2.3

## Goal

Make Bauhaus viewport follow behavior readable.

Current problem:

The viewport technically follows the current playhead event, but it still feels like page refreshes or jumps. The target changes too often because individual MIDI note events are too dense and visually scattered.

Correct behavior:

```txt
note pulse = note activity
viewport follow = smooth linear song progress

The viewport should move like a camera/playhead scanning through the MIDI grid, not like it is chasing every note event.

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

change MIDI import
change MIDI playback timing
change grid block count
change palette/finish system
add visible UI controls
remove note-class pulse
remove manual viewport nudge
rewrite renderer architecture
Current Truth

Keep working:

full grid mode
portraitStudy / landscapeStudy modes
manual viewport nudging
palette switching
finish switching
active pulse
canonical MIDI playback
legacy walker audio muted by default
Required Concept

Split viewport follow into two possible follow targets:

event
timeline

But default follow mode should use:

timeline

Add viewport config:

viewport.followTarget = "timeline";

Supported values:

timeline
event

Do not add visible UI controls.

Required Debug API

Add:

_wos.bauhaus.setViewportFollowTarget(target)

Example:

_wos.bauhaus.setViewportFollowTarget("timeline")
_wos.bauhaus.setViewportFollowTarget("event")

event can preserve the current exact-event behavior for comparison.

timeline becomes the default.

Required Timeline Follow Logic

When:

viewport.followPlayback === true
viewport.followTarget === "timeline"

do not center on the latest event block.

Instead:

Get current transport beat / playback beat.
Get MIDI source length in beats.
Compute progress:
progress = currentBeat / sourceLengthBeats
progress = clamp(progress, 0, 1)
Convert progress to a linear block index:
linearIndex = Math.floor(progress * Math.max(0, totalBlocks - 1))
Convert linear index to grid position:
targetCol = linearIndex % totalCols
targetRow = Math.floor(linearIndex / totalCols)
Center viewport around that target:
targetStartCol = clamp(targetCol - Math.floor(cols / 2), 0, maxStartCol)
targetStartRow = clamp(targetRow - Math.floor(rows / 2), 0, maxStartRow)
Smoothly move current viewport toward target.
Required Smoothing

Keep smoothing, but make it slower and more cinematic by default.

Suggested default:

followSmoothing: 0.08

This should feel like drift, not snapping.

Allow user to tune through console:

_wos.state.world.layers.find(l => l.type === "grid").renderer.viewport.followSmoothing = 0.12

Recommended test values:

0.04 = very slow drift
0.08 = cinematic default
0.12 = responsive smooth
0.18 = current faster follow
Required Quantized Target Update

Do not update the target every frame if it causes jitter.

Add optional target update throttling:

viewport.followTargetUpdateMs = 120;
viewport._lastTargetUpdateAt = 0;

Only recompute target every 80–160ms.

Suggested default:

followTargetUpdateMs: 120

The lerp can still run every frame.

Required Debug Stats

Extend _wos.debugGridStats() and _wos.bauhaus.getViewport() with:

followTarget
followSmoothing
followTargetUpdateMs
timelineProgress
timelineIndex
targetStartCol
targetStartRow
smoothStartCol
smoothStartRow

Do not remove existing stats.

Note Pulse Behavior

Keep note pulse, but do not let global note-class pulse drive viewport follow.

If note-class pulse feels too noisy, reduce only its visual intensity, not the underlying logic.

Do not solve the note meter in this patch.

Test Flow

Reload, drop MIDI, generate grid:

_wos.generateBauhausGrid()
_wos.bauhaus.setViewportMode("portraitStudy")
_wos.bauhaus.setViewport(7, 11, 0, 0)
_wos.bauhaus.setViewportFollowPlayback(true)
_wos.bauhaus.setViewportFollowTarget("timeline")
_wos.midiPlayback.enable()
_wos.midiPlayback.legacyWalkerAudio(false)

Press Play.

Inspect:

_wos.bauhaus.getViewport()
_wos.debugGridStats()

Expected:

followTarget: "timeline"
timelineProgress increases over time
timelineIndex increases over time
viewport moves smoothly through grid
movement direction is understandable
no hard page refreshes

Compare event mode:

_wos.bauhaus.setViewportFollowTarget("event")

Expected:

event mode may feel jumpier
timeline mode should be calmer and more readable
Visual Target

The viewport should feel like:

a camera scanning through a designed musical map

Not:

a slideshow refreshing to new random pages

For portrait:

scan through the grid row by row

For landscape:

feel like a horizontal musical strip or route
Acceptance Criteria

Pass is complete when:

Timeline follow mode exists.
Timeline follow is default when followPlayback is enabled.
Viewport movement is more readable and directional.
Exact event follow can still be tested as an alternate mode.
Note pulse remains separate.
MIDI playback timing is unchanged.
No visible UI controls were added.
Grid count truth remains unchanged.
Stop Condition

Stop after timeline follow mode works.

Do not continue into:

note meter redesign
character layer
audio-reactive paper
export
pattern tile library
UI controls

---