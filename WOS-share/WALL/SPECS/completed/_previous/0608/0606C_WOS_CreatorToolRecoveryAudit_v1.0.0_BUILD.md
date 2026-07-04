---
layout: spec
title: "Creator Tool Recovery Audit"
date: 2026-06-06
doc_id: "0606C_WOS_CreatorToolRecoveryAudit_v1.0.0"
version: "1.0.0"

project: "Wall of Sound"
system: "WOS"

domain: "interaction"
component: "creator_tool_recovery_audit"

type: "system-spec"
status: "approved"

priority: "high"
risk: "medium"

classification: "support-system"

summary: "Audits and restores the existing WOS creator tools that were buried or disconnected during Wall/Studio UI expansion. This spec removes non-functional runtime navigation clutter, recovers working Canvas/Object/MIDI creation tools, and links living tools into intentional Studio or left-rail access points without creating duplicate systems."

doctrine:
  - "Recover before rebuilding"
  - "Working tools must remain discoverable"
  - "Runtime UI supports travel, observation, atmosphere, camera, capture"
  - "Studio UI supports authoring, inspection, asset management, palette work, glyph work"
  - "Canvas UI supports drawing, placement, object editing, MIDI drops, and world-space creation"
  - "No duplicate tool systems"
  - "No placeholder navigation"
  - "If a tool cannot be demonstrated immediately, it must not occupy prime runtime UI"

depends_on:
  - "WOS_Naming_Doctrine_v1.1.0"
  - "WOS_ConstitutionalSpecTemplate_v2.0.1"
  - "wall-studio current runtime"
  - "existing Canvas/Object/MIDI tool code"
  - "existing GlyphLab"
  - "existing ColorLab"
  - "existing WOS Studio shell"

enables:
  - "Runtime UI cleanup"
  - "Canvas tool recovery"
  - "Studio tool consolidation"
  - "Creator workflow restoration"
  - "Future asset placement"
  - "Future event authoring"
  - "Future Style Swapper integration"

tags:
  - "creator tools"
  - "studio"
  - "canvas"
  - "ui cleanup"
  - "glyphlab"
  - "colorlab"
  - "object panel"
  - "midi"
  - "recovery"
  - "audit"
---

# 0606C_WOS_CreatorToolRecoveryAudit_v1.0.0_BUILD

## Build Status

```text
[BUILD]
```

This is a **cleanup / recovery audit**.

This is not a new feature expansion.

The goal is to recover existing working WOS creator tools, remove runtime UI clutter, and re-establish clear access to Wall, Studio, Canvas, GlyphLab, and ColorLab.

---

# Purpose

WOS currently contains multiple working or partially working creator systems that became buried, disconnected, or obscured during later Wall/Studio development.

Recent runtime evidence confirms:

```text
Canvas drawing still exists.
World-space marks follow map movement.
Old Object Panel still opens.
Object inspection still works.
MIDI drop still works.
GlyphLab exists and functions.
ColorLab exists and functions.
WOS Studio already has slots for Asset Library, Actor Library, Glyph Lab, Palette Lab, and Proof Stage.
```

The problem is not that the creator tools are gone.

The problem is:

```text
Working tool
↓
Buried
↓
Forgotten
↓
Duplicate or placeholder system added beside it
```

This spec audits the existing tool chain and restores intentional access.

---

# Core Problem

The current runtime UI contains architectural navigation labels that do not reflect the user's active creation workflow.

Observed clutter:

```text
WORLD
ZONES
SYSTEMS
VIZ
```

These labels currently fail the working-tool test:

```text
Can I explain what this does in one sentence?
Can I use it immediately?
Would I notice if it disappeared?
Does it help create, route, observe, capture, or style the world?
```

Meanwhile, actual creator tools are scattered or hidden:

```text
Canvas tools
Object Panel
MIDI drop
GlyphLab
ColorLab
Studio tabs
```

This creates avoidable friction and wastes production time.

---

# Non-Negotiable Recovery Rule

Do not build replacement systems until the existing systems are audited.

