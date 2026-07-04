0513_WOS_GlyphConstructionSystem_v1.1.0.md
Overview

Phase 2 of the Glyph Construction System focuses on:

precision rendering
workflow speed
live symbolic context
non-destructive editing
structured curve creation

This update transforms the construction canvas from a proof-of-concept editor into a usable symbolic design environment suitable for:

modular typography
signage systems
symbolic poetry
transit-style iconography
generative language systems
WOS environmental symbols

This version intentionally avoids:

bezier editors
freeform illustration complexity
SVG-style anchor manipulation

The system remains:

constraint-first
grid-native
symbol-oriented
Goals
Primary Goals

1. Crisp Retina Rendering

Fix blurry low-resolution construction rendering.

2. Live Symbol Awareness

Users must see glyphs update in-context while editing.

3. Safe Editing

Add erase + undo workflow.

4. Structural Curves

Upgrade arc system into usable corner construction.

5. Faster Symbol Iteration

Reduce friction while constructing entire symbol families.

Version
0513_WOS_GlyphConstructionSystem_v1.1.0
File Targets
Modified
engine/glyphConstructor.js
engine/symbolRenderer.js
ui/symbolDrawer.js
styles.css
index.html
FEATURE 01 — Retina Canvas Rendering
Problem

Construction canvas appears blurry because:

canvas internal resolution != displayed size

This causes:

soft lines
fuzzy diagonals
low-detail previews
poor grid precision
Required
Construction canvas must support:
devicePixelRatio scaling
Implementation
Add utility
function resizeHiDPICanvas(canvas, ctx) {
const rect = canvas.getBoundingClientRect();
const dpr = window.devicePixelRatio || 1;

canvas.width = Math.round(rect.width _ dpr);
canvas.height = Math.round(rect.height _ dpr);

ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

ctx.imageSmoothingEnabled = false;
}
Required Usage

Call:

resizeHiDPICanvas()

during:

init
resize
drawer open
layout changes
Result

Expected:

crisp monoline rendering
sharp dots
clean diagonals
readable tiny symbols
FEATURE 02 — Live Glyph Slot Thumbnails
Problem

Glyph slots currently show:

empty placeholders

Users cannot:

compare symbols
maintain visual consistency
evaluate rhythm of a symbol set
Required

Each glyph cell must render:

live miniature glyph preview
UI Structure
Replace slot internals with:

<div class="glyph-slot">
  <canvas class="glyph-slot-preview"></canvas>
  <span class="glyph-slot-label">A</span>
</div>
Rendering

Use:

WOS.SymbolRenderer.renderGlyph()
Thumbnail Specs
Recommended
48×48 px

Retina-scaled internally.

Refresh Triggers

Update thumbnail when:

object added
object moved
object erased
undo
duplicate
rotate
mirror
clear glyph
FEATURE 03 — Global Text Selection Suppression
Problem

Dragging across UI accidentally selects:

labels
buttons
text
panel contents

Breaks editor feel.

Required

Editor behaves like:

Figma
Illustrator
CAD software
level editor
CSS
Add
body {
user-select: none;
-webkit-user-select: none;
}
Restore ONLY for
input,
textarea,
[contenteditable="true"] {
user-select: text;
-webkit-user-select: text;
}
FEATURE 04 — Erase Tool
Problem

Current workflow:

mistake → destructive delete

No micro-editing possible.

Required

Add:

eraser tool
Tool ID
tool: "erase"
Behavior
Hover

Hovered object:

highlights
glows
increases opacity
Click

Click removes:

single object only

NOT pixels.

Important

Erase operates on:

glyph objects

NOT raster data.

This preserves:

editability
symbolic structure
transform operations
FEATURE 05 — Undo System
Required

Add:

single-level undo minimum

Preferred:

history stack
State
Add
history: [],
historyIndex: -1

inside construction state.

Snapshot Strategy

Push snapshot after:

add
move
erase
rotate
mirror
duplicate
clear
Snapshot Type

