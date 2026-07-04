# 0620D_PLAY_BroadcastCardAndBumperPreviewPatch_v1.0.0_PATCH

## Patch Name

**PLAY Broadcast Card + Bumper Preview Patch**

## Version

`v1.0.0`

## Date

2026-06-20

## Status

Draft for implementation

---

# 1. Purpose

0620C introduced **Broadcast HUD Mode**, proving that PLAY can present playlist playback as a map-integrated, OBS-friendly music HUD.

0620D adds the next presentation layer: **Broadcast Card + Bumper Preview**.

This patch turns playlist identity into a stream-ready visual object that can be used for:

```text
playlist intro
playlist transition bumper
now-entering card
playing-next card
release/event card
schedule block card
```

Core principle:

```text
Broadcast HUD = live playback presentation.
Broadcast Card = playlist identity presentation.
```

The card/bumper is the first step toward treating playlists as stream programs, release blocks, and channel segments.

---

# 2. Product Context

Current PLAY chain:

```text
0619A — multi-playlist workspace
0619B — drag-to-playlist
0619C — fill / regenerate controls
0620A — integrity + playback safety
0620B — playlist identity
0620C — Broadcast HUD mode
```

PLAY can now:

```text
build playlist
manage playlist identity
play from browser
present as Broadcast HUD
sit over map/world visuals
```

0620D adds:

```text
present playlist identity as a 16:9 broadcast card / bumper
```

---

# 3. Patch Goal

Create a **Broadcast Card Preview** mode/component that composes:

- playlist cover image
- playlist background image
- playlist title
- description
- mood tags
- track count
- duration
- created/updated metadata if useful
- presentation variant labels like `Now Entering`, `Playing Next`, or `Live Set`

inside a 16:9 frame.

This should be previewable inside PLAY and suitable for later OBS/browser capture.

---

# 4. Scope

## Included

### A. Broadcast Card Preview Component

Create a reusable 16:9 card preview for the active playlist.

### B. Presentation Variants

Support at least:

- `Now Entering`
- `Playing Next`
- `Live Set`
- `Release Event`

### C. Visual Composition

Use playlist identity fields:

- cover image / monogram fallback
- background image / dark fallback
- accent color
- title
- description
- mood tags
- track count
- duration

### D. Preview Access

Add UI access from one of:

```text
Playlist Identity panel
Broadcast HUD / More
Top-level action if simpler
```

### E. OBS-Safe Layout

The card should be stable at 16:9, readable, and capture-friendly.

### F. Optional Bumper Timer Stub

Add optional display/control for bumper duration:

```text
5s / 10s / 15s / 30s
```

No automatic playback scheduling required.

---

# 5. Non-Goals

Do not implement in this patch:

- full scheduler
- actual automatic bumper playback between playlists
- OBS API integration
- video rendering/export
- animation timeline
- complex shader effects
- generated cover art
- generated background art
- per-track visual cards
- public share page
- cloud hosting
- audio-reactive card animation
- map scene binding beyond background display

This patch is a preview/composition foundation.

---

# 6. Broadcast Card Definition

A Broadcast Card is a 16:9 visual presentation of a playlist identity.

It answers:

```text
What program are we entering?
```

It should work as:

- a 5–10 second stream bumper
- a playlist intro
- a scene transition
- a release/event visual card
- a schedule block preview
- a future web/share card

---

# 7. Variants

Support a small variant set.

Recommended type:

```ts
export type BroadcastCardVariant =
  | "now_entering"
  | "playing_next"
  | "live_set"
  | "release_event";
```

## Variant Labels

```text
now_entering  → NOW ENTERING
playing_next  → PLAYING NEXT
live_set      → LIVE SET
release_event → RELEASE EVENT
```

Variant should affect:

- eyebrow label
- optional subtitle copy
- minor layout styling only

Do not create four totally separate layouts in v1.

---

# 8. Visual Layout

Recommended 16:9 structure:

