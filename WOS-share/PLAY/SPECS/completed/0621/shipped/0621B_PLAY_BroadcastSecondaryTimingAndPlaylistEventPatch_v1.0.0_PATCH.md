# 0621B_PLAY_BroadcastSecondaryTimingAndPlaylistEventPatch_v1.0.0_PATCH

## Project

**PLAY / PLAYLIST**

## Patch Type

Broadcast HUD behavior patch

## Status

Draft / ready for Claude or Codex implementation

## Purpose

0621A successfully moved Broadcast HUD away from permanent dashboard behavior and into a mood-first broadcast surface with optional operator layers.

0621B should make the new secondary layer behave like a real broadcast interruption system instead of a manual debug panel.

The main correction:

```text
Broadcast HUD should idle as atmosphere.
Secondary information should appear temporarily, explain what is playing or coming next, then disappear.
```

## Product Lock

Preserve this hierarchy:

```text
Main surface      = playlist mood / world / background
Secondary layer   = temporary broadcast information
Operator layer    = compact controls
Editor            = analysis
Broadcast HUD     = mood + playback state
Broadcast Card    = identity
Grid Layer        = optional broadcast composition system
```

Do not reopen the chart-led HUD direction.

Do not restore the permanent queue rail.

---

# Current State From 0621A

0621A shipped:

- `BroadcastGridLayer`
  - passive SVG grid overlay
  - 4×6 default
  - registration crosshairs at intersections
  - corner brackets
  - `pointer-events: none`
  - off by default
  - toggled via `⊞` in header-right

- `BroadcastSecondaryLayer`
  - modes: `now_playing`, `playlist_identity`, `next_up`, `upcoming_buffet`, `none`
  - one active mode at a time
  - cycled via `—/▶/◈/→/≡` button
  - floating glass card positioning
  - atmosphere surface remains dominant

- `BroadcastHudShell`
  - permanent queue rail removed from default layout
  - atmosphere zone owns full body
  - operator controls live in header-right

- `TopBar`
  - text utility controls compressed to icon buttons
  - `Import to Library` → `⊕`
  - `Restore Project` → `↺`
  - `Backup Project` → `⬡`
  - tooltips retained

---

# Goal

Add timing, priority, and event semantics to `BroadcastSecondaryLayer`.

The layer should support both manual operator cycling and timed broadcast appearances.

The viewer should experience this as:

```text
Atmosphere / playlist world
↓
Temporary now-playing or upcoming event card
↓
Return to atmosphere
```

The system should not feel like a constant menu.

---

# Non-Goals

Do not implement these in 0621B:

- full scheduler engine
- 24-hour or 7-day calendar UI
- persistent queue rail
- FlowCurveCanvas in Broadcast HUD
- graph nodes / axes / route line / legend
- autoplay playlist switching
- external OBS control API
- AI-generated event scheduling
- full PIP layout editor
- new visual theme overhaul

---

# Required Behavior

## 1. Timed Secondary Layer Visibility

Each `BroadcastSecondaryLayer` mode should have a default display duration.

Recommended defaults:

| Mode | Duration | Purpose |
|---|---:|---|
| `now_playing` | 7s | confirm current audio |
| `playlist_identity` | 10s | reintroduce current playlist world |
| `next_up` | 8s | preview next track |
| `upcoming_buffet` | 16s | preview future playlist events |
| `none` | indefinite | atmosphere idle |

After the timer expires, the active mode should return to `none` unless the operator has pinned or manually selected a mode.

## 2. Manual Operator Cycling Remains

The existing header-right cycle control should continue working.

Current cycle:

```text
— / ▶ / ◈ / → / ≡
```

Expected behavior:

- `—` means no secondary card / atmosphere only.
- `▶` shows now playing.
- `◈` shows playlist identity.
- `→` shows next up.
- `≡` shows upcoming buffet.

Manual selection should reset the timer for that mode.

## 3. Optional Pin Behavior

Add a simple pinned state if easy and low-risk.

Suggested control:

```text
📌 or lock-style icon in operator controls
```

Pinned behavior:

