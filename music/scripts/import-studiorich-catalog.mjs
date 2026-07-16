/**
 * Import StudioRich master catalog from CSV → play-project-v2 JSON seed.
 *
 * Usage:
 *   node play/scripts/import-studiorich-catalog.mjs
 *
 * Output:
 *   data/catalog/studiorich/studiorich-project-seed.json
 *
 * This JSON can be loaded in PLAY via the ··· → Import Project JSON action.
 * It merges with existing playlists so nothing is lost.
 */

import { readFileSync, writeFileSync } from "fs";
import { createHash } from "crypto";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");

const CSV_PATH = resolve(ROOT, "data/catalog/studiorich/catalog_v2.csv");
const OUT_PATH = resolve(ROOT, "data/catalog/studiorich/studiorich-project-seed.json");

// ── Camelot key mapping ────────────────────────────────────────────────────
const MUSICAL_KEY_TO_CAMELOT = {
  "c major": "8B",  "c minor": "5A",
  "g major": "9B",  "g minor": "6A",
  "d major": "10B", "d minor": "7A",
  "a major": "11B", "a minor": "8A",
  "e major": "12B", "e minor": "9A",
  "b major": "1B",  "b minor": "10A",
  "cb major": "1B", "cb minor": "10A",
  "f# major": "2B", "f# minor": "11A",
  "gb major": "2B", "gb minor": "11A",
  "db major": "3B", "db minor": "12A",
  "c# major": "3B", "c# minor": "12A",
  "ab major": "4B", "ab minor": "1A",
  "g# major": "4B", "g# minor": "1A",
  "eb major": "5B", "eb minor": "2A",
  "d# major": "5B", "d# minor": "2A",
  "bb major": "6B", "bb minor": "3A",
  "a# major": "6B", "a# minor": "3A",
  "f major": "7B",  "f minor": "4A",
};

function musicalKeyToCamelot(key, scale) {
  const combined = `${key.trim().toLowerCase()} ${scale.trim().toLowerCase()}`;
  return MUSICAL_KEY_TO_CAMELOT[combined] ?? null;
}

// ── Helpers ────────────────────────────────────────────────────────────────
function splitCsvLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQuotes = !inQuotes; }
    else if (ch === "," && !inQuotes) { result.push(current); current = ""; }
    else { current += ch; }
  }
  result.push(current);
  return result;
}

function parseDelimitedTags(value) {
  if (!value) return [];
  const s = String(value).trim();
  const sep = s.includes("|") ? "|" : ",";
  return s.split(sep).map(t => t.trim()).filter(Boolean);
}

function parseDuration(value) {
  if (!value) return undefined;
  const s = String(value).trim();
  const asNum = parseFloat(s);
  if (!isNaN(asNum) && !s.includes(":")) return asNum > 0 ? asNum : undefined;
  const parts = s.split(":").map(p => parseInt(p, 10));
  if (parts.some(isNaN)) return undefined;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return undefined;
}

function clampEnergy(v) { return Math.max(0, Math.min(1, v)); }

function artworkStatus(hasCover) {
  const s = (hasCover || "").trim().toLowerCase();
  if (s === "yes" || s === "true" || s === "1") return "linked";
  if (s === "no" || s === "false" || s === "0") return "missing";
  return "unknown";
}

function stableId(sunoId, title, artist) {
  const key = `sr:${sunoId || title}:${artist}`;
  return "track_" + createHash("sha1").update(key).digest("hex").slice(0, 12);
}

// ── Parse CSV ──────────────────────────────────────────────────────────────
const csvText = readFileSync(CSV_PATH, "utf8");
const lines = csvText.trim().split(/\r?\n/);
const headers = lines[0].split(",").map(h => h.trim().toLowerCase());

const tracks = [];
const errors = [];
const unmapped = new Set();

// collect BPMs for energy estimation
const allBpms = [];
const rawRows = [];
for (let i = 1; i < lines.length; i++) {
  const line = lines[i].trim();
  if (!line) continue;
  const cols = splitCsvLine(line);
  const row = {};
  headers.forEach((h, idx) => { row[h] = (cols[idx] ?? "").trim(); });
  rawRows.push(row);
  const bpm = parseFloat(row["bpm"]);
  if (!isNaN(bpm) && bpm > 0) allBpms.push(bpm);
}

const minBpm = allBpms.length ? Math.min(...allBpms) : 60;
const maxBpm = allBpms.length ? Math.max(...allBpms) : 180;

// Track which CSV columns were used
const usedColumns = new Set();

