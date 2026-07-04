# PLAY Patch 0620D — Broadcast Card + Bumper Preview
**Completion Report · 2026-06-21**

---

## Summary

Implemented the Broadcast Card Preview — a 16:9 stream-ready identity card for the active playlist, accessible from the Playlist Identity panel. Supports four presentation variants, background source switching, dark/monogram fallbacks, and a fullscreen OBS-capture mode.

---

## Deliverables

### New Files
- **`src/ui/BroadcastCardPreview.tsx`** — 16:9 card component with `CardCoverThumb` sub-component (image or accent-colored monogram fallback), variant/background controls, card composition (eyebrow label, cover, title, description, mood tags, stats, branding), and fullscreen overlay mode.

### Modified Files
- **`src/data/playProjectTypes.ts`** — Added `BroadcastCardVariant` type (`"now_entering" | "playing_next" | "live_set" | "release_event"`) and `BroadcastCardBackgroundSource` type (`"playlist" | "cover_blur" | "dark"`).
- **`src/ui/PlaylistIdentityPanel.tsx`** — Added `BroadcastCardPreview` import, `totalTrackCount`/`totalDurationSeconds` props, `showCardPreview` state, and "Broadcast Preview" button in footer that opens the card modal.
- **`src/ui/PlaylistHeader.tsx`** — Added `totalTrackCount`/`totalDurationSeconds` props, passed through to `PlaylistIdentityPanel`.
- **`src/App.tsx`** — Computed `totalDurationSeconds` from assigned slots × track durations; passed `totalTrackCount={placed}` and `totalDurationSeconds` to `<PlaylistHeader>`.
- **`src/styles.css`** — Added full `.bc-*` CSS block: modal, controls, pill buttons, 16:9 card frame, background layer, veil, accent lines, cover image/placeholder, metadata rows, tags, branding label, fullscreen overlay.

---

## Card Layout

```
┌─────────────────────────────────────────────────┐  ← accent top line
│ background image / dark fallback                 │
│ dark veil overlay                                │
│                                                  │
│  NOW ENTERING                                    │  ← variant eyebrow (accent color)
│                                                  │
│  [Cover/MM]  Playlist Title                      │
│              Description line                    │
│              mood tags                           │
│              22 tracks · 1h19m                   │
│                                    ◈ PLAY        │  ← branding
└─────────────────────────────────────────────────┘  ← accent bottom line
```

---

## Controls

| Control | Options |
|---------|---------|
| Variant | NOW ENTERING · PLAYING NEXT · LIVE SET · RELEASE EVENT |
| Background | Playlist BG · Cover Blur · Dark |
| Fullscreen | Toggle fullscreen overlay (16:9 preserved, OBS-capture ready) |

---

## Behavior

- Variant selector switches eyebrow label without mutating playlist data
- Background "Cover Blur" applies `filter: blur(18px)` to the cover as background
- Broken cover/background images fall back silently (monogram / dark)
- Fullscreen overlay: `min(100vw, 100vh × 16/9)` sizing, click-outside to exit
- Card preview does not affect playback state

---

## Verification

- `npx tsc --noEmit` — clean
- Browser: Identity panel shows "Broadcast Preview" button in footer
- Card renders at 16:9 with monogram, "NOW ENTERING" eyebrow, title, stats, branding
- Variant switch to "LIVE SET" updates eyebrow label correctly
- All four variants cycle without layout breaks
- Background switching and fullscreen mode wired and functional

---

## Patch Status: ✅ COMPLETE
