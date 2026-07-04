# 0609G — WOS Canvas Studio Tooling
**Version:** 1.0.0  
**Status:** PRE-BUILD  
**Depends on:** 0609F (Canvas Studio Interaction Repair)

---

## Context

0609D/F established a working Canvas iframe inside Studio. The engine initializes, drawing works. Tooling is now audited for the Studio Canvas surface:

- **Shape tool is retired.** Glyph (via GlyphLab drawer) is the replacement reusable drawing primitive.
- **Glyph must be exposed as a dedicated tool button** in the Studio Canvas toolbar.
- **No conflict** between Canvas Glyph drawer and Studio Glyph Lab tab — they are parallel systems serving different workflows.

---

## Audit Findings

### Current canvas.html tool buttons
| Button | `data-tool` | Visible | Status |
|--------|-------------|---------|--------|
| Select | `select` | ✓ | Keep |
| Motion/Pen | `pen` | ✓ | Keep |
| Shape | `shape` | ✗ (display:none) | **Retired — keep hidden** |
| Text | `text` | ✓ | Keep |
| Ball | `ball` | ✓ | Keep |
| Glyph | — | ✗ (missing) | **Add** |
| Sampler | — | ✗ (context menu only) | **Add button** |

### GlyphLab drawer (Canvas Glyph entry point)
- **Entry:** `DrawerSystem.openDrawer("glyph")` — opens an overlay panel within the canvas iframe
- **Tool states set by GlyphLab:** `state.tool = "symbol-place"` or `"symbol-brush"` (handled by main.js)
- **State lives in:** `state.glyphs` + `state.glyphLibrary` (persisted to localStorage)
- **DrawerSystem** is loaded in canvas.html (`drawerSystem.js`, `glyphDrawer.js`) — glyph drawer is already wired

### Studio Glyph Lab vs Canvas Glyph — no conflict
- **Studio Glyph Lab** = `data-mode="glyph-lab"` tab in Studio shell — separate authoring surface (placeholder)
- **Canvas Glyph** = `DrawerSystem.openDrawer("glyph")` inside the canvas iframe — design and place glyphs on the canvas
- These are distinct. Canvas Glyph opens within the iframe; Studio Glyph Lab is a Studio-level tab. No cross-contamination.

### Sampler access
- Currently accessible only via context menu (right-click → Sampler ›)
- Sampler drawer: `DrawerSystem.openDrawer("sampler")` — fully wired in canvas.html
- A dedicated Sampler button in the toolbar improves discoverability

### Export / Save / Open
- All three exist in the canvas context menu (`data-action="save"`, `"open"`, `"new"`)
- No separate toolbar button needed — context menu is sufficient for v1
- Keep as-is; mark as Phase 2 for visible toolbar buttons if requested

---

## Requirements

### R1 — Shape tool stays hidden
Shape button (`data-tool="shape"`) remains `display:none` in canvas.html. No code restores it. Hidden for JS compat only (main.js keyboard shortcuts reference `"shape"` tool state — do not remove the element).

### R2 — Glyph button added to canvas toolbar
Add a visible Glyph button to the tool-group in canvas.html. Clicking it calls `DrawerSystem.openDrawer("glyph")` — this opens the GlyphLab overlay panel within the canvas iframe. Do not set `state.tool` directly; the GlyphLab drawer manages tool transitions internally.

Button spec:
```html
<button class="tool" data-action="glyph" title="Glyph (G)">
  <!-- glyph icon — use ✦ or SVG from existing wall/index.html glyph icon -->
</button>
```

Wire in canvas.html's inline script (alongside existing tool button wiring):
```js
document.querySelectorAll('.tool[data-action="glyph"]').forEach(function(btn) {
  btn.addEventListener('click', function() {
    var DS = window.SBE && SBE.DrawerSystem;
    if (DS) DS.openDrawer('glyph');
  });
});
```

**Note:** Use `data-action` (not `data-tool`) so main.js's `chooseTool` handler (which reads `button.dataset.tool`) does not intercept it. GlyphLab manages its own tool state.

### R3 — Sampler button added to canvas toolbar
Add a visible Sampler button to the tool-group. Clicking it opens the sampler overlay panel.

Button spec:
```html
<button class="tool" data-action="sampler" title="Sampler">
  <!-- sampler icon -->
</button>
```

Wire:
```js
document.querySelectorAll('.tool[data-action="sampler"]').forEach(function(btn) {
  btn.addEventListener('click', function() {
    var DS = window.SBE && SBE.DrawerSystem;
    if (DS) DS.openDrawer('sampler');
    // Fallback: toggle overlay-panel visibility if DrawerSystem not available
  });
});
```

### R4 — Visible Studio Canvas tool order (left to right / top to bottom)
1. Select (`data-tool="select"`)
2. Motion/Pen (`data-tool="pen"`)
3. Text (`data-tool="text"`)
4. Ball (`data-tool="ball"`)
5. Glyph (`data-action="glyph"`) ← new
6. Sampler (`data-action="sampler"`) ← new
7. Shape (`data-tool="shape"`, `display:none`) ← hidden, JS compat only

### R5 — No Studio Glyph Lab conflict
- Canvas Glyph button opens `DrawerSystem.openDrawer("glyph")` in iframe context only
- Studio Glyph Lab tab (`data-mode="glyph-lab"`) is a separate Studio shell concern — do not modify it
- No cross-frame communication between Canvas Glyph and Studio Glyph Lab

### R6 — GlyphLab drawer prerequisites verified
Before adding the Glyph button, confirm in canvas.html that:
- `drawerSystem.js` is loaded ✓ (already in canvas.html)
- `glyphDrawer.js` is loaded ✓ (already in canvas.html)
- `glyphRenderer.js` and `glyphConstructor.js` are loaded ✓ (already in canvas.html)
- `SBE.DrawerSystem` is defined after page load ✓ (confirmed via audit)
- GlyphLab drawer container (`#drawer-panel`) exists in canvas.html DOM ✓ (already present in overlay panel)

### R7 — Keyboard shortcut for Glyph (optional, Phase 2)
Wall's keyboard handler maps `G` → `symbol-place`. In canvas.html the keyboard handler in main.js is active. Do not override or suppress it — pressing `G` already opens GlyphLab via main.js shortcut. The toolbar button is additive.

---

## Files Modified

| File | Change |
|------|--------|
| `studio/canvasLab/canvas.html` | Add Glyph and Sampler tool buttons; wire click handlers in inline script |

No changes to `wall/main.js`, `wall/index.html`, `studio/studioShell.js`, or Studio Glyph Lab.

---

## Acceptance Criteria

| ID | Test | Pass condition |
|----|------|----------------|
| T1 | Shape tool | Shape button is not visible in Studio Canvas |
| T2 | Glyph button visible | Glyph button appears in Studio Canvas toolbar between Ball and Sampler |
| T3 | Glyph opens GlyphLab drawer | Clicking Glyph opens the GlyphLab overlay panel inside the canvas iframe |
| T4 | Glyph tool active | After picking a glyph, `state.tool` becomes `symbol-place` or `symbol-brush` |
| T5 | Sampler button visible | Sampler button appears in Studio Canvas toolbar |
| T6 | Sampler opens panel | Clicking Sampler opens the sampler overlay panel |
| T7 | Studio Glyph Lab unaffected | Studio Glyph Lab tab still opens its own mode; no cross-contamination |
| T8 | Pen/Select/Text/Ball still work | Existing tool interactions unaffected |
| T9 | Shape keyboard compat | Pressing `S` (if wired) still switches to shape tool internally without showing UI |
