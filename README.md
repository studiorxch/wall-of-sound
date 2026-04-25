# 🧱 Wall of Sound (WOS)

Wall of Sound is a physics-driven audiovisual engine where sound emerges from interaction.

Instead of composing on a timeline, WOS generates music through motion, collision, and behavior. Objects exist on a “Wall” and produce sound as they interact—turning composition into a dynamic system rather than a linear sequence.

---

## 🎯 Core Concept

WOS replaces traditional DAW sequencing with an **event-based sound system**:

- Objects move through space
- Interactions trigger sound events
- Behaviors shape motion and rhythm
- The system evolves continuously

This enables **infinite variation with structural cohesion**.

---

## 🧠 System Architecture

WOS operates across three primary layers:

### 1. Data Layer

Defines the world state.

- Objects (shapes, strokes, emitters)
- Properties (position, velocity, rotation)
- Behaviors (emission, collision, forces)

---

### 2. Logic Layer

Processes motion and interaction.

- Physics engine (delta time, damping, velocity)
- Behavior system (runs every frame)
- Collision detection and response
- Event dispatch system (eventBus)

---

### 3. Output Layer

Transforms events into sound.

- Oscillator (monitor output)
- MIDI output (Ableton / external gear)
- Future: sampler + per-object sound mapping

---

## 🔊 Audio Model

Sound is not placed—it is triggered.

- Collisions → transient events (hits, notes)
- Emitters → rhythmic generation
- Motion → modulation (velocity, density, timing)
- Groups → multi-voice coordination

The system supports:

- Loop-safe playback
- BPM alignment (external or internal clock)
- Layered generative structures

---

## 🧩 Objects

All elements on the Wall are treated as **Objects**:

- Strokes (drawn lines)
- Shapes (grouped geometry)
- Emitters (spawn particles/events)
- Particles (temporary sound carriers)

Objects can:

- Move
- Collide
- Emit
- Hold behaviors
- Trigger sound

---

## ⚙️ Behaviors

Behaviors define how objects act.

### Categories

**Emitters**

- Generate particles or events over time
- Directional control via angle/dial
- Spread, rate, and lifecycle control

**Deflectors**

- Bumper (hard / elastic)
- Rails / ramps (guided motion)

**Fields**

- Attract / repel forces within a radius

---

## 🎨 The Wall

The “Wall” is the primary system surface.

- Replaces traditional canvas metaphor
- Holds all objects and interactions
- Can scale to multiple walls (future)
- Designed for both creation and presentation

---

## 🛠 Tools

### Mop Tool (Primary)

Unified drawing + transform tool.

- Draw strokes
- Select objects
- Move / rotate / scale
- Save to shape library

Legacy tools are being phased out in favor of a unified workflow.

---

## 🔁 Playback Model

WOS runs continuously:

- Behaviors execute every frame
- Motion is time-based (deltaTime)
- Sound events are triggered dynamically
- No fixed timeline required

Supports:

- Passive (ambient playback)
- Active (interactive performance)

---

## 📦 Project Structure

/wall-of-sound
/wall # UI + rendering layer
/sound # audio + playback systems
/docs # specs and system design
index.html # main entry
main.js # core engine loop
controls.js # UI bindings

---

## 🚧 Current Focus

- Object system unification
- Behavior consistency across modes
- Stable physics timing (deltaTime scaling)
- Emitter refinement (direction + edge spawning)
- Selection and transform system

---

## 🔮 Roadmap

- Sampler integration (per-object sound)
- Shape library + reusable assets
- Multi-wall environments
- Embeddable “Capsules” (shareable scenes)
- Visual + audio sync systems
- Generative playlist / loop engine integration

---

## 🧪 Philosophy

WOS is not a DAW replacement.

It is a **sound system**:

- Emergent
- Interactive
- Spatial
- Continuous

It treats music as a **living structure**, not a fixed arrangement.

---git checkout 385ebdc -- sound/

## 👤 Author

StudioRich  
Brooklyn, NYC

---

## 📜 License

TBD
