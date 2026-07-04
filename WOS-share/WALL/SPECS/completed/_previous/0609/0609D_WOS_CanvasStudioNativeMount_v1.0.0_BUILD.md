# 0609D_WOS_CanvasStudioNativeMount_v1.0.0_BUILD

## Objective

Make Canvas work natively inside WOS Studio.

0609C only created a bridge from Studio back to Wall. That is not the intended architecture.

Canvas is a creator tool and must live in Studio. Wall is the broadcast screen and should not host visible Canvas authoring UI.

## Required Correction

Replace the current Studio Canvas placeholder / bridge behavior.

Current incorrect behavior:
- Studio Canvas tab displays text only.
- Studio Canvas tab opens Canvas in Wall.
- Canvas engine is still treated as owned by Wall.

Required behavior:
- Studio Canvas tab mounts the actual Canvas authoring surface inside Studio.
- Canvas tools operate inside Studio.
- Canvas state stays in Studio.
- Wall remains clean broadcast surface.

## In Scope

- Add native Canvas workspace to Studio Canvas tab.
- Reuse existing Canvas systems where possible:
  - engine-canvas
  - canvas-wrap
  - tool-group
  - canvas-tool-subbar
  - note-column / sampler note controls if required
  - canvas renderer / scene state modules
- Extract or relocate only what is needed to make Canvas run inside Studio.
- Preserve compatibility with existing Canvas save/load state.
- Keep Wall canvas compatibility elements hidden only if boot still requires them.

## Out of Scope

- No Canvas redesign.
- No new Canvas tools.
- No Map Lab changes.
- No ColorLab changes.
- No asset assignment.
- No new Wall buttons.
- No new creator rail.

## Requirements

### R1 — Studio Canvas Must Render Real Canvas

Canvas tab must show the actual Canvas authoring area, not a link.

Required visible elements inside Studio Canvas:
- canvas surface
- Select tool
- Motion/Pen tool
- Text tool
- Ball tool
- basic canvas controls required for operation

### R2 — Do Not Use “Open Canvas in Wall”

Remove the “Open Canvas in Wall” behavior from Studio Canvas tab.

Studio Canvas must not depend on switching to Wall for normal use.

### R3 — Wall Must Remain Broadcast Clean

Wall must not show visible Canvas authoring controls.

Wall may retain hidden compatibility DOM only if current runtime requires it.

### R4 — Preserve Sampler

Sampler must remain accessible and must continue to support dropped audio / active bank behavior.

Do not remove sampler functionality.

### R5 — No Net New Wall UI

Do not add anything visible to Wall.

### R6 — Audit Before Moving Code

Before modifying, identify:
- Canvas owner files
- renderer dependencies
- state dependencies
- event binding dependencies
- sampler dependencies
- which DOM IDs are required

## Acceptance Tests

T1 — Studio Canvas tab renders an actual canvas surface.

T2 — Studio Canvas tools are visible and usable inside Studio.

T3 — Studio Canvas does not show an “Open Canvas in Wall” bridge as the primary workflow.

T4 — Wall remains visually clean.

T5 — Wall does not show Canvas tool buttons.

T6 — Sampler still works.

T7 — Existing Canvas JS does not throw.

T8 — Existing scene/canvas state compatibility is preserved.

T9 — No new Wall buttons are added.

## Required Report

Provide:
- Files changed
- Canvas dependencies found
- Canvas DOM moved/copied/reused
- Wall elements kept hidden for compatibility
- Studio Canvas behavior
- Sampler status
- Acceptance test results