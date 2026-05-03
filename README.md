# 🧱 Wall of Sound (WOS)

Wall of Sound is a physics-driven audiovisual engine where sound emerges from interaction.

Instead of composing on a timeline, WOS generates music through motion, collision, and behavior. Objects exist on a “Wall” and produce sound as they interact—turning composition into a dynamic system rather than a linear sequence.

---

## 🎯 Core Concept

WOS replaces traditional DAW sequencing with an **event-based sound system**:

- Objects move through space
- Interactions generate events
- Events trigger sound
- Behaviors shape motion and rhythm

This enables **infinite variation with structural cohesion**.

---

## 🧠 System Architecture

WOS operates across four primary layers:

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

---

### 3. Event Layer (Core Runtime)

Decouples interaction from sound.

```text
Wall → Event → Sound
```

- All interactions produce events (collision, emission, lifecycle)
- Events are dispatched through a central EventBus
- Events carry context (position, velocity, energy, source)

This ensures:

- Visual systems do not directly control audio
- Audio systems can evolve independently
- The same event stream can power real-time playback and export

---

### 4. Sound Layer

Transforms events into sound.

- Oscillator (monitor output)
- MIDI output (Ableton / external gear)
- Future: sampler + sound engine

---

## 🔁 Bidirectional System

WOS supports two directions of interaction:

### 1. Interaction → Sound (Primary)

- Collisions trigger notes
- Emitters generate rhythm
- Motion shapes timing and dynamics

### 2. Sound → Visual (Reactive)

- Audio analysis feeds back into the system
- Visuals respond through the same event pipeline

```text
audio → event → wall response
```

This avoids tight coupling between audio and visuals.

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
- Particles (temporary carriers)

Objects can:

- Move
- Collide
- Emit
- Hold behaviors
- Trigger events

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
- Designed for both creation and presentation
- Supports portrait and landscape (stream + export)

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
- Events are triggered dynamically
- Sound responds in real-time

Supports:

- Passive (ambient playback)
- Active (interactive performance)

---

## 📦 Project Structure

```
/wall-of-sound
  /wall        # visual + physics systems
  /sound       # audio engines (MIDI, future sampler)
  /core        # event system + shared runtime (EventBus)
  /docs        # specs and system design

  index.html   # entry point
  main.js      # engine loop
  controls.js  # UI bindings
```

---

## 🚧 Current Focus

- Object system unification (shapes, strokes, groups)
- Stable physics + motion feel
- Collision consistency + event quality
- Emitter refinement (direction, density, lifecycle)
- Selection + transform system

---

## 🔮 Roadmap

- Event schema refinement (energy, velocity, timing)
- Minimal sound engine (event → tone mapping)
- Sampler integration (per-object sound profiles)
- Shape + sound libraries
- Multi-wall environments
- Embeddable “Capsules” (shareable scenes)
- Stream + export modes (OBS / MP4 / WAV)

---

## 🧪 Philosophy

WOS is not a DAW.

It is a **sound system**:

- Emergent
- Interactive
- Spatial
- Continuous

It treats music as a **living structure**, not a fixed arrangement.

---

## 👤 Author

StudioRich
Brooklyn, NYC

---

## 📜 License

TBD
