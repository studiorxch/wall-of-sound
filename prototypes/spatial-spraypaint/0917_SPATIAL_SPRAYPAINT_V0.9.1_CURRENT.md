# Spatial Spraypaint V0.9.1 Current Status

Date: 2026-09-17

Status: COMPLETE — iPad LAN Test Access pass. Narrowly scoped: made the dev server reachable from an iPad on the same LAN as the dev Mac, and audited (without changing) iPad/Safari compatibility, the Pencil diagnostics panel, and full-screen drawing behavior. One file changed. No deployment/hosting/auth/PWA work, no cap physics or Flair changes, per explicit instruction.

Baseline: V0.9 commit `b146230`/`f5e5a6d` (Flair moved onto the real accessible cap path).

## A. Dev-server network access

**Change**: `vite.config.ts` — added `host: true` to both `server` and `preview` blocks. This is Vite's own documented mechanism for binding to `0.0.0.0` (every network interface) instead of loopback-only; `open: true`/`port: 3000` untouched. No IP address is hard-coded anywhere — Vite resolves the Mac's actual LAN address(es) itself at startup and prints them.

**Verified directly** (not just read the docs): started `npx vite --port 5196` in the background and confirmed the printed URLs:
```
VITE v5.4.21  ready in 140 ms
➜  Local:   http://localhost:5196/
➜  Network: http://192.168.1.111:5196/
➜  Network: http://10.14.0.2:5196/
```
Then `curl`'d both the `localhost` and the `192.168.1.111` URL — both returned HTTP 200. Stopped that test server afterward. Separately, restarted this session's own dev-server config (`.claude/launch.json`'s `spatial-spraypaint` entry, port 5195, which was already using `npx vite --port 5195` and now inherits `host: true` from `vite.config.ts` with no changes needed to that file) and confirmed the same Network URL appears there too, and the app still loads correctly (screenshotted).

- **Exact command to start the server**: `npm run dev` (unchanged — the `host: true` config default means no extra flag is needed; `npx vite --host` also works identically if preferred)
- **Port**: `5195` in this project's own `.claude/launch.json` dev config; `3000` if run via the plain `npm run dev` / `vite.config.ts` default (no `.claude/launch.json` involved). Whichever port the terminal's own `➜ Local:` line reports is authoritative — Vite auto-increments if the configured port is already in use.
- **Mac LAN URL format for iPad**: `http://<mac-lan-ip>:<port>/` — e.g. `http://192.168.1.111:5195/` on this Mac right now. The IP is **not** fixed — it depends on which network the Mac is on when the server starts, and Vite prints the current one every time (`➜ Network: ...`). Read it fresh from the terminal each session rather than reusing a saved address.

## B. iPad/Safari compatibility audit

Read-only audit (`grep`/manual review across `src/*.ts` and `index.html`) — no app behavior changed, since no concrete blocker was found beyond LAN reachability itself:

- **No localhost-only runtime URLs**: `grep -rn "localhost\|127.0.0.1" src/*.ts index.html` — zero matches outside test files.
- **No desktop-Chrome-only APIs**: no `requestPointerLock`, `ImageCapture`, `webkit`-prefixed calls, or Chrome-specific globals found. `setPointerCapture`/`hasPointerCapture`/`releasePointerCapture` (used for wall-panning) are standard Pointer Events API, supported in Safari since iOS 13.
- **Pointer events already the primary input path**: `main.ts`'s drawing loop is built entirely on `pointerdown`/`pointermove`/`pointerup`, already pointerType-agnostic (mouse, pen, and touch all reach the same code path) — no Chrome-only `MSPointerEvent`/touch-event-only fallback.
- **`touch-action` already correct and already scoped**: `#composite-canvas { touch-action: none; }` (`index.html:31`) — already present from a prior pass, already scoped to the canvas alone (not applied globally), which is exactly what prevents the browser from hijacking a Pencil/finger drag on the canvas into a native scroll/pinch-zoom/double-tap-zoom gesture.
- **Viewport meta tag present and standard**: `<meta name="viewport" content="width=device-width, initial-scale=1.0">`. Left unchanged — adding `user-scalable=no` globally would be exactly the "disable normal browser behavior globally" the brief says not to do, and it's unnecessary: zoom-prevention is already correctly scoped to the canvas via `touch-action: none` above, not the viewport tag.
- **No hover-only controls block functionality**: the only two `:hover` CSS rules in `index.html` (button border/background tint) are purely decorative highlights layered on top of ordinary `click`/pointer-driven buttons — every control still fires on tap with no hover state required first.
- **Dialogs/popovers already touch-usable**: Brush Studio and Calibration Bench are `position: fixed` overlays with `overflow-y: auto` scroll regions (native touch-scrollable on iOS Safari, no extra CSS needed on modern iOS); Brush Studio's Mode selector is a plain `<select>`, which iOS Safari renders as its own native touch picker wheel.
- **Page-level scroll already prevented**: `html, body, #app { overflow: hidden; }` (`index.html:15`), already present — combined with the canvas's own `touch-action: none`, this means no code change was needed for "does not page-scroll during Pencil drawing."
- **Known, un-fixed limitation (out of scope to fix — flagged, not silently ignored)**: the optional hand-tracking ("spatial" input) mode uses `@mediapipe/camera_utils`, which calls `getUserMedia` internally. Camera access requires a secure context; a plain `http://<lan-ip>:port` origin is **not** secure (only `https:` and `localhost` are), so hand-tracking will fail to start when the app is loaded over the LAN URL on iPad. This does not affect Pencil/mouse/touch drawing, which is the primary path this pass is testing — see "Known Safari/iPad limitations" below. Fixing it would mean standing up HTTPS, which section E explicitly excludes from this pass.

## C. Pencil diagnostics

Preserved exactly as-is — no code changes needed; verified live instead. The panel (`#pencil-diagnostics-panel`, toggled by a checkbox in Settings → Input → "Pencil diagnostics") already reports all six required fields, reading them straight off the real `PointerEvent` via `normalizePointerSample` (`PencilInput.ts`) with the Pointer Events spec's own documented fallbacks (pressure 0.5 default, tilt/twist 0 default) — never fabricated:

- `pointerType` (shown uppercased, e.g. "PEN")
- `pressure`
- `tiltX` / `tiltY` (shown combined as "Tilt X / Y")
- `twist`
- `velocity` (screen-px/ms, derived from consecutive samples)
- `coalescedCount` ("Coalesced" — `event.getCoalescedEvents().length`, 0 when unsupported)

**Verified live**: opened Settings, checked "Pencil diagnostics," confirmed the panel appears showing all six fields (initially "—" before any pointer event). Dispatched a synthetic `pointerType: "pen"` event with `pressure: 0.62, tiltX: 24, tiltY: -12, twist: 90` and confirmed the panel updated exactly: `PEN`, `0.62`, `24° / -12°`, `90°`, `0.000` (first sample, no prior point for velocity), `0` (screenshotted).

## D. Full-screen drawing behavior

All four items were already satisfied by existing code (traced, not modified):

- **No page-scroll during Pencil drawing**: `overflow: hidden` on `html`/`body`/`#app` + canvas `touch-action: none` (see B above) — both already present.
- **No unexpected browser-zoom during a stroke**: same `touch-action: none` scoping — a gesture that starts on the canvas can't be reinterpreted as pinch-zoom by Safari, since the canvas itself opts out of native touch gesture handling.
- **Pointer capture retained where supported**: `main.ts` calls `setPointerCapture`/`hasPointerCapture`/`releasePointerCapture` around its pan gesture (guarded, standard Pointer Events API — supported in Safari since iOS 13).
- **Finger vs. Pencil distinguished**: `NormalizedPointerSample.isPencil` (`pointerType === "pen"`) and `.isTouch` (`pointerType === "touch"`) are already computed for every sample and shown live in the diagnostics panel's pointerType readout. **Not fixed, flagged as a manual test item**: the app does not currently branch on this distinction to reject finger/palm input from painting — a finger touch on the canvas draws exactly like a Pencil touch would. Changing that would be an interaction-model change (e.g. palm rejection), well beyond "smallest necessary" for a LAN-access pass, so it's left for the physical checklist below to surface rather than silently fixed or silently ignored.
- **No duplicate paint from coalesced samples**: `coalescedCount` is computed and shown for diagnostic purposes ONLY — `main.ts`'s actual deposition path never calls `getCoalescedEvents()` or iterates coalesced sub-samples for painting, so there is no mechanism by which processing them could duplicate paint. Confirmed by reading every call site of `getCoalescedEvents` in the codebase (one: `PencilInput.ts`'s diagnostic-only `coalescedCount` field).