```text
┌────────────────────────────────────────────────────────────┐
│ Background image / dark fallback                           │
│ dark veil overlay                                          │
│                                                            │
│ NOW ENTERING                                               │
│                                                            │
│ [Cover Art]  Playlist Title                                │
│              Description / mood line                       │
│              tags / duration / track count                 │
│                                                            │
│                                      PLAY / WOS / channel   │
└────────────────────────────────────────────────────────────┘
```

Alternative layout acceptable if cleaner:

```text
Cover large left
Text right
Background full frame
Accent line / HUD frame
```

---

# 9. Required Visual Elements

## Playlist Cover

Show:

- cover image if available
- monogram fallback if not

## Background

Use:

1. playlist background image if available
2. blurred/expanded cover image if feasible
3. dark fallback if no image

## Text

Show:

- variant label
- playlist title
- description if present
- mood tags if present
- track count + total duration
- optional created/updated date

## Branding

Small label acceptable:

```text
PLAY
```

or:

```text
PLAY / WOS
```

Do not overbrand.

---

# 10. Background Rules

A background should never destroy readability.

Required:

- dark veil layer
- text shadow or contrast-safe text panel
- graceful fallback when image fails
- no layout collapse on broken image

Optional:

- blur background
- subtle grid/noise overlay
- accent color wash

---

# 11. Accent Color

Use playlist `accentColor` for:

- edge line
- cover border
- status label
- HUD frame
- selected highlight

Do not make entire card unreadable with the accent color.

---

# 12. Mood Tags

Render mood tags as small chips or inline labels.

Example:

```text
urban · map · night · lofi · transit
```

If no tags exist, hide tag row.

---

# 13. Duration + Track Count

Show readable metadata:

```text
22 tracks · 1h19m
```

If target duration exists and differs:

```text
22 tracks · 1h19m · target 2h00m
```

Keep it compact.

---

# 14. Preview UI

Add a way to preview the card.

Recommended:

```text
Identity Panel → Broadcast Preview
```

Inside the preview:

- variant selector
- 16:9 card preview
- background source preview
- optional bumper duration selector

Possible controls:

```text
Variant: Now Entering / Playing Next / Live Set / Release Event
Duration: 5s / 10s / 15s / 30s
Background: Playlist / Cover Blur / Dark
```

If this is too much, implement only variant selector and card preview.

---

# 15. Fullscreen / OBS Preview

Optional but useful:

```text
Open Fullscreen Preview
```

or:

```text
Open Bumper Preview
```

This can simply expand the card to full available viewport.

No separate window required unless easy.

Requirements:

- 16:9 preserved
- no scrollbars in fullscreen preview
- readable at 1920x1080 capture

---

# 16. Data / State

Add optional card preferences.

Recommended type:

```ts
export type BroadcastCardPrefs = {
  variant?: BroadcastCardVariant;
  bumperDurationSeconds?: number;
  backgroundSource?: "playlist" | "cover_blur" | "dark";
  showDescription?: boolean;
  showMoodTags?: boolean;
  showStats?: boolean;
};
```

Where to store:

```ts
playlist.broadcastIdentity.cardPrefs
```

or:

```ts
playlist.broadcastCardPrefs
```

Use whichever is least disruptive.

If persistent settings are too much, keep preview variant as local UI state for v1.

---

# 17. Component Plan

Possible new components:

```text
BroadcastCardPreview.tsx
BroadcastCardControls.tsx
BroadcastCardFullscreen.tsx
```

Possible helper:

```text
broadcastCardTypes.ts
```

Likely reuse:

- playlist identity data from 0620B
- duration formatting helpers
- cover/monogram rendering
- mood tag rendering
- accent color styles

---

# 18. Interaction Rules

- Previewing card must not mutate playlist tracks.
- Changing variant should not affect playback.
- Changing bumper duration should not affect playlist duration.
- Card preview should be safe while playback is running.
- Card preview should not enter Broadcast HUD unless user chooses that mode separately.

---

# 19. Export / Capture

No rendered video export required.

Optional:

- copy card metadata to clipboard
- screenshot/export PNG only if trivial

Do not block v1 on image export.

OBS/browser capture is the practical output for now.

---

# 20. Acceptance Criteria

## Card Preview

- Active playlist can show a 16:9 broadcast card preview.
- Card uses cover image or monogram fallback.
- Card uses background image or dark fallback.
- Card shows playlist title.
- Card shows description if present.
- Card shows mood tags if present.
- Card shows track count + duration.
- Accent color is visible but not overwhelming.

## Variants

- User can switch between at least two variants.
- Preferred: all four variants are available.
- Variant label changes correctly.
- Variant switch does not mutate playlist content.

## Identity Integration

- Updating cover/description/tags in Identity panel updates preview.
- Reload preserves identity fields used by preview.
- Backup JSON includes identity fields.

## OBS Suitability

- Preview remains 16:9.
- Fullscreen/large preview is legible.
- No unexpected scrollbars.
- Broken images do not crash layout.

## No Regressions

- Broadcast HUD still works.
- Flow-Curve editor still works.
- Playlist identity panel still works.
- Playback still works.
- Drag-to-playlist still works.
- Fill/regenerate still work.

---

# 21. Manual Test Plan

## Test 1 — Basic Card

1. Select playlist.
2. Add title, description, cover, background, mood tags.
3. Open Broadcast Preview.
4. Confirm 16:9 card renders.

Expected:

```text
Playlist looks like a broadcast-ready identity card.
```

## Test 2 — Variant Switching

1. Switch variant to `Now Entering`.
2. Switch to `Playing Next`.
3. Switch to `Live Set`.
4. Switch to `Release Event`.

Expected:

```text
Eyebrow label changes without breaking layout.
```

## Test 3 — Missing Images

1. Clear cover image.
2. Clear background image.
3. Open preview.

Expected:

```text
Monogram and dark fallback render cleanly.
```

## Test 4 — Broken Image URL

1. Add invalid cover URL.
2. Add invalid background URL.
3. Open preview.

Expected:

```text
Fallback appears. No crash.
```

## Test 5 — Fullscreen / OBS

1. Open card preview large/fullscreen.
2. Capture with OBS or browser capture.
3. Confirm no scrollbars and clean 16:9 framing.

Expected:

```text
Card can be used as a simple stream bumper.
```

## Test 6 — Live Playback Safety

1. Start playback.
2. Open card preview.
3. Switch variants.
4. Return to Broadcast HUD.

Expected:

```text
Playback state remains stable.
```

---

# 22. Implementation Order

Recommended:

```text
1. Add BroadcastCardVariant type
2. Build BroadcastCardPreview component
3. Wire playlist identity into card
4. Add preview entry point from Identity panel
5. Add variant selector
6. Add 16:9 CSS frame
7. Add broken-image fallback
8. Add optional fullscreen preview
9. Test OBS capture
```

---

# 23. Claude / Codex Notes

Keep this patch small and visual.

Do not build scheduler logic.

Do not create animation timelines.

Do not attempt export-to-video.

Do not build audio reactivity yet.

The goal is to make the playlist identity visible as a broadcast object.

---

# 24. Product Principle

```text
PLAYLIST turns playlists into programmable broadcast channels.
```

0620D adds the first stream-ready identity card:

```text
playlist → visual card
playlist → bumper
playlist → release/event object
playlist → future schedule block
```

---

# 25. Future Follow-Up

Natural next patches after this:

```text
0620E_PLAY_NowNextQueuePanelPatch_v1.0.0_PATCH
0620F_PLAY_AudioReactiveHUDSignalsPatch_v1.0.0_PATCH
0620G_PLAY_PlaylistScheduleBlockPatch_v1.0.0_PATCH
0620H_PLAY_BroadcastScenePackagePatch_v1.0.0_PATCH
```
