# 0609C_WOS_CanvasStudioMigration_v1.0.0_BUILD

## Objective

Move Canvas authoring access from Wall into Studio.

Wall is the broadcast screen.
Studio is where creator tools live.

This build must remove Canvas/tool editing UI from the Wall surface and expose Canvas through Studio without deleting or breaking existing Canvas functionality.

## Scope

In:
- Add Canvas tab to Studio.
- Mount or bridge the existing Canvas editor inside Studio.
- Remove visible Canvas tool buttons from Wall.
- Preserve existing hidden DOM / JS bindings needed for compatibility.
- Preserve sampler access.
- Preserve map/channel/camera/route controls.

Out:
- No Canvas redesign.
- No new drawing tools.
- No Map Lab changes.
- No ColorLab changes.
- No asset assignment.
- No new Wall buttons.

## Requirements

1. Add Studio tab:

Canvas

2. Canvas tab must provide access to the existing Canvas editor/workflow.

3. Wall must no longer show visible Canvas editing controls:
- Select
- Motion/Pen
- Text
- Ball
- canvas tool subbar
- canvas-wrap if it is only editor-facing

4. Do not delete compatibility elements unless proven unused.

5. Sampler must remain accessible.

6. No new Wall UI.

7. Net visible Wall UI count must decrease.

## Acceptance Tests

T1 — Canvas tab appears in Studio.

T2 — Canvas editor/workflow is accessible from Studio.

T3 — Wall no longer shows visible Canvas editing buttons.

T4 — Wall map/channel/camera/route controls still work.

T5 — Sampler remains accessible.

T6 — No new Wall buttons added.

T7 — Existing Canvas JS does not throw on boot.

T8 — Hidden compatibility elements remain only where needed.

## Required Report

- Removed from Wall
- Preserved for compatibility
- Added to Studio
- Sampler access path
- Final Wall visible UI count before/after