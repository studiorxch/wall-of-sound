// Glyph — top-level workspace.
//
// From 0804C forward (docs/glyph-audio/0804_GLYPH_NOTES_Full_Canvas_Pulse_Truth_Drum_Layer_Spec_v0.1.0.md),
// this is the PRIMARY pipeline, replacing the prior builds' reliance on an
// already-complete Track.beatMap.beatTimesSeconds (empty on every real
// track checked in 0804B's live verification) with a full-duration pulse
// grid derived from confirmed BPM + track duration alone (§6):
//
//   Track Audio -> Duration + Confirmed BPM -> Beat Anchor Detection
//   -> Full-Duration Pulse Grid -> Per-Pulse Feature Mapping
//   -> Continuous Pulse-Run Geometry -> Section-Aware Layout
//   -> Full Canvas Fit -> Drum Event Detection -> Layered Preview
//   -> Persistence -> Deterministic SVG Export
//
// Scope decision, disclosed in the 0804C completion report: this build
// does NOT reconcile the prior builds' MappingPreset/mappingEvaluation.ts
// rule system or ConnectionGrammar's bar/phrase/silence decision machinery
// into the new pulse-truth pipeline — energy->height uses the same single
// direct mapping 0804A shipped as its own default, and the continuous
// path's only break is at section boundaries (§9.6). glyphRunFormation.ts/
// connectionGrammar.ts/connectorGeometry.ts/punctuationGeometry.ts/
// manuscriptLayout.ts/archGrammar.ts's generateGlyphInstances/
// beatUnitDerivation.ts and GlyphConnectionEditor.tsx/GlyphPreviewCanvas.tsx/
// GlyphBeatGridReview.tsx all remain fully intact and unit-tested but are
// no longer wired into this workspace's render — a real, deliberate scope
// cut given the size of this build, not an oversight. GlyphComposition
// still requires their legacy fields (mappingPresetId/Snapshot,
// layoutPresetId/Snapshot, connectionGrammarId/Snapshot) from 0804A/0804B;
// this build populates them with small inert defaults, clearly marked
// below, since nothing in the new render path reads them.
//
// 0804D (docs/glyph-audio/0804_GLYPH_NOTES_Silent_Bar_Spacing_Event_Dot_Reassignment_Spec_v0.1.0.md):
// bars are no longer a dot — buildContinuousGlyphRuns' own DEFAULT_GLYPH_SPACING
// (continuousGlyphRuns.ts) now inserts silent horizontal spacing at bar
// (and, when phraseId is ever populated upstream, phrase) boundaries
// instead, reusing 0804B's BoundaryBehavior type vocabulary for the two
// behavior fields without touching 0804B's own DEFAULT_CONNECTION_GRAMMAR
// or its still-intact, still-tested pipeline. Dots are reserved for real
// audible events (drum onsets) only.
//
// Reuses MUSIC's existing audio decode infrastructure
// (decodeAudioAnalysisInput) and the exact per-pulse RMS energy functions
// beatGridAdapter.ts already established (computeBeatWindows/
// computeBeatEnergyFromChannelData/normalizeEnergyTrackRelative) — applied
// now to the full pulse-truth grid's own timestamps instead of a
// track.beatMap-derived list.
//
// Drum sourcing (§14): `selectDrumAudioSourceForTrack` below reads the
// existing stem archive read-only via fetchStemSets (the same GET the
// Sectional Looper already calls) and, when a "current"-lifecycle stem set
// has a drums stem, decodes it through the existing session-only
// stemLooperSource.ts adapter — no changes to the stem system itself.
// Falls back to the already-decoded full mix when no such stem set exists.

