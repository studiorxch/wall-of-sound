---
layout: spec
title: "Creator Tool Recovery Pass"
date: 2026-06-09
doc_id: "0609A_WOS_CreatorToolRecoveryPass_v1.0.0"
version: "1.0.0"

project: "Wall of Sound"
system: "WOS"

domain: "interaction"
component: "creator_tool_recovery_pass"

type: "system-spec"
status: "approved"

priority: "high"
risk: "medium"

classification: "support-system"

summary: "Implements the first recovery pass after the Creator Tool Recovery Audit by restoring intentional access to living creator tools, relocating obstructive runtime launchers, adding creator debug commands, and establishing ColorLab as an external tool to be integrated into Studio Palette Lab without creating duplicate systems."

doctrine:
  - "Recover before rebuilding"
  - "Working tools must remain discoverable"
  - "Runtime UI supports travel, observation, atmosphere, camera, capture"
  - "Studio UI supports authoring, inspection, asset management, palette work, glyph work"
  - "Canvas UI supports drawing, placement, object editing, MIDI drops, and world-space creation"
  - "No duplicate tool systems"
  - "No placeholder navigation"
  - "Separate working tools are better than integrated broken tools"

depends_on:
  - "0606C_WOS_CreatorToolRecoveryAudit_v1.0.0_BUILD"
  - "WOS_Naming_Doctrine_v1.1.0"
  - "WOS_ConstitutionalSpecTemplate_v2.0.1"
  - "0522_WOS_SurfaceChannelDoctrine_v1.1.0"
  - "current wall-studio runtime"
  - "external ColorLab source: src-2026May24.zip"

enables:
  - "Creator workflow restoration"
  - "Studio tool consolidation"
  - "Canvas tool recovery"
  - "GlyphLab bridge"
  - "ColorLab to Palette Lab bridge"
  - "Future Map Lab implementation"
  - "Future asset placement"
  - "Future Style Swapper integration"

tags:
  - "creator tools"
  - "recovery"
  - "studio"
  - "canvas"
  - "glyphlab"
  - "colorlab"
  - "palette lab"
  - "object panel"
  - "midi"
  - "runtime rail"
  - "debug"
---

# 0609A_WOS_CreatorToolRecoveryPass_v1.0.0_BUILD

## Build Status

```text
[BUILD]
```

This is a **targeted recovery patch**.

This is not a redesign, not a new editor framework, and not a Map Lab build.

The goal is to restore intentional access to existing creator tools and prepare Studio to absorb external tools such as ColorLab without creating duplicate systems.

---

# Purpose

The 0606C audit confirmed that most creator systems are not missing. They are buried, disconnected, mislabeled, or blocked by runtime navigation clutter.

This pass implements the first practical cleanup layer:

```text
Audit findings
↓
Recover living access points
↓
Expose debug proof commands
↓
Bridge external tools into Studio intentionally
```

This spec exists to make creator tooling reachable again before adding new authoring systems such as Map Lab, asset assignment, object replacement, or world editing.

---

# Source Audit Summary

The 0606C audit classified the current creator tool ecosystem as:

```text
LIVE:          11
DISCONNECTED: 4
PLACEHOLDER:  1
BROKEN:       2
MISSING:      1
```

Critical findings:

```text
Canvas Select is LIVE.
Canvas Motion is LIVE.
Canvas Ball is LIVE.
Canvas Text is LIVE.
Object Panel is DISCONNECTED.
MIDI Drop is LIVE.
World-Space Drawing is LIVE.
GlyphLab is DISCONNECTED.
Studio Glyph Lab is PLACEHOLDER.
Runtime Left Rail is BROKEN.
Studio Button Placement is BROKEN.
```

The audit originally marked ColorLab as MISSING because no ColorLab module was found in the current wall/studio repo.

Updated clarification:

```text
ColorLab exists as an external tool/source.
It is not currently integrated into WOS Studio.
```

Therefore, for this recovery pass ColorLab should be treated as:

```text
EXTERNAL / DISCONNECTED
```

not as permanently missing.

The current available external reference is:

```text
src-2026May24.zip
```

---

# Core Principle

Do not build new creator systems until the living systems are reachable.

```text
Recover access
↓
Expose proof commands
↓
Document surviving owners
↓
Integrate only after ownership is clear
```

---

# Authority Boundaries

## This Spec May Change

```text
runtime navigation markup
runtime navigation CSS
Studio launcher placement
Canvas launcher routing
GlyphLab launcher routing
ColorLab launcher routing / bridge placeholder
Object Panel launcher routing
creator debug namespace
Studio documentation
recovery report output
```

