# PLAY Patch 0620G — Minimal Broadcast Transport
**Completion Report · 2026-06-21**

---

## Summary

Replaced the Broadcast HUD's operator-heavy transport strip with a minimal, stream-facing playback signal. The HUD now shows state (not controls), while the Flow-Curve Editor retains the full transport unchanged.

---

## Surface Transport Rule (locked in)

| Surface | Transport |
|---------|-----------|
| Flow-Curve Editor | Full controls — prev / play / stop / next / seek / Auto ON |
| Broadcast HUD | Minimal signal — state glyph / title / artist / progress line / time |
| Broadcast Card | None |

---

## Deliverables

### New File
- **`src/ui/MinimalBroadcastTransport.tsx`** — Passive playback signal component. Props: `isPlaying`, `slotIndex`, `title`, `artist`, `elapsedSeconds`, `durationSeconds`, `accentColor`, `onTogglePlay`. Renders: state glyph (▶/Ⅱ/—), slot label, title, artist, elapsed/total time, 2px accent progress line. Does not expose prev/stop/next/autoplay/seek.

### Modified Files
- **`src/ui/BroadcastHudShell.tsx`** — Replaced `hud-transport` block (full controls) with `<MinimalBroadcastTransport>` inside `.hud-transport-wrap`. Removed now-unused `slotNum`, `trackTitle`, `trackArtist`, `timeLabel`, `progress`, `fmtTime` locals. Added `MinimalBroadcastTransport` import.
- **`src/styles.css`** — Added `.hud-transport-wrap`, `.mbt-shell`, `.mbt-nowplaying`, `.mbt-state-btn`, `.mbt-track-line`, `.mbt-slot`, `.mbt-title`, `.mbt-sep`, `.mbt-artist`, `.mbt-time`, `.mbt-progress`, `.mbt-progress-fill` rules.

---

## HUD Transport Layout

```
— Not playing                                          0:00
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

When playing:
```
▶ #04  Tendency — Jan Jelinek                       2:14 / 7:21
━━━━━━━━━━━━━━━━━━━━━━████░░░░░░░░░░░░░░░░░░░░░░░░░░░░
```

---

## Verification

- `npx tsc --noEmit` — clean
- Broadcast HUD: minimal one-line transport, no prev/stop/next/Auto visible
- "— Not playing" state renders correctly for empty playlist
- Progress line (2px) spans full width at the bottom of the transport
- Flow-Curve Editor: full transport (prev/play/stop/next/seek/Auto ON) unchanged
- No regressions in HUD layout, queue rail, or identity header

---

## Patch Status: ✅ COMPLETE