import { useEffect, useMemo, useState } from "react";
import type { Track } from "../../data/trackTypes";
import type { MusicalAnalysisDocument, BeatUnit, SectionUnit, BarUnit, BoundaryUnit } from "../../data/glyphAudioTypes";
import type { MappingPreset } from "../../data/glyphMappingTypes";
import type { GlyphGrammar } from "../../data/glyphGrammarTypes";
import type { ManuscriptLayoutPreset } from "../../data/glyphLayoutTypes";
import type { GlyphComposition, RenderProfile, ExportRecord, GlyphLayerVisibility, GlyphColorMode } from "../../data/glyphCompositionTypes";
import type { PulseTruthResult, ConfirmedBpmResult } from "../../data/glyphPulseTruthTypes";
import type { GlyphCanvasShape, GlyphViewportMode, GlyphCanvasPreset } from "../../data/glyphCanvasTypes";
import type { DrumLayerResult, DrumEventSource } from "../../data/glyphDrumLayerTypes";
import type { LaserLayerResult, LaserLayerSource, LaserRenderSettings } from "../../data/glyphLaserLayerTypes";
import { decodeAudioAnalysisInput, type DecodeOptions } from "../../logic/audioAnalysisInput";
import { computeBeatWindows, computeBeatEnergyFromChannelData, normalizeEnergyTrackRelative } from "../../logic/glyph/beatGridAdapter";
import { computePulseTruth, PULSE_TRUTH_VERSION } from "../../logic/glyph/pulseTruth";
import { buildContinuousGlyphRuns } from "../../logic/glyph/continuousGlyphRuns";
import { computeFullCanvasLayout } from "../../logic/glyph/fullCanvasLayout";
import { detectDrumEvents, selectDrumAudioSource, DRUM_LAYER_ANALYZER_VERSION } from "../../logic/glyph/drumEventDetection";
import { layoutDrumEvents } from "../../logic/glyph/drumLayerLayout";
import { buildAudibleEvents, EVENT_VOCABULARY_ANALYZER_VERSION, EVENT_CLASSIFICATION_THRESHOLD_VERSION } from "../../logic/glyph/glyphEventVocabulary";
import { placeAudibleEvents } from "../../logic/glyph/glyphEventSymbolGeometry";
import { selectLaserAudioSource } from "../../logic/glyph/laserSourceSelection";
import { detectLaserActivity, LASER_ANALYZER_VERSION } from "../../logic/glyph/laserLayerAnalysis";
import { layoutLaserFrames, DEFAULT_LASER_ACTIVITY_THRESHOLD, DEFAULT_LASER_VERTICAL_OFFSET } from "../../logic/glyph/laserLayerLayout";
import { FRANK_COVER_PRESET_ID } from "../../logic/glyph/glyphColorPresets";
import { fetchStemSets, resolveTrackAudioIdentifier } from "../../logic/stems/stemClient";
import { buildStemLooperSourceTrack } from "../../logic/stems/stemLooperSource";
import { applyHandmadeDeformation } from "../../logic/glyph/handmadeDeformation";
import { computeFullCanvasCacheKey } from "../../logic/glyph/glyphCacheKey";
import { buildFullCanvasSvgDocument, GLYPH_FULL_CANVAS_RENDERER_VERSION } from "../../logic/glyph/glyphSvgExport";
import { DEFAULT_CONNECTION_GRAMMAR } from "../../logic/glyph/connectionGrammar";
import { isBeatMapTrustedForAnalysis } from "../../logic/beatMap/beatMapTrust";
import { downloadBlob } from "./GlyphExportPanel";
import { SQUARE_CANVAS_PRESET, PORTRAIT_CANVAS_PRESET } from "../../data/glyphCanvasTypes";
import { GlyphCanvasEditor } from "./GlyphCanvasEditor";
import { GlyphFullCanvasPreview } from "./GlyphFullCanvasPreview";
import { GlyphDiagnostics } from "./GlyphDiagnostics";
import { GlyphEventLayerEditor } from "./GlyphEventLayerEditor";
import { GlyphLaserLayerEditor } from "./GlyphLaserLayerEditor";

export type SaveGlyphCompositionPayload = {
  analysis: MusicalAnalysisDocument;
  mappingPreset?: MappingPreset;
  grammar?: GlyphGrammar;
  layoutPreset?: ManuscriptLayoutPreset;
  composition: GlyphComposition;
};

export type GlyphWorkspaceProps = {
  libraryTracks: Track[];
  sourceTrackId: string | null;
  resolveTrackUrl: (track: Track) => string | null;
  onAuditionTrack?: (trackId: string) => void;
  auditionTrackId?: string | null;
  playbackStatus?: string;
  onPauseTrack?: () => void;
  onResumeTrack?: () => void;
  currentTimeSeconds?: number;

  glyphMappingPresets: MappingPreset[];
  glyphGrammars: GlyphGrammar[];
  glyphLayoutPresets: ManuscriptLayoutPreset[];

  onSaveGlyphComposition: (payload: SaveGlyphCompositionPayload) => void;
  onRecordGlyphExport: (record: ExportRecord) => void;
};

function nowIso() {
  return new Date().toISOString();
}
function makeId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

const GLOBAL_SEED = 1; // one global seed per composition — no reroll UI this slice
const DECODE_OPTIONS: DecodeOptions = { channelMode: "mono" };
const DEFAULT_BEATS_PER_BAR = 4;
const DEFAULT_DRAFT_BPM = 120;
const DRUM_LANE_OFFSET = 40;
const DRUM_MAX_MARK_HEIGHT = 20;

const DEFAULT_ARCH_GRAMMAR: GlyphGrammar = {
  id: "grammar-full-canvas-default", schemaVersion: 1, grammarType: "arch-script-v1", name: "Arch Script (default)",
  defaultParameters: {
    archCount: 1, width: 20, height: 15, curveSharpness: 0.25, asymmetry: 0.1, baselineOffset: 0,
    connectorLength: 0, connectorSag: 0, entryOvershoot: 0, exitOvershoot: 0, localCompression: 0,
    dotEnabled: false, dotSize: 1, dotOffset: 0, handmadeVariance: 0.2,
  },
  createdAt: "", updatedAt: "",
};

const DEFAULT_RENDER_PROFILE: RenderProfile = {
  id: "render-default", schemaVersion: 1, name: "Default",
  strokeWidthMm: 0.5, strokeColor: "#000000", dotRadiusMm: 1,
  roundCapsAndJoins: true, backgroundColor: "none",
};

const DEFAULT_LAYER_VISIBILITY: GlyphLayerVisibility = {
  pulseManuscript: true, drumEvents: false, clapEvents: false, accentEvents: false, laserLayer: false,
  sections: true, safeArea: false,
};

const DEFAULT_LASER_RENDER_SETTINGS: LaserRenderSettings = {
  mode: "oscillationLine", activityThreshold: DEFAULT_LASER_ACTIVITY_THRESHOLD,
  amplitude: 10, smoothing: 0.5, verticalOffset: DEFAULT_LASER_VERTICAL_OFFSET, strokeWidth: 0.3,
};

// GlyphComposition's mappingPresetSnapshot/layoutPresetSnapshot/
// connectionGrammarSnapshot fields are inherited, required data from prior
// builds' pipeline (see file header) — nothing in THIS pipeline reads
// these back; they exist purely to satisfy GlyphComposition's type until a
// future build either removes them or genuinely reconciles the two
// pipelines.
const INERT_MAPPING_PRESET: Omit<MappingPreset, "id" | "createdAt" | "updatedAt"> = {
  schemaVersion: 1, name: "(unused — full canvas pipeline)", description: "Not read by the full-canvas pipeline.",
  grammarId: "arch-script-v1", rules: [], boundaryRules: [],
};
const INERT_LAYOUT_PRESET: Omit<ManuscriptLayoutPreset, "id"> = {
  type: "manuscriptRows", pageWidthMm: 210, pageHeightMm: 297, marginMm: 15,
  barsPerRow: 4, rowGapMm: 10, baseBeatWidthMm: 12, alignBars: true, sectionStartsNewRow: true, preserveSilence: true,
};

function pulsesToMusicalAnalysisDocument(
  pulseTruthResult: PulseTruthResult, id: string, sourceAudioId: string, createdAt: string, beatsPerBar: number,
): MusicalAnalysisDocument {
  const beats: BeatUnit[] = pulseTruthResult.pulses.map((p) => ({
    id: p.id, sectionId: p.sectionId ?? "s0", phraseId: p.phraseId, barId: `bar-${p.barIndex}`,
    index: p.index, indexWithinBar: p.beatInBar, startSeconds: p.timeSeconds, durationSeconds: p.durationSeconds,
    startBeat: p.index, durationBeats: 1, energy: p.energy,
    attackSharpness: p.attack, onsetDensity: 0, sustain: 0.5, pitchMovement: null, spectralBrightness: null, accentStrength: 0,
    confidence: { value: p.confidence ?? 0.5, source: "analysis" },
  }));

  const bars: BarUnit[] = [];
  const boundaries: BoundaryUnit[] = [];
  let lastBarIndex = -1;
  for (const p of pulseTruthResult.pulses) {
    if (p.barIndex !== lastBarIndex) {
      bars.push({
        id: `bar-${p.barIndex}`, sectionId: p.sectionId ?? "s0", phraseId: null, index: p.barIndex,
        startBeat: p.index, durationBeats: beatsPerBar, energy: p.energy, confidence: { value: 0.5, source: "derived" },
      });
      boundaries.push({
        id: `boundary-bar-${p.barIndex}`, kind: "bar", startBeat: p.index, strength: 1, confidence: { value: 0.5, source: "derived" },
      });
      lastBarIndex = p.barIndex;
    }
  }

  const sections: SectionUnit[] = pulseTruthResult.pulses.length
    ? [{ id: "s0", index: 0, startBeat: 0, durationBeats: pulseTruthResult.pulses.length, energy: 0.5, novelty: 0, confidence: { value: 0.5, source: "derived" } }]
    : [];

  return {
    id, schemaVersion: 1, analyzerVersion: PULSE_TRUTH_VERSION, sourceAudioId, createdAt,
    track: { id: "track", durationSeconds: pulseTruthResult.durationSeconds, detectedBpm: pulseTruthResult.confirmedBpm, timeSignature: { beatsPerBar, beatUnit: 4 } },
    sections, phrases: [], bars, beats, boundaries, silences: [],
  };
}