## This Spec May Not Change

```text
Map Lab
Mapbox building selection
asset assignment
object replacement
music-reactive systems
new Canvas engines
new GlyphLab engines
new ColorLab engines
new Palette Lab engines
new runtime taxonomy
new Wall rendering behavior
```

## Wall Runtime Protection

Wall runtime must remain usable for:

```text
travel
observation
camera
atmosphere
capture
map interaction
```

Runtime cleanup must not break map loading, HUD controls, camera controls, or existing world-space systems.

---

# Required Recovery Targets

## 1. Runtime Left Rail Cleanup

Current broken labels:

```text
WORLD
ZONES
SYSTEMS
VIZ
```

These must be removed from prime runtime navigation unless each has an immediately demonstrable destination.

Replace with living creator/runtime access:

```text
Wall
Studio
Canvas
GlyphLab
ColorLab
Settings
Help
```

Optional if simple and already route-backed:

```text
Proof
```

## Required behavior

Each launcher must either:

```text
open a living tool
```

or:

```text
return a structured unavailable status through _wos.debug.creator
```

No prime launcher may silently do nothing.

---

## 2. Studio Button Placement Recovery

Current issue:

```text
Studio launcher is fixed in the upper-right and competes with HUD/runtime controls.
```

Required recovery:

```text
Move Studio launcher into intentional left-rail access.
Remove or disable the obstructive upper-right fixed launcher.
```

Studio must remain accessible at:

```text
../studio/index.html
```

Preferred default route:

```text
../studio/index.html#asset-library
```

---

## 3. Canvas Access Recovery

Canvas currently exists inside the legacy editor shell and supports:

```text
Select
Motion
Ball
Text
```

Required recovery:

```text
Add intentional Canvas launcher.
Ensure launcher activates or reveals existing Canvas tool surface.
Ensure Canvas starts in a usable default tool state.
```

Preferred default:

```text
Canvas → Select tool active
```

Acceptable alternate:

```text
Canvas → Motion tool active
```

if that reflects current runtime defaults.

Do not create a new Canvas implementation.

---

## 4. Object Panel Access Recovery

Object Panel is disconnected but functional through selection/pin behavior.

Required recovery:

```text
Add intentional openObjectPanel() debug command.
If possible, expose Object Panel through Canvas or Inspector access.
```

Minimum acceptable recovery:

```js
_wos.debug.creator.openObjectPanel()
```

must:

```text
open/pin the existing right-panel Object Inspector
switch to the Object tab if available
return structured status
never throw
```

Do not rebuild inspector markup.

---

## 5. GlyphLab Recovery

Current state:

```text
Working GlyphLab exists in Wall drawer system.
Studio Glyph Lab is a placeholder.
```

Required recovery:

```text
Expose existing GlyphLab intentionally.
Bridge Studio Glyph Lab to the existing GlyphLab owner.
Do not create a second GlyphLab.
```

Minimum acceptable recovery:

```js
_wos.debug.creator.openGlyphLab()
```

must call the existing GlyphLab drawer/path if present and return structured status.

Studio Glyph Lab should no longer imply it is a separate engine.

It should either:

```text
launch existing GlyphLab
```

or clearly state:

```text
Existing GlyphLab detected; bridge pending.
```

---

## 6. ColorLab Recovery / External Integration

The current repo audit did not find ColorLab, but ColorLab exists externally as a separate tool.

Required treatment:

```text
ColorLab is EXTERNAL / DISCONNECTED.
```

Current external source:

```text
src-2026May24.zip
```

ColorLab must be treated like a living external authoring tool that should eventually feed Studio Palette Lab.

## Required recovery for this pass

Add structured placeholder bridge behavior:

```js
_wos.debug.creator.openColorLab()
```

The command must:

```text
check whether an integrated ColorLab route/module exists
open it if found
otherwise return EXTERNAL_DISCONNECTED with expected source/reference
never throw
```

## Studio Palette Lab relationship

Studio Palette Lab must remain the Studio-facing palette destination.

ColorLab is the external authoring source.

Expected future bridge:

```text
ColorLab
↓
Palette Package Export
↓
Studio Palette Lab
↓
Map Style / Style Swapper / Asset Presentation
```

Do not invent a new palette engine in this pass.

Do not replace current Studio Palette Lab.

---

## 7. MIDI Drop Proof Access

MIDI Drop is live but implicit.

Required recovery:

```text
Expose proof command or structured status for MIDI Drop.
```

Minimum command:

```js
_wos.debug.creator.proofMidiDrop()
```

Acceptable for this build:

```text
returns instructions/status if synthetic proof cannot run safely
```

