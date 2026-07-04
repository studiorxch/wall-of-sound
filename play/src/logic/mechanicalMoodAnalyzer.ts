/**
 * Catalog-derived mechanical mood analyzer (0701D).
 *
 * Uses only existing catalog fields (BPM, energy, brightness, rhythm density,
 * groove, focus category, mood tags, etc.) — no audio file access required.
 *
 * Each MechanicalMoodTag receives a confidence score 0–1 based on how many
 * catalog signals support it. Tags above 0.48 are assigned. Max 3 per track
 * unless confidence is very high.
 */

import type { Track, MechanicalMoodTag, MechanicalAnalysisSource } from "../data/trackTypes";

export type MechanicalMoodResult = {
  mechanicalMoodTags: MechanicalMoodTag[];
  mechanicalMoodConfidence: Record<string, number>;
  mechanicalAnalysisStatus: "partial" | "analyzed";
  mechanicalAnalysisSources: MechanicalAnalysisSource[];
  mechanicalAnalysisNotes: string[];
};

// ── Signal parsers ─────────────────────────────────────────────────────────

function parseRhythmDensity(v: string | undefined): number {
  if (!v) return 0.5;
  const s = v.trim().toLowerCase();
  if (s === "high" || s === "dense") return 0.85;
  if (s === "low" || s === "sparse") return 0.2;
  return 0.5; // medium or unknown
}

function parseMoodKeywords(track: Track): Set<string> {
  const kw = new Set<string>();
  const addWords = (s: string | undefined) => {
    if (!s) return;
    s.toLowerCase().split(/[\s,/|;]+/).forEach((w) => w.length > 2 && kw.add(w));
  };
  addWords(track.primaryMood);
  addWords(track.focusCategory);
  track.moodTags?.forEach(addWords);
  track.moodSuggestions?.forEach(addWords);
  return kw;
}

function hasAny(kw: Set<string>, ...words: string[]): boolean {
  return words.some((w) => kw.has(w) || [...kw].some((k) => k.includes(w)));
}

function bpmNorm(bpm: number): number {
  // Map 60–180 bpm → 0–1
  return Math.max(0, Math.min(1, (bpm - 60) / 120));
}

// ── Per-tag scoring ────────────────────────────────────────────────────────

type ScoreFn = (track: Track, energy: number, brightness: number, bpmN: number, rhythmD: number, kw: Set<string>, notes: string[]) => number;

