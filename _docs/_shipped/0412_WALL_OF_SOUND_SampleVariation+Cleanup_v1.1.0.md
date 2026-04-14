0412_WALL_OF_SOUND_SampleVariation+Cleanup_v1.1.0

# Wall of Sound — Sample Variation + Physics Cleanup (FINAL)

## Assumptions

- Local server (127.0.0.1:5501)
- Samples in /audio/samples/
- Collision system already firing

---

# 1. SAMPLE SYSTEM (FIX VARIATION)

## Replace sample storage

```js
const samples = {
  low: [],
  mid: [],
  high: [],
};
```

---

## Load ALL samples (not one)

```js
async function loadSamples(context) {
  if (samples.low.length) return;

  const map = {
    low: [
      "/audio/samples/kick1.wav",
      "/audio/samples/kick2.wav",
      "/audio/samples/kick3.wav",
    ],
    mid: [
      "/audio/samples/snare1.wav",
      "/audio/samples/snare2.wav",
      "/audio/samples/snare3.wav",
    ],
    high: [
      "/audio/samples/hat1.wav",
      "/audio/samples/hat2.wav",
      "/audio/samples/hat3.wav",
    ],
  };

  for (const key in map) {
    samples[key] = [];

    for (const url of map[key]) {
      const res = await fetch(url);
      const buf = await res.arrayBuffer();
      const decoded = await context.decodeAudioData(buf);

      samples[key].push(decoded);
    }

    console.log("✅ loaded bank:", key, samples[key].length);
  }
}
```

---

# 2. COLLISION AUDIO (REAL VARIATION)

Replace your handler with:

```js
handle: function (type, sourceObject) {
  const context = state.audio.context;
  if (!context || context.state !== "running") return;

  const sampleType = classifyCollision(sourceObject, state);
  const bank = samples[sampleType];

  if (!bank || bank.length === 0) return;

  const buffer = bank[Math.floor(Math.random() * bank.length)];

  const source = context.createBufferSource();
  const gainNode = context.createGain();

  source.buffer = buffer;

  // 🎯 pitch from MIDI note
  const note = sourceObject.sound?.midi?.note || 60;
  const pitch = Math.pow(2, (note - 60) / 12);

  source.playbackRate.value =
    pitch * (0.96 + Math.random() * 0.08);

  gainNode.gain.value = 0.8;

  source.connect(gainNode);
  gainNode.connect(context.destination);

  source.start();
}
```

---

# 3. REMOVE OSCILLATOR

Delete ALL oscillator sound code.

---

# 4. BALL CLEANUP (NO FLOOR STACKING)

## Replace floor logic:

```js
const FLOOR_Y = state.canvas.height * 0.92;

state.balls.forEach((ball) => {
  if (ball.y > FLOOR_Y) {
    ball._dead = true;
  }
});
```

## After physics loop:

```js
state.balls = state.balls.filter((b) => !b._dead);
```

---

# 5. FORCE COLLISION EVENTS

Replace collision dispatch with:

```js
soundSources.forEach((source) => {
  if (!source.line || !source.line.sound) return;
  dispatchCollisionEvent(source.line);
});
```

---

# 6. COLLISION CLASSIFICATION

```js
function classifyCollision(sourceObject, state) {
  const vx = sourceObject.vx || 0;
  const vy = sourceObject.vy || 0;
  const speed = Math.hypot(vx, vy);

  if (vy > 6 && speed > 8) return "low";
  if (speed > 5) return "mid";
  return "high";
}
```

---

# EXPECTED RESULT

- Different samples per hit
- Pitch changes across lines
- No ball pile at floor
- Continuous emitter flow
- System feels musical, not repetitive