It must report:

```text
drop handler found / missing
MidiImporter found / missing
supported assignment target
current selected stroke/object state if available
```

---

## 8. World-Space Drawing Proof Access

World-space drawing is live through SurfaceDrawingRuntime but not obvious.

Required recovery:

```js
_wos.debug.creator.proofWorldSpaceDrawing()
```

Command should report:

```text
SurfaceDrawingRuntime present
Workspace present
active interaction mode if available
surface overlay present
map projection/unprojection availability
```

It may optionally open/activate draw mode if safe.

---

# Required Debug Namespace

Add or restore:

```js
_wos.debug.creator
```

Required commands:

```js
creatorToolInventory()
creatorToolStatus(toolId)
openCanvas()
openObjectPanel()
openGlyphLab()
openColorLab()
openStudio()
proofWorldSpaceDrawing()
proofMidiDrop()
```

All commands must:

```text
return structured objects
never throw
avoid destructive side effects
avoid creating new systems
```

Required response shape:

```js
{
  ok: true,
  toolId: "canvas",
  status: "LIVE",
  action: "opened",
  owner: "wall/index.html",
  message: "Canvas launcher activated existing legacy editor surface."
}
```

Failure response shape:

```js
{
  ok: false,
  toolId: "colorlab",
  status: "EXTERNAL_DISCONNECTED",
  action: "not_opened",
  owner: "src-2026May24.zip",
  message: "ColorLab exists externally but no integrated route was found."
}
```

---

# Tool Status Dictionary

Use the 0606C status labels plus one new label for this pass.

```text
LIVE
DISCONNECTED
PLACEHOLDER
DUPLICATE
BROKEN
MISSING
EXTERNAL_DISCONNECTED
```

## EXTERNAL_DISCONNECTED

A tool exists outside the current integrated runtime/studio shell, but is not yet connected to WOS Studio or Wall navigation.

This status applies to ColorLab unless an integrated route/module is found during implementation.

---

# Required Creator Tool Inventory

`creatorToolInventory()` must include at least:

```text
canvas-select
canvas-motion
canvas-ball
canvas-text
object-panel
midi-drop
world-space-drawing
glyphlab
colorlab
studio-asset-library
studio-actor-library
studio-glyph-lab
studio-palette-lab
studio-proof-stage
runtime-left-rail
studio-launcher
```

Each entry must include:

```js
{
  toolId,
  label,
  status,
  owner,
  entryPoint,
  recoveryAction
}
```

---

# Runtime Navigation Requirements

## Prime runtime rail after patch

Minimum:

```text
Wall
Studio
Canvas
GlyphLab
ColorLab
Settings
Help
```

## Behavior

### Wall

Returns user to runtime/world view.

### Studio

Opens:

```text
../studio/index.html#asset-library
```

### Canvas

Activates/reveals existing Canvas workflow.

### GlyphLab

Opens existing GlyphLab drawer/tool if available.

### ColorLab

If integrated route exists, opens it.

If not integrated, reports external disconnected status through debug and may display a clear non-prime placeholder notification.

### Settings / Help

Must route to existing working destinations or return structured unavailable status.

---

# Studio Integration Requirements

## Studio Glyph Lab

Must not remain an unqualified placeholder.

It should indicate:

```text
Existing GlyphLab owner detected in Wall.
Use launcher/debug bridge until full Studio integration.
```

If feasible, provide a direct action:

```text
Open GlyphLab
```

## Studio Palette Lab

Must acknowledge ColorLab as an external source when available.

Minimum note:

```text
ColorLab external source detected. Integration pending.
```

If no source can be detected at runtime, do not hard-fail.

---

# Execution Flow

```text
Load Wall
↓
Initialize runtime rail
↓
Expose living creator launchers
↓
Initialize _wos.debug.creator
↓
Run creatorToolInventory()
↓
Open Canvas / GlyphLab / Studio / Object Panel by command
↓
Verify no HUD obstruction
↓
Verify Wall runtime remains intact
```

---

# Acceptance Tests

## T1 — Runtime rail cleanup

Expected:

```text
WORLD / ZONES / SYSTEMS / VIZ are removed from prime runtime rail
```

or explicitly demoted with working destinations.

## T2 — Studio launcher no longer obstructs HUD

Expected:

```text
No fixed upper-right Studio launcher overlaps HUD or map controls.
```

## T3 — Living launchers visible

Expected runtime launcher access:

```text
Wall
Studio
Canvas
GlyphLab
ColorLab
Settings
Help
```

## T4 — Canvas opens intentionally

Expected:

