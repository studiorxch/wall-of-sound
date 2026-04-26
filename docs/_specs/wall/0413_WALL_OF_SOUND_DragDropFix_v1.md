---
layout: spec
title: "DragDropFix"
date: 2026-04-13
doc_id: "0413_WALL_OF_SOUND_DragDropFix_v1"
version: "1.0.0"
project: "Wall of Sound"
domain: "wall"
system: "WOS"
component: "audio_system"
type: "legacy-spec"
status: "needs-review"
priority: "medium"
risk: "unknown"
summary: "Imported legacy Wall of Sound spec. Needs review."
---

# 0413_WALL_OF_SOUND_DragDropFix_v1.0.0

## Context

The current system technically supports drag-and-drop audio loading into `sampleMap`, but:

- There is **no visible drop zone**
- Dragging files gives **no feedback**
- Users cannot tell where to drop
- Drops sometimes fail due to improper event targeting
- No UI exists to confirm samples were loaded
- No per-note assignment clarity

Result:

> Feature exists in code, but is functionally invisible and unreliable.

---

## Goal

Create a **clear, reliable, visible drag-and-drop system** that:

- Always accepts audio files
- Clearly shows where to drop
- Provides immediate feedback
- Assigns samples to the active note
- Works across the entire canvas area
- Prevents silent failure

---

## Requirements

### 1. Global Drop Zone Overlay

Create a full-screen drop overlay:

- Appears when user drags files into window
- Covers entire viewport
- Displays message:

```
DROP AUDIO FILES HERE
(Assigned to current note)
```

- Uses semi-transparent dark background
- Disappears on drop or drag leave

---

### 2. Reliable Drag Events (CRITICAL FIX)

Current issue:
Drag events attached to `document.body` are inconsistent.

### Replace with:

```js
window.addEventListener("dragenter", showOverlay);
window.addEventListener("dragover", handleDragOver);
window.addEventListener("dragleave", hideOverlay);
window.addEventListener("drop", handleDrop);
```

### Required behavior:

- `dragover` MUST call `e.preventDefault()`
- Without this → drop will NEVER fire

---

### 3. Drop Handler (Rewrite)

Replace existing drop logic with:

```js
async function handleDrop(e) {
  e.preventDefault();
  hideOverlay();

  const files = [...e.dataTransfer.files];
  if (!files.length) return;

  const ctx = ensureAudioContext();
  if (!ctx) return;

  if (ctx.state !== "running") {
    await ctx.resume();
  }

  const note = state.defaults.note || 60;
  const noteClass = note % 12;

  let loaded = 0;

  for (const file of files) {
    if (!file.type.includes("audio")) continue;

    try {
      const buffer = await file.arrayBuffer();
      const decoded = await ctx.decodeAudioData(buffer);

      if (sampleMap[noteClass].length >= 3) {
        sampleMap[noteClass].shift();
      }

      sampleMap[noteClass].push(decoded);
      loaded++;
    } catch (err) {
      console.warn("Failed to decode:", file.name);
    }
  }

  saveSamples();

  showToast(`Loaded ${loaded} sample(s) → ${NOTE_NAMES[noteClass]}`);
}
```

---

### 4. Visual Feedback System

Add:

### A. Toast Notification

Small UI popup:

```
Loaded 3 samples → C
```

### B. HUD Update

Already exists but enhance:

```
Samples: READY (3 on C)
```

---

### 5. Drop Zone UI Element

Add to `index.html`:

```html
<div id="drop-overlay" class="hidden">
  <div class="drop-message">
    DROP AUDIO FILES HERE
    <br />
    <span>Assigned to current note</span>
  </div>
</div>
```

---

### 6. CSS

```css
#drop-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.75);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

#drop-overlay.hidden {
  display: none;
}

.drop-message {
  color: white;
  font-size: 24px;
  text-align: center;
  font-family: monospace;
  opacity: 0.9;
}
```

---

### 7. Overlay Control

```js
const overlay = document.getElementById("drop-overlay");

function showOverlay() {
  overlay.classList.remove("hidden");
}

function hideOverlay() {
  overlay.classList.add("hidden");
}
```

---

### 8. CRITICAL UX ADDITION

Add instruction to UI:

```
[ Drag samples onto screen to load sounds ]
```

Place:

- top-left HUD OR
- under note selector

---

## Error Handling

Must handle:

- Non-audio files → ignore
- Decode failures → warn only
- Empty drop → ignore
- AudioContext locked → resume safely

---

## Expected Result

After implementation:

- User drags files → overlay appears
- User drops files → samples load instantly
- Toast confirms success
- Sounds play on collision immediately

---

## Implementation Guide

**where**

- index.html (overlay UI)
- main.js (event + drop logic)
- styles.css (overlay styling)

**run**

- drag `.wav` or `.mp3` onto screen

**expect**

- overlay appears
- samples load
- collisions produce sound immediately
