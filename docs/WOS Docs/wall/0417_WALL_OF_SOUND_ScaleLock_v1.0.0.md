---
layout: spec
title: "ScaleLock"
date: 2026-04-17
doc_id: "0417_WALL_OF_SOUND_ScaleLock_v1.0.0"
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

## Scope

main.js only

---

## Goal

Constrain all note output (emitters + collisions) to a musical scale while preserving hybrid fallback + pitch shifting.

---

## Step 1 — Add scale config to state

Locate state initialization.

Add:

state.audio = state.audio || {};

state.audio.scale = {
root: 60, // MIDI C4
type: "major", // "major", "minor", "pentatonic"
enabled: true
};

---

## Step 2 — Define scale maps

Add near top of file:

const SCALE_MAPS = {
major: [0, 2, 4, 5, 7, 9, 11],
minor: [0, 2, 3, 5, 7, 8, 10],
pentatonic: [0, 2, 4, 7, 9]
};

---

## Step 3 — Add quantizeToScale()

function quantizeToScale(note, root, scaleType) {
const scale = SCALE_MAPS[scaleType];
if (!scale) return note;

    const offset = note - root;
    const octave = Math.floor(offset / 12) * 12;
    const noteInOctave = offset % 12;

    let closest = scale[0];
    let minDist = Math.abs(noteInOctave - scale[0]);

    for (let i = 1; i < scale.length; i++) {
        const dist = Math.abs(noteInOctave - scale[i]);
        if (dist < minDist) {
            minDist = dist;
            closest = scale[i];
        }
    }

    return root + octave + closest;

}

---

## Step 4 — Apply BEFORE playback

Find where note is finalized before playbackRate is calculated.

Insert:

if (state.audio.scale?.enabled) {
note = quantizeToScale(
note,
state.audio.scale.root,
state.audio.scale.type
);
}

---

## Step 5 — DO NOT modify fallback logic

Keep:

- sampleMap lookup
- nearest-bank fallback
- playbackRate pitch shifting

UNCHANGED

---

## Expected Result

- All notes snap to musical scale
- Fallback still works
- Pitch shifting still works
- Waterfall patterns become harmonic sequences
