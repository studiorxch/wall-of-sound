# 0609F_WOS_CanvasStudioInteractionRepair_v1.0.0_BUILD

## Objective

Make the Studio Canvas iframe actually draw and function.

Current state:
- Canvas iframe loads.
- Canvas UI appears.
- Tools are visible.
- Drawing does not work.
- Canvas interaction does not function.

This build fixes interaction only.

## Scope

In:
- Fix pointer/mouse event handling inside `studio/canvasLab/canvas.html`.
- Fix canvas sizing / coordinate mapping inside iframe.
- Fix boot/init blockers preventing drawing.
- Verify Select, Motion/Pen, Text, and Ball tools create or select objects.
- Preserve sampler.
- Preserve Wall cleanup.

Out:
- No redesign.
- No new tools.
- No Map Lab changes.
- No Wall UI changes.
- No new buttons.

## Required Audit First

Before changing code, report:
- browser console errors from the Canvas iframe
- whether `engine-canvas` has a 2D context
- whether `controls.js` initialized
- whether `drawTools.js` initialized
- whether pointer events reach `engine-canvas`
- whether canvas rect/scale math is valid inside iframe
- whether boot gate classes block input

## Acceptance Tests

T1 — Click/drag with Motion/Pen creates a visible line.

T2 — Text tool creates editable text.

T3 — Ball tool creates a visible ball/particle.

T4 — Select tool can select an existing object.

T5 — Canvas coordinates match pointer position.

T6 — No console errors during Canvas boot.

T7 — Sampler remains accessible.

T8 — Wall remains unchanged.

## Required Report

- Root cause
- Files changed
- Tests passed
- Any remaining broken Canvas behavior