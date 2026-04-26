// =========================
// STATE
// =========================

const list = document.getElementById("list");

let slices = [];
let currentAudio = null;
let currentWave = null; // 🔥 track active waveform

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
// AUDIO PLAYBACK
// =========================

function playSlice(slice) {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }

  const path = `data/${slice.file}`;
  const audio = new Audio(path);

  audio.loop = true;

  audio.play().catch(() => {
    console.warn("⚠️ autoplay blocked:", path);
  });

  currentAudio = audio;
}

// =========================
// WAVEFORM
// =========================

function renderWaveform(container, filePath) {
  // 🔥 destroy previous wave
  if (currentWave) {
    currentWave.destroy();
    currentWave = null;
  }

  container.innerHTML = "";

  currentWave = WaveSurfer.create({
    container: container,
    waveColor: "rgba(255,255,255,0.4)",
    progressColor: "#00ff88",
    height: 20,
    barWidth: 2,
    cursorWidth: 0,
    interact: false,
  });

  currentWave.load(filePath);
}

// =========================
// RENDER
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

      // =========================
      // SECTION COLOR
      // =========================
      if (seg.section) {
        btn.classList.add(seg.section);
      }

      if (seg.auto_flag === "ending_candidate") {
        btn.classList.add("ending");
      }

      // =========================
      // CONTENT
      // =========================
      const label = document.createElement("span");
      label.innerText = seg.id.split("_slice_")[1];

      const wave = document.createElement("div");
      wave.className = "wave";

      btn.appendChild(label);
      btn.appendChild(wave);

      // =========================
      // CLICK
      // =========================
      btn.onclick = () => {
        document
          .querySelectorAll(".segment")
          .forEach((el) => el.classList.remove("active"));

        btn.classList.add("active");

        playSlice(seg);

        // 🔥 waveform preview
        renderWaveform(wave, `data/${seg.file}`);
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

    console.log("✅ Labeller ready");
  } catch (err) {
    console.error(err);
  }
}

// =========================
// START
// =========================

init();