// §14.2/§14.3 — source priority, read-only against the existing stem
// archive: prefer a registered_existing drum stem (tier 1), then a
// demucs-separated one (tier 2), else the full mix (tier 3). This never
// writes to the stem library — `fetchStemSets` is the same read-only GET
// the Sectional Looper already uses, and `buildStemLooperSourceTrack` is
// the existing session-only adapter (stemLooperSource.ts) that lets the
// existing `decodeAudioAnalysisInput` decode a stem's audio without any
// change to that decode path. No new stem-system infrastructure.
async function selectDrumAudioSourceForTrack(
  track: Track, fallbackMono: Float32Array, fallbackSampleRate: number,
): Promise<{ source: DrumEventSource; audio: { mono: Float32Array; sampleRate: number } }> {
  const decodeFullMixAudio = async () => ({ mono: fallbackMono, sampleRate: fallbackSampleRate });
  const audioIdentifier = resolveTrackAudioIdentifier(track);
  if (!audioIdentifier) {
    return selectDrumAudioSource({ hasDrumStem: false, decodeFullMixAudio });
  }
  try {
    const { sets, lifecycles } = await fetchStemSets(track.trackId, audioIdentifier);
    const drumSet = sets.find((s) => s.stems?.drums && lifecycles[s.id]?.lifecycle === "current");
    if (!drumSet) {
      return selectDrumAudioSource({ hasDrumStem: false, decodeFullMixAudio });
    }
    const decodeStem = async () => {
      const adapter = buildStemLooperSourceTrack(track, audioIdentifier, drumSet, "drums");
      const decoded = await decodeAudioAnalysisInput(adapter, DECODE_OPTIONS);
      return { mono: decoded.mono, sampleRate: decoded.sampleRate };
    };
    if (drumSet.origin === "registered_existing") {
      return selectDrumAudioSource({ hasDrumStem: true, decodeDrumStemAudio: decodeStem, decodeFullMixAudio });
    }
    return selectDrumAudioSource({ hasDrumStem: false, hasSeparatedDrumStem: true, decodeSeparatedDrumStemAudio: decodeStem, decodeFullMixAudio });
  } catch {
    // Read-only stem-set lookup failed (e.g. endpoint unreachable) — fall
    // back to the full mix rather than blocking drum analysis entirely.
    return selectDrumAudioSource({ hasDrumStem: false, decodeFullMixAudio });
  }
}

// §10 — mirrors selectDrumAudioSourceForTrack exactly, but for the "other"
// StemRole (the only non-vocals/drums/bass role this system has — never
// broadened to vocals or bass automatically, per the pre-implementation
// review). Read-only against the existing stem archive; no stem-system
// changes.
async function selectLaserAudioSourceForTrack(
  track: Track, fallbackMono: Float32Array, fallbackSampleRate: number,
): Promise<{ source: LaserLayerSource; audio: { mono: Float32Array; sampleRate: number } }> {
  const decodeFullMixAudio = async () => ({ mono: fallbackMono, sampleRate: fallbackSampleRate });
  const audioIdentifier = resolveTrackAudioIdentifier(track);
  if (!audioIdentifier) {
    return selectLaserAudioSource({ hasOtherStem: false, decodeFullMixAudio });
  }
  try {
    const { sets, lifecycles } = await fetchStemSets(track.trackId, audioIdentifier);
    const otherSet = sets.find((s) => s.stems?.other && lifecycles[s.id]?.lifecycle === "current");
    if (!otherSet) {
      return selectLaserAudioSource({ hasOtherStem: false, decodeFullMixAudio });
    }
    const decodeStem = async () => {
      const adapter = buildStemLooperSourceTrack(track, audioIdentifier, otherSet, "other");
      const decoded = await decodeAudioAnalysisInput(adapter, DECODE_OPTIONS);
      return { mono: decoded.mono, sampleRate: decoded.sampleRate };
    };
    if (otherSet.origin === "registered_existing") {
      return selectLaserAudioSource({ hasOtherStem: true, decodeOtherStemAudio: decodeStem, decodeFullMixAudio });
    }
    return selectLaserAudioSource({ hasOtherStem: false, hasInstrumentalStem: true, decodeInstrumentalStemAudio: decodeStem, decodeFullMixAudio });
  } catch {
    return selectLaserAudioSource({ hasOtherStem: false, decodeFullMixAudio });
  }
}

