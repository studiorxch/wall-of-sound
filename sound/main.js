// =========================
// CONFIG
// =========================

const BPM = 90;
const BEAT_DURATION = 60 / BPM;
const BEATS_PER_BAR = 4;

const stems = ["drums", "bass", "other", "vocals"];

// =========================
// AUDIO
// =========================

const context = new AudioContext();

// =========================
// STATE
// =========================

let transportStart = null;
let transportRunning = false;
let currentSources = [];
let slices = [];

// stem toggles
const stemState = {
  drums: true,
  bass: true,
  other: true,
  vocals: true,
};

// =========================
// LOAD METADATA
// =========================

async function loadMetadata() {
  const res = await fetch("data/analysis/metadata.json");
  return await res.json();
}

// =========================
// LOAD BUFFER
// =========================

async function loadBuffer(path) {
  const res = await fetch(path);
  const arr = await res.arrayBuffer();
  return await context.decodeAudioData(arr);
}

// =========================
// PATH FIX (IMPORTANT)
// =========================

function getStemPath(slice, stem) {
  return `data/stems/_temp/htdemucs/${slice.id}/${stem}.wav`;
}

// =========================
// TRANSPORT
// =========================

function toggleTransport() {
  if (!transportRunning) {
    transportStart = context.currentTime;
    transportRunning = true;
    console.log("▶ Transport started");
  } else {
    stopAll();
    transportRunning = false;
    transportStart = null;
    console.log("⏹ Transport stopped");
  }
}

// =========================
// STOP ALL
// =========================

function stopAll() {
  currentSources.forEach((s) => {
    try {
      s.stop();
    } catch {}
  });
  currentSources = [];
}

// =========================
// QUANTIZE
// =========================

function getNextBarTime() {
  const now = context.currentTime;
  const elapsed = now - transportStart;

  const beatsPassed = elapsed / BEAT_DURATION;
  const nextBar = Math.ceil(beatsPassed / BEATS_PER_BAR) * BEATS_PER_BAR;

  return transportStart + nextBar * BEAT_DURATION;
}

// =========================
// PLAY SLICE
// =========================

async function playSlice(slice) {
  if (!transportRunning) return;

  if (context.state === "suspended") {
    await context.resume();
  }

  const startTime = getNextBarTime();

  stopAll();

  for (let stem of stems) {
    if (!stemState[stem]) continue;

    const path = getStemPath(slice, stem);

    try {
      const buffer = await loadBuffer(path);

      const src = context.createBufferSource();
      src.buffer = buffer;
      src.loop = true;

      src.connect(context.destination);
      src.start(startTime);

      currentSources.push(src);
    } catch (e) {
      console.warn("Missing:", path);
    }
  }
}

// =========================
// STEM TOGGLE UI
// =========================

function toggleStem(stem) {
  stemState[stem] = !stemState[stem];

  const btn = document.getElementById(`btn-${stem}`);
  btn.classList.toggle("active", stemState[stem]);
}

// =========================
// UI
// =========================

function buildUI() {
  const list = document.getElementById("list");
  list.innerHTML = "";

  const grouped = {};

  slices.forEach((s) => {
    if (!grouped[s.track_id]) grouped[s.track_id] = [];
    grouped[s.track_id].push(s);
  });

  Object.entries(grouped).forEach(([trackId, segs]) => {
    const container = document.createElement("div");
    container.className = "item";

    const title = document.createElement("div");
    title.className = "track-title";
    title.innerText = trackId;

    const row = document.createElement("div");
    row.className = "timeline";

    segs
      .sort(
        (a, b) =>
          parseInt(a.id.split("_slice_")[1]) -
          parseInt(b.id.split("_slice_")[1]),
      )
      .forEach((seg) => {
        const btn = document.createElement("div");
        btn.className = "segment";

        if (seg.auto_flag === "ending_candidate") {
          btn.classList.add("ending");
        }

        btn.innerText = seg.id.split("_slice_")[1];

        btn.onclick = () => {
          document
            .querySelectorAll(".segment")
            .forEach((el) => el.classList.remove("active"));

          btn.classList.add("active");

          playSlice(seg);
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
  slices = await loadMetadata();
  buildUI();
}

init();
