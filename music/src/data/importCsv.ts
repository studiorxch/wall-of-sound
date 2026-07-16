import type { Track, CamelotKey, TrackAudioAnalysis, ArtworkStatus, AnalysisStatus, AnalysisSource, PlatformUse } from "./trackTypes";
import { clampEnergy, estimateEnergyFromBpm } from "../logic/energy";
import {
  parseDurationToSeconds,
  parseDelimitedTags,
  normalizeRating,
  normalizeSourceOwner,
} from "../logic/trackMetadata";
import { suggestMoodsFromAnalysis } from "../logic/moodSuggestions";
import { isValidCamelotKey } from "../logic/camelot";

function generateTrackId(): string {
  return `track_${Math.random().toString(36).slice(2, 10)}`;
}

// Musical key + scale → Camelot key
const MUSICAL_KEY_TO_CAMELOT: Record<string, CamelotKey> = {
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

function musicalKeyToCamelot(key: string, scale: string): CamelotKey | null {
  const combined = `${key.trim().toLowerCase()} ${scale.trim().toLowerCase()}`;
  return MUSICAL_KEY_TO_CAMELOT[combined] ?? null;
}

function artworkStatusFromHasCover(val: string): ArtworkStatus {
  const s = val.trim().toLowerCase();
  if (s === "yes" || s === "true" || s === "1") return "linked";
  if (s === "no" || s === "false" || s === "0") return "missing";
  return "unknown";
}

export type ImportResult = {
  tracks: Track[];
  errors: string[];
};

export function parseCsvTracks(csvText: string, opts?: {
  defaultSourceOwner?: Track["sourceOwner"];
  defaultSourceLibrary?: string;
  defaultPlatformUse?: PlatformUse[];
  defaultAnalysisStatus?: AnalysisStatus;
  defaultAnalysisSources?: AnalysisSource[];
}): ImportResult {
  const {
    defaultSourceOwner,
    defaultSourceLibrary,
    defaultPlatformUse,
    defaultAnalysisStatus,
    defaultAnalysisSources,
  } = opts ?? {};

  const lines = csvText.trim().split(/\r?\n/);
  if (lines.length < 2) {
    return { tracks: [], errors: ["CSV file appears empty or has no data rows."] };
  }

  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const errors: string[] = [];
  const tracks: Track[] = [];

  const allBpms: number[] = [];
  const rawRows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cols = splitCsvLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = (cols[idx] ?? "").trim();
    });
    rawRows.push(row);
    const bpm = parseFloat(row["bpm"]);
    if (!isNaN(bpm) && bpm > 0) allBpms.push(bpm);
  }

  const minBpm = allBpms.length ? Math.min(...allBpms) : 60;
  const maxBpm = allBpms.length ? Math.max(...allBpms) : 180;

  rawRows.forEach((row, i) => {
    const rowNum = i + 2;
    const bpmRaw = parseFloat(row["bpm"]);
    const rowErrors: string[] = [];

    // Title: fall back to audio_filename or generated label
    const rawTitle = row["title"] || row["audio filename"] || row["audio_filename"] || "";
    const title = rawTitle || `Track ${rowNum}`;

    const artist = row["artist"] || "";

    if (isNaN(bpmRaw) || bpmRaw <= 0) {
      rowErrors.push(`Row ${rowNum}: invalid BPM "${row["bpm"]}"`);
    }

    // Duration — catalog_v2 uses float seconds directly
    const durationRaw = parseDurationToSeconds(
      row["durationseconds"] || row["duration_seconds"] || row["duration"] || ""
    );
    if (durationRaw == null || durationRaw <= 0) {
      rowErrors.push(`Row ${rowNum}: invalid duration`);
    }

    // Camelot key: try explicit camelot columns first, then key+scale, then raw key
    const camelotRaw = row["camelotkey"] || row["camelot_key"] || row["camelot"] || "";
    const keyRaw = row["key"] || "";
    const scaleRaw = row["scale"] || "";
    // 0712_MUSIC_BPM_Key_Persistence_Repair: no fabricated default — stays
    // undefined ("—" in the UI) unless a real Camelot/key value was parsed.
    let camelotKey: CamelotKey | undefined;
    let rawKey: string | undefined;
    let musicalKey: string | undefined;

    if (camelotRaw && isValidCamelotKey(camelotRaw)) {
      camelotKey = camelotRaw as CamelotKey;
    } else if (keyRaw && scaleRaw) {
      musicalKey = `${keyRaw} ${scaleRaw}`;
      const derived = musicalKeyToCamelot(keyRaw, scaleRaw);
      if (derived) {
        camelotKey = derived;
      } else {
        rawKey = musicalKey;
      }
    } else if (keyRaw && isValidCamelotKey(keyRaw)) {
      camelotKey = keyRaw as CamelotKey;
    } else if (keyRaw) {
      rawKey = keyRaw;
    }

    if (rowErrors.length) {
      errors.push(...rowErrors);
      return;
    }

    // Energy: prefer energy_norm (0-1 normalized) over raw energy_level
    let energy: number;
    let energySource: Track["energySource"];
    const energyNorm = parseFloat(row["energy_norm"] ?? "");
    const energyRaw = parseFloat(row["energy"] || row["energy_level"] || "");

    if (!isNaN(energyNorm) && energyNorm >= 0 && energyNorm <= 1) {
      energy = clampEnergy(energyNorm);
      energySource = "manual";
    } else if (!isNaN(energyRaw) && energyRaw >= 0 && energyRaw <= 1) {
      energy = clampEnergy(energyRaw);
      energySource = "manual";
    } else {
      energy = estimateEnergyFromBpm(bpmRaw, minBpm, maxBpm);
      energySource = "estimated";
    }

    // Genres
    const genreRaw = row["genre"] || "";
    const genres = genreRaw ? parseDelimitedTags(genreRaw) : [];

    // Mood tags — catalog_v2 has "mood tags" column (with space)
    const moodRaw = row["mood tags"] || row["mood"] || row["moods"] || row["moodtags"] || "";
    const moodTags = moodRaw ? parseDelimitedTags(moodRaw) : [];

    // Primary mood
    const primaryMood = row["primary mood"] || row["primary_mood"] || undefined;

    // Mood suggestions from mood_1/2/3 columns
    const mood1 = row["mood_1"] || "";
    const mood2 = row["mood_2"] || "";
    const mood3 = row["mood_3"] || "";
    const moodSuggestionCandidates = [mood1, mood2, mood3].filter(Boolean);

    // Mood confidence
    const moodConfidenceRaw = parseFloat(row["mood_confidence"] ?? "");
    const moodConfidence = !isNaN(moodConfidenceRaw) ? moodConfidenceRaw : undefined;

    // Mood coordinates
    const coordX = parseFloat(row["coord_x"] ?? "");
    const coordY = parseFloat(row["coord_y"] ?? "");
    const moodCoordX = !isNaN(coordX) ? coordX : undefined;
    const moodCoordY = !isNaN(coordY) ? coordY : undefined;

    // Mood coverage
    const moodCoverageRaw = parseFloat((row["mood coverage"] || row["mood_coverage"]) ?? "");
    const moodCoverage = !isNaN(moodCoverageRaw) ? moodCoverageRaw : undefined;

    // Artwork status
    const hasCoverRaw = row["has cover"] || row["has_cover"] || "";
    const artworkStatus: ArtworkStatus | undefined = hasCoverRaw
      ? artworkStatusFromHasCover(hasCoverRaw)
      : undefined;

    // Audio analysis fields
    const audioAnalysis: TrackAudioAnalysis = {};
    const parseF = (v: string) => { const n = parseFloat(v); return isNaN(n) ? undefined : n; };
    const parseI = (v: string) => { const n = parseInt(v, 10); return isNaN(n) ? undefined : n; };
    audioAnalysis.actualBpm = parseF(row["actual_bpm"] ?? "");
    audioAnalysis.bpmConfidence = parseF(row["bpm_confidence"] ?? "");
    audioAnalysis.actualKey = row["actual_key"] || undefined;
    audioAnalysis.keyConfidence = parseF(row["key_confidence"] ?? "");
    audioAnalysis.camelot = row["camelot"] || undefined;
    audioAnalysis.tempoFamily = row["tempo_family"] || undefined;
    audioAnalysis.energyScore = parseF(row["energy_score"] ?? "");
    audioAnalysis.energyLevel = row["energy_level"] || row["energy level"] || undefined;
    audioAnalysis.loudness = parseF(row["loudness"] ?? "");
    audioAnalysis.rmsMean = parseF(row["rms_mean"] ?? "");
    audioAnalysis.rmsPeak = parseF(row["rms_peak"] ?? "");
    audioAnalysis.dynamicRange = parseF(row["dynamic_range"] ?? "");
    audioAnalysis.onsetDensity = parseF(row["onset_density"] ?? "");
    audioAnalysis.transientDensity = parseF(row["transient_density"] ?? "");
    audioAnalysis.spectralCentroid = parseF(row["spectral_centroid"] ?? "");
    audioAnalysis.spectralRolloff = parseF(row["spectral_rolloff"] ?? "");
    audioAnalysis.zeroCrossingRate = parseF(row["zero_crossing_rate"] ?? "");
    audioAnalysis.brightness = parseF(row["brightness_norm"] || row["brightness"] || "");
    audioAnalysis.density = parseF(row["density"] ?? "");
    audioAnalysis.sampleRate = parseI(row["sample_rate"] ?? "");
    audioAnalysis.channels = parseI(row["channels"] ?? "");
    audioAnalysis.beatsDetected = parseI(row["beats_detected"] ?? "");
    audioAnalysis.analysisVersion = row["analysis_version"] || undefined;
    const hasAnalysis = Object.values(audioAnalysis).some((v) => v !== undefined);

    // Source owner — prefer explicit column, then default, then "unknown"
    const explicitOwner = row["source_owner"] || row["sourceowner"];
    const sourceOwner = explicitOwner
      ? normalizeSourceOwner(explicitOwner)
      : (defaultSourceOwner ?? "unknown");

    // Analysis status & sources
    const analysisStatus: AnalysisStatus = defaultAnalysisStatus ?? "not_analyzed";
    const analysisSources: AnalysisSource[] | undefined = defaultAnalysisSources;

    // Catalog identity
    const sunoIdRaw = row["suno id"] || row["suno_id"] || "";
    const catalogId = sunoIdRaw || row["catalogid"] || row["catalog_id"] || undefined;

    // Platform use
    const platformUse: PlatformUse[] | undefined = defaultPlatformUse;

    // Source library
    const sourceLibrary = row["source_library"] || row["sourcelibrary"] || defaultSourceLibrary || undefined;

    // File metadata
    const audioFilenameRaw = row["audio filename"] || row["audio_filename"] || "";
    const fileName = audioFilenameRaw || undefined;
    const fileExtension = fileName ? fileName.split(".").pop() : undefined;

    // Focus category (StudioRich catalog field)
    const focusCategory = row["focus category"] || row["focus_category"] || undefined;

    // Style
    const style = row["style"] || undefined;

    // Last updated → analysisUpdatedAt
    const analysisUpdatedAt = row["last_updated"] || row["last updated"] || undefined;

    // Brightness as top-level
    const brightnessNorm = parseF(row["brightness_norm"] ?? "");

    const track: Track = {
      trackId: generateTrackId(),
      title,
      artist,
      bpm: bpmRaw,
      bpmSource: "csv_metadata",
      camelotKey,
      keySource: camelotKey ? "csv_metadata" : undefined,
      durationSeconds: durationRaw!,
      energy,
      energySource,
      filePath: row["filepath"] || row["file_path"] || undefined,
      fileName,
      fileExtension,
      audioFilename: fileName,
      genre: genreRaw || undefined,
      genres: genres.length ? genres : undefined,
      sourcePlaylist: row["sourceplaylist"] || row["source_playlist"] || undefined,
      albumTitle: row["album/ep"] || row["album"] || row["album_title"] || row["albumtitle"] || undefined,
      albumArtist: row["album artist"] || row["album_artist"] || row["albumartist"] || undefined,
      year: row["year"] ? parseInt(row["year"], 10) || undefined : undefined,
      composer: row["composer"] || undefined,
      grouping: row["grouping"] || undefined,
      key: rawKey,
      musicalKey,
      moodTags: moodTags.length ? moodTags : undefined,
      importedMoodTags: moodTags.length ? moodTags : undefined,
      primaryMood,
      moodSuggestions: moodSuggestionCandidates.length ? moodSuggestionCandidates : undefined,
      moodConfidence,
      moodCoordX,
      moodCoordY,
      moodCoverage,
      artworkStatus,
      rating: normalizeRating(row["rating"]) ?? 0,
      sourceOwner,
      sourceLibrary,
      catalogId,
      sunoId: sunoIdRaw || undefined,
      platformUse,
      analysisStatus,
      analysisSources,
      analysisUpdatedAt,
      groove: row["groove"] || undefined,
      rhythmDensity: row["rhythm density"] || row["rhythm_density"] || row["rhythmdensity"] || undefined,
      phraseLength: row["phrase length"] || row["phrase_length"] || row["phraselength"] || undefined,
      percussiveShape: row["percussive shape"] || row["percussive_shape"] || row["percussiveshape"] || undefined,
      energyLevel: row["energy level"] || row["energy_level"] || undefined,
      brightness: brightnessNorm ?? undefined,
      focusCategory,
      style,
      albumArtUrl: row["album_art"] || row["album_art_url"] || row["albumarturl"] || undefined,
      audioAnalysis: hasAnalysis ? audioAnalysis : undefined,
      playCount: 0,
    };

    // Generate mood suggestions from analysis if we don't have them yet
    if (!track.moodSuggestions?.length && hasAnalysis) {
      track.moodSuggestions = suggestMoodsFromAnalysis(track);
    }

    // Capture unmapped columns that have no first-class field (0701D)
    const mappedColumns = new Set([
      "title", "artist", "bpm", "duration", "durationseconds", "duration_seconds",
      "camelotkey", "camelot_key", "camelot", "key", "scale",
      "energy_norm", "energy", "energy_level", "energy level",
      "genre", "mood tags", "mood", "moods", "moodtags",
      "primary mood", "primary_mood", "mood_1", "mood_2", "mood_3",
      "mood_confidence", "coord_x", "coord_y", "mood coverage", "mood_coverage",
      "has cover", "has_cover", "brightness_norm", "brightness",
      "audio filename", "audio_filename", "filepath", "file_path",
      "source_owner", "sourceowner", "source_library", "sourcelibrary",
      "album/ep", "album", "album_title", "albumtitle",
      "album artist", "album_artist", "albumartist",
      "year", "composer", "grouping", "suno id", "suno_id",
      "catalogid", "catalog_id", "rating", "groove",
      "rhythm density", "rhythm_density", "rhythmdensity",
      "percussive shape", "percussive_shape", "percussiveshape",
      "phrase length", "phrase_length", "phraselength",
      "focus category", "focus_category", "style", "last_updated", "last updated",
      "loudness", "actual_bpm", "bpm_confidence", "actual_key", "key_confidence",
      "tempo_family", "energy_score", "rms_mean", "rms_peak", "dynamic_range",
      "onset_density", "transient_density", "spectral_centroid", "spectral_rolloff",
      "zero_crossing_rate", "density", "sample_rate", "channels", "beats_detected",
      "analysis_version", "album_art", "album_art_url", "albumarturl",
      "sourceplaylist", "source_playlist",
    ]);
    const importMetadata: Record<string, string | number | boolean | null> = {};
    for (const [col, val] of Object.entries(row)) {
      if (!mappedColumns.has(col) && val !== "") {
        const asNum = parseFloat(val);
        importMetadata[col] = isNaN(asNum) ? val : asNum;
      }
    }

    if (Object.keys(importMetadata).length > 0) {
      track.importMetadata = importMetadata;
    }

    tracks.push(track);
  });

  return { tracks, errors };
}

function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}