export function GlyphWorkspace({
  libraryTracks, sourceTrackId, resolveTrackUrl,
  onAuditionTrack, auditionTrackId, playbackStatus, onPauseTrack, onResumeTrack, currentTimeSeconds,
  onSaveGlyphComposition, onRecordGlyphExport,
}: GlyphWorkspaceProps) {
  const track = useMemo(
    () => libraryTracks.find((t) => t.trackId === sourceTrackId) ?? null,
    [libraryTracks, sourceTrackId],
  );

  const [decodeStatus, setDecodeStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [decodeError, setDecodeError] = useState<string | null>(null);
  const [mono, setMono] = useState<Float32Array | null>(null);
  const [sampleRate, setSampleRate] = useState<number>(0);

  const [beatsPerBarDraft, setBeatsPerBarDraft] = useState(DEFAULT_BEATS_PER_BAR);
  const [bpmDraft, setBpmDraft] = useState(DEFAULT_DRAFT_BPM);
  const [userConfirmedBpm, setUserConfirmedBpm] = useState(false);

  const [canvasShape, setCanvasShape] = useState<GlyphCanvasShape>("square");
  const [viewportMode, setViewportMode] = useState<GlyphViewportMode>("fitCanvas");
  const [layerVisibility, setLayerVisibility] = useState<GlyphLayerVisibility>(DEFAULT_LAYER_VISIBILITY);

  const [drumLayerResult, setDrumLayerResult] = useState<DrumLayerResult | null>(null);
  const [drumAnalyzing, setDrumAnalyzing] = useState(false);

  const [laserLayerResult, setLaserLayerResult] = useState<LaserLayerResult | null>(null);
  const [laserAnalyzing, setLaserAnalyzing] = useState(false);
  const [laserRenderSettings, setLaserRenderSettings] = useState<LaserRenderSettings>(DEFAULT_LASER_RENDER_SETTINGS);
  const [colorMode, setColorMode] = useState<GlyphColorMode>("monochrome");

  const [savedComposition, setSavedComposition] = useState<GlyphComposition | null>(null);

  useEffect(() => {
    setDecodeStatus("idle"); setDecodeError(null); setMono(null); setSampleRate(0);
    setUserConfirmedBpm(false); setBpmDraft(track?.bpm && track.bpm > 0 ? track.bpm : DEFAULT_DRAFT_BPM);
    setBeatsPerBarDraft(track?.beatMap?.timeSignature?.numerator ?? DEFAULT_BEATS_PER_BAR);
    setDrumLayerResult(null); setDrumAnalyzing(false);
    setLaserLayerResult(null); setLaserAnalyzing(false);
    setLaserRenderSettings(DEFAULT_LASER_RENDER_SETTINGS); setColorMode("monochrome");
    setSavedComposition(null);
    setLayerVisibility(DEFAULT_LAYER_VISIBILITY);

    if (!track) return;
    if (!resolveTrackUrl(track)) {
      setDecodeStatus("error"); setDecodeError("This track has no resolvable audio source.");
      return;
    }
    let cancelled = false;
    setDecodeStatus("loading");
    decodeAudioAnalysisInput(track, { ...DECODE_OPTIONS, maxDurationSec: Math.ceil(track.durationSeconds) + 5 })
      .then((input) => {
        if (cancelled) return;
        setMono(input.mono); setSampleRate(input.sampleRate); setDecodeStatus("ready");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setDecodeStatus("error"); setDecodeError(err instanceof Error ? err.message : String(err));
      });
    return () => { cancelled = true; };
  }, [track, resolveTrackUrl]);

  // §6.4 — trusted manual BPM, else a trusted existing beat map's own BPM,
  // else the workspace requires explicit user confirmation before any
  // pulse grid is generated.
  const autoConfirmedBpm: ConfirmedBpmResult | null = useMemo(() => {
    if (!track) return null;
    if ((track.bpmSource === "manual" || track.bpmSource === "embedded_metadata" || track.bpmSource === "csv_metadata") && track.bpm && track.bpm > 0) {
      return { bpm: track.bpm, source: "trustedManual" };
    }
    if (isBeatMapTrustedForAnalysis(track.beatMap) && track.beatMap?.bpm && track.beatMap.bpm > 0) {
      return { bpm: track.beatMap.bpm, source: "trustedBeatMap" };
    }
    return null;
  }, [track]);

  const confirmedBpm: ConfirmedBpmResult | null = autoConfirmedBpm ?? (userConfirmedBpm ? { bpm: bpmDraft, source: "userConfirmed" } : null);

  const detectedAnchorSeconds = track?.beatMap?.beatTimesSeconds ?? [];

  const pulseTruthResult: PulseTruthResult | null = useMemo(() => {
    if (!track || !confirmedBpm || decodeStatus !== "ready" || !mono) return null;
    const draft = computePulseTruth({
      durationSeconds: track.durationSeconds, confirmedBpm: confirmedBpm.bpm,
      detectedAnchorSeconds, beatsPerBar: beatsPerBarDraft, sectionId: "s0",
    });
    if (draft.pulses.length === 0) return draft;
    const windows = computeBeatWindows(draft.pulses.map((p) => p.timeSeconds), confirmedBpm.bpm, track.durationSeconds);
    const rawEnergies = computeBeatEnergyFromChannelData(mono, sampleRate, windows);
    const energies = normalizeEnergyTrackRelative(rawEnergies);
    return { ...draft, pulses: draft.pulses.map((p, i) => ({ ...p, energy: energies[i] ?? 0.5 })) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track, confirmedBpm?.bpm, decodeStatus, mono, sampleRate, beatsPerBarDraft]);

  const glyphRuns = useMemo(() => {
    if (!pulseTruthResult || pulseTruthResult.pulses.length === 0) return [];
    return buildContinuousGlyphRuns(pulseTruthResult.pulses, (pulse, index) =>
      applyHandmadeDeformation({ ...DEFAULT_ARCH_GRAMMAR.defaultParameters, height: 8 + pulse.energy * 22 }, GLOBAL_SEED, index),
    );
  }, [pulseTruthResult]);

  const canvasPreset: GlyphCanvasPreset = canvasShape === "square" ? SQUARE_CANVAS_PRESET : PORTRAIT_CANVAS_PRESET;

  const fullCanvasLayout = useMemo(() => {
    if (!pulseTruthResult || glyphRuns.length === 0) return null;
    return computeFullCanvasLayout({
      canvas: canvasPreset, pulses: pulseTruthResult.pulses, runs: glyphRuns,
      minPulseWidth: 10, maxPulseWidth: 60, rowGap: 20, sectionGap: 60, safeArea: canvasPreset.safeArea,
    });
  }, [pulseTruthResult, glyphRuns, canvasPreset]);

  const drumMarks = useMemo(() => {
    if (!drumLayerResult || !fullCanvasLayout) return [];
    return layoutDrumEvents(drumLayerResult.events, fullCanvasLayout, DRUM_LANE_OFFSET, DRUM_MAX_MARK_HEIGHT);
  }, [drumLayerResult, fullCanvasLayout]);

  // 0804E — a NEW feature-extraction/classification pass over the
  // already-detected drumLayerResult.events; never mutates DrumEvent or
  // re-runs onset detection. analyzedAt reuses drumLayerResult's own
  // timestamp (this classification is part of the same analysis pass).
  const audibleEventsResult = useMemo(() => {
    if (!drumLayerResult || !mono || sampleRate <= 0 || !track) return null;
    return buildAudibleEvents(drumLayerResult.events, { mono, sampleRate }, track.trackId, drumLayerResult.analyzedAt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drumLayerResult, mono, sampleRate, track?.trackId]);

  // Joins each classified event against the SAME placed DrumMark point
  // (via sourceDrumEventId <-> DrumMark.eventId) — never a second,
  // independently-computed placement.
  const placedEvents = useMemo(() => {
    if (!audibleEventsResult) return [];
    return placeAudibleEvents(audibleEventsResult.events, drumMarks);
  }, [audibleEventsResult, drumMarks]);

  const laserLayoutResult = useMemo(() => {
    if (!laserLayerResult || !fullCanvasLayout) return null;
    return layoutLaserFrames(laserLayerResult.frames, fullCanvasLayout, laserRenderSettings.activityThreshold, laserRenderSettings.verticalOffset);
  }, [laserLayerResult, fullCanvasLayout, laserRenderSettings.activityThreshold, laserRenderSettings.verticalOffset]);

  async function handleAnalyzeDrums() {
    if (!track || !mono || sampleRate <= 0) return;
    setDrumAnalyzing(true);
    try {
      const { source, audio } = await selectDrumAudioSourceForTrack(track, mono, sampleRate);
      const result = detectDrumEvents({
        audio, source, sourceTrackId: track.trackId, analyzedAt: nowIso(),
      });
      setDrumLayerResult(result);
      // Classification (audibleEventsResult) is derived from drumLayerResult
      // automatically via useMemo — enabling clap/accent visibility here is
      // safe even though classification hasn't run yet this tick; the
      // layers simply render nothing until the memo catches up next render.
      setLayerVisibility((prev) => ({ ...prev, drumEvents: true, clapEvents: true, accentEvents: true }));
    } finally {
      setDrumAnalyzing(false);
    }
  }

  async function handleAnalyzeLaser() {
    if (!track || !mono || sampleRate <= 0) return;
    setLaserAnalyzing(true);
    try {
      const { source, audio } = await selectLaserAudioSourceForTrack(track, mono, sampleRate);
      const result = detectLaserActivity({ audio, source, sourceTrackId: track.trackId, analyzedAt: nowIso() });
      setLaserLayerResult(result);
      setLayerVisibility((prev) => ({ ...prev, laserLayer: true }));
    } finally {
      setLaserAnalyzing(false);
    }
  }

  function handleSave() {
    if (!track || !confirmedBpm || !pulseTruthResult || !fullCanvasLayout) return;

    const analysisDoc = pulsesToMusicalAnalysisDocument(pulseTruthResult, makeId("analysis"), track.trackId, nowIso(), beatsPerBarDraft);
    const connectionGrammar = { ...DEFAULT_CONNECTION_GRAMMAR, id: makeId("connection"), createdAt: nowIso(), updatedAt: nowIso() };
    const mappingPreset: MappingPreset = { id: makeId("mapping"), createdAt: nowIso(), updatedAt: nowIso(), ...INERT_MAPPING_PRESET };
    const layoutPreset: ManuscriptLayoutPreset = { id: makeId("layout"), ...INERT_LAYOUT_PRESET };

    const cacheKey = computeFullCanvasCacheKey({
      analysisId: analysisDoc.id, analysisVersion: analysisDoc.analyzerVersion,
      confirmedBpm: confirmedBpm.bpm, pulseTruthVersion: PULSE_TRUTH_VERSION, phaseOffsetSeconds: pulseTruthResult.phaseOffsetSeconds,
      mappingPresetSnapshot: mappingPreset, glyphGrammarSnapshot: DEFAULT_ARCH_GRAMMAR, connectionGrammarSnapshot: connectionGrammar,
      canvasPresetSnapshot: canvasPreset, layoutSettings: { minPulseWidth: 10, maxPulseWidth: 60, rowGap: 20, sectionGap: 60 },
      drumLayerAnalyzerVersion: drumLayerResult ? DRUM_LAYER_ANALYZER_VERSION : null, drumLayerSource: drumLayerResult?.source ?? null,
      eventVocabularyAnalyzerVersion: audibleEventsResult ? EVENT_VOCABULARY_ANALYZER_VERSION : null,
      eventClassificationThresholds: audibleEventsResult ? EVENT_CLASSIFICATION_THRESHOLD_VERSION : null,
      laserAnalyzerVersion: laserLayerResult ? LASER_ANALYZER_VERSION : null, laserSource: laserLayerResult?.source ?? null,
      laserRenderMode: laserLayerResult ? laserRenderSettings.mode : null,
      laserActivityThreshold: laserLayerResult ? laserRenderSettings.activityThreshold : null,
      laserAmplitude: laserLayerResult ? laserRenderSettings.amplitude : null,
      laserSmoothing: laserLayerResult ? laserRenderSettings.smoothing : null,
      laserVerticalOffset: laserLayerResult ? laserRenderSettings.verticalOffset : null,
      laserStrokeWidth: laserLayerResult ? laserRenderSettings.strokeWidth : null,
      colorMode, coverAccent: colorMode === "cover" ? FRANK_COVER_PRESET_ID : null,
      seed: GLOBAL_SEED, rendererVersion: GLYPH_FULL_CANVAS_RENDERER_VERSION,
    });

    const composition: GlyphComposition = {
      id: makeId("composition"), schemaVersion: 1, name: `${track.title} — Manuscript`,
      source: { kind: "library_track", trackId: track.trackId }, sourceDurationSeconds: track.durationSeconds,
      analysisId: analysisDoc.id,
      mappingPresetId: mappingPreset.id, mappingPresetSnapshot: mappingPreset,
      grammarId: DEFAULT_ARCH_GRAMMAR.id, grammarSnapshot: DEFAULT_ARCH_GRAMMAR,
      connectionGrammarId: connectionGrammar.id, connectionGrammarSnapshot: connectionGrammar, connectionOverrides: [],
      layoutPresetId: layoutPreset.id, layoutPresetSnapshot: layoutPreset,
      pulseTruthSnapshot: pulseTruthResult, canvasPresetSnapshot: canvasPreset, viewportMode,
      drumLayerSnapshot: drumLayerResult ?? undefined, layerVisibility,
      eventVocabularySnapshot: audibleEventsResult ? { analyzerVersion: audibleEventsResult.analyzerVersion, events: audibleEventsResult.events } : undefined,
      laserLayerSnapshot: laserLayerResult ?? undefined,
      laserRenderSettings, colorMode,
      seed: GLOBAL_SEED, cacheKey,
      createdAt: nowIso(), updatedAt: nowIso(),
    };

    onSaveGlyphComposition({ analysis: analysisDoc, composition });
    setSavedComposition(composition);
  }

  function handleExport() {
    if (!savedComposition || !fullCanvasLayout) return;
    const svg = buildFullCanvasSvgDocument(
      canvasPreset, fullCanvasLayout, drumMarks, placedEvents, laserLayoutResult?.segments ?? [], laserRenderSettings,
      layerVisibility, DEFAULT_RENDER_PROFILE,
      {
        compositionId: savedComposition.id, analysisId: savedComposition.analysisId,
        confirmedBpm: savedComposition.pulseTruthSnapshot.confirmedBpm, canvasShape: canvasPreset.shape,
        drumSource: drumLayerResult?.source ?? null, laserSource: laserLayerResult?.source ?? null, colorMode,
        seed: savedComposition.seed, rendererVersion: GLYPH_FULL_CANVAS_RENDERER_VERSION,
      },
    );
    const fileName = `glyph-composition-${savedComposition.id}.svg`;
    downloadBlob(svg, fileName, "image/svg+xml;charset=utf-8");
    onRecordGlyphExport({
      id: `export-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      compositionId: savedComposition.id, exportedAt: nowIso(), format: "svg",
      renderProfileId: DEFAULT_RENDER_PROFILE.id, fileName, cacheKey: savedComposition.cacheKey,
      metadata: {
        compositionId: savedComposition.id, compositionUpdatedAt: savedComposition.updatedAt, analysisId: savedComposition.analysisId,
        analyzerVersion: PULSE_TRUTH_VERSION, mappingPresetId: savedComposition.mappingPresetId, grammarId: savedComposition.grammarId,
        layoutPresetId: savedComposition.layoutPresetId, seed: savedComposition.seed, rendererVersion: GLYPH_FULL_CANVAS_RENDERER_VERSION,
      },
    });
  }

  if (!track) {
    return (
      <div style={{ padding: 24, opacity: 0.7, fontSize: 13 }}>
        No track open. Select a Catalog track, open its detail panel, and click "Open in Glyph".
      </div>
    );
  }

  const isCurrent = auditionTrackId === track.trackId;
  const isPlaying = isCurrent && playbackStatus === "playing";
  const isPaused = isCurrent && playbackStatus === "paused";
  function handlePlayPause() {
    if (isPlaying) onPauseTrack?.();
    else if (isPaused) onResumeTrack?.();
    else onAuditionTrack?.(track!.trackId);
  }

  return (
    <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12, maxWidth: 1100 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 16 }}>Glyph — {track.title}</h2>
          <p style={{ margin: "4px 0 0", fontSize: 12, opacity: 0.6 }}>{track.artist}</p>
        </div>
        <button className="tb-btn sm" onClick={handlePlayPause} disabled={!onAuditionTrack}>
          {isPlaying ? "Pause" : "Play"}
        </button>
      </div>

      {decodeStatus === "loading" && <div style={{ fontSize: 12, opacity: 0.7 }}>Decoding audio…</div>}
      {decodeStatus === "error" && <div style={{ fontSize: 12, color: "#f43f5e" }}>Could not decode audio: {decodeError}</div>}

      {decodeStatus === "ready" && !confirmedBpm && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
          <span style={{ opacity: 0.7 }}>No trusted BPM for this track — confirm one before generating notation:</span>
          <input type="number" min={20} max={300} value={bpmDraft} onChange={(e) => setBpmDraft(Math.max(20, Number(e.target.value) || DEFAULT_DRAFT_BPM))} style={{ width: 64 }} />
          <button className="tb-btn sm" onClick={() => setUserConfirmedBpm(true)}>Confirm BPM</button>
        </div>
      )}

      {confirmedBpm && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 12 }}>
          <span style={{ opacity: 0.7 }}>
            BPM {confirmedBpm.bpm.toFixed(1)} ({confirmedBpm.source === "trustedManual" ? "trusted" : confirmedBpm.source === "trustedBeatMap" ? "trusted beat map" : "confirmed"})
          </span>
          <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
            Beats per bar
            <input type="number" min={1} max={16} value={beatsPerBarDraft} onChange={(e) => setBeatsPerBarDraft(Math.max(1, Math.round(Number(e.target.value) || DEFAULT_BEATS_PER_BAR)))} style={{ width: 48 }} />
          </label>
        </div>
      )}

      {fullCanvasLayout && pulseTruthResult && (
        <>
          <GlyphCanvasEditor
            canvasShape={canvasShape} onCanvasShapeChange={setCanvasShape}
            viewportMode={viewportMode} onViewportModeChange={setViewportMode}
            layerVisibility={layerVisibility} onLayerVisibilityChange={setLayerVisibility}
            drumLayerAvailable={drumLayerResult != null}
          />

          <GlyphEventLayerEditor
            layerVisibility={layerVisibility} onLayerVisibilityChange={setLayerVisibility}
            eventsAvailable={(audibleEventsResult?.events.length ?? 0) > 0}
          />

          <GlyphLaserLayerEditor
            layerVisibility={layerVisibility} onLayerVisibilityChange={setLayerVisibility}
            laserRenderSettings={laserRenderSettings} onLaserRenderSettingsChange={setLaserRenderSettings}
            colorMode={colorMode} onColorModeChange={setColorMode}
            laserAvailable={laserLayerResult != null}
          />

          <GlyphFullCanvasPreview
            canvas={canvasPreset} layout={fullCanvasLayout} drumMarks={drumMarks}
            placedEvents={placedEvents} laserSegments={laserLayoutResult?.segments ?? []}
            laserRenderSettings={laserRenderSettings} colorMode={colorMode}
            layerVisibility={layerVisibility} viewportMode={viewportMode}
            currentTimeSeconds={isCurrent ? currentTimeSeconds : undefined}
          />

          <GlyphDiagnostics
            durationSeconds={pulseTruthResult.durationSeconds} confirmedBpm={pulseTruthResult.confirmedBpm}
            expectedPulses={pulseTruthResult.expectedPulseCount} detectedAnchors={pulseTruthResult.detectedAnchorCount}
            synthesizedPulses={pulseTruthResult.synthesizedPulseCount} generatedArches={pulseTruthResult.pulses.length}
            connectedRuns={glyphRuns.length}
            placedArches={fullCanvasLayout.placedRuns.reduce((s, r) => s + r.pulseIds.length, 0)}
            visibleArches={fullCanvasLayout.placedRuns.reduce((s, r) => s + r.pulseIds.length, 0)}
            coveragePercent={pulseTruthResult.coveragePercent} rows={fullCanvasLayout.rowCount} canvasShape={canvasPreset.shape}
            overflowRight={fullCanvasLayout.overflowRight} overflowBottom={fullCanvasLayout.overflowBottom}
            barBoundaryCount={fullCanvasLayout.barBoundaryCount} insertedBarGapCount={fullCanvasLayout.insertedBarGapCount}
            drumSource={drumLayerResult?.source ?? null} drumEventCount={drumLayerResult?.eventCount ?? 0}
            visibleDrumEventCount={drumMarks.length}
            audibleEvents={audibleEventsResult?.events ?? []} visibleEventMarkCount={placedEvents.length}
            laserResult={laserLayerResult} laserLayout={laserLayoutResult}
          />

          <div style={{ display: "flex", gap: 8 }}>
            <button className="tb-btn sm" onClick={handleSave}>{savedComposition ? "Saved" : "Save"}</button>
            <button className="tb-btn sm" onClick={handleAnalyzeDrums} disabled={drumAnalyzing || decodeStatus !== "ready"}>
              {drumAnalyzing ? "Analyzing drums…" : drumLayerResult ? "Re-analyze drums" : "Analyze drums"}
            </button>
            <button className="tb-btn sm" onClick={handleAnalyzeLaser} disabled={laserAnalyzing || decodeStatus !== "ready"}>
              {laserAnalyzing ? "Analyzing laser…" : laserLayerResult ? "Re-analyze laser" : "Analyze laser"}
            </button>
            <button className="tb-btn sm" onClick={handleExport} disabled={!savedComposition}>Export SVG</button>
          </div>
        </>
      )}
    </div>
  );
}