```text
Recover first.
Reconnect second.
Refactor third.
Rebuild only if proven missing.
```

---

# Required UI Split

WOS must distinguish between runtime observation and creator authoring.

## Wall Runtime

Purpose:

```text
Travel
Observe
Route
Camera
Atmosphere
Capture
```

Wall is not the place for buried creation menus unless explicitly in authoring mode.

## WOS Studio

Purpose:

```text
Asset Library
Actor Library
Glyph Lab
Palette Lab
Proof Stage
Canvas access
Tool consolidation
```

Studio is the organized home for asset and design systems.

## Canvas

Purpose:

```text
Select
Motion
Ball
Text
Path/Object creation
World-space drawing
MIDI object assignment
Object editing
Save/load authoring data
```

Canvas may initially remain a separate page or surface if full Studio integration would delay recovery.

---

# Immediate Left-Rail Cleanup

Replace the current runtime left rail with a launcher for living tools.

## Remove from runtime rail

```text
WORLD
ZONES
SYSTEMS
VIZ
```

Unless a label has a working, visible, immediately demonstrable destination, it must be removed from prime runtime navigation.

## Add / expose

Minimum left rail:

```text
Wall
Studio
Canvas
ColorLab
GlyphLab
Settings
Help
```

Optional if already supported:

```text
Proof
```

## Placement Rule

The Studio button must not cover or interfere with HUD controls.

If Studio remains a runtime launcher, place it in a fixed left-rail slot that does not overlap:

```text
HUD
map controls
camera controls
route controls
capture controls
```

---

# Existing Tool Inventory

The audit must identify the file owner, runtime entry point, current status, and recovery action for each tool.

## Canvas Tools

Required tools:

```text
Select
Motion
Ball
Text
```

For each tool, report:

```text
file owner
button selector
handler function
active state behavior
cursor behavior
object creation behavior
save/load behavior
known breakage
```

## Object Panel

Audit:

```text
how it opens
what object types it reads
what properties it edits
whether edits persist
whether it can be launched intentionally
```

## MIDI Drop

Audit:

```text
drop target
MIDI parsing path
object assignment behavior
visual confirmation
persistence behavior
failure state
```

## World-Space Drawing

Audit:

```text
screen-to-world coordinate conversion
lng/lat persistence
map pan behavior
map zoom behavior
object selection behavior
layer ownership
```

## GlyphLab

Audit:

```text
current route/page
current functionality
export format
output destination
whether output reaches Asset Library
whether output reaches Actor Library
whether output reaches World
```

## ColorLab

Audit:

```text
current route/page
current functionality
palette output format
whether output reaches Palette Lab
whether output reaches map style
whether output can support Style Swapper
```

## WOS Studio

Audit:

```text
Asset Library status
Actor Library status
Glyph Lab placeholder status
Palette Lab status
Proof Stage status
Studio route/page
Studio launcher behavior
```

---

# Required Recovery Map

The intended consolidation map is:

```text
WOS Studio
├─ Asset Library
├─ Actor Library
├─ Glyph Lab      ← connect existing working GlyphLab here
├─ Palette Lab    ← connect existing ColorLab / palette system here
├─ Canvas         ← expose or link existing Canvas tools here
└─ Proof Stage
```

Do not create a second GlyphLab.

Do not create a second ColorLab.

Do not create a second Canvas system.

Connect what exists.

---

# Tool Status Classification

Every audited tool must receive exactly one status.

```text
LIVE
DISCONNECTED
PLACEHOLDER
DUPLICATE
BROKEN
MISSING
```

## LIVE

Tool works and can be intentionally accessed.

## DISCONNECTED

Tool works but lacks intentional access or is buried behind accidental UI.

## PLACEHOLDER

UI exists but no meaningful implementation exists.

## DUPLICATE

Tool overlaps an existing working system.

## BROKEN

Tool exists but fails its basic workflow.

## MISSING

No surviving code or UI could be found.

---

# Required Audit Report Format

