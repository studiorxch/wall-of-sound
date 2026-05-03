---
layout: spec
title: "UI Clarity Sampler Inspector"
date: 2026-04-17
doc_id: "0417_UI_Clarity_Sampler_Inspector_v1.0.0"
version: "1.0.0"
project: "Wall of Sound"
domain: "wall"
system: "WOS"
component: "ui"
type: "legacy-spec"
status: "needs-review"
priority: "medium"
risk: "unknown"
summary: "Imported legacy Wall of Sound spec. Needs review."
---

# 0417_UI_Clarity_Sampler_Inspector_v1.0.0

## Scope
main.js only (UI + state sync)
NO new systems
NO refactors of audio/engine

---

## Goal
Fix UI clarity and trust by:

- Syncing inspector with selected object
- Separating object vs sampler concerns
- Making sample usage visible
- Labeling note/color system clearly

---

# PART 1 — INSPECTOR SYNC (CRITICAL)

## Problem
Selecting objects does NOT update:
- color swatch
- note selection
- mute state

## Fix

On object select:

function syncInspectorToObject(obj) {
  if (!obj) return;

  state.defaults.note = obj.note;
  state.ui.selectedNoteClass = obj.note % 12;

  state.ui.selectedColor = obj.color;

  state.ui.isMuted = !!obj.behavior?.isMuted;
}

Call this in:
- selection handler
- click selection
- duplicate select

---

## Color Swatch Sync

When object selected:

setColorSwatch(obj.color);
highlightNoteCell(obj.note % 12);

---

# PART 2 — SAMPLER TAB (SEPARATION)

## Problem
"NOTE" section is inside Object tab → confusing

## Fix

Move sampler UI into:

UI Tabs:
- Object
- Canvas
- World
- Sampler  <-- NEW

---

## Sampler Tab Contents

- 12 keys (C → B)
- sample count per key
- solo toggle
- fallback mode display

---

# PART 3 — SAMPLE VISIBILITY

## Add helper

function getSampleCount(noteClass) {
  const bank = sampleMap[noteClass];
  return bank ? bank.length : 0;
}

---

## Render counts

Each key displays:

C   (2)
C#  (0)
D   (1)

---

## Optional highlight

If fallback used:

if (noteClass !== resolvedClass) {
  drawDimmedKey(noteClass);
}

---

# PART 4 — SOLO CONTROL UI

## State (already exists)

state.audio.soloNoteClass = null;

---

## UI behavior

Click key:

state.audio.soloNoteClass =
  state.audio.soloNoteClass === noteClass ? null : noteClass;

---

## Visual

- active key = bright
- others = dim

---

# PART 5 — COLOR LABELING

## Problem
Colors are abstract → must map mentally

## Fix

Add labels:

[C] [C#] [D] [D#] [E] ...

---

## Implementation

const NOTE_LABELS = [
  "C","C#","D","D#","E",
  "F","F#","G","G#","A","A#","B"
];

Render label under swatch.

---

# PART 6 — OBJECT VS SAMPLER SPLIT

## Object Tab shows ONLY:

- note
- color
- behavior
- mechanic
- mute
- sound.enabled
- motion

---

## Sampler Tab shows ONLY:

- sample banks
- key counts
- solo
- fallbackMode

---

# RESULT

- Inspector reflects selected object instantly
- Color always matches actual note
- Sample ownership is visible
- No more blind sample behavior
- Sampler logic separated from object editing

---

## Implementation Guide

- Where: main.js
- Run: reload → select objects → verify inspector updates
- Expect:
  - color swatch updates on selection
  - note highlights correctly
  - sampler tab shows counts per key
  - solo key isolates playback
