# 0621D_PLAY_BroadcastHUDStageClearanceLayoutHotfix_v1.0.0_PATCH

## Project

**PLAY — Broadcast HUD / Playlist Presentation**

## Status

**PATCH READY**

## Purpose

Remove unnecessary Broadcast HUD chrome so the playlist background/title screen owns more presentation space.

0621C fixed the playlist persistence regression. The next immediate issue is layout clarity: Broadcast HUD still has too much top interface structure for a viewer-facing stream surface.

The goal of this patch is to clear the stage, not add new features.

```text
Broadcast HUD = presentation surface
Editor chrome = hidden/minimized operator layer
Playlist background/title screen = primary identity surface
Bottom row = compact playback + playlist context
```

---

## Product Correction

The current Broadcast HUD has two top bars:

1. Browser/app top row / mode row
2. Large playlist identity row with cover, title, operator buttons, and status light

The second row consumes too much vertical space and repeats identity already carried by the full-screen playlist/background title image.

For Broadcast HUD, remove the large second row from the default layout.

---

## Required Behavior

### 1. Keep Top Row, But Minimize It

Keep the smallest top row because it contains the route back to editor / mode switching.

Move these controls into the top row:

- secondary-layer cycle button
- pin button if visible
- grid toggle `⊞`
- status / green light

These controls should become compact operator controls.

They may remain visible for now, but must not create a second full-width presentation row.

### 2. Remove Large Playlist Header Row From Broadcast HUD

Remove the large second-row presentation header from Broadcast HUD default view.

Do not show:

- large playlist cover block
- large title row container
- extra full-width playlist metadata bar
- extra status area consuming presentation height

The playlist title may still appear elsewhere if it supports the bottom playback context or a timed secondary card.

### 3. Remove Playlist Cover From Default Broadcast HUD

Do not show the playlist cover as a persistent top-left object in Broadcast HUD.

Reason:

- the background / title screen already does the identity work at full scale
- the cover duplicates identity
- it consumes space and creates a dashboard feel

Cover art may still be used in:

- playlist manager
- editor
- broadcast card
- secondary `playlist_identity` card
- future bumper mode

### 4. Use Bottom Row for Track + Playlist Context

The bottom row should be the default place for compact playback context.

Recommended grouping:

```text
[track index] Now playing track — artist     Playlist Title     elapsed / duration
```

The playlist title should persist near the rotating track title so viewers understand the songs belong to the active playlist.

This creates a stable relationship:

```text
rotating songs + persistent playlist title = one program block
```

### 5. Preserve Atmosphere Surface

The main body should remain open for:

- background image
- playlist title screen artwork
- veil / vignette
- optional passive grid overlay
- temporary secondary cards

Do not add a new widget layer to replace the removed header.

---

## Non-Goals

Do not implement library separation in this patch.

Do not change persistence behavior from 0621C.

Do not modify Flow-Curve Editor logic.

Do not restore permanent queue rail.

Do not restore default FlowCurveCanvas in Broadcast HUD.

Do not add new playlist metadata editing UI.

---

## Files To Inspect

Likely files:

```text
src/ui/BroadcastHudShell.tsx
src/ui/BroadcastSecondaryLayer.tsx
src/ui/BroadcastGridLayer.tsx
src/ui/TopBar.tsx
src/App.tsx
src/styles.css
```

Search terms:

```bash
grep -R "BroadcastHudShell\|BroadcastSecondaryLayer\|BroadcastGridLayer\|TopBar\|playlist cover\|coverImage\|hud-header\|header-right\|status" src
```

---

## Implementation Notes

### Suggested Layout Model

```text
┌──────────────────────────────────────────────┐
│ compact top operator row                     │
├──────────────────────────────────────────────┤
│                                              │
│          playlist background / world          │
│          optional grid overlay                │
│          temporary secondary card             │
│                                              │
├──────────────────────────────────────────────┤
│ now playing + playlist title + progress       │
└──────────────────────────────────────────────┘
```

### Operator Controls

Move operator controls into a compact row cluster.

Suggested icons already in use:

```text
— / ▶ / ◈ / → / ≡    secondary layer cycle
◫                    pin
⊞                    grid
●                    status
```

All controls must have tooltips / accessible labels.

### Bottom Row Copy

Recommended bottom row composition:

```text
#01 Going Around — Herbert, Matthew Herbert · Standard Pace of Living · 1:07 / 6:55
```

Keep it compact, readable, and non-dominant.

---

## Acceptance Criteria

Pass when all are true:

1. Broadcast HUD no longer has a large second top row.
2. Persistent playlist cover is removed from Broadcast HUD default layout.
3. Operator controls are compacted into the remaining top row.
4. Status indicator / green light no longer requires its own large header area.
5. Main atmosphere surface gains vertical space.
6. Bottom row clearly pairs now-playing track with active playlist title.
7. Secondary layer timing from 0621B still works.
8. Grid toggle from 0621A still works independently.
9. Playlist persistence from 0621C still works after reload.
10. TypeScript build passes.

---

## Verification Checklist

Run:

```bash
npm run build
```

Manual browser test:

```text
1. Open Broadcast HUD.
2. Confirm only one compact top row remains.
3. Confirm large playlist header row is gone.
4. Confirm playlist cover is not persistently visible in Broadcast HUD.
5. Confirm background/title image gets more vertical space.
6. Confirm secondary-layer cycle still works.
7. Confirm pin still works.
8. Confirm grid toggle still works.
9. Confirm bottom row shows current track and active playlist title together.
10. Hard refresh browser and confirm playlists still persist.
```

---

## Next Patch After This

Recommended next patch:

```text
0621E_PLAY_PlaylistSourceGroupIsolationPatch_v1.0.0_PATCH
```

Purpose:

Prevent playlist contamination by making each playlist pull from its own source group unless explicitly allowed otherwise.

This should be handled after the Broadcast HUD stage is cleared.

---

## Implementation Guide

- **Where:** Update `BroadcastHudShell`, `TopBar`, bottom transport/progress row, and related CSS in `src/styles.css`.
- **What:** Remove the large Broadcast HUD playlist header row, move operator buttons/status into the compact top row, remove persistent cover display, and group active track + playlist title in the bottom row.
- **Expect:** Broadcast HUD has more presentation space, the background/title image owns the stage, only compact operator controls remain, and persistence remains stable after refresh.