Claude/Codex must produce a concise report before patching beyond UI exposure.

```text
Tool: Canvas Select
Status: LIVE | DISCONNECTED | PLACEHOLDER | DUPLICATE | BROKEN | MISSING
File Owner:
Entry Point:
Current Behavior:
Failure Point:
Recovery Action:
```

This must be repeated for:

```text
Canvas Select
Canvas Motion
Canvas Ball
Canvas Text
Object Panel
MIDI Drop
World-Space Drawing
GlyphLab
ColorLab
Studio Asset Library
Studio Actor Library
Studio Glyph Lab
Studio Palette Lab
Studio Proof Stage
Left Rail Runtime Navigation
Studio Button Placement
```

---

# Implementation Scope

This build may change:

```text
runtime navigation markup
runtime navigation CSS
Studio launcher routing
Canvas launcher routing
ColorLab launcher routing
GlyphLab launcher routing
dead button visibility
tool entry points
debug exposure for recovery proof
README documentation
```

This build may reconnect:

```text
existing Canvas tools
existing Object Panel
existing MIDI drop
existing GlyphLab
existing ColorLab
existing Studio tabs
```

This build may not invent:

```text
new editor framework
new object schema
new glyph engine
new palette engine
new Studio architecture
new left rail taxonomy
new placeholder tabs
```

---

# Runtime Navigation Doctrine

The runtime screen must prioritize video-production workflow.

Allowed runtime priorities:

```text
Route
Transport
Camera
Atmosphere
Capture
Wall
Studio
Canvas
Settings
Help
```

Disallowed unless proven useful:

```text
WORLD
ZONES
SYSTEMS
VIZ
```

Reason:

```text
They describe architecture, not creator action.
```

---

# Studio Integration Doctrine

Studio should eventually become the umbrella for authoring tools.

However, recovery takes priority over perfect consolidation.

If integrating Canvas into Studio risks breaking the working Canvas system, expose Canvas as a separate page first.

```text
Separate working tool
>
integrated broken tool
```

---

# Canvas Recovery Doctrine

Canvas is not a future feature.

Canvas has surviving evidence.

The goal is to make it intentionally accessible again.

Required minimum behavior:

```text
Open Canvas.
Select tool.
Create object/mark.
Object follows map/world movement if world-space.
Object can be selected.
Object properties can be edited.
MIDI can be dropped onto object if supported.
State can be saved or exact missing persistence path is reported.
```

---

# GlyphLab Recovery Doctrine

GlyphLab is a shape/symbol authoring tool.

It should not remain a dead-end.

Required audit question:

```text
Can a GlyphLab output become an Asset Library object, Actor Library candidate, or World-visible object?
```

If not, report the missing bridge.

Do not rebuild GlyphLab.

---

# ColorLab Recovery Doctrine

ColorLab is a palette authoring tool.

It must become a source for:

```text
Palette Lab
Style Swapper
Map style application
Merch/export styling
```

Required audit question:

```text
Can a ColorLab palette be applied to the map or exported as a style package?
```

If not, report the missing bridge.

Do not rebuild ColorLab.

---

# Debug Commands

Add or restore debug commands under:

```js
_wos.debug.creator
```

Required:

```js
creatorToolInventory()
creatorToolStatus(toolId)
openCanvas()
openObjectPanel()
openGlyphLab()
openColorLab()
openStudio()
```

Optional:

```js
proofWorldSpaceDrawing()
proofMidiDrop()
proofGlyphExport()
proofPaletteExport()
```

All commands must return structured objects and never throw.

---

# Acceptance Tests

## T1 — Runtime rail cleanup

Expected:

```text
WORLD/ZONES/SYSTEMS/VIZ removed from prime runtime rail
```

or explicitly reported as still present with reason.

## T2 — Studio button no longer covers HUD

Expected:

```text
Studio launcher does not overlap HUD controls or map controls.
```

## T3 — Living tool launchers visible

Expected left rail or equivalent launcher exposes:

```text
Wall
Studio
Canvas
ColorLab
GlyphLab
```

