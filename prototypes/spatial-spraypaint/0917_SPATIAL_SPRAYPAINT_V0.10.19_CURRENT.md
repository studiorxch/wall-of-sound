# Spatial Spraypaint V0.10.19 Current Status

Date: 2026-09-17

Status: PARTIAL — implementation and automated verification pass; full human mouse/Pencil A/B and repeated live drip pixel inspection remain required.

Baseline: V0.10.18 commits `a760803` / `617e673`.

## Implemented

- Preserved the V0.10.17/18 drip silhouette, gravity, width, taper, bends, rounded tip, gradient, timing, frequency, and deterministic replay.
- Extended the existing straight Mop drip underlay for both pool/dwell and travel-generated channels. The depth is width-relative (`max(source size × 0.38, drip width × 0.85)`) and remains bounded so rising diagonals do not expose the hidden root through the opposite edge.
- The visible strip is unchanged: no root circle, shelf, bulb, cap, or wider root geometry was added. Existing composition remains wall → Mop drip underlay → Mop source paint.
- Traced Physical pointer sampling: pointer events update `activeWallPoint`; the render loop deposits through `StrokeSmoother`, `AdaptiveCurveReconstructor`, and canonical stroke creation. Coalesced events remain diagnostics-only.
- Extended the existing `StrokeSmoother` authority with a mouse-only adaptive path before curve reconstruction/canonical rendering. Fast mouse deltas retain stronger jitter suppression; deliberate turns receive a high response; pointer-up flushes the exact endpoint.
- Pen, touch, and Hand retain the previous `StrokeSmoother.smooth()` behavior. Pencil normalization, coalesced-event diagnostics, Flair mappings, canonical semantics, width, and deposition physics are unchanged.
- Existing Settings smoothing `Off` versus `Medium`/other levels provides the requested mouse OFF/ON comparison without adding another control.
- Squeeze was not changed.

## Verification

- Focused: 58/58 PASS (`StrokeSmoother`, `WetDripEngine`, `WetPaintModel`, incremental `MopRuntimeParity`).
- Full suite: 659/659 PASS.
- TypeScript: `npx tsc --noEmit` PASS.
- Production build: `npx vite build` PASS.
- Incremental Mop parity covers dwell, horizontal, vertical, rising diagonal, descending diagonal, and curved/circular paths through the mouse-specific smoothing path.
- Local browser: Mop selected; Settings smoothing OFF and Medium both accepted; equivalent automated diagonal mouse drags rendered responsively and preserved endpoints.

## Remaining live validation

The available browser automation can generate straight drag gestures but cannot faithfully reproduce a large handstyle gesture, sustained dwell/repeated live drips, or Apple Pencil hardware input. Before upgrading this checkpoint from PARTIAL, perform on the drawing host:

1. Draw equivalent large Mop handstyles with mouse smoothing Off and Medium; confirm Medium is visibly cleaner without obvious latency and corners/endpoints remain intentional.
2. Repeat straight and curved Mop strokes with multiple drips, inspect at normal scale and pixel zoom, and confirm no exposed gap, black wedge, seam, detached origin, or upper-root protrusion.
3. Repeat the gesture with Apple Pencil and confirm behavior is unchanged.
4. Keep the V0.10.18 Squeeze live timing comparison tracked separately; it was not modified in V0.10.19.
