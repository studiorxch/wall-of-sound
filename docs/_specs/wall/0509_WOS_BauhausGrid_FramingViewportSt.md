# 0509_WOS_BauhausGrid_FramingViewportStudy_v1.2.1

## Goal

Add a debug-only framing/viewport study mode for the existing Bauhaus grid environment layer.

Current system is working:

- MIDI import works
- Bauhaus grid generates correctly
- gridBlocks match playbackEvents
- palette presets work
- finish presets work
- active pulse works
- no visible UI controls were added

This patch should let us explore more inspiring framed views of the grid without changing the underlying grid data.

Core idea:

Full MIDI grid = source world
Viewport/framing = presentation window

We should be able to view a smaller section of the grid at a larger, more designed scale.

Problem

The full-grid view is useful for truth/debugging, but visually it often feels too small or too diagnostic.

For presentation, wallpaper, merch, and streaming backdrops, the more useful view may be closer to:

portrait: 6x12, 7x11, 8x14 visible tile region
landscape: 12x6, 14x8 visible tile region

This should not delete or regenerate the MIDI grid.

It should only change how the current grid layer is framed/rendered.

Files Allowed

Primary:

wall/engine/gridSystem.js
wall/main.js

Optional only if truly needed:

wall/styles.css

Do not touch:

wall/index.html
wall/ui/controls.js
wall/engine/registry.js
wall/engine/schemas.js
MIDI importer
MIDI playback timing
transport

The current Bauhaus palette/finish system lives in gridSystem.js, and the debug API/state wiring lives in main.js; keep this patch in that same lane.

Forbidden Changes

Do not:

change MIDI import
change MIDI playback timing
change grid block count
change palette/finish behavior
add visible UI controls
add new World panel controls
add persistence
add export
add character layers
add parallax
add audio-reactive systems
Required Concept

Add a renderer-level viewport/framing configuration to the Bauhaus grid layer.

Example:

layer.renderer.viewport = {
enabled: false,
mode: "full",
cols: 7,
rows: 11,
startCol: 0,
startRow: 0,
followPlayback: false,
padding: 24
};

This is a rendering window, not a data mutation.

The grid still contains every MIDI block.

Required View Modes

Support these internal modes:

full
portraitStudy
landscapeStudy
full

Current behavior.

Render the whole grid fitted to the frame.

portraitStudy

Render a cropped section of the grid.

Default:

cols: 7
rows: 11

or choose the closest clean fit based on current frame ratio.

landscapeStudy

Render a cropped section of the grid.

Default:

cols: 12
rows: 6

or choose the closest clean fit based on current frame ratio.

Required Debug API

Add methods under existing \_wos.bauhaus.

\_wos.bauhaus.setViewportMode(mode)
\_wos.bauhaus.getViewport()
\_wos.bauhaus.setViewport(cols, rows, startCol, startRow)
\_wos.bauhaus.nudgeViewport(dx, dy)
\_wos.bauhaus.resetViewport()

Optional:

\_wos.bauhaus.setViewportFollowPlayback(enabled)

Expected usage:

\_wos.bauhaus.setViewportMode("portraitStudy")
\_wos.bauhaus.setViewport(7, 11, 0, 0)
\_wos.bauhaus.nudgeViewport(1, 0)
\_wos.bauhaus.nudgeViewport(0, 1)
\_wos.bauhaus.setViewportMode("full")

No visible UI controls.

Rendering Behavior

When viewport.enabled === false or mode === "full":

Use current full-grid rendering exactly as-is.

When viewport mode is enabled:

Determine visible tile window:
startCol
startRow
visibleCols
visibleRows
Render only blocks inside that window.
Compute cell size based on visible window, not full grid dimensions.
Center visible window inside the canvas frame.
Keep palette/finish treatment active.
Keep active pulse behavior active.
Important Data Rule

Do not remove, filter, or rewrite layer.blocks.

Instead, the renderer should decide:

is this block inside the current viewport?

Then draw only visible blocks.

Block Window Logic

Each block should already have grid position data, probably:

block.col
block.row

or equivalent.

If missing, derive from index:

col = index % grid.columns
row = Math.floor(index / grid.columns)

Do not mutate permanently unless safe.

Viewport Safety

Clamp viewport movement.

If the grid is smaller than the viewport, center/fallback safely.

Example:

startCol = clamp(startCol, 0, Math.max(0, totalCols - visibleCols))
startRow = clamp(startRow, 0, Math.max(0, totalRows - visibleRows))
Follow Playback Mode

Optional but useful.

If enabled:

viewport follows the current playback event position

Simple rule:

Look at most recent triggered MIDI event index.
Convert event index to grid row/col.
Center viewport around that block.
Clamp safely.

This must be off by default.

Do not make this fancy.

Default Behavior

Existing default remains full-grid mode.

Do not surprise the user after reload.

viewport.enabled = false
viewport.mode = "full"
Debug Stats

Extend \_wos.debugGridStats() with:

viewportMode
viewportEnabled
viewportCols
viewportRows
viewportStartCol
viewportStartRow
visibleBlocks
totalBlocks

Do not remove existing stats.

Test Flow

Reload, drop MIDI, generate grid:

\_wos.generateBauhausGrid()
\_wos.debugGridStats()

Expected:

full-grid behavior unchanged
gridBlocks === playbackEvents
viewportMode: "full"
viewportEnabled: false

Test portrait study:

\_wos.bauhaus.setViewportMode("portraitStudy")
\_wos.bauhaus.setViewport(7, 11, 0, 0)
\_wos.debugGridStats()

Expected:

larger tile view
visibleBlocks around 77
full layer still has all blocks
gridBlocks still equals playbackEvents

Nudge:

\_wos.bauhaus.nudgeViewport(1, 0)
\_wos.bauhaus.nudgeViewport(0, 1)

Expected:

view moves through the larger MIDI world
no count mutation
no playback change

Return full:

\_wos.bauhaus.setViewportMode("full")

Expected:

normal full-grid poster view returns
Visual Target

The viewport mode should feel like:

looking into a designed Bauhaus world

Not:

zooming browser/camera into a debug grid

The visible tile scale should be large enough that:

circles are readable
line accents are readable
tile rhythm feels intentional
palette/finish has room to breathe
Acceptance Criteria

Pass is complete when:

Full-grid mode is unchanged.
Portrait study mode shows a larger cropped tile region.
Landscape study mode shows a larger cropped tile region.
Viewport can be nudged through the MIDI grid.
Palette and finish still work.
Active pulse still works.
Grid count truth remains intact.
No visible UI controls were added.
MIDI playback behavior was not changed.
Stop Condition

Stop after debug viewport/framing works.

Do not continue into:

export
SVG
PNG
audio-reactive paper
character layer
pattern tile library
UI controls
persistence

## Why this is the right patch

This keeps the full MIDI grid as the **source world**, but lets us inspect it like a designed environment.

That solves the core issue you’re seeing:

full grid = truth
viewport = art direction