## T4 — Canvas opens intentionally

Expected:

```text
Canvas opens through intentional UI or debug command.
```

## T5 — Canvas tool audit complete

Expected statuses for:

```text
Select
Motion
Ball
Text
```

## T6 — World-space drawing proof

Expected:

```text
Drawn mark follows map pan/zoom or exact failure point is reported.
```

## T7 — Object Panel proof

Expected:

```text
Object Panel opens intentionally and can inspect selected object, or exact failure point is reported.
```

## T8 — MIDI drop proof

Expected:

```text
MIDI drop still works on supported object, or exact failure point is reported.
```

## T9 — GlyphLab proof

Expected:

```text
Existing GlyphLab opens through intentional UI or Studio tab bridge.
```

## T10 — ColorLab proof

Expected:

```text
Existing ColorLab opens through intentional UI or Studio Palette Lab bridge.
```

## T11 — No duplicate new systems

Expected:

```text
No new GlyphLab, ColorLab, Canvas, or Object Panel implementation created.
```

## T12 — Studio slot audit complete

Expected statuses for:

```text
Asset Library
Actor Library
Glyph Lab
Palette Lab
Proof Stage
```

## T13 — Debug inventory works

Expected:

```js
_wos.debug.creator.creatorToolInventory()
```

returns structured data.

## T14 — No runtime regression

Expected:

```text
Wall map still loads.
Mapbox viewport still works.
Existing HUD remains usable.
```

## T15 — Recovery report produced

Expected:

```text
Audit report included with every tool classified as LIVE/DISCONNECTED/PLACEHOLDER/DUPLICATE/BROKEN/MISSING.
```

---

# Non-Goals

This spec does not build:

```text
new route system
new camera system
new cloud system
new style swapper
new Printify integration
new carnival system
new event authoring system
new Twitch companion panel
```

Those depend on recovered tools and cleaner UI.

---

# Deferred Systems

After recovery, future specs may address:

```text
Route initiation recovery
Style Swapper: ColorLab → Map
PNG/SVG export
Sky/Cloud runtime authority
Actor-mounted camera rig authority
3D vehicle presentation pass
Audio-reactive building pass
Carnival event authoring
Printify merch pipeline
```

---

# Risk Controls

## Risk: Tool recovery becomes redesign

Mitigation:

```text
Only expose and reconnect existing systems.
No visual redesign beyond removing obstruction.
```

## Risk: Canvas integration breaks working Canvas

Mitigation:

```text
Expose Canvas separately first.
Integrate into Studio later.
```

## Risk: Placeholder tabs survive

Mitigation:

```text
Every tab must be LIVE or explicitly labeled PLACEHOLDER in audit.
Placeholders must not occupy prime runtime rail.
```

## Risk: Claude/Codex builds duplicate systems

Mitigation:

```text
Search existing code first.
Patch routing/access second.
Never create a replacement unless the original is proven missing.
```

---

# Canonical References

- `WOS_Naming_Doctrine_v1.1.0`
- `WOS_ConstitutionalSpecTemplate_v2.0.1`
- Current Wall runtime
- Current WOS Studio shell
- Existing Canvas/Object/MIDI tools
- Existing GlyphLab
- Existing ColorLab

---

# Implementation Guide

- **Where**: Audit current runtime/Studio files first. Patch only the files that own left-rail navigation, Studio launcher placement, Canvas launch access, GlyphLab launch access, ColorLab launch access, Object Panel access, and creator debug commands.
- **What**: Run `node --check` on every touched JavaScript file. Then run/prove: `creatorToolInventory()`, `openCanvas()`, `openObjectPanel()`, `openGlyphLab()`, `openColorLab()`, `proofWorldSpaceDrawing()`, and `proofMidiDrop()` where available.
- **Expect**: The runtime rail is cleaned, Studio no longer obstructs HUD, Canvas/GlyphLab/ColorLab are intentionally accessible, and every creator tool is classified with a recovery action instead of being buried, duplicated, or silently broken.