const TAG_SCORERS: Record<MechanicalMoodTag, ScoreFn> = {

  opener(t, energy, brightness, bpmN, rhythmD, kw, notes) {
    let s = 0;
    if (energy > 0.65) { s += 0.38; notes.push("high energy"); }
    if (bpmN > 0.42) { s += 0.28; notes.push("fast BPM"); }
    if (bpmN > 0.55) s += 0.1;
    if (brightness > 0.55) { s += 0.12; notes.push("bright"); }
    if (hasAny(kw, "energetic", "uplifting", "powerful", "opening", "hype")) { s += 0.18; notes.push("opener keywords"); }
    return s;
  },

  closer(t, energy, brightness, bpmN, _rd, kw, notes) {
    let s = 0;
    if (energy < 0.35) { s += 0.42; notes.push("low energy"); }
    if (bpmN < 0.3) { s += 0.28; notes.push("slow BPM"); }
    if (brightness < 0.45) { s += 0.1; notes.push("low brightness"); }
    if ((t.durationSeconds ?? 0) > 240) { s += 0.1; notes.push("long duration"); }
    if (hasAny(kw, "mellow", "ambient", "calm", "closing", "end", "fade", "outro")) { s += 0.16; notes.push("closer keywords"); }
    return s;
  },

  drop(t, energy, brightness, bpmN, rhythmD, kw, notes) {
    let s = 0;
    if (energy > 0.78) { s += 0.45; notes.push("very high energy"); }
    if (bpmN > 0.55) { s += 0.3; notes.push("fast BPM"); }
    if (rhythmD > 0.7) { s += 0.2; notes.push("dense rhythm"); }
    if (hasAny(kw, "drop", "impact", "peak", "intense", "powerful")) { s += 0.1; notes.push("drop keywords"); }
    return s;
  },

  lift(t, energy, brightness, bpmN, _rd, kw, notes) {
    let s = 0;
    if (energy > 0.65) { s += 0.35; notes.push("high energy"); }
    if (brightness > 0.6) { s += 0.42; notes.push("high brightness"); }
    if (bpmN > 0.35) { s += 0.15; notes.push("medium+ BPM"); }
    if (hasAny(kw, "lift", "uplifting", "bright", "rising", "ascend")) { s += 0.12; notes.push("lift keywords"); }
    return s;
  },

  brightener(t, energy, brightness, bpmN, _rd, kw, notes) {
    let s = 0;
    if (brightness > 0.65) { s += 0.52; notes.push("high brightness"); }
    if (energy > 0.4 && energy < 0.8) { s += 0.28; notes.push("moderate energy"); }
    if (hasAny(kw, "bright", "light", "cheerful", "happy", "upbeat")) { s += 0.15; notes.push("bright keywords"); }
    return s;
  },

  pulse(t, energy, brightness, bpmN, rhythmD, kw, notes) {
    let s = 0;
    if (energy > 0.5 && energy < 0.82) { s += 0.28; notes.push("medium-high energy"); }
    if (rhythmD > 0.7) { s += 0.4; notes.push("dense rhythm"); }
    if (bpmN > 0.42 && bpmN < 0.75) { s += 0.22; notes.push("mid-fast BPM"); }
    if (hasAny(kw, "pulse", "driving", "groove", "rhythmic")) { s += 0.1; notes.push("pulse keywords"); }
    return s;
  },

  build(t, energy, brightness, bpmN, _rd, kw, notes) {
    let s = 0;
    if (energy > 0.45 && energy < 0.75) { s += 0.3; notes.push("building energy range"); }
    if (bpmN > 0.33 && bpmN < 0.65) { s += 0.28; notes.push("build BPM range"); }
    if (brightness > 0.38 && brightness < 0.72) { s += 0.22; notes.push("moderate brightness"); }
    if (hasAny(kw, "build", "rising", "tension", "progression", "climb")) { s += 0.2; notes.push("build keywords"); }
    return s;
  },

  plateau(t, energy, brightness, bpmN, rhythmD, kw, notes) {
    let s = 0;
    if (energy > 0.45 && energy < 0.7) { s += 0.4; notes.push("stable energy range"); }
    if (bpmN > 0.28 && bpmN < 0.55) { s += 0.3; notes.push("stable BPM"); }
    if (rhythmD > 0.3 && rhythmD < 0.75) { s += 0.2; notes.push("medium rhythm density"); }
    return s;
  },

  hold(t, energy, brightness, bpmN, rhythmD, kw, notes) {
    let s = 0;
    if (energy > 0.3 && energy < 0.58) { s += 0.42; notes.push("held energy"); }
    if (bpmN > 0.2 && bpmN < 0.48) { s += 0.3; notes.push("moderate BPM"); }
    if (rhythmD < 0.65) { s += 0.18; notes.push("non-dense rhythm"); }
    if (hasAny(kw, "hold", "sustain", "steady", "stable")) { s += 0.1; notes.push("hold keywords"); }
    return s;
  },

  anchor(t, energy, brightness, bpmN, rhythmD, kw, notes) {
    let s = 0;
    if (t.groove) { s += 0.42; notes.push("groove field present"); }
    if (energy > 0.38 && energy < 0.7) { s += 0.28; notes.push("anchor energy range"); }
    if (bpmN > 0.25 && bpmN < 0.52) { s += 0.2; notes.push("anchor BPM"); }
    if (rhythmD > 0.38 && rhythmD < 0.78) { s += 0.1; notes.push("medium rhythm"); }
    return s;
  },

  bridge(t, energy, brightness, bpmN, _rd, kw, notes) {
    let s = 0;
    if (energy > 0.28 && energy < 0.62) { s += 0.35; notes.push("bridge energy range"); }
    if (brightness > 0.3 && brightness < 0.65) { s += 0.25; notes.push("mid brightness"); }
    if (bpmN > 0.22 && bpmN < 0.52) { s += 0.2; notes.push("bridge BPM"); }
    if (hasAny(kw, "bridge", "connect", "link", "transition", "between")) { s += 0.2; notes.push("bridge keywords"); }
    return s;
  },

  transition(t, energy, brightness, bpmN, _rd, kw, notes) {
    let s = 0;
    if (energy > 0.32 && energy < 0.62) { s += 0.3; notes.push("transition energy"); }
    const dur = t.durationSeconds ?? 0;
    if (dur > 0 && dur < 210) { s += 0.25; notes.push("short/medium duration"); }
    if (bpmN > 0.28 && bpmN < 0.58) { s += 0.2; notes.push("transition BPM"); }
    if (hasAny(kw, "transition", "interlude", "bridge", "connecting")) { s += 0.25; notes.push("transition keywords"); }
    return s;
  },

  recovery(t, energy, brightness, bpmN, _rd, kw, notes) {
    let s = 0;
    if (energy > 0.22 && energy < 0.52) { s += 0.42; notes.push("recovery energy"); }
    if (bpmN > 0.2 && bpmN < 0.42) { s += 0.3; notes.push("slower BPM"); }
    if (hasAny(kw, "recovery", "calm", "mellow", "gentle", "soft")) { s += 0.2; notes.push("recovery keywords"); }
    return s;
  },

  reset(t, energy, brightness, bpmN, _rd, kw, notes) {
    let s = 0;
    if (energy < 0.4) { s += 0.45; notes.push("low energy"); }
    if (bpmN < 0.35) { s += 0.35; notes.push("slow BPM"); }
    if (hasAny(kw, "reset", "break", "pause", "rest", "minimal")) { s += 0.2; notes.push("reset keywords"); }
    return s;
  },

  drift(t, energy, brightness, bpmN, _rd, kw, notes) {
    let s = 0;
    if (energy < 0.35) { s += 0.4; notes.push("very low energy"); }
    if (bpmN < 0.3) { s += 0.3; notes.push("slow BPM"); }
    if (brightness < 0.45) { s += 0.2; notes.push("low brightness"); }
    if (hasAny(kw, "drift", "ambient", "atmospheric", "floating", "sparse")) { s += 0.2; notes.push("drift keywords"); }
    return s;
  },

  deepener(t, energy, brightness, bpmN, _rd, kw, notes) {
    let s = 0;
    if (brightness < 0.4) { s += 0.48; notes.push("low brightness"); }
    if (energy > 0.35 && energy < 0.68) { s += 0.35; notes.push("mid energy"); }
    if (hasAny(kw, "deep", "dark", "bass", "heavy", "dense", "underground")) { s += 0.2; notes.push("deepener keywords"); }
    return s;
  },

  shadow(t, energy, brightness, bpmN, _rd, kw, notes) {
    let s = 0;
    if (brightness < 0.28) { s += 0.55; notes.push("very low brightness"); }
    if (energy > 0.18 && energy < 0.58) { s += 0.3; notes.push("mid-low energy"); }
    if (hasAny(kw, "shadow", "dark", "noir", "minimal", "brooding")) { s += 0.2; notes.push("shadow keywords"); }
    return s;
  },

  tension(t, energy, brightness, bpmN, rhythmD, kw, notes) {
    let s = 0;
    if (energy > 0.62) { s += 0.42; notes.push("high energy"); }
    if (brightness < 0.42) { s += 0.42; notes.push("low brightness"); }
    if (rhythmD > 0.55) { s += 0.15; notes.push("rhythm density"); }
    if (hasAny(kw, "tension", "tense", "suspense", "dark", "aggressive")) { s += 0.1; notes.push("tension keywords"); }
    return s;
  },

  release(t, energy, brightness, bpmN, _rd, kw, notes) {
    let s = 0;
    if (energy > 0.32 && energy < 0.68) { s += 0.3; notes.push("release energy"); }
    if (brightness > 0.58) { s += 0.42; notes.push("high brightness"); }
    if (bpmN > 0.25 && bpmN < 0.52) { s += 0.2; notes.push("release BPM"); }
    if (hasAny(kw, "release", "resolution", "resolve", "light", "open", "euphoric")) { s += 0.12; notes.push("release keywords"); }
    return s;
  },

  disruptor(t, energy, brightness, bpmN, rhythmD, kw, notes) {
    let s = 0;
    if (bpmN > 0.62) { s += 0.35; notes.push("very fast BPM"); }
    if (energy > 0.83) { s += 0.35; notes.push("very high energy"); }
    if (rhythmD > 0.75) { s += 0.2; notes.push("dense rhythm"); }
    if (hasAny(kw, "disrupt", "intense", "chaos", "aggressive", "power")) { s += 0.15; notes.push("disruptor keywords"); }
    return s;
  },
};

