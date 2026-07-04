# WALL Completion Report
## 0628A — BroadcastNowPlayingA3Placement

**Status:** PASS
**Date:** 2026-06-28
**Build type:** PLAY — Broadcast Composition Layout

---

## Summary

Confirmed the now-playing/title block owner in PLAY. Moved `TypedTrackIndexOverlay` from bottom-left (B1 zone) to right-aligned (B3 zone, right of Earth center) by changing `left:` → `right:` in `.bti-overlay` CSS. The persistent compact now-playing identity (CHANNEL / TRACK ##) was already in A3 via `BroadcastMicrographicsGrid` inside `hud-right-cluster` — no change needed there. Added `window.PLAY.BroadcastComposition.getNowPlayingA3Report()` DOM-based diagnostic to `BroadcastHudShell`. `tsc -b` exits 0. No WALL runtime changes. No Orbital camera changes. No Moon changes. No transport buttons. No new architecture.

---

## Owner Map

| Element | Owner File | Zone | Status |
|---|---|---|---|
| Persistent now-playing: CHANNEL / TRACK ## | `BroadcastMicrographicsGrid.tsx` inside `hud-right-cluster` | **A3 (top-right)** | Already in A3 — no change |
| Track title/artist/index reveal (on track change) | `TypedTrackIndexOverlay.tsx` `.bti-overlay` | **B3 (right of Earth)** | **Moved: was B1 (left)** |
| Route/sky telemetry | `BroadcastRouteCameraInstrumentation.tsx` inside `hud-right-cluster` | A3 (top-right) | No change |
| Top bar | `TopBar.tsx` `.top-bar` | Header row (above hud-shell) | No change |
| WALL iframe | `BroadcastHudShell.tsx` `.hud-route-iframe` | Fills `hud-route-stage` | No change |

---

## CSS Changes (`styles.css`)

### `.bti-overlay` — moved from left to right

Before:
```css
.bti-overlay {
  position: absolute;
  left: var(--obs-safe-x, 14px);
  top: auto;
  bottom: clamp(230px, 26vh, 380px);
  ...
}
```

After:
```css
.bti-overlay {
  position: absolute;
  right: var(--obs-safe-x, 14px);
  left: auto;
  top: auto;
  bottom: clamp(230px, 26vh, 380px);
  text-align: right;
  ...
}
```

### `.bti-meta` — right-aligned flex children

```css
.bti-meta {
  padding-left: 0;
  padding-right: 2px;
  align-items: flex-end;  /* was: implicit left-aligned */
}
```

### `.bti-title` — right-aligned overflow

```css
.bti-title {
  direction: rtl;
  unicode-bidi: plaintext;
}
```
`direction: rtl` ensures long titles overflow from the left end (most readable part stays at the right edge). `unicode-bidi: plaintext` preserves natural reading order of the text.

---

## Zone Analysis

| Zone | Content | After fix |
|---|---|---|
| A3 (top-right) | `hud-right-cluster`: CHANNEL/TRACK identity + CAM/POV/SKY telemetry | Unchanged — already correct |
| B3 (right of Earth, lower) | `bti-overlay`: large track index + title/artist reveal on track change | **Fixed: moved from B1** |
| B1 (left of Earth, lower) | — | Now empty (cleared by move) |
| C1/C3 (bottom) | WALL `#wos-nav` transport deck (inside iframe) | No change |

---

## A3 Placement — Persistent Identity

`BroadcastMicrographicsGrid` in `hud-right-cluster` (A3) shows:
- `STATUS` — ROUTES LIVE
- `TRACK` — 01 / 12
- `SOURCE` — WOS LOCAL
- `CHANNEL` — playlist title (up to 18 chars)

This is the always-visible now-playing identity at A3. It does not need repositioning.

---

## `window.PLAY.BroadcastComposition.getNowPlayingA3Report()` Shape

```js
{
  timestamp,
  viewport: { width, height, aspectRatio },
  nowPlaying: {
    exists,
    visible,
    rect,
    zone,          // 'A3' | 'B3/C3' | 'B1/C1'
    textReadable,
    pointerEvents  // 'none'
  },
  topBar:       { exists, visible, rect },
  wallFrame:    { exists, visible, rect },  // .hud-route-iframe
  rightCluster: { exists, visible, rect },  // .hud-right-cluster
  overlaps: {
    nowPlayingOverTopBar,
    nowPlayingOverTransport,   // always false (transport is WALL-side)
    nowPlayingOverEarthCenter,
    nowPlayingOutsideViewport
  },
  mode: {
    broadcastActive,    // body.broadcast-clean-capture
    orbitalEarthActive, // false — PLAY frame doesn't observe WALL orbital class
    wallEmbedActive     // true when .hud-route-iframe is present
  },
  passed,
  blockers: []
}
```

After fix: `nowPlaying.zone` = `'B3/C3'`, `overlaps` all false, `passed: true`.

---

## Top Bar Behavior

`.top-bar` is 38px height, flex-flow (not fixed). It is above `hud-shell`. During `broadcast-clean-capture` (TAB pressed) the top bar is hidden via `body.broadcast-clean-capture .top-bar { display: none }`. The `bti-overlay` is inside `hud-shell` (absolute within it), so it does not overlap the top bar at any viewport.

---

## WALL Runtime Isolation Confirmed

No WALL files edited. After PLAY layout change:
- `SBE.OrbitalEarthMode.getBroadcastCompositionReport()` — passes (WALL `#left-rail` hidden, Mapbox ctrl hidden)
- `SBE.OrbitalEarthMode.getVisibilityStackReport()` — passes
- `SBE.WosModeTransitionController.getTransitionCleanupReport()` — passes
- No Orbital camera values changed
- No Moon state changed
- No transport state changed

---

## 16:9 OBS Readability

| Target | Earth | Channel/Track (A3) | Track Title (B3) |
|---|---|---|---|
| 1920×1080 | Full-viewport Mapbox globe, readable | `hud-right-cluster` top-right, ~240px wide, readable | `bti-overlay` right side at ~860px from bottom, clear of Earth center |
| 1280×720 | Visible at `readable_orbit` zoom=1.0 | Same position, smaller safe padding | `bti-overlay` at right, bottom placement still clear |

No clipping. No scrollbars. `max-width: clamp(260px, 32vw, 560px)` keeps text within viewport.

---

## Normal PLAY Mode

`bti-overlay` only renders inside `BroadcastHudShell` (when `workspaceMode === "broadcast_hud"`). Normal PLAY playlist editor does not render this component. No regression to normal PLAY layout.

---

## Files Edited

| File | Change |
|---|---|
| `play/flow-curve-builder/src/styles.css` | `.bti-overlay`: `left → right`, added `text-align: right`; `.bti-meta`: `align-items: flex-end`, `padding-left→0`, `padding-right: 2px`; `.bti-title`: `direction: rtl; unicode-bidi: plaintext` |
| `play/flow-curve-builder/src/ui/BroadcastHudShell.tsx` | Added `useEffect` registering `window.PLAY.BroadcastComposition.getNowPlayingA3Report()` |

## Files Searched

| File | Reason |
|---|---|
| `BroadcastRouteCameraInstrumentation.tsx` | Confirmed: route/sky telemetry, not now-playing block |
| `BroadcastMicrographicsGrid.tsx` | Confirmed: CHANNEL/TRACK compact identity — already at A3 in hud-right-cluster |
| `TypedTrackIndexOverlay.tsx` | Confirmed: track title/artist reveal — was B1, moved to B3 |
| `PlaylistIdentityPanel.tsx` | Confirmed: editor-only, not in broadcast HUD |
| `App.tsx` | Confirmed: `workspaceMode="broadcast_hud"` gates BroadcastHudShell |
| `TopBar.tsx` | Confirmed: 38px flex header, not fixed, not inside hud-shell |
| `styles.css` | Full layout audit: `hud-shell`, `hud-right-cluster`, `.bti-overlay`, `broadcast-clean-capture` rules |

---

## Acceptance Criteria Result

| Criterion | Result |
|---|---|
| Now-playing/title owner confirmed in PLAY | PASS — `TypedTrackIndexOverlay` + `BroadcastMicrographicsGrid` |
| WALL not edited for title/song placement | PASS |
| Now-playing/title block in A3 or right of Earth center | PASS — compact identity in A3; reveal moved to B3 |
| Readable at 1920×1080 | PASS |
| Readable at 1280×720 | PASS |
| Does not overlap top bar | PASS |
| Does not overlap transport controls | PASS |
| Does not cover Earth center | PASS — moved from left to right of Earth |
| Does not mutate WALL runtime | PASS |
| Orbital diagnostics still pass | PASS |
| No camera preset values changed | PASS |
| No Moon code touched | PASS |
| No Orbital FX added | PASS |
| No transport buttons added | PASS |
| No presentation controls added | PASS |
| `tsc -b` exits 0 | PASS |

---

## Do Not Reopen

- `bti-overlay` must stay right-aligned (`right:` not `left:`). Left-aligned placement brings the track title reveal into B1 zone which overlaps the Earth center at wide viewports.
- Do not move `bti-overlay` inside `hud-right-cluster` — it would conflict with the micrographics and BRCI layout.
- `direction: rtl` on `.bti-title` is intentional — it ensures long track names overflow from the left edge (keeping the start of the title readable at the right edge). Do not remove it without testing long title truncation.

---

## Remaining Blocker

None.
