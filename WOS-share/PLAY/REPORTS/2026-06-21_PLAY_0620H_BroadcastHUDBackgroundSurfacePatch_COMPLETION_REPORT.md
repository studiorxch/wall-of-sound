# PLAY Patch 0620H — Broadcast HUD Background Surface
**Completion Report · 2026-06-21**

---

## Summary

Shifted Broadcast HUD from boxed interface panels toward a full-bleed broadcast surface. Added cover-blur background fallback, replaced flat dark veil with a richer gradient vignette, removed structural purple border lines, and gave the graph and queue panels a glass/embedded treatment.

---

## Visual Rule (locked in)

```
Purple = state signal (progress line, NOW label, playing dot)
Not purple = structure
```

Removed: hard `2px var(--accent)` border under header, hard accent border above transport.  
Kept: bottom progress line (`mbt-progress-fill`), status dot, NOW/NEXT accent labels.

---

## Changes

### `src/ui/BroadcastHudShell.tsx`
- Added `coverSrc` derived from `playlist.coverImage?.src`
- Background layer now renders:  
  `bgSrc → hud-bg` / `coverSrc (no bgSrc) → hud-bg hud-bg-cover-blur` / dark fallback
- Removed `style={{ borderBottomColor: accent }}` from `.hud-header`
- Removed `style={{ borderTopColor: accent }}` from `.hud-transport-wrap`

### `src/styles.css`
| Rule | Change |
|------|--------|
| `.hud-bg-cover-blur` | NEW — `filter: blur(32px) brightness(0.5) saturate(1.3); transform: scale(1.12)` |
| `.hud-bg-veil` | Flat `rgba(10,10,18,0.72)` → radial + linear gradient vignette |
| `.hud-header` | Removed `border-bottom: 2px solid var(--accent)` → gradient fade (`linear-gradient to bottom`) |
| `.hud-canvas-zone .curve-container` | Added `background: rgba(6,6,18,0.52)`, `backdrop-filter: blur(4px)`, `border-radius: 6px`, `box-shadow` |
| `.hud-queue-rail` | Removed `border-left: 1px solid rgba(255,255,255,0.07)` → `box-shadow: -1px 0 0 rgba(255,255,255,0.04)` (softer), slightly higher opacity bg |
| `.hud-transport-wrap` | Removed `border-top` → `linear-gradient(to top, ...)` gradient band |

---

## Background Fallback Stack

```
1. playlist.backgroundImage.src  → full-bleed bg image
2. playlist.coverImage.src       → blurred/darkened cover expansion
3. (neither)                     → dark surface (var(--bg))
```

---

## Verification

- `npx tsc --noEmit` — clean
- Broadcast HUD: no hard purple structural lines visible
- Header floats with gradient fade, no bottom border
- Graph panel: rounded glass card, no accent outline
- Queue rail: integrated without hard separator
- Transport: gradient band, no border, progress line remains as the single accent
- No regressions in editor, card preview, or queue panel

---

## Patch Status: ✅ COMPLETE
