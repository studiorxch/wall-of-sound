0513_WOS_SymbolLabWorkbenchLayout_v1.0.0
Goal

Re-architect SymbolLab from a tall sidebar utility into a docked horizontal workstation that preserves simultaneous visibility between:

World canvas
Glyph construction
Glyph library
Live preview systems

This update prioritizes:

centered composition
continuous workflow
live contextual feedback
future scalability toward timeline/layer systems
Core Problem

Current layout creates several UX and spatial issues:

Issue Result
SymbolLab occupies excessive vertical space Main world canvas becomes compressed
World shifts off-center Loss of immersion and compositional balance
Preview/editor overlap Visual noise and confusion
Slot library wastes vertical space Low information density
Context switching between previews Broken creative flow

The system now behaves more like:

a symbolic workstation
procedural deployment environment
audiovisual composition tool

…not a traditional sidebar inspector.

The layout must evolve accordingly.

New Layout Architecture
Previous Layout
┌──────────────┬──────────────┐
│ │ │
│ │ │
│ WORLD │ SYMBOLLAB │
│ │ │
│ │ │
└──────────────┴──────────────┘
New Layout
┌────────────────────────────────────────────┐
│ │
│ │
│ WORLD │
│ │
│ │
├────────────────────────────────────────────┤
│ slots │ editor │ word │ poem │ pattern │
└────────────────────────────────────────────┘
Design Objectives

1. World Canvas Remains Centered

The world canvas is the primary visual space.

Requirements:

maintain horizontal centering
preserve breathing room
avoid asymmetric side compression
maximize visible world area
improve OBS/presentation aesthetics 2. SymbolLab Converts Into Docked Workbench

SymbolLab becomes:

bottom-docked modular workstation

NOT:

full-height sidebar 3. Glyph Library Moves Horizontal

Current vertical slot grid becomes:

compact horizontal strip
scrollable if needed
higher density
reduced dead space

Benefits:

more room for previews
easier scanning
faster symbolic comparison
cleaner workstation proportions
Layout Structure
Bottom Workbench Regions
Region Purpose
Slot Strip glyph browsing
Construction Canvas glyph authoring
Live Preview Panels deployment/context preview
Controls tools + brush + styling
Construction Canvas

The glyph editor remains the primary editing surface.

Requirements:

fixed square aspect ratio
always visible
centered within workbench
isolated from world overlap
no transparency bleed-through
Live Preview Panels

Persistent simultaneous previews.

No tab switching required.

Suggested layout:

[word]
[poem]
[pattern]
[world]

Small but always active.

Preview Rules

Previews should:

update live
remain isolated from world canvas
never overlap construction canvas
support future animation
World Canvas Rules

World canvas should:

ignore SymbolLab width changes
remain centered
resize dynamically with dock height
preserve aspect behavior
Responsive Dock Sizing

Workbench height should support:

Mode Height
Compact 240px
Standard 320px
Expanded 420px

Implementation:

--symbol-workbench-height
CSS Layout Direction
Replace Current Sidebar Flex

FROM:

display:flex;
flex-direction:row;

TO:

display:flex;
flex-direction:column;
Proposed DOM Structure

<div id="app-shell">

  <main id="world-stage">
    <canvas id="world-canvas"></canvas>
  </main>

  <section id="symbol-workbench">

    <div id="symbol-slot-strip"></div>

    <div id="symbol-editor-region">
      <div id="glyph-construction"></div>

      <div id="preview-column">
        <div class="preview-panel word"></div>
        <div class="preview-panel poem"></div>
        <div class="preview-panel pattern"></div>
        <div class="preview-panel world"></div>
      </div>
    </div>

    <div id="symbol-controls"></div>

  </section>

</div>
Rendering Rules
Important

World rendering and SymbolLab rendering must remain isolated.

NO:

composited overlays
transparent bleed-through
shared canvas stacking

Each rendering context should remain visually distinct.

Preview Rendering Architecture

Previews should become:

behavioral scopes

not screenshots.

This allows:

animated previews
procedural deployment
density testing
sequence simulation
future MIDI/timeline integration
Future-Proofing

This layout intentionally prepares for:

Future System Integration
timelines bottom dock
layers bottom dock
symbol sequencing bottom dock
transport lanes bottom dock
automation curves bottom dock
generative systems preview column
live diagnostics preview column
Important UX Rule

The user must be able to:

draw → deploy → preview → modify

without:

mode switching
hiding panels
changing tabs
losing world visibility

This is critical to symbolic flow authoring.

Performance Rules
Required

Use:

requestAnimationFrame

for:

preview redraw batching
dock resizing
live deployment previews

Avoid:

layout thrashing
synchronous preview redraw loops
Non-Goals

This update does NOT include:

timeline system
animation editor
docking manager
floating windows
node graph
undo history changes
procedural sequencing logic

Layout architecture only.

Success Criteria

The update succeeds if:

Criteria Expected Result
World remains centered yes
SymbolLab no longer dominates screen yes
Glyph editing + previews visible simultaneously yes
No world overlap behind editor yes
Preview flow feels continuous yes
Layout feels like a workstation yes
Files Expected
Likely Targets
index.html
styles.css
ui/symbolDrawer.js
main.js

Potentially:

render/layoutManager.js

if layout abstraction becomes necessary.

Version Notes

This update represents the transition from:

symbol utility panel

to:

symbolic composition workstation

which better reflects the evolving role of SymbolLab inside WOS.
