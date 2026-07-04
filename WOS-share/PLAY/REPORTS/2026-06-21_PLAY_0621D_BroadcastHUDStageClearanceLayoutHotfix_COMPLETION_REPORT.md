# PLAY Patch 0621D — Broadcast HUD Stage Clearance Layout Hotfix
**Completion Report · 2026-06-21**

---

## Summary

Cleared the Broadcast HUD stage. Removed the large second header band and the persistent playlist cover, lifted the operator controls into the single top row (TopBar), and paired the active playlist title with the now-playing track in the bottom transport. The background/title surface now owns the full presentation height.

---

## Layout (after patch)

```
┌──────────────────────────────────────────────┐
│ ◈ PLAY  [Flow-Curve][Broadcast HUD]   — ◫ ⊞ ● │  ← single compact top row
├──────────────────────────────────────────────┤
│                                              │
│        playlist background / world            │
│        optional grid overlay                  │
│        temporary secondary card               │
│                                              │
├──────────────────────────────────────────────┤
│ ▶ #01 Track — Artist / Playlist     1:07/6:55 │  ← track + playlist title + progress
└──────────────────────────────────────────────┘
```

---

## Architecture Change

Operator state (secondary mode, pin, grid, modeKey) and the secondary-layer queue + auto-dismiss timer were **lifted from `BroadcastHudShell` to `App`**, so the controls can live in the shared top row while `BroadcastHudShell` becomes a pure presentation surface.

```
App  ── owns hudSecondaryMode / hudPinned / hudGridVisible / hudModeKey
     ── owns the 0621B auto-dismiss timer effect
     ── builds hudQueue + cycle/activate handlers
     ├── <TopBar rightSlot={<HudOperatorControls .../>} />   (controls in the top row)
     └── <BroadcastHudShell secondaryMode= gridVisible= queue= ... />  (renders layers only)
```

---

## Changes

### NEW: `src/ui/HudOperatorControls.tsx`
Compact operator cluster for the top row: secondary-layer cycle (`— ▶ ◈ → ≡`), pin (`◫`), grid toggle (`⊞`), and the playback status dot. All buttons carry tooltips. Owns the `SECONDARY_LABELS` / `SECONDARY_TITLES` display maps.

### `src/ui/BroadcastSecondaryLayer.tsx`
- Exported `SECONDARY_CYCLE` (canonical operator cycle order) so App and the controls share one source of truth.

### `src/ui/BroadcastHudShell.tsx`
- **Removed the entire `.hud-header` band** — cover thumb, title, description, stats, mood tags, and the header-right control cluster.
- Removed local `useState`/`useEffect`/cycle logic — now receives `secondaryMode`, `secondaryModeKey`, `secondaryTimerDurationMs`, `gridVisible`, `queue` as props.
- Removed `HudCoverThumb`, `fmtUpdatedLabel`, `buildNowNextQueueState`, mode-label constants (moved up to App / controls).
- Body is now `atmosphere-zone + grid overlay + secondary card` with no header consuming height.
- Passes `playlistTitle={playlist.title}` to the transport.

### `src/ui/MinimalBroadcastTransport.tsx`
- Added `playlistTitle?` prop. Renders `… Artist / Playlist Title` so rotating tracks stay visibly bound to the active playlist (`rotating songs + persistent playlist title = one program block`).

### `src/ui/TopBar.tsx`
- Added `rightSlot?: ReactNode` prop, rendered right-aligned (`.tb-right-slot`, `margin-left: auto`). Generic — App injects the HUD controls only in `broadcast_hud` mode.

### `src/App.tsx`
- Lifted HUD operator state + `hudModeKeyRef`.
- Added the 0621B auto-dismiss timer effect at the hooks level.
- Builds `hudQueue` (via `buildNowNextQueueState`) and `cycleHudSecondaryMode` / `activateHudMode` handlers; computes `hudTimerDurationMs`.
- Injects `<HudOperatorControls>` into `TopBar.rightSlot` when in HUD mode.
- Passes lifted state + queue to `BroadcastHudShell`.

### `src/styles.css`
- `.tb-right-slot`, `.hud-op-controls` — top-row control cluster.
- `.mbt-pl-divider`, `.mbt-playlist` — bottom-row playlist title styling.
- (Existing `.hud-ctl-btn` / `.hud-status-dot` reused; `.hud-header*` rules left in place, now unused.)

---

## Verification (browser, port 5173)

- ✅ Single compact top row — logo, mode switch, operator controls (`— ◫ ⊞ ●`) on the right
- ✅ Large second header row gone (`!document.querySelector('.hud-header')` → true)
- ✅ Persistent playlist cover removed from default HUD
- ✅ Atmosphere surface gains full vertical space
- ✅ Bottom row pairs track + playlist title: "Not playing / My Mix … 0:00"
- ✅ Operator controls confirmed inside `.top-bar` (`.top-bar .hud-op-controls` present)
- ✅ Secondary cycle → now_playing card renders (bottom-left, rundown line) — 0621B intact
- ✅ Pin (`◫`) holds the card; grid (`⊞`) overlay renders independently — 0621A intact
- ✅ Persistence (0621C): seeded 2 playlists (active = pl_y) → reload → both persist, active preserved, UI shows them
- ✅ `npx tsc --noEmit` clean
- ✅ No console errors

---

## Remaining Risks

- The old `.hud-header*` CSS rules are now dead (no element uses them). Left in place to keep the diff tight; safe to prune in a later cleanup.
- The secondary-layer auto-dismiss timer now lives in App and runs regardless of workspace mode. It is harmless in editor mode (mode stays `none`), but a future change could gate it on `workspaceMode === "broadcast_hud"` if desired.

---

## Patch Status: ✅ COMPLETE