```js
_wos.debug.creator.openCanvas()
```

returns `ok: true` or a structured failure with exact owner/failure.

## T5 — Object Panel opens intentionally

Expected:

```js
_wos.debug.creator.openObjectPanel()
```

pins/opens existing Object Inspector or reports exact failure.

## T6 — GlyphLab opens intentionally

Expected:

```js
_wos.debug.creator.openGlyphLab()
```

opens existing GlyphLab drawer/tool or reports exact failure.

## T7 — ColorLab classified correctly

Expected:

```js
_wos.debug.creator.openColorLab()
```

returns one of:

```text
LIVE
EXTERNAL_DISCONNECTED
BROKEN
```

It must not return generic missing if external source is documented.

## T8 — Creator inventory works

Expected:

```js
_wos.debug.creator.creatorToolInventory()
```

returns structured inventory with all required tool IDs.

## T9 — MIDI proof status works

Expected:

```js
_wos.debug.creator.proofMidiDrop()
```

returns MIDI importer/drop status without throwing.

## T10 — World-space drawing proof status works

Expected:

```js
_wos.debug.creator.proofWorldSpaceDrawing()
```

returns surface drawing status without throwing.

## T11 — Studio tabs still work

Expected:

```text
Asset Library
Actor Library
Glyph Lab
Palette Lab
Proof Stage
```

remain accessible.

## T12 — No duplicate systems created

Expected:

```text
No new Canvas engine.
No new GlyphLab engine.
No new ColorLab engine.
No new Object Panel engine.
```

## T13 — Wall runtime still loads

Expected:

```text
Mapbox viewport loads.
HUD remains usable.
Camera/map controls remain usable.
Existing runtime behavior does not regress.
```

## T14 — JavaScript syntax check passes

Expected:

Run syntax checks on all touched JavaScript files.

```bash
node --check path/to/file.js
```

All touched files pass.

---

# Non-Goals

This spec does not build:

```text
Map Lab
building selection
asset assignment
object replacement
music behavior systems
Style Swapper
new ColorLab engine
new GlyphLab engine
new Canvas system
new route system
new event authoring system
new carnival system
```

---

# Deferred Systems

After this recovery pass:

```text
0608_MAPLAB_BuildingSelection_v0.2_BUILD
ColorLab → Studio Palette Lab import bridge
GlyphLab → Studio Glyph Lab bridge
Canvas → Studio Canvas workspace
Style Swapper: Palette Lab → Map Style Authority
Object Panel persistence repair
MIDI Drop expanded object assignment
```

---

# Risk Controls

## Risk: Recovery becomes redesign

Mitigation:

```text
Patch access only.
Do not redesign tool internals.
```

## Risk: ColorLab gets rebuilt accidentally

Mitigation:

```text
Treat ColorLab as external/disconnected.
Locate/import/bridge later.
No new palette engine in this pass.
```

## Risk: Runtime rail cleanup breaks workspace context

Mitigation:

```text
Keep original handlers reachable if still needed.
Remove only prime visual clutter.
Use structured debug status for unavailable actions.
```

## Risk: Studio integration breaks working Wall tools

Mitigation:

```text
Expose external links/bridges first.
Full Studio embedding is deferred.
```

---

# Canonical References

- `0606C_WOS_CreatorToolRecoveryAudit_v1.0.0_BUILD`
- `WOS_Naming_Doctrine_v1.1.0`
- `WOS_ConstitutionalSpecTemplate_v2.0.1`
- `0522_WOS_SurfaceChannelDoctrine_v1.1.0`
- `src-2026May24.zip`
- Current Wall runtime
- Current WOS Studio shell

---

# Implementation Guide

- **Where**: Patch only the files that own runtime left rail/navigation, Studio launcher placement, existing Canvas/Object Panel/GlyphLab access, Studio Glyph/Palette Lab bridge messaging, and `_wos.debug.creator`. Expected owners from audit include `wall/render/workspaceUI.js`, `wall/index.html`, `wall/main.js`, `wall/ui/controls.js`, and `studio/studioShell.js`.
- **What**: Run `node --check` on every touched JavaScript file. Then verify in browser console: `_wos.debug.creator.creatorToolInventory()`, `openCanvas()`, `openObjectPanel()`, `openGlyphLab()`, `openColorLab()`, `proofWorldSpaceDrawing()`, and `proofMidiDrop()`.
- **Expect**: Runtime rail shows living tool access instead of architectural clutter, Studio no longer obstructs HUD, Canvas/Object Panel/GlyphLab are intentionally reachable, ColorLab is classified as external/disconnected until integrated, and no duplicate creator systems are created.
