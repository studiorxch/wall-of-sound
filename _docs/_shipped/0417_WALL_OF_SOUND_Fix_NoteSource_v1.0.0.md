# 0417_WALL_OF_SOUND_Fix_NoteSource_v1.0.0

## Scope
Single-file update: `main.js`  
Goal: Fix emitter note source so particles inherit the correct note (not defaulting to C)

---

## Problem

Particles are always using note 60 (C), even when lines are set to other notes.

Debug HUD confirms:
- `ball.blueprint.note = 60`
- `ball.sound.midi.note = 60`

This means the issue is at emitter spawn time, not playback.

---

## Root Cause

Emitter spawn logic is reading from:

    line.note

But the UI updates:

    line.midi.note

So the system is using a stale note source.

---

## Required Fix

### Update BOTH emitter spawn functions

---

### FIND

    const sourceNote =
      (line && typeof line.note === "number" ? line.note : null) ??
      (seg && typeof seg.note === "number" ? seg.note : null) ??
      60;

---

### REPLACE WITH

    const sourceNote =
      (line && line.midi && typeof line.midi.note === "number"
        ? line.midi.note
        : null) ??
      (seg && seg.midi && typeof seg.midi.note === "number"
        ? seg.midi.note
        : null) ??
      60;

---

## Important Notes

- Do NOT modify blueprint structure
- Do NOT modify motion logic
- Do NOT modify sample system
- Only fix note source at spawn

---

## Expected Result

- Each emitter produces correct pitch
- Debug HUD shows matching values (e.g. D#/D#)
- No more global C-note behavior

---

## Validation

1. Create multiple lines with different notes
2. Enable emitter behavior
3. Enable debug HUD:

    _wos.state.ui.debugHUD = true

4. Confirm:
   - blueprint.note matches line note
   - sound.midi.note matches blueprint.note

---

## Implementation Guide

- Where: main.js → emitter spawn logic
- Run: reload app
- Expect: emitters produce correct notes
