// =========================
// STATE
// =========================

const list = document.getElementById("list");

let slices = [];
let timelineMap = [];

let audioCtx = new (window.AudioContext || window.webkitAudioContext)();
let masterStartTime = 0;
let isPlaying = false;

let scheduledNodes = [];
let bufferCache = {};

const BPM = 124;
const BEATS_PER_BAR = 4;
const pxPerSecond = 120;

// =========================
// LOAD DATA
// =========================

async function loadData() {
  const res = await fetch("data/analysis/metadata.json");
  if (!res.ok) throw new Error("❌ Failed to load metadata.json");
  return await res.json();
}

// =========================
// GROUP
// =========================

function groupByTrack(slices) {
  const tracks = {};

  slices.forEach((s) => {
    if (!tracks[s.track_id]) tracks[s.track_id] = [];
    tracks[s.track_id].push(s);
  });

  Object.values(tracks).forEach((arr) => {
    arr.sort(
      (a, b) =>
        parseInt(a.id.split("_slice_")[1]) - parseInt(b.id.split("_slice_")[1]),
    );
  });

  return tracks;
}

// =========================
// AUTO LABEL
// =========================

function autoLabelSlices(slices) {
  const tracks = groupByTrack(slices);

  Object.values(tracks).forEach((track) => {
    if (track[0]) track[0].section = "intro";
    if (track[1]) track[1].section = "intro";

    const endIdx = track.findIndex((s) => s.auto_flag === "ending_candidate");

    if (endIdx !== -1) {
      track[endIdx].section = "outro";
      if (endIdx - 1 >= 0) track[endIdx - 1].section = "release";
    }
  });

  return slices;
}

// =========================
// AUDIO BUFFER CACHE
// =========================

async function loadBuffer(path) {
  if (bufferCache[path]) return bufferCache[path];

  const res = await fetch(path);
  const buf = await res.arrayBuffer();
  const audio = await audioCtx.decodeAudioData(buf);

  bufferCache[path] = audio;
  return audio;
}

// =========================
// PLAYBACK ENGINE
// =========================

async function playSequence(trackSlices) {
  stopPlayback();

  masterStartTime = audioCtx.currentTime;
  isPlaying = true;

  let offset = 0;

  for (const seg of trackSlices) {
    const buffer = await loadBuffer(`data/${seg.file}`);

    const source = audioCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(audioCtx.destination);

    source.start(masterStartTime + offset);

    scheduledNodes.push(source);

    offset += buffer.duration;
  }

  startPlayheadSync();
}

function stopPlayback() {
  scheduledNodes.forEach((n) => {
    try {
      n.stop();
    } catch {}
  });

  scheduledNodes = [];
  isPlaying = false;
}

// =========================
// PLAYHEAD SYNC
// =========================

function startPlayheadSync() {
  const playhead = document.getElementById("playhead");
  const container = document.getElementById("timeline-container");

  function update() {
    if (!isPlaying) return;

    const t = audioCtx.currentTime - masterStartTime;
    const x = t * pxPerSecond;

    playhead.style.left = x + "px";
    container.scrollLeft = x - 200;

    requestAnimationFrame(update);
  }

  requestAnimationFrame(update);
}

// =========================
// TIMELINE
// =========================

async function buildTimeline(slices) {
  const canvas = document.getElementById("timeline");
  const ctx = canvas.getContext("2d");
  const scroll = document.getElementById("timeline-scroll");

  let totalWidth = 0;
  timelineMap = [];

  const colors = {
    intro: "#2c3e50",
    build: "#2980b9",
    peak: "#c0392b",
    release: "#27ae60",
    outro: "#7f8c8d",
  };

  const durations = [];

  for (const seg of slices) {
    const buffer = await loadBuffer(`data/${seg.file}`);
    durations.push(buffer.duration);
    totalWidth += buffer.duration * pxPerSecond;
  }

  canvas.width = totalWidth;
  canvas.height = scroll.offsetHeight;
  scroll.style.width = totalWidth + "px";

  // GRID
  const secondsPerBeat = 60 / BPM;
  const secondsPerBar = secondsPerBeat * BEATS_PER_BAR;

  const totalSeconds = totalWidth / pxPerSecond;

  ctx.strokeStyle = "rgba(255,255,255,0.05)";
  for (let t = 0; t < totalSeconds; t += secondsPerBeat) {
    const x = t * pxPerSecond;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }

  ctx.strokeStyle = "rgba(255,255,255,0.15)";
  ctx.lineWidth = 2;

  for (let t = 0; t < totalSeconds; t += secondsPerBar) {
    const x = t * pxPerSecond;

    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();

    ctx.fillStyle = "#aaa";
    ctx.font = "10px monospace";
    ctx.fillText(Math.floor(t / secondsPerBar) + 1, x + 4, 12);
  }

  // SLICES
  let x = 0;

  slices.forEach((seg, i) => {
    const width = durations[i] * pxPerSecond;

    ctx.fillStyle = colors[seg.section] || "#444";
    ctx.fillRect(x, 0, width, canvas.height);

    timelineMap.push({
      id: seg.id,
      xStart: x,
      xEnd: x + width,
    });

    x += width;
  });
}

// =========================
// UI
// =========================

function renderTracks(tracks) {
  list.innerHTML = "";

  Object.entries(tracks).forEach(([trackId, segs]) => {
    const container = document.createElement("div");
    container.className = "item";

    const title = document.createElement("div");
    title.className = "track-title";
    title.innerText = trackId;

    const row = document.createElement("div");
    row.className = "timeline";

    segs.forEach((seg) => {
      const btn = document.createElement("div");
      btn.className = "segment";

      if (seg.section) btn.classList.add(seg.section);
      if (seg.auto_flag === "ending_candidate") btn.classList.add("ending");

      btn.innerText = seg.id.split("_slice_")[1];

      btn.onclick = () => {
        document
          .querySelectorAll(".segment")
          .forEach((el) => el.classList.remove("active"));

        btn.classList.add("active");

        playSequence(segs);
      };

      row.appendChild(btn);
    });

    container.appendChild(title);
    container.appendChild(row);
    list.appendChild(container);
  });
}

// =========================
// INIT
// =========================

async function init() {
  slices = await loadData();
  slices = autoLabelSlices(slices);

  const grouped = groupByTrack(slices);

  renderTracks(grouped);
  await buildTimeline(slices);

  console.log("✅ Labeller ready (v1.4.0)");
}

init();