- when pinned, active secondary mode does not auto-dismiss
- when unpinned, active mode resumes timed behavior
- default is unpinned

If pinning adds too much risk, defer it and keep timer reset behavior only.

## 4. Priority Order

When the system automatically chooses what to show, use this priority:

1. current track changed → `now_playing`
2. playlist changed or broadcast starts → `playlist_identity`
3. track is close to ending and next track exists → `next_up`
4. playlist block is close to ending and upcoming playlist/event data exists → `upcoming_buffet`
5. otherwise → `none`

Do not show multiple cards at once.

## 5. Track Duration Display

`now_playing` should show:

```text
track title
artist
elapsed / duration
playlist title
```

Example:

```text
NOW PLAYING
The Softest Room
StudioRich
02:14 / 05:48
A Playlist for Nappers
```

## 6. Playlist Duration Display

`playlist_identity` should show:

```text
playlist title
description or mood line
track count
total duration
```

Example:

```text
A PLAYLIST FOR NAPPERS
sleepy / warm / soft / atmospheric
22 tracks · 1h 19m
```

## 7. Next Up Display

`next_up` should show:

```text
NEXT UP
next track title
artist
duration
```

Optional:

```text
Starts in 00:42
```

If no next track exists, gracefully fall back to `none`.

## 8. Upcoming Buffet Display

`upcoming_buffet` should preview playlist or event blocks, not the whole queue rail.

It should display a small set of future attractions.

Recommended max:

```text
3 upcoming items
```

Each item should show:

```text
time or relative position
playlist / event title
duration
short mood label if available
```

Example:

```text
COMING UP
01  Dawn Ambient        42m   soft signal
02  Subway Motion       1h    transit pulse
03  Night Signal        2h    after-hours drift
```

If real schedule data does not exist yet, derive temporary items from available playlist records or mock-safe internal data only if the app already has it. Do not invent fake user-facing events from nowhere.

## 9. One Secondary Layer At A Time

Enforce this rule structurally:

```ts
type BroadcastSecondaryMode =
  | "none"
  | "now_playing"
  | "playlist_identity"
  | "next_up"
  | "upcoming_buffet";
```

There should be one `activeSecondaryMode`, not multiple booleans.

## 10. Atmosphere Must Remain Dominant

The card should stay compact and temporary.

Rules:

- no permanent side rail
- no full-height panel
- no table layout
- no scrolling card
- no graph/chart restoration
- no dense analytics
- no repeated duplicate now-playing regions

---

# Suggested Data Types

Create or update a small UI-only model if helpful.

```ts
export type BroadcastSecondaryMode =
  | "none"
  | "now_playing"
  | "playlist_identity"
  | "next_up"
  | "upcoming_buffet";

export type BroadcastSecondaryTimingConfig = Record<
  Exclude<BroadcastSecondaryMode, "none">,
  number
>;

export type BroadcastUpcomingItem = {
  itemId: string;
  title: string;
  durationSeconds?: number;
  startsInSeconds?: number;
  moodLabel?: string;
  type: "track" | "playlist" | "event";
};
```

Suggested default timing:

```ts
export const DEFAULT_SECONDARY_TIMING_MS = {
  now_playing: 7000,
  playlist_identity: 10000,
  next_up: 8000,
  upcoming_buffet: 16000,
} satisfies BroadcastSecondaryTimingConfig;
```

---

# Suggested Implementation

## `BroadcastHudShell`

Responsibilities:

- own `activeSecondaryMode`
- own optional `secondaryPinned`
- pass track / playlist / upcoming data to `BroadcastSecondaryLayer`
- reset timer on manual cycle
- auto-dismiss to `none` when timer expires and not pinned
- keep grid toggle independent from secondary mode

Pseudo-flow:

```ts
const [activeSecondaryMode, setActiveSecondaryMode] = useState<BroadcastSecondaryMode>("none");
const [secondaryPinned, setSecondaryPinned] = useState(false);

useEffect(() => {
  if (activeSecondaryMode === "none" || secondaryPinned) return;

  const timeoutMs = DEFAULT_SECONDARY_TIMING_MS[activeSecondaryMode];
  const timerId = window.setTimeout(() => {
    setActiveSecondaryMode("none");
  }, timeoutMs);

  return () => window.clearTimeout(timerId);
}, [activeSecondaryMode, secondaryPinned]);
```

## `BroadcastSecondaryLayer`

Responsibilities:

- render exactly one mode
- return `null` for `none`
- format time cleanly
- avoid null crashes when track / playlist / upcoming data is missing
- keep card compact

## `BroadcastGridLayer`

No required changes unless CSS stacking needs adjustment.

Grid remains:

- passive
- optional
- off by default
- `pointer-events: none`

## `TopBar`

No required changes unless shared icon button styles need refinement.

---

# CSS / Visual Requirements

Maintain the 0621A direction:

- atmosphere surface dominates
- card floats above mood surface
- grid remains subtle
- no competing panels
- no permanent rail

Suggested class names:

```css
.broadcast-secondary-layer
.broadcast-secondary-card
.broadcast-secondary-card--now-playing
.broadcast-secondary-card--playlist-identity
.broadcast-secondary-card--next-up
.broadcast-secondary-card--upcoming-buffet
.broadcast-secondary-kicker
.broadcast-secondary-title
.broadcast-secondary-meta
.broadcast-secondary-timer
```

Timing can be supported visually with an optional thin progress/rundown line on the card.

Do not create loud loading bars that fight the bottom playback progress bar.

---

# Acceptance Criteria

0621B passes when:

1. Broadcast HUD opens with atmosphere dominant and secondary mode set to `none` by default.
2. Operator can cycle through all secondary modes.
3. Only one secondary card is visible at a time.
4. Manual mode selection resets that mode's timer.
5. Timed modes auto-dismiss back to `none` when unpinned.
6. `now_playing` shows current track, artist, elapsed, duration, and playlist title.
7. `playlist_identity` shows playlist title, description/mood, track count, and duration.
8. `next_up` shows next track information if available and gracefully hides if unavailable.
9. `upcoming_buffet` shows no more than 3 upcoming playlist/event items.
10. Permanent queue rail does not return.
11. FlowCurveCanvas does not return to default Broadcast HUD.
12. Grid toggle still works independently.
13. TypeScript build passes.

---

# Verification Checklist

Run:

```bash
npm run build
```

Then verify in browser:

- Broadcast HUD default view is atmosphere-only.
- `⊞` toggles grid without affecting secondary card mode.
- Secondary mode button cycles `none → now_playing → playlist_identity → next_up → upcoming_buffet → none`.
- Each mode appears as a compact floating card.
- Each timed mode disappears after its configured duration.
- Missing next/upcoming data does not crash the UI.
- No chart, route line, graph nodes, axes, legend, or permanent queue rail appears in default Broadcast HUD.
- Editor Flow Curve remains available in editor mode.

---

# Do Not Reopen

- Do not restore the permanent queue rail as the default Broadcast HUD layout.
- Do not restore `FlowCurveCanvas` in default Broadcast HUD.
- Do not turn Broadcast HUD into an analytics dashboard.
- Do not make all secondary information visible at once.
- Do not make the grid interactive in this patch.
- Do not build the full scheduler before the secondary layer behavior is stable.

---

# Expected Result

After 0621B, Broadcast HUD behaves like a broadcast surface:

```text
It breathes.
It shows mood first.
It interrupts itself briefly with useful now/next/upcoming information.
It then returns to atmosphere.
```

This creates the foundation for future playlist bumpers, show transitions, schedule events, and multi-PIP broadcast grammar without reintroducing dashboard clutter.

## Implementation Guide

- **Where:** Update `src/ui/BroadcastHudShell.tsx`, `src/ui/BroadcastSecondaryLayer.tsx`, secondary-layer types/constants if present, and related rules in `src/styles.css`.
- **What:** Add timed mode auto-dismiss, duration-aware copy, next/upcoming guards, one-mode state control, and optional pin behavior; run `npm run build`.
- **Expect:** Broadcast HUD idles as atmosphere, temporarily displays one compact now/playlist/next/upcoming card, auto-dismisses back to mood, keeps grid independent, and passes TypeScript build.
