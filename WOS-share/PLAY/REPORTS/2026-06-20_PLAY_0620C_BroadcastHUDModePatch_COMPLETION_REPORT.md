# PLAY Patch 0620C — Broadcast HUD Mode
**Completion Report · 2026-06-20**

---

## Summary

Implemented the Broadcast HUD Mode — a dedicated presentation layout that replaces the editor view when active, designed for on-air/broadcast contexts where the operator needs a clean, read-only playback interface.

---

## Deliverables

### New Files
- **`src/ui/BroadcastHudShell.tsx`** — Full HUD layout component with three zones: header identity strip, read-only flow curve canvas, and bottom transport strip. Includes `HudCoverThumb` sub-component (56×56, image or accent-colored monogram fallback), background image layer with dark veil overlay, mood tag display, and next-up track info.

### Modified Files
- **`src/ui/FlowCurveCanvas.tsx`** — Added `readOnly?: boolean` prop (default `false`). Guards `addPoint`, `removePoint`, and `onPointPointerDown` so no curve mutations can occur in HUD mode.
- **`src/ui/TopBar.tsx`** — Exported `WorkspaceMode = "flow_curve" | "broadcast_hud"` type. Added `.tb-mode-switch` button pair ("Flow-Curve" / "Broadcast HUD") with active state. Import/backup/restore controls conditionally hidden when in HUD mode.
- **`src/App.tsx`** — Added `workspaceMode` state, wired `TopBar` props, conditionally renders `<BroadcastHudShell>` in HUD mode and gates `<PlaylistHeader>` + editor workspace rows on `"flow_curve"` mode.
- **`src/styles.css`** — Added `.tb-mode-switch`, `.tb-mode-btn`, `.tb-mode-btn.active` rules and full `.hud-*` CSS block (shell, background layers, header, canvas zone, transport, controls, progress, next-up, error).

---

## Behavior

| Action | Result |
|--------|--------|
| Click "Broadcast HUD" | Editor disappears; HUD renders with header strip, read-only curve, transport |
| Click "← Editor" | Returns to full editor layout |
| Click on curve in HUD | No point added (readOnly guard) |
| Import/Backup/Restore buttons | Hidden in HUD mode; restored on exit |
| Background image set | Rendered as full-bleed layer behind HUD with dark veil |
| Accent color set | Applied to header border, progress fill, slot number, mood tags, play button |

---

## Verification

- `npx tsc --noEmit` — clean, no errors
- Browser: mode toggle renders in top bar, both labels visible with active state highlight
- Broadcast HUD → header strip shows cover + title + stats + dates + exit button
- Flow curve displays read-only (status dot, canvas renders, no edit affordances)
- Transport strip renders with prev/play/stop/next controls, seek range, autoplay toggle
- "← Editor" button returns to editor with all controls restored
- No runtime errors in browser console

---

## Architecture Notes

- `WorkspaceMode` type exported from `TopBar.tsx` (co-located with the only consumer of the toggle)
- `BroadcastHudShell` receives all playback state as props — no internal state for playback, keeping it a pure presentation component
- `onCurveChange={() => {}}` passed to the read-only canvas — safe no-op, never called due to `readOnly` guard
- Background image uses `position: absolute; inset: 0` layering with `z-index` 0/1/2 stack so header/canvas/transport always sit above the image

---

## Patch Status: ✅ COMPLETE
