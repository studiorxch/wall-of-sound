# 0624W_PLAY_TABToggleControlsAndRestoreStudioButtonHotfix_v1.0.0_PATCH

## Status

Ready for implementation.

## Priority

P0 / Restore Control Access

This patch fixes the current Broadcast HUD control regression.

The required behavior is simple:

```text
1. Controls must be available.
2. TAB toggles controls on/off.
3. Only the working controls should remain on the board.
4. Studio / Canvas access must be restored.
5. Show/clean view must not destroy access to controls.
```

No more global hiding of controls.

No more moving required controls out of reach.

No more treating Canvas as the only control fallback.

---

## Active Project Paths

```text
WOS root:
  /Users/studio/Projects/wall-of-sound

PLAY root:
  /Users/studio/Projects/wall-of-sound/play

PLAY app:
  /Users/studio/Projects/wall-of-sound/play/flow-curve-builder

PLAY source:
  /Users/studio/Projects/wall-of-sound/play/flow-curve-builder/src
```

Do not use:

```text
/Users/studio/Projects/play
```

That path is legacy/inactive.

---

## Current Problem

Recent patches overcorrected by hiding controls globally.

Current failure:

```text
the map surface is clean
but required controls are missing or unavailable
the Studio / Canvas button was lost
the interface is not operable
```

Correct behavior:

```text
Operate = controls visible and usable
TAB = hide/show controls
Show = clean state, but TAB can restore controls
Studio / Canvas = always reachable
```

---

## Product Rule

Controls are not decoration.

Required controls must stay accessible.

The control surface should be minimal, but not missing.

---

## Required Control Model

### Default

Broadcast HUD should open with controls visible.

```text
controlsVisible = true
```

### TAB key

TAB toggles control visibility.

```text
TAB pressed:
  controlsVisible = !controlsVisible
```

Behavior:

```text
controls visible → TAB hides controls
controls hidden → TAB restores controls
```

TAB must work in both Operate and Show contexts.

Prevent browser focus weirdness only if needed:

```ts
event.preventDefault()
```

but do not break typing in input fields.

If an input/textarea/contenteditable is focused, do not hijack TAB.

---

## Required Visible Controls

Keep only working controls on the board.

Current user note:

```text
there are only two buttons on that interface that work
```

Therefore:

```text
keep the two working route/control buttons
remove or hide broken/nonfunctional controls
```

Do not expose buttons that do nothing.

If the working controls are:

```text
Operate
Launch / Play
```

keep those.

If the working controls are:

```text
Drive
Launch
```

keep those.

Use actual working state from code/testing.

---

## Restore Studio / Canvas Button

Restore the lost Studio / Canvas access button.

Required label:

```text
Studio ↗
```

or if current naming uses Canvas:

```text
Canvas ↗
```

Preferred if both are meaningful:

```text
Studio ↗
```

Behavior:

```text
opens full WOS/Studio/Canvas control view
does not replace Broadcast HUD
opens in new tab if that is current behavior
```

Acceptance:

```text
Studio/Canvas button is always visible when controlsVisible = true
```

Do not remove this button again.

---

## WOS Controls Visibility

Do not hide WOS `#wos-nav` globally.

Instead, connect it to control visibility.

Required:

```text
controlsVisible = true  → show minimal working WOS controls
controlsVisible = false → hide WOS controls
```

If WOS embed CSS is controlled by body classes or query params, use a class bridge.

Suggested class model:

```text
body.wos-embed.controls-visible #wos-nav {
  display: flex !important;
}

body.wos-embed.controls-hidden #wos-nav {
  display: none !important;
}
```

If PLAY cannot directly set WOS body class because it is inside iframe, use query/state messaging or URL param reload only if already available.

Preferred simpler approach:

```text
keep #wos-nav visible in Operate by default
hide it only when TAB toggles controls off
```

---

## PLAY Controls Visibility

PLAY-side controls should also follow the same flag:

```text
controlsVisible = true:
  show operator toolbar
  show Studio/Canvas button
  show route/play controls

controlsVisible = false:
  hide operator toolbar
  keep typed overlay and micrographics
  keep map interactive
  show a tiny "TAB = controls" hint only if needed
```

Do not create a new Capture Mode.

This is only a controls visibility toggle.

---

## Map Interaction

Map interaction must remain working in both states.

Required:

```text
controls visible:
  map pans/zooms outside controls
  controls click

controls hidden:
  map pans/zooms
```

Overlays remain:

```text
pointer-events: none
```

except actual controls.

---

## Top Toolbar

The Broadcast top/operator toolbar should be minimal.

Suggested visible set:

```text
Operate | Show | Snapshot | ▶ | Routes: Live | Studio ↗
```

But if only two route buttons work, the route section should show only the working buttons.

Do not clutter the toolbar with broken controls.

---

## Show Mode Relationship

Show mode can be clean, but it must not trap the user.

Required:

```text
Show may set controlsVisible = false
TAB restores controls
Operate may set controlsVisible = true
```

But do not force controls to stay hidden.

