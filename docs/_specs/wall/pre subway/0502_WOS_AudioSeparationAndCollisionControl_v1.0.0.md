# 0502_WOS_AudioSeparationAndCollisionControl_v1.0.0

## STATUS

ACTIVE — REQUIRED FOR SOUND ENGINE STABILITY

---

## 🎯 OBJECTIVE

Establish strict separation between:

1. Collision-driven audio
2. MIDI-driven audio
3. Walker self-audio

AND

Reduce visual noise from collision smoke so it no longer dominates the canvas.

---

## ⚠️ CURRENT PROBLEMS

### 1. MIDI is visual only

- MIDI points render
- No system consumes them → no sound triggered

### 2. Walker Self Sound toggle is ignored

- walker → collision → sound still fires

### 3. No audio routing separation

- All audio flows through collision system

### 4. Collision smoke too dense

- Overwhelms small particle / walker systems

---

## ✅ FINAL DECISIONS

- Collision audio, MIDI audio, and walker audio must be isolated
- Walker self sound OFF = no audio from walker collisions
- MIDI points are active triggers
- Collision smoke must be reduced or disabled

---

## 🔊 MIDI TRIGGER SYSTEM

function processMidiPointsForWalker(walker) {
if (!state.midiPoints.length) return;

const t = walker.t;

state.midiPoints.forEach(point => {
if (point.strokeId !== walker.strokeId) return;
if (point.consumed) return;

    const threshold = 0.01;

    if (Math.abs(point.t - t) < threshold) {
      triggerMidiPoint(point, walker);
      point.consumed = true;
    }

});
}

function triggerMidiPoint(point, walker) {
const event = {
type: "midi",
sourceId: walker.id,
midi: {
note: point.note,
velocity: point.velocity || 100,
channel: 2
},
energy: 1
};

emitEvent(event.type, event);
}

---

## 🚫 COLLISION AUDIO GATE

function shouldPlayCollisionAudio(sourceObject) {
if (!sourceObject) return false;

if (sourceObject.type === "walker") {
if (!sourceObject.audioEnabled) return false;
}

return true;
}

---

## 🎨 COLLISION SMOKE CONTROL

const COLLISION_SMOKE_SCALE = 0.25;

if (sourceObject.type === "walker") return;

---

## 🔚 END
