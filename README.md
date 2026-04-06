# Sonic Canvas

A visual system for generating music through motion, collision, and form.

---

## Overview

Sonic Canvas is a playable canvas where shapes, agents, and motion produce sound.

Instead of sequencing notes on a timeline, Sonic Canvas lets you:

- draw structures
- release motion (balls / agents)
- generate rhythm through interaction

Sound is not placed — it emerges.

---

## Directory Structure

sonic-canvas
├── engine
│   ├── collision.js
│   ├── lineSystem.js
│   ├── physics.js
│   ├── swarm.js
│   └── textSystem.js
├── index.html
├── main.js
├── midi
│   └── midiOut.js
├── README.md
├── render
│   └── canvasRenderer.js
├── state
│   ├── examplePreset.js
│   └── sceneManager.js
├── styles.css
└── ui
├── controls.js
├── drawTools.js
└── svgImporter.js

---

## Core Idea

Each movement in space creates a sonic event.

form → motion → collision → sound → loop

- Geometry defines timing
- Motion defines variation
- Collisions trigger sound

---

## Modes (Current Direction)

### Draw Mode

Create shapes that act as rhythm structures.

- freehand drawing (with smoothing)
- shape / glyph library (loops, zig-zags, forms)
- note → color mapping

---

### Motion Mode

Agents (balls / particles) move through space and generate sound.

- continuous motion
- emergent rhythm
- organic timing

---

### Hybrid (Emerging)

Motion interacts with drawn structures.

agents + geometry = controlled emergence

---

## Features

### Sound System

- MIDI / audio triggered by collision
- note mapped visually to color
- supports microsound + rhythmic systems

---

### Loop System

- BPM-based timing
- bar-based recording (8 / 16 / 32)
- quantized start
- instant loop playback

---

### Export

- video export (.webm)
- audio export (.wav)
- scene export (.json)
- image export (.png)

---

### Playable Canvas

- freehand drawing (smoothed)
- direct manipulation (move / scale / rotate)
- glyph-based structures instead of traditional typography
- shape presets for fast composition

---

## Philosophy

Sonic Canvas is not a DAW.  
Sonic Canvas is not a visualizer.

It is a system where:

each movement of form creates its own pattern of sound

Inspired by early sci-fi concepts of visible sound structures,  
but built as an interactive, generative instrument.

---

## Current Focus

This project is actively evolving.

Priority:

- playable interaction (drawing, placement, timing)
- loop generation
- export pipeline

Not yet prioritized:

- advanced editing tools
- UI polish
- deep customization

---

## Usage (Current)

1. Draw or place shapes
2. Assign notes (auto color)
3. Add motion (balls / agents)
4. Press record
5. Capture loop
6. Export or continue

---

## Tech Notes

- Canvas-based rendering
- Collision-driven event system
- Web Audio / MIDI integration
- MediaRecorder for export

---

## Status

Experimental / In Progress

A live system under active iteration focused on:

- interaction feel
- emergent behavior
- musical output

---

## Direction

Sonic Canvas is evolving into:

- a visual instrument
- a loop generator
- a shareable content system

---

## License

(TBD)

---

## StudioRich

Built as part of the StudioRich system:

Sound, motion, and structure as shared infrastructure.

---

## One Line

Draw something.  
Watch it move.  
It makes music.