rawRows.forEach((row, i) => {
  const rowNum = i + 2;

  // Title
  usedColumns.add("title"); usedColumns.add("audio filename");
  const title = row["title"] || row["audio filename"] || `Track ${rowNum}`;

  // Artist
  usedColumns.add("artist");
  const artist = row["artist"] || "";

  // BPM
  usedColumns.add("bpm");
  const bpm = parseFloat(row["bpm"]);
  if (isNaN(bpm) || bpm <= 0) {
    errors.push(`Row ${rowNum} (${title}): invalid BPM "${row["bpm"]}" — skipped`);
    return;
  }

  // Duration
  usedColumns.add("duration");
  const durationSeconds = parseDuration(row["duration"]);
  if (!durationSeconds || durationSeconds <= 0) {
    errors.push(`Row ${rowNum} (${title}): invalid duration "${row["duration"]}" — skipped`);
    return;
  }

  // Camelot key from key + scale
  usedColumns.add("key"); usedColumns.add("scale");
  const keyRaw = row["key"] || "";
  const scaleRaw = row["scale"] || "";
  let camelotKey = "1A";
  let musicalKey = undefined;
  if (keyRaw && scaleRaw) {
    musicalKey = `${keyRaw} ${scaleRaw}`;
    const derived = musicalKeyToCamelot(keyRaw, scaleRaw);
    camelotKey = derived ?? "1A";
  }

  // Energy from energy_norm
  usedColumns.add("energy_norm"); usedColumns.add("energy level");
  const energyNorm = parseFloat(row["energy_norm"] ?? "");
  let energy, energySource;
  if (!isNaN(energyNorm) && energyNorm >= 0 && energyNorm <= 1) {
    energy = clampEnergy(energyNorm);
    energySource = "manual";
  } else {
    const ratio = (bpm - minBpm) / (maxBpm - minBpm || 1);
    energy = clampEnergy(0.15 + ratio * 0.7);
    energySource = "estimated";
  }

  // Genres / mood tags
  usedColumns.add("genre"); usedColumns.add("mood tags");
  usedColumns.add("primary mood"); usedColumns.add("mood_1"); usedColumns.add("mood_2"); usedColumns.add("mood_3");
  usedColumns.add("mood_confidence"); usedColumns.add("coord_x"); usedColumns.add("coord_y");
  usedColumns.add("mood coverage"); usedColumns.add("mood_1_color"); // logged but not stored
  usedColumns.add("has cover"); usedColumns.add("brightness_norm");
  usedColumns.add("loudness"); usedColumns.add("last_updated");
  usedColumns.add("suno id"); usedColumns.add("album artist"); usedColumns.add("album/ep");
  usedColumns.add("year"); usedColumns.add("composer"); usedColumns.add("grouping");
  usedColumns.add("rhythm density"); usedColumns.add("percussive shape");
  usedColumns.add("groove"); usedColumns.add("phrase length"); usedColumns.add("focus category");
  usedColumns.add("style"); usedColumns.add("lyrics"); // lyrics not stored

  const genreRaw = row["genre"] || "";
  const genres = genreRaw ? parseDelimitedTags(genreRaw) : [];
  const moodTags = parseDelimitedTags(row["mood tags"] || "");
  const primaryMood = row["primary mood"] || undefined;
  const mood1 = row["mood_1"];
  const mood2 = row["mood_2"];
  const mood3 = row["mood_3"];
  const moodSuggestions = [mood1, mood2, mood3].filter(Boolean);
  const moodConfidenceRaw = parseFloat(row["mood_confidence"] ?? "");
  const moodConfidence = !isNaN(moodConfidenceRaw) ? moodConfidenceRaw : undefined;
  const coordX = parseFloat(row["coord_x"] ?? "");
  const coordY = parseFloat(row["coord_y"] ?? "");
  const moodCoordX = !isNaN(coordX) ? coordX : undefined;
  const moodCoordY = !isNaN(coordY) ? coordY : undefined;
  const moodCoverageRaw = parseFloat(row["mood coverage"] ?? "");
  const moodCoverage = !isNaN(moodCoverageRaw) ? moodCoverageRaw : undefined;

  const brightnessNorm = parseFloat(row["brightness_norm"] ?? "");
  const brightness = !isNaN(brightnessNorm) ? brightnessNorm : undefined;

  const loudnessRaw = parseFloat(row["loudness"] ?? "");

  const audioAnalysis = {
    ...(loudnessRaw && !isNaN(loudnessRaw) ? { loudness: loudnessRaw } : {}),
    ...(brightness !== undefined ? { brightness } : {}),
  };
  const hasAnalysis = Object.keys(audioAnalysis).length > 0;

  const sunoId = row["suno id"] || undefined;

  const track = {
    trackId: stableId(sunoId, title, artist),
    title,
    artist,
    bpm,
    camelotKey,
    durationSeconds,
    energy,
    energySource,
    musicalKey,
    genre: genreRaw || undefined,
    genres: genres.length ? genres : undefined,
    albumTitle: row["album/ep"] || undefined,
    albumArtist: row["album artist"] || undefined,
    year: row["year"] ? (parseInt(row["year"], 10) || undefined) : undefined,
    composer: row["composer"] || undefined,
    grouping: row["grouping"] || undefined,
    fileName: row["audio filename"] || undefined,
    fileExtension: row["audio filename"] ? row["audio filename"].split(".").pop() : undefined,
    audioFilename: row["audio filename"] || undefined,
    artworkStatus: row["has cover"] ? artworkStatus(row["has cover"]) : undefined,
    moodTags: moodTags.length ? moodTags : undefined,
    primaryMood,
    moodSuggestions: moodSuggestions.length ? moodSuggestions : undefined,
    moodConfidence,
    moodCoordX,
    moodCoordY,
    moodCoverage,
    brightness,
    groove: row["groove"] || undefined,
    rhythmDensity: row["rhythm density"] || undefined,
    phraseLength: row["phrase length"] || undefined,
    percussiveShape: row["percussive shape"] || undefined,
    energyLevel: row["energy level"] || undefined,
    focusCategory: row["focus category"] || undefined,
    style: row["style"] || undefined,
    sunoId,
    catalogId: sunoId || undefined,
    sourceOwner: "studiorich",
    sourceLibrary: "StudioRich Catalog",
    platformUse: ["internal", "studiorich_stream"],
    analysisStatus: "partial",
    analysisSources: ["import", "external_tool"],
    analysisUpdatedAt: row["last_updated"] || undefined,
    audioAnalysis: hasAnalysis ? audioAnalysis : undefined,
    rating: 0,
    playCount: 0,
  };

  // Remove undefined fields
  Object.keys(track).forEach(k => { if (track[k] === undefined) delete track[k]; });

  tracks.push(track);
});