---

## Do Not Reintroduce

Do not bring back:

```text
Capture Mode
Still Mode
Freeze
16:9 frame
Exit Capture
fake route line
signal dot
dark haze
bottom dock
emoji icons
right Mapbox controls
telemetry flood
broken nonfunctional buttons
```

---

## Implementation Targets

Likely PLAY files:

```text
src/ui/BroadcastHudShell.tsx
src/ui/BroadcastOperatorOverlay.tsx
src/ui/TypedTrackIndexOverlay.tsx
src/ui/BroadcastMicrographicsGrid.tsx
src/styles.css
```

Likely WOS/embed files:

```text
wall/index.html
wall/styles.css
wall/traversalControlDeck.js
```

Use actual repo names.

---

## Required Implementation Steps

### 1. Add controlsVisible state

In Broadcast HUD shell:

```ts
const [controlsVisible, setControlsVisible] = useState(true);
```

### 2. Add TAB handler

```ts
useEffect(() => {
  function onKeyDown(event: KeyboardEvent) {
    const target = event.target as HTMLElement | null;
    const isTyping =
      target?.tagName === "INPUT" ||
      target?.tagName === "TEXTAREA" ||
      target?.isContentEditable;

    if (isTyping) return;

    if (event.key === "Tab") {
      event.preventDefault();
      setControlsVisible((value) => !value);
    }
  }

  window.addEventListener("keydown", onKeyDown);
  return () => window.removeEventListener("keydown", onKeyDown);
}, []);
```

Adjust to project style.

### 3. Wire CSS class

Apply class:

```text
hud-controls-visible
hud-controls-hidden
```

or:

```text
broadcast-controls-visible
broadcast-controls-hidden
```

### 4. Restore Studio / Canvas link

Add back to operator toolbar:

```text
Studio ↗
```

or current correct label.

### 5. Stop global WOS nav hiding

Change embed CSS from unconditional:

```css
#wos-nav { display: none !important; }
```

to controls-aware visibility.

If controls-aware iframe class cannot be reached yet, leave WOS nav visible in Operate and hide only with Show/TAB through the simplest reliable mechanism.

### 6. Remove broken controls

Audit visible controls.

If a button is not wired and not needed:

```text
hide it
```

Do not leave dead UI.

---

## Acceptance Criteria

### A. Controls visible by default

Opening Broadcast HUD shows usable controls.

---

### B. TAB hides controls

Pressing TAB hides the control UI.

---

### C. TAB restores controls

Pressing TAB again restores the control UI.

---

### D. Studio / Canvas button restored

A visible Studio/Canvas access button is back when controls are visible.

---

### E. Required route controls visible

The working route/play controls are available when controls are visible.

---

### F. Broken controls removed

Nonfunctional buttons are not shown.

---

### G. Map remains interactive

Map pan/zoom works with controls visible and hidden.

---

### H. Show does not trap controls

If Show hides controls, TAB restores them.

---

### I. No old clutter returns

Do not restore:

```text
bottom dock
capture/still/freeze/16:9
fake line/dot
haze
emoji controls
telemetry flood
```

---

### J. tsc clean

Run:

```bash
cd /Users/studio/Projects/wall-of-sound/play/flow-curve-builder
tsc -b
```

Expected:

```text
exits 0
```

If WOS files are touched, run available lightweight WOS check if one exists.

---

## Manual Test Checklist

1. Start WOS local route server.

2. Start PLAY.

```bash
cd /Users/studio/Projects/wall-of-sound/play/flow-curve-builder
npm run dev
```

3. Open Broadcast HUD.

4. Confirm controls are visible.

5. Confirm Studio/Canvas button is visible.

6. Confirm working route controls are visible.

7. Drag map outside controls.

Expected:

```text
map pans
```

8. Press TAB.

Expected:

```text
controls hide
map remains visible
typed overlay/micrographics remain
```

9. Drag map.

Expected:

```text
map pans
```

10. Press TAB again.

Expected:

```text
controls return
```

11. Click Studio/Canvas.

Expected:

```text
full control view opens
```

12. Click working route/play buttons.

Expected:

```text
buttons respond
```

13. Confirm broken buttons are not visible.

14. Switch Show.

15. Press TAB.

Expected:

```text
controls return
```

16. Run:

```bash
tsc -b
```

Expected:

```text
exits 0
```

---

## Expected Result

Broadcast HUD becomes operable again.

The user can:

```text
see controls
hide controls with TAB
restore controls with TAB
access Studio/Canvas
move the map
use the working route/play controls
```

without bringing back bottom docks, capture modes, fake overlays, or broken UI.

---

## Implementation Guide

- **Where:** Broadcast HUD shell/operator toolbar, WOS embed nav visibility CSS, Studio/Canvas link.
- **What:** Add a TAB-powered controlsVisible toggle, restore the Studio/Canvas button, keep only working controls visible, and stop hiding route controls globally.
- **Expect:** Controls stay accessible when needed and disappear only when explicitly hidden with TAB.
