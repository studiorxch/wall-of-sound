// =========================
// CONFIG
// =========================

const METADATA_URL = "data/analysis/bpm_analysis.json";
const PX_PER_SECOND = 100;
const DEFAULT_SLICE_DURATION = 2.0;

// =========================
// STATE
// =========================

let audioCtx = null;
let scheduledNodes = [];
let isPlaying = false;
let masterStartTime = 0;

const bufferCache = new Map();
const loadingPromises = new Map();

// =========================
// AUDIO CONTEXT
// =========================

function getAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }

  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }

  return audioCtx;
}

// =========================
// PATH HELPER
// =========================

function getAudioPath(file) {
  return file.startsWith("data/") ? file : `data/${file}`;
}

// =========================
// BUFFER LOADER (CACHED + SAFE)
// =========================

async function loadBuffer(file) {
  const path = getAudioPath(file);

  if (bufferCache.has(path)) {
    return bufferCache.get(path);
  }

  if (loadingPromises.has(path)) {
    return loadingPromises.get(path);
  }

  const promise = (async () => {
    const ctx = getAudioContext();

    const res = await fetch(path);
    const buf = await res.arrayBuffer();
    const audio = await ctx.decodeAudioData(buf);

    bufferCache.set(path, audio);
    loadingPromises.delete(path);

    return audio;
  })();

  loadingPromises.set(path, promise);

  return promise;
}

// =========================
// TIMELINE (UI ONLY)
// =========================

function buildTimeline(slices) {
  const timelineEl = document.getElementById("timeline");
  timelineEl.innerHTML = "";

  const durations = slices.map((seg) => seg.duration || DEFAULT_SLICE_DURATION);

  let totalWidth = 0;
  durations.forEach((d) => {
    totalWidth += d * PX_PER_SECOND;
  });

  timelineEl.style.width = `${totalWidth}px`;

  let offset = 0;

  slices.forEach((seg, i) => {
    const width = durations[i] * PX_PER_SECOND;

    const el = document.createElement("div");
    el.className = `timeline-seg ${seg.status?.toLowerCase() || ""}`;

    el.style.position = "absolute";
    el.style.left = `${offset}px`;
    el.style.width = `${width}px`;
    el.style.height = "100%";

    timelineEl.appendChild(el);

    offset += width;
  });
}

// =========================
// PLAYBACK
// =========================

function stopPlayback() {
  scheduledNodes.forEach((node) => {
    try {
      node.stop();
    } catch {}
  });

  scheduledNodes = [];
  isPlaying = false;
}

async function playSequence(trackSlices) {
  stopPlayback();

  const ctx = getAudioContext();

  let offset = 0;
  masterStartTime = ctx.currentTime + 0.05;
  isPlaying = true;

  // 🔥 PRELOAD ALL BUFFERS
  const buffers = await Promise.all(
    trackSlices.map((seg) => loadBuffer(seg.file)),
  );

  // 🔥 SCHEDULE PLAYBACK
  for (let i = 0; i < trackSlices.length; i++) {
    const seg = trackSlices[i];
    const buffer = buffers[i];

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);

    source.start(masterStartTime + offset);

    scheduledNodes.push(source);

    offset += seg.duration || buffer.duration;
  }

  startPlayheadSync(trackSlices);
}

// =========================
// PLAYHEAD
// =========================

function startPlayheadSync(slices) {
  const playhead = document.getElementById("playhead");

  function update() {
    if (!isPlaying) return;

    const ctx = getAudioContext();
    const elapsed = ctx.currentTime - masterStartTime;

    const x = elapsed * PX_PER_SECOND;

    playhead.style.transform = `translateX(${x}px)`;

    requestAnimationFrame(update);
  }

  requestAnimationFrame(update);
}

// =========================
// UI
// =========================

function renderTracks(tracks) {
  const container = document.getElementById("tracks");
  container.innerHTML = "";

  tracks.forEach((track) => {
    const row = document.createElement("div");
    row.className = "track-row";

    const title = document.createElement("div");
    title.className = "track-title";
    title.textContent = track.id;

    const btn = document.createElement("button");
    btn.textContent = "▶";

    btn.onclick = () => {
      buildTimeline(track.slices);
      playSequence(track.slices);
    };

    row.appendChild(title);
    row.appendChild(btn);

    container.appendChild(row);
  });
}

// =========================
// INIT
// =========================

async function init() {
  const res = await fetch(METADATA_URL);
  const data = await res.json();

  console.log("tracks:", data.tracks.length);
  console.log(
    "slice counts:",
    data.tracks.map((t) => t.slices.length),
  );

  renderTracks(data.tracks);

  console.log("✅ Labeller ready (v1.4.0)");
}

init();