const ALL_TAGS = Object.keys(TAG_SCORERS) as MechanicalMoodTag[];

// ── Main export ───────────────────────────────────────────────────────────

export function analyzeMechanicalMoods(track: Track): MechanicalMoodResult {
  const energy = track.energy ?? 0.5;
  const brightness = track.brightness ?? track.audioAnalysis?.brightness ?? 0.5;
  const bpm = track.bpm ?? 120;
  const bpmN = bpmNorm(bpm);
  const rhythmD = parseRhythmDensity(track.rhythmDensity);
  const kw = parseMoodKeywords(track);

  const scores: Partial<Record<MechanicalMoodTag, number>> = {};
  const allNotes: string[] = [];

  for (const tag of ALL_TAGS) {
    const tagNotes: string[] = [];
    const score = Math.min(1, TAG_SCORERS[tag](track, energy, brightness, bpmN, rhythmD, kw, tagNotes));
    if (score > 0) {
      scores[tag] = score;
      if (tagNotes.length) allNotes.push(`${tag}: ${tagNotes.join(", ")}`);
    }
  }

  // Select tags above threshold, cap at 3 unless very high confidence
  const THRESHOLD = 0.48;
  const sorted = (Object.entries(scores) as [MechanicalMoodTag, number][])
    .filter(([, v]) => v >= THRESHOLD)
    .sort(([, a], [, b]) => b - a);

  const maxTags = sorted.length > 0 && sorted[0][1] >= 0.88 ? 4 : 3;
  const selected = sorted.slice(0, maxTags);
  const mechanicalMoodTags = selected.map(([tag]) => tag);
  const mechanicalMoodConfidence: Record<string, number> = {};
  selected.forEach(([tag, score]) => { mechanicalMoodConfidence[tag] = Math.round(score * 100) / 100; });

  // Determine how many signals were available
  const signalCount = [
    track.energy != null,
    track.brightness != null || track.audioAnalysis?.brightness != null,
    track.bpm != null,
    track.rhythmDensity != null,
    track.groove != null,
    (track.moodTags?.length ?? 0) > 0,
    track.primaryMood != null,
    track.focusCategory != null,
    (track.moodSuggestions?.length ?? 0) > 0,
  ].filter(Boolean).length;

  const mechanicalAnalysisStatus: "partial" | "analyzed" = signalCount >= 4 ? "analyzed" : "partial";

  const sources: MechanicalAnalysisSource[] = ["play_catalog_analyzer"];
  if (track.analysisSources?.includes("import")) sources.unshift("catalog_import");

  const notes = [
    `Signals used: ${signalCount}/9 available catalog fields`,
    ...allNotes.slice(0, 6),
  ];
  if (signalCount < 4) notes.push("Limited signals — result may be imprecise");

  return {
    mechanicalMoodTags,
    mechanicalMoodConfidence,
    mechanicalAnalysisStatus,
    mechanicalAnalysisSources: sources,
    mechanicalAnalysisNotes: notes,
  };
}
