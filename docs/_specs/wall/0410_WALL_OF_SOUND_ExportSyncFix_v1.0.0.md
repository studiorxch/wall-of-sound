---
layout: spec
title: "ExportSyncFix"
date: 2026-04-10
doc_id: "0410_WALL_OF_SOUND_ExportSyncFix_v1.0.0"
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

0410_WALL_OF_SOUND_ExportSyncFix_v1.0.0

Generated: 04/10/2026

---

## 🎯 Objective

Fix export desynchronization between `.wav` (audio) and `.webm` (video) so that:

- durations match exactly (end-to-end)
- playback is frame-stable (no choppiness)
- exports are reliable for production use

---

## ⚠️ Current Issue

Observed:

- Audio duration: ~16.00s
- Video duration: ~15.10s
- Video appears choppy / uneven

This indicates:

- independent timing systems (audio vs MediaRecorder)
- dropped frames or unstable FPS
- recorder stopping early or not aligned with loop duration

---

## 🧱 System Context (DO NOT BREAK)

- Loop system is BPM + bar based
- Export pipeline uses:
  - `.wav` (audio)
  - `.webm` (canvas capture via MediaRecorder)
  - `.png` (snapshot)
- Render loop uses canvas + requestAnimationFrame
- Physics + swarm + collision run in real time

DO NOT:

- rewrite architecture
- remove MediaRecorder
- touch audio generation logic
- modify shape / physics / collision systems

ONLY fix timing + export synchronization

---

## ✅ Required Behavior

### 1. Single Source of Truth (MANDATORY)

All export timing must derive from:

```js
durationSec = ((bars * 60) / bpm) * 4;
```

Example:

- 120 BPM
- 8 bars → 16 seconds

---

### 2. Shared Start / Stop Timing

Audio and video MUST:

- start from same timestamp
- stop from same condition

NO independent timers

---

### 3. Stable Frame Rate

Video MUST:

- run at fixed FPS (30fps)
- avoid frame drops affecting duration

---

### 4. Matching Output

Final result:

- audio.duration === video.duration (±0.05s max)
- no early cutoff
- no drift

---

## 🔧 Implementation Requirements

### A. Lock Duration

Add a shared export timer:

```js
const durationSec = ((bars * 60) / bpm) * 4;
const durationMs = durationSec * 1000;

const startTime = performance.now();

function shouldStop(now) {
  return now - startTime >= durationMs;
}
```

Use this for BOTH:

- stopping audio
- stopping MediaRecorder

---

### B. Lock Canvas Capture FPS

Replace any dynamic capture with:

```js
const stream = canvas.captureStream(30);
```

DO NOT omit FPS

---

### C. Stabilize Render Loop

Throttle rendering to consistent frame pacing:

```js
const TARGET_FPS = 30;
const FRAME_DURATION = 1000 / TARGET_FPS;

let lastFrameTime = 0;

function renderLoop(now) {
  if (now - lastFrameTime >= FRAME_DURATION) {
    drawFrame();
    lastFrameTime = now;
  }
  requestAnimationFrame(renderLoop);
}
```

---

### D. MediaRecorder Config

Ensure stable encoding:

```js
const recorder = new MediaRecorder(stream, {
  mimeType: "video/webm;codecs=vp9",
  videoBitsPerSecond: 5000000,
});
```

---

### E. Audio Start Sync

Capture audio start time:

```js
const audioStartTime = audioContext.currentTime;
```

Optional: use this to align visuals if needed

---

### F. Unified Stop

Inside main loop:

```js
if (shouldStop(performance.now())) {
  stopAudio();
  recorder.stop();
}
```

No setTimeout allowed for stopping

---

### G. Debug Logging (REQUIRED)

Log durations after export:

```js
console.log("Expected:", durationSec);

video.onloadedmetadata = () => {
  console.log("Video duration:", video.duration);
};

audio.onloadedmetadata = () => {
  console.log("Audio duration:", audio.duration);
};
```

---

## 🚫 Constraints

- DO NOT introduce async drift
- DO NOT rely on setTimeout for duration
- DO NOT create separate clocks
- DO NOT rewrite unrelated systems
- DO NOT degrade performance of render loop

---

## ✅ Deliverables

Claude must return:

1. Exact code changes (diff-style or full functions)
2. Clear insertion points (file + location)
3. No pseudocode — fully working code only

---

## 🧪 Success Criteria

After fix:

- 8 bar @ 120 BPM export = 16.00s video + audio
- No visible stutter in playback
- Repeat exports are consistent
- WebM loops cleanly with WAV

---

## ⚡ Implementation Guide

- where: main loop + export logic + MediaRecorder setup
- run: export 8-bar loop at 120 BPM
- expect: perfectly aligned audio/video durations + smooth playback