## F. Verification (from the Mac, this environment)

- Started the server with the new LAN-accessible command (`npx vite --port 5196`, and separately confirmed via this session's own `spatial-spraypaint` dev-server config on port 5195).
- LAN address/port it listened on: `192.168.1.111:5195` (also `192.168.1.111:5196` for the ad hoc test instance) — read live from Vite's own startup output, never hard-coded.
- `localhost` verified still working: `curl http://localhost:5196/` → `200`; the app also loads and functions normally in this session's own browser pane at `http://localhost:5195`, screenshotted.
- **This environment cannot physically reach an iPad** — this sandboxed session has no access to a real iPad or any device on the Mac's physical LAN beyond what `curl` from the same host can confirm. The LAN URL's reachability from another device on the same Wi-Fi network could not be tested end-to-end from here; the checklist below is for the user to run on the actual iPad.

## Physical iPad Test Checklist

1. Confirm the iPad is on the **same Wi-Fi network** as the Mac (not a guest network, not cellular).
2. On the Mac, run `npm run dev` inside `prototypes/spatial-spraypaint`, note the `➜ Network:` URL it prints.
3. On the iPad, open Safari and type that exact URL (e.g. `http://192.168.1.111:5195/`).
4. Confirm the app loads and the canvas renders (matches what you see on the Mac's `localhost` tab).
5. Select a real cap (Pink Dot Fat or New York Fat) from the normal cap picker.
6. Draw a stroke with Apple Pencil — confirm ink follows the Pencil tip with no lag/offset, and the page never scrolls or zooms mid-stroke.
7. Open Settings → Input → enable "Pencil diagnostics." Draw again and confirm Pressure/Tilt/Twist/Velocity/Coalesced values change live and look plausible (pressure 0-1, tilt within roughly ±90°).
8. Rest a palm on the glass near the Pencil tip while drawing — note whether it also paints (expected: yes, currently unguarded — see D above; not a bug, a known behavior to be aware of).
9. Open Brush Studio (tap "Edit Brush →") — confirm the cap list and Flair Mode dropdown are usable by tap, and the native mode picker wheel appears correctly.
10. Try the optional hand-tracking toggle — expect it to fail to start camera access on the LAN `http://` URL (see B's known limitation); this is expected, not a new bug.

## Deliverable Summary

1. **Files changed**: `prototypes/spatial-spraypaint/vite.config.ts` only.
2. **Exact launch command**: `npm run dev` (from `prototypes/spatial-spraypaint`).
3. **URL for iPad Safari**: whatever `➜ Network:` line the terminal prints at startup, e.g. `http://192.168.1.111:5195/` (address varies by network — always read it fresh).
4. **Firewall/macOS prompt to expect**: the first time a `node`/`vite` process binds to all interfaces and accepts an incoming connection, macOS's own firewall (System Settings → Network → Firewall, if enabled) may show "Do you want the application 'node' to accept incoming network connections?" — click **Allow**. If the firewall is off, no prompt appears.
5. **Known Safari/iPad limitations**: hand-tracking (camera-based "spatial" input) will not start over a plain LAN `http://` URL — `getUserMedia` requires a secure context (`https:` or `localhost`), out of scope to fix here (see E). Finger touches are not currently distinguished from Pencil for drawing purposes (no palm rejection) — see D.
6. **Pencil diagnostic steps**: Settings → Input → check "Pencil diagnostics" → draw with Pencil → panel shows live pointerType/pressure/tilt/twist/velocity/coalesced values.
7. **Commit hash**: (pending — see next commit)
