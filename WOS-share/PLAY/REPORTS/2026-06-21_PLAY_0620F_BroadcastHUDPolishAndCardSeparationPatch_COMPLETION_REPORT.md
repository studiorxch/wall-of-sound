# PLAY Patch 0620F — Broadcast HUD Polish + Card Separation
**Completion Report · 2026-06-21**

---

## Summary

Focused polish and boundary patch. Fixed the graph node clipping bug (markers leaking outside plot area), removed the redundant `← Editor` button from the HUD header, and formalized the card/graph separation rule in code.

---

## Changes

### A. Graph Node Clipping Fix — `FlowCurveCanvas.tsx`

Added an SVG `<clipPath id="flowCurvePlotClip">` bounded to the exact inner plot area (`PAD.left`, `PAD.top`, `INNER_W`, `INNER_H`). Wrapped the following elements in `<g clipPath="url(#flowCurvePlotClip)">`:
- Red warning zone rects
- Curve path line
- Track nodes (all rings, fills, labels)
- Control points (draggable curve handles)

Grid lines, axis labels, and legend remain outside the clip group — they need to render into the padding zones. The clip prevents any marker from visually overflowing the plot boundary at any viewport size.

### B. Remove Redundant `← Editor` Button — `BroadcastHudShell.tsx`

Removed the `hud-exit-btn` (`← Editor`) from the HUD header. Mode switching is handled solely by the top-bar `Flow-Curve / Broadcast HUD` toggle. Removed `onExitHud` from the component's destructured props (kept in Props type since App.tsx still passes it, no breaking change).

### C. Card Separation Rule — `BroadcastCardPreview.tsx`

Added header comment at top of file:
```ts
// Broadcast cards are identity/title surfaces — cinematic, not analytical.
// Do NOT render FlowCurveCanvas here. Flow graphs belong in Editor and Broadcast HUD modes.
```
Confirmed no `FlowCurveCanvas` import or usage is present. Card remains cover/background/title/tags/stats only.

---

## Surface Separation Rule (locked in)

| Surface | Graph | Description |
|---------|-------|-------------|
| Flow-Curve Editor | ✅ full interactive | Engineering surface |
| Broadcast HUD | ✅ read-only navigation | Route/energy overview |
| Broadcast Card | ❌ none | Cinematic identity card |

---

## Verification

- `npx tsc --noEmit` — clean
- Broadcast HUD: `← Editor` button absent from header; status dot remains
- Graph: first curve point near left edge fully contained within plot clip — no marker overflow
- Queue rail: NOW/NEXT display unaffected
- Top-bar toggle remains the single route between modes

---

## Patch Status: ✅ COMPLETE