Use:

structuredClone()

OR:

JSON.parse(JSON.stringify())
Keyboard Shortcut
Add
Cmd+Z
Ctrl+Z
FEATURE 06 — Arc Tool Upgrade
Problem

Current arc tool only supports:

center-origin semi-circle

Good for:

moons
circles
radial forms

Bad for:

corners
transit curves
rounded geometry
Required

Arc tool now supports:

MODE A — Center Arc

Default behavior.

Current implementation remains unchanged.

MODE B — Corner Arc

Activated with:

SHIFT
Corner Arc Workflow
Interaction
Step 1

Click start point.

Step 2

Drag toward bend direction.

Step 3

Release at end point.

Result

Creates:

90º rounded corner arc
Construction Logic

Corner arc stores:

{
type: "arc",
mode: "corner",
startX,
startY,
endX,
endY,
radius,
clockwise
}
Renderer Update

renderGlyphObject()
must support:

obj.mode === "corner"
FEATURE 07 — Rounded Rectangle Tool
Required

Add:

rounded rect support
Option A (Preferred)

Add:

cornerRadius

to rect objects.

Example
{
type: "rect",
x,
y,
w,
h,
cornerRadius: 0.08
}
Rendering

Use:

ctx.roundRect()

fallback:
manual path construction.

FEATURE 08 — 24×24 Grid Option
Problem

16×16 excellent for:

minimal systems
signage
symbols

But lacks:

dense detail
micro-patterns
technical glyphs
Required

Allow selectable:

16×16
24×24
32×32 (future-ready)
UI

Add dropdown:

GRID
[16]
[24]
[32]
State

Replace:

gridDivisions: 16

with dynamic value.

Already mostly supported.

FEATURE 09 — Persistent Live Poem Preview
Problem

Preview tabs isolate workflow.

Users must constantly:

switch modes

This destroys symbolic continuity.

Required

Add:

persistent secondary preview panel
Layout
Recommended
+---------------------------------------------------+
| glyph slots | construction canvas | live preview |
+---------------------------------------------------+
Preview Modes

Selectable:

WORD
POEM
PATTERN
WORLD
Behavior

Live updates while editing.

NO mode switching required.

FEATURE 10 — Copy / Paste Between Glyphs
Required

Enable:

cross-glyph shape reuse
Keyboard
Cmd+C
Cmd+V
Clipboard Format

Internal JS object clone.

NOT system clipboard initially.

Paste Behavior

Pasted objects:

offset slightly
auto-selected
FEATURE 11 — Construction Overlay Polish
Required

Improve hover feedback.

Add
Selected object
cyan outline
Hovered object
soft glow
Marquee
semi-transparent fill
FEATURE 12 — Live Preview Performance
Required

Throttle preview redraws.

Suggested

Use:

requestAnimationFrame()

instead of:

redraw on every mouse event
Architecture Notes
Important

The Glyph Construction System remains:

object-based

NOT:

raster-based

This distinction must remain protected.

All operations should preserve:

editability
symbolic structure
normalized coordinates
deterministic rendering
Future Systems Enabled

This architecture now prepares for:

symbol inheritance
procedural mutation
symmetry tools
animated symbols
reactive WOS glyphs
environmental signage
symbolic transit maps
generative alphabets
symbolic MIDI/event systems
Non-Goals

Do NOT add:

bezier anchor editor
Illustrator-style handles
layer panel
freeform painting
raster brushes
SVG import complexity

The system should remain:

minimal
fast
symbolic
constraint-driven
Expected Outcome

After v1.1.0 the system should feel like:

a modular symbolic construction lab

instead of:

a prototype drawing widget
Implementation Guide

Main work occurs in:

ui/symbolDrawer.js
engine/glyphConstructor.js

Renderer upgrades occur in:

engine/symbolRenderer.js

CSS fixes mainly affect:

styles.css

Expected visible result:

crisp editor + live glyph previews + erase/undo + proper curve construction
