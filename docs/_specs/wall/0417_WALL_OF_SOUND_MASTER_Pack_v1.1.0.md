---
layout: spec
title: "MASTER Pack"
date: 2026-04-17
doc_id: "0417_WALL_OF_SOUND_MASTER_Pack_v1.1.0"
version: "1.1.0"
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

# 0417_WALL_OF_SOUND_MASTER_Pack_v1.1.0

## Scope
main.js only

## Includes
- Stability Pack (mute, fallback, duplication, guide surfaces)
- Text System (in-canvas multiline + annotation/sound modes)

---

# PART 1 — STABILITY FIXES

## 1. Mute System (Hard Gate)

Ensure all sound paths check:

if (sourceObject?.behavior?.isMuted) return;
if (sourceObject?.sound?.enabled === false) return;

Normalize:
behavior.isMuted = !!behavior.isMuted;

---

## 2. Silent Guide Surfaces

Add:
sound.enabled = true

Gate:
if (obj.sound?.enabled === false) return;

Optional:
mechanicType = "guide"

---

## 3. Fallback Control

Add to state:

state.audio.fallbackMode = "nearest"; // or "strict"

Strict mode:

if (!sampleMap[noteClass]) return;

Nearest mode:
(keep existing nearest-bank fallback)

---

## 4. Sample Visibility (Debug)

Add log:

console.log("PLAY NOTE", {
  note,
  noteClass,
  resolvedClass,
  fallbackMode: state.audio.fallbackMode,
  sampleCount: bank ? bank.length : 0
});

---

## 5. Duplicate Preservation

When duplicating:

newObj.note = original.note;
newObj.sound = clone(original.sound);
newObj.behavior = clone(original.behavior);

DO NOT use state.defaults.note

---

# PART 2 — TEXT SYSTEM

## Text Object

{
  type: "text",
  x,
  y,
  lines: [],
  mode: "annotation", // or "sound"
  note,
  sound
}

---

## State

state.ui.textEditing = {
  active: false,
  x: 0,
  y: 0,
  lines: [""],
  caretLine: 0,
  caretChar: 0
};

---

## Start Editing

On canvas click:

state.ui.textEditing.active = true;
state.ui.textEditing.x = mouseX;
state.ui.textEditing.y = mouseY;

---

## Controls

Enter → new line  
Backspace → delete  
Cmd/Ctrl + Enter → commit  
Esc → cancel  

---

## Commit

function createTextObjectFromEditor() {
  const e = state.ui.textEditing;

  addObject({
    type: "text",
    x: e.x,
    y: e.y,
    lines: [...e.lines],
    mode: "annotation",
    note: state.defaults.note,
    sound: null
  });
}

---

## Rendering

const lineHeight = 18;

text.lines.forEach((line, i) => {
  ctx.fillText(line, text.x, text.y + i * lineHeight);
});

---

## Caret

Draw caret using ctx.measureText

---

## Mode Behavior

Annotation:

if (obj.type === "text" && obj.mode === "annotation") return;

Sound:
- participates in collision
- triggers note

---

## Visual

Annotation:
- low opacity

Sound:
- full color
- reacts to hits

---

# RESULT

- Stable sampler behavior
- Predictable mute + silent ramps
- Reliable duplication
- In-world text authoring
- Multiline support
- Text as annotation + instrument

---

## Implementation Guide

- Where: main.js
- Run: reload and test emitters, mute, fallback modes, text tool
- Expect: stable instrument workflow + in-canvas text system
