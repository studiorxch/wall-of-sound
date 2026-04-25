const list = document.getElementById("list");

let selectedSlice = null;
let currentPlayer = null;

// =========================
// LOAD DATA
// =========================

async function loadData() {
  const res = await fetch("data/analysis/metadata.json");
  return await res.json();
}

// =========================
// GROUP TRACKS
// =========================

function groupByTrack(slices) {
  const tracks = {};

  slices.forEach((seg) => {
    const base = seg.track_id;

    if (!tracks[base]) tracks[base] = [];
    tracks[base].push(seg);
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
// AUTO LABELER
// =========================

function autoLabelSlices(slices) {
  const tracks = {};

  slices.forEach((s) => {
    if (!tracks[s.track_id]) tracks[s.track_id] = [];
    tracks[s.track_id].push(s);
  });

  Object.values(tracks).forEach((trackSlices) => {
    trackSlices.sort((a, b) => {
      const ai = parseInt(a.id.split("_slice_")[1], 10);
      const bi = parseInt(b.id.split("_slice_")[1], 10);
      return ai - bi;
    });

    const lastIndex = trackSlices.length - 1;

    if (trackSlices[0]) trackSlices[0].section = "intro";
    if (trackSlices[1]) trackSlices[1].section = "intro";

    const endingIndex = trackSlices.findIndex(
      (s) => s.auto_flag === "ending_candidate"
    );

    if (endingIndex !== -1) {
      trackSlices[endingIndex].section = "ending";

      const outroIndex = endingIndex - 1;
      if (outroIndex >= 0) {
        trackSlices[outroIndex].section = "outro";
      }
    }
  });

  return slices;
}

// =========================
// RENDER
// =========================

function renderTracks(tracks) {
  list.innerHTML = "";

  Object.entries(tracks).forEach(([trackId, segs]) => {
    const container = document