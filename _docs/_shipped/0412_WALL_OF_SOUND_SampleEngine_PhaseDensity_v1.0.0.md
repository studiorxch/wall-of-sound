# 0412_WALL_OF_SOUND_SampleEngine_PhaseDensity_v1.0.0

Date: 04/12/2026

---

## Objective

Upgrade the sound system from reactive tone generation → structured sample-based composition

Introduce:

- Continuous density → pitch mapping
- Phase-aware modulation → timing structure
- Sample engine → real sonic identity

---

## Assumptions

- state.collisionCount exists
- state.loopPhase exists
- eventBus.triggerEvent works
- midiOutput.handle works
- oscillatorOutput.handle works
- AudioContext initialized

---

## STEP 1 — Continuous Density

```js
function getDensityValue(count) {
  return Math.min(1, count / 12);
}
```

---

## STEP 2 — Phase Modulation

```js
function applyPhaseModulation(note, phase) {
  if (phase < 0.25) return note - 12;
  if (phase < 0.75) return note;
  return note + 12;
}
```

---

## STEP 3 — Sample Engine

Create file:

/audio/sampleEngine.js

```js
(function initSampleEngine(global) {
  const SBE = (global.SBE = global.SBE || {});

  const SampleEngine = {
    context: null,
    buffers: {},
    masterGain: null,

    async init(context) {
      this.context = context;

      this.masterGain = context.createGain();
      this.masterGain.gain.value = 0.8;
      this.masterGain.connect(context.destination);

      await this.loadSamples();
    },

    async loadSamples() {
      const sampleMap = {
        low: "/audio/samples/soft.wav",
        mid: "/audio/samples/mid.wav",
        high: "/audio/samples/hard.wav",
      };

      for (const [key, url] of Object.entries(sampleMap)) {
        const res = await fetch(url);
        const arrayBuffer = await res.arrayBuffer();
        const buffer = await this.context.decodeAudioData(arrayBuffer);
        this.buffers[key] = buffer;
      }
    },

    play(type, velocity = 80) {
      if (!this.buffers[type]) return;

      const source = this.context.createBufferSource();
      const gain = this.context.createGain();

      source.buffer = this.buffers[type];

      const normalized = velocity / 127;
      gain.gain.value = Math.max(0.1, normalized);

      source.connect(gain);
      gain.connect(this.masterGain);

      source.start();
    },
  };

  SBE.SampleEngine = SampleEngine;
})(window);
```

---

## STEP 4 — Density → Sample Type

```js
const densityVal = getDensityValue(state.collisionCount || 0);

let sampleType = "low";
if (densityVal > 0.66) sampleType = "high";
else if (densityVal > 0.33) sampleType = "mid";
```

---

## STEP 5 — Note Mapping

```js
let note = rawNote;

if (state.soundResponse.densityHarmonics) {
  note = rawNote + Math.floor(densityVal * 12);
}
```

---

## STEP 6 — Phase Application

```js
note = applyPhaseModulation(note, state.loopPhase || 0);
```

---

## STEP 7 — Trigger Sample

Option A (replace oscillator):

```js
SBE.SampleEngine.play(sampleType, velocity);
return;
```

Option B (layer):

```js
SBE.SampleEngine.play(sampleType, velocity);
```

---

## STEP 8 — Initialize Engine

```js
if (!SBE.SampleEngine.context) {
  await SBE.SampleEngine.init(state.audio.context);
}
```

---

## Expected Result

- Density controls pitch + sample
- Velocity controls loudness
- Phase controls structure
- System becomes musical, not reactive

---

## Implementation Guide

- where  
  add /audio/sampleEngine.js  
  update midiOutput.handle  
  update oscillatorOutput.handle

- run  
  load samples → reload → test collisions

- expect  
  evolving pitch  
  dynamic volume  
  sample-based sound identity
