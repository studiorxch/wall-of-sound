0412_WALL_OF_SOUND_FullFix_AudioAndCleanup_v1.0.0

# Wall of Sound — Full Audio + Physics Fix Spec

## Assumptions

- Running on http://127.0.0.1:5501
- Samples located at ./audio/samples/
- Web Audio API in use
- Collision system already working

---

## 1. AudioContext Unlock

```js
window.addEventListener(
  "pointerdown",
  async () => {
    const ctx = ensureAudioContext();
    if (!ctx) return;

    if (ctx.state !== "running") {
      await ctx.resume();
      console.log("🔊 AudioContext:", ctx.state);
    }

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.frequency.value = 440;
    gain.gain.value = 0.05;

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.05);
  },
  { once: true },
);
```

---

## 2. Sample Loading

```js
async function loadSamples(context) {
  if (samples.low && samples.mid && samples.high) return;

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
    try {
      const files = map[key];
      const url = files[Math.floor(Math.random() * files.length)];

      const res = await fetch(url);
      console.log("FETCH", key, url, res.status);

      if (!res.ok) throw new Error("HTTP " + res.status);

      const buf = await res.arrayBuffer();
      samples[key] = await context.decodeAudioData(buf);

      console.log("✅ sample loaded:", key);
    } catch (e) {
      console.error("❌ sample load failed:", key, e);
    }
  }
}
```

---

## 3. Collision Audio (Samples Only)

```js
handle: function (type, sourceObject) {
  const context = state.audio.context;
  if (!context || context.state !== "running") return;

  const sampleType = classifyCollision(sourceObject, state);
  const buffer = samples[sampleType];

  if (!buffer) {
    console.warn("⚠️ missing sample:", sampleType);
    return;
  }

  const source = context.createBufferSource();
  const gainNode = context.createGain();

  source.buffer = buffer;
  source.playbackRate.value = 0.95 + Math.random() * 0.1;

  gainNode.gain.value = 0.8;

  source.connect(gainNode);
  gainNode.connect(context.destination);

  source.start();

  console.log("🎯 PLAY", sampleType);
}
```

---

## 4. Remove Oscillator Audio

Delete all oscillator-based sound generation.

---

## 5. Always Trigger Collisions

Remove any `if (!isPlaying)` guards in collision dispatch.

---

## 6. Ball Cleanup

```js
if (ball.y > state.canvas.height * 0.92) {
  ball.y = state.canvas.height * 0.92;

  ball._restTime = (ball._restTime || 0) + dt;

  if (ball._restTime > 0.25) {
    ball._dead = true;
  }

  ball.vx *= 0.8;
  ball.vy *= -0.3;
} else {
  ball._restTime = 0;
}
```

After loop:

```js
state.balls = state.balls.filter((b) => !b._dead);
```

---

## 7. Force Collision Dispatch

```js
soundSources.forEach(function (source) {
  if (!source.line || !source.line.sound) return;
  dispatchCollisionEvent(source.line);
});
```

---

## Expected Result

- Audible kick/snare/hat on collisions
- Balls disappear cleanly
- Console shows playback logs
