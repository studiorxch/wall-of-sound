// =========================
// STATE
// =========================

const list = document.getElementById("list");

let slices = [];
let currentAudio = null;
let playheadInterval = null;

let timelineMap = []; // slice → x position

// =========================
// LOAD DATA
// =========================

async function loadData() {
  const res = await fetch("data/analysis/metadata.json");

  if (!res.ok) {
    throw new Error("❌ Failed to load metadata.json");
  }

  return await res.json();
}

// =========================
// GROUP BY TRACK
// =========================

function groupByTrack(slices) {
  const tracks = {};

  slices.forEach((seg) => {
    if (!tracks[seg.track_id]) {
      tracks[seg.track_id] = [];
    }
    tracks[seg.track_id].push(seg);
  });

  Object.values(tracks).forEach((list) => {
    list.sort((a, b) => {
      const ai = parseInt(a.id.split("_slice_")[1], 10);
      const bi = parseInt(b.id.split("_slice_")[1], 10);
      return ai - bi;
    });
  });

  return tracks;
}

// =========================
// AUTO LABEL
// =========================

function autoLabelSlices(slices) {
  const tracks = groupByTrack(slices);

  Object.values(tracks).forEach((trackSlices) => {
    if (trackSlices[0]) trackSlices[0].section = "intro";
    if (trackSlices[1]) trackSlices[1].section = "intro";

    const endingIndex = trackSlices.findIndex(
      (s) => s.auto_flag === "ending_candidate",
    );

    if (endingIndex !== -1) {
      trackSlices[endingIndex].section = "outro";

      const prev = endingIndex - 1;
      if (prev >= 0) {
        trackSlices[prev].section = "release";
      }
    }
  });

  return slices;
}

// =========================
// AUDIO
// =========================

function playSlice(slice) {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }

  const path = `data/${slice.file}`;
  const audio = new Audio(path);

  audio.loop = false;

  audio.play().catch(() => {
    console.warn("⚠️ autoplay blocked:", path);
  });

  currentAudio = audio;

  startPlayhead(slice);
}

// =========================
// TIMELINE BUILD
// =========================

function buildTimeline(slices) {
  const canvas = document.getElementById("timeline");
  const ctx = canvas.getContext("2d");

  canvas.width = canvas.offsetWidth;
  canvas.height = canvas.offsetHeight;

  timelineMap = [];

  let x = 0;
  const widthPerSlice = 80;

  const colors = {
    intro: "#2c3e50",
    build: "#2980b9",
    peak: "#c0392b",
    release: "#27ae60",
    outro: "#7f8c8d",
  };

  slices.forEach((seg) => {
    ctx.fillStyle = colors[seg.section] || "#444";
    ctx.fillRect(x, 0, widthPerSlice, canvas.height);

    timelineMap.push({
      id: seg.id,
      xStart: x,
      xEnd: x + widthPerSlice,
    });

    x += widthPerSlice;
  });
}

// =========================
// PLAYHEAD
// =========================

function startPlayhead(slice) {
  const playhead = document.getElementById("playhead");

  const mapping = timelineMap.find((m) => m.id === slice.id);
  if (!mapping) return;

  let x = mapping.xStart;

  if (playheadInterval) {
    clearInterval(playheadInterval);
  }

  playhead.style.left = x + "px";

  playheadInterval = setInterval(() => {
    x += 1;
    playhead.style.left = x + "px";

    if (x >= mapping.xEnd) {
      clearInterval(playheadInterval);
    }
  }, 16);
}

// =========================
// RENDER GRID
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
  try {
    slices = await loadData();

    slices = autoLabelSlices(slices);

    const grouped = groupByTrack(slices);

    renderTracks(grouped);

    // 🔥 NEW TIMELINE
    buildTimeline(slices);

    console.log("✅ Labeller ready");
  } catch (err) {
    console.error(err);
  }
}

init();