// Report unmapped CSV columns
headers.forEach(h => { if (!usedColumns.has(h)) unmapped.add(h); });

// ── Build project seed ─────────────────────────────────────────────────────
const now = new Date().toISOString();
const seed = {
  schemaVersion: "play-project-v2",
  libraryTracks: tracks,
  activePlaylistId: "playlist_default",
  playlists: [
    {
      playlistId: "playlist_default",
      title: "New Playlist",
      slots: [],
      curve: { points: [{ x: 0, y: 0.5 }, { x: 1, y: 0.5 }] },
      locks: [],
      orphans: [],
      targetDurationMinutes: 120,
      createdAt: now,
      updatedAt: now,
    },
  ],
  excludedTrackIds: [],
  createdAt: now,
  updatedAt: now,
};

writeFileSync(OUT_PATH, JSON.stringify(seed, null, 2), "utf8");

// ── Report ─────────────────────────────────────────────────────────────────
console.log("\n=== StudioRich Catalog Import ===");
console.log(`Imported:  ${tracks.length} tracks`);
console.log(`Rejected:  ${errors.length} rows`);
console.log(`Output:    ${OUT_PATH}`);

if (errors.length) {
  console.log("\nErrors:");
  errors.forEach(e => console.log("  " + e));
}

if (unmapped.size) {
  console.log("\nUnmapped CSV columns (not stored):");
  [...unmapped].forEach(c => console.log("  " + c));
}

console.log("\nField mapping summary:");
console.log("  suno id         → sunoId, catalogId");
console.log("  title           → title");
console.log("  artist          → artist");
console.log("  audio filename  → audioFilename, fileName, fileExtension");
console.log("  album/ep        → albumTitle");
console.log("  album artist    → albumArtist");
console.log("  genre           → genre, genres[]");
console.log("  year            → year");
console.log("  composer        → composer");
console.log("  grouping        → grouping");
console.log("  bpm             → bpm");
console.log("  key + scale     → musicalKey → camelotKey (via Camelot wheel)");
console.log("  duration        → durationSeconds");
console.log("  energy_norm     → energy (0-1 normalized)");
console.log("  brightness_norm → brightness, audioAnalysis.brightness");
console.log("  loudness        → audioAnalysis.loudness");
console.log("  mood tags       → moodTags[]");
console.log("  primary mood    → primaryMood");
console.log("  mood_1/2/3      → moodSuggestions[]");
console.log("  mood_confidence → moodConfidence");
console.log("  coord_x/y       → moodCoordX, moodCoordY");
console.log("  mood coverage   → moodCoverage");
console.log("  has cover       → artworkStatus (Yes→linked, No→missing)");
console.log("  rhythm density  → rhythmDensity");
console.log("  percussive shape→ percussiveShape");
console.log("  energy level    → energyLevel (raw)");
console.log("  groove          → groove");
console.log("  phrase length   → phraseLength");
console.log("  focus category  → focusCategory");
console.log("  style           → style");
console.log("  last_updated    → analysisUpdatedAt");
console.log("\nDefaults applied to all rows:");
console.log("  sourceOwner     = studiorich");
console.log("  sourceLibrary   = StudioRich Catalog");
console.log("  platformUse     = [internal, studiorich_stream]");
console.log("  analysisStatus  = partial");
console.log("  analysisSources = [import, external_tool]");
console.log("\nNot stored: lyrics, mood_1_color");
