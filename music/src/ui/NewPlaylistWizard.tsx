import { useState, useMemo, useEffect, useRef } from "react";
import type { CrateRecord } from "../data/crateTypes";
import type { Track } from "../data/trackTypes";
import type { TrackSlot } from "../data/playlistTypes";
import type { TrackPlaybackIssue } from "../data/playProjectTypes";
import type { PlaylistShapeConfig, PlaylistShapeSection, PlaylistEnergyShape, PlaylistSectionEnergyEnvelope } from "../data/playlistShapeTypes";
import { resolveCratePool, resolveCrateTracks } from "../logic/resolveCrate";
import { gatePlaylistCandidates, describeSkipReport, finalizeGeneratedPlaylistSlots, buildPlaylistEligibilityAudit, type PlaylistEligibilityAudit } from "../logic/trackEligibility";
import { countPendingImportAnalysis } from "../logic/audioReadiness";
import {
  makeDefaultShapeConfig,
  buildShapePlaylist,
  buildSlotsFromShapeResult,
  derivePlaylistGenerationState,
  type ShapeBuildResult,
  type PlaylistGenerationState,
} from "../logic/playlistShapeBuilder";
import { inferEnergyShape, normalizeEnergyEnvelope, defaultEnvelopeForSection } from "../logic/playlistEnergyEnvelope";
import { PlaylistShapeSectionRow } from "./playlistShape/PlaylistShapeSectionRow";

// ---------------------------------------------------------------------------
// Types
//
// Crate-first shape (0711_MUSIC_Crate_First_Playlist_Shape_UX_Revision) —
// supersedes the Mood Arc-based wizard shape step from the prior build.
// Crates carry mood/genre/energy/activity intelligence; this wizard only
// arranges already-organized crates into a timed Intro/S01.../Outro
// structure. It does not expose energy/mood/genre/transition editing.
// ---------------------------------------------------------------------------

export type NewPlaylistWizardMode = "accepted" | "options_only" | "empty";

export interface NewPlaylistWizardResult {
  title: string;
  targetDurationMinutes: number;
  crateIds: string[];
  acceptedSlots?: TrackSlot[];
  optionsGeneratedAt?: string;
  optionsGeneratedFromCrateIds?: string[];
  mode: NewPlaylistWizardMode;
  shapeConfig?: PlaylistShapeConfig;
}

interface Props {
  crates: CrateRecord[];
  libraryTracks: Track[];
  defaultTitle?: string;
  // Codec/playback safety (0709 leak audit) — the wizard runs its own
  // generation pipeline and must gate its own candidate pool.
  trackPlaybackIssues?: Record<string, TrackPlaybackIssue>;
  onComplete: (result: NewPlaylistWizardResult) => void;
  onCancel: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtDur(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

const DURATION_PRESETS = [
  { label: "30 min", minutes: 30 },
  { label: "1 hour", minutes: 60 },
  { label: "2 hours", minutes: 120 },
  { label: "3 hours", minutes: 180 },
];

// ---------------------------------------------------------------------------
// Wizard
// ---------------------------------------------------------------------------

type Step = 1 | 2 | 3;

export function NewPlaylistWizard({
  crates,
  libraryTracks,
  defaultTitle = "Untitled Playlist",
  trackPlaybackIssues,
  onComplete,
  onCancel,
}: Props) {
  // ── Step 1 state ──
  const [title, setTitle] = useState(defaultTitle);
  const [targetMinutes, setTargetMinutes] = useState(120);
  const [customMinutes, setCustomMinutes] = useState(120);
  const [useCustom, setUseCustom] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  // ── Step 2 (Shape + Crates) state ──
  // Spreadsheet-style inline editing (0712_MUSIC_Playlist_Shape_Inline_Editing)
  // — every row is directly editable in place; there is no row-selection /
  // "which section is being edited" state anymore.
  const [shapeConfig, setShapeConfig] = useState<PlaylistShapeConfig | null>(null);

  // ── Step 3 (Generate) state ──
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState(false);
  // 0804_MUSIC_Playlist_Eligibility_Repair §11 — the full audit is kept
  // (previously the gate result was discarded after building one terse
  // string), so the dialog can show a complete, reconciled breakdown instead
  // of a single pre-formatted line.
  const [eligibilityAudit, setEligibilityAudit] = useState<PlaylistEligibilityAudit | null>(null);
  const [generationState, setGenerationState] = useState<PlaylistGenerationState | null>(null);
  const [shapeResult, setShapeResult] = useState<ShapeBuildResult | null>(null);
  const [shapeSlots, setShapeSlots] = useState<TrackSlot[]>([]);

  const [step, setStep] = useState<Step>(1);

  useEffect(() => {
    if (step === 1) titleRef.current?.select();
  }, [step]);

  const cratesMap = useMemo(() => new Map(crates.map((c) => [c.id, c])), [crates]);
  const crateCountsById = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of crates) m.set(c.id, resolveCrateTracks(c, libraryTracks).tracks.length);
    return m;
  }, [crates, libraryTracks]);

  const effectiveMinutes = useCustom ? customMinutes : targetMinutes;

  // Every crate referenced by any section — the union is the candidate
  // universe for generation. There is no separate global crate step.
  const referencedCrateIds = useMemo(() => {
    if (!shapeConfig) return [] as string[];
    const ids = new Set<string>();
    for (const sec of shapeConfig.sections) {
      for (const cw of sec.crateWeights) ids.add(cw.crateId);
    }
    return [...ids];
  }, [shapeConfig]);

  const combinedPoolTracks = useMemo(
    () => (referencedCrateIds.length > 0 ? resolveCratePool(referencedCrateIds, cratesMap, libraryTracks) : []),
    [referencedCrateIds, cratesMap, libraryTracks],
  );

  // ── Step navigation ──

  function goToStep2() {
    if (!title.trim()) return;
    setShapeConfig((prev) =>
      prev && prev.targetDurationMinutes === effectiveMinutes ? prev : makeDefaultShapeConfig(effectiveMinutes)
    );
    setStep(2);
  }

  function updateSection(id: string, patch: Partial<PlaylistShapeSection>) {
    setShapeConfig((prev) => prev && {
      ...prev,
      sections: prev.sections.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    });
  }

  // Applies a partial envelope patch. When the section is in Auto mode
  // (shapeSource "inferred"), the shape is always freshly recomputed from
  // the resulting start/end — never left stale from before the edit — per
  // §6.3 ("recalculates the shape... updates immediately when either
  // endpoint changes") and §6.5 ("crossing endpoints automatically changes
  // the inferred shape").
  function updateEnergyEnvelope(sectionId: string, patch: Partial<PlaylistSectionEnergyEnvelope>) {
    setShapeConfig((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        sections: prev.sections.map((s) => {
          if (s.id !== sectionId) return s;
          const merged = { ...s.energyEnvelope, ...patch };
          const next = merged.shapeSource === "explicit"
            ? merged
            : { ...merged, shape: inferEnergyShape(merged.start, merged.end) };
          return { ...s, energyEnvelope: normalizeEnergyEnvelope(next, s.energyEnvelope) };
        }),
      };
    });
  }

  // Endpoint safeguards (§6.5) — Flat locks both ends together; Rise/Fall
  // move the OPPOSING endpoint rather than ever silently flipping shape.
  function setEnergyStart(section: PlaylistShapeSection, value: number) {
    const env = section.energyEnvelope;
    if (env.shapeSource === "explicit" && env.shape === "flat") {
      updateEnergyEnvelope(section.id, { start: value, end: value });
    } else if (env.shapeSource === "explicit" && env.shape === "rise" && value > env.end) {
      updateEnergyEnvelope(section.id, { start: value, end: value });
    } else if (env.shapeSource === "explicit" && env.shape === "fall" && value < env.end) {
      updateEnergyEnvelope(section.id, { start: value, end: value });
    } else {
      updateEnergyEnvelope(section.id, { start: value });
    }
  }

  function setEnergyEnd(section: PlaylistShapeSection, value: number) {
    const env = section.energyEnvelope;
    if (env.shapeSource === "explicit" && env.shape === "flat") {
      updateEnergyEnvelope(section.id, { start: value, end: value });
    } else if (env.shapeSource === "explicit" && env.shape === "rise" && value < env.start) {
      updateEnergyEnvelope(section.id, { start: value, end: value });
    } else if (env.shapeSource === "explicit" && env.shape === "fall" && value > env.start) {
      updateEnergyEnvelope(section.id, { start: value, end: value });
    } else {
      updateEnergyEnvelope(section.id, { end: value });
    }
  }

  function setEnergyShape(sectionId: string, value: "auto" | PlaylistEnergyShape) {
    if (value === "auto") {
      updateEnergyEnvelope(sectionId, { shapeSource: "inferred" });
    } else {
      updateEnergyEnvelope(sectionId, { shape: value, shapeSource: "explicit" });
    }
  }

  function addCrateToSection(sectionId: string, crateId: string) {
    setShapeConfig((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        sections: prev.sections.map((s) => {
          if (s.id !== sectionId) return s;
          if (s.crateWeights.some((cw) => cw.crateId === crateId)) return s;
          const weight = s.crateWeights.length === 0 ? 100 : Math.round(100 / (s.crateWeights.length + 1));
          return { ...s, crateWeights: [...s.crateWeights, { crateId, weight }] };
        }),
      };
    });
  }

  function removeCrateFromSection(sectionId: string, crateId: string) {
    setShapeConfig((prev) => prev && {
      ...prev,
      sections: prev.sections.map((s) =>
        s.id === sectionId ? { ...s, crateWeights: s.crateWeights.filter((cw) => cw.crateId !== crateId) } : s
      ),
    });
  }

  function setCrateWeight(sectionId: string, crateId: string, weight: number) {
    setShapeConfig((prev) => prev && {
      ...prev,
      sections: prev.sections.map((s) =>
        s.id === sectionId
          ? { ...s, crateWeights: s.crateWeights.map((cw) => (cw.crateId === crateId ? { ...cw, weight } : cw)) }
          : s
      ),
    });
  }

  function duplicateSection(sectionId: string) {
    setShapeConfig((prev) => {
      if (!prev) return prev;
      const idx = prev.sections.findIndex((s) => s.id === sectionId);
      if (idx === -1) return prev;
      const src = prev.sections[idx];
      const copy: PlaylistShapeSection = { ...src, id: `${sectionId}_copy${Date.now().toString(36)}`, label: `${src.label} copy` };
      const sections = [...prev.sections];
      sections.splice(idx + 1, 0, copy);
      return { ...prev, sections };
    });
  }

  function removeSection(sectionId: string) {
    setShapeConfig((prev) => prev && { ...prev, sections: prev.sections.filter((s) => s.id !== sectionId) });
  }

  // "+ Add Section" (§17) — appended just before Outro, valid default
  // duration/envelope, current default (empty) crate state, immediately
  // editable inline (no expanded editor to open).
  function addSection() {
    setShapeConfig((prev) => {
      if (!prev) return prev;
      const outroIdx = prev.sections.findIndex((s) => s.id === "outro");
      const insertAt = outroIdx === -1 ? prev.sections.length : outroIdx;
      const n = prev.sections.filter((s) => /^s\d+$/.test(s.id)).length + 1;
      const newSection: PlaylistShapeSection = {
        id: `s${n}_${Date.now().toString(36)}`,
        label: `S${String(n).padStart(2, "0")}`,
        durationMinutes: 20,
        crateWeights: [],
        energyEnvelope: defaultEnvelopeForSection(`s${n}`),
      };
      const sections = [...prev.sections];
      sections.splice(insertAt, 0, newSection);
      return { ...prev, sections };
    });
  }

  function goToGenerate() {
    setStep(3);
    runGenerate();
  }

  function runGenerate() {
    if (!shapeConfig) return;
    setGenerating(true);
    setGenerated(false);
    setShapeResult(null);
    setShapeSlots([]);
    setEligibilityAudit(null);
    setGenerationState(null);

    // Pre-generation codec/playback-safety gate (0709 leak audit) — every
    // crate a section draws from is gated up front; weighting never
    // overrides this. Playback safety (codec/missing-audio/exclusion) is the
    // ONLY hard pre-filter here — 0804_MUSIC_Playlist_Eligibility_Repair
    // removed the prior excludePendingImports() pool-thinning step (pending
    // canonical mood/DSP analysis is a warning, not a hard rejection; see
    // audioReadiness.ts's countPendingImportAnalysis doc comment).
    const gate = gatePlaylistCandidates(combinedPoolTracks, {
      mode: "casual",
      playbackIssues: trackPlaybackIssues,
    }, "new playlist wizard");

    setTimeout(() => {
      const result = buildShapePlaylist({
        libraryTracks: gate.eligibleTracks,
        crates,
        shapeConfig,
        allLibraryTracksForDiagnostics: combinedPoolTracks,
      });

      const audit = buildPlaylistEligibilityAudit({
        consideredCount: combinedPoolTracks.length,
        gate,
        metadataWarningCounts: {
          pending_import_analysis: countPendingImportAnalysis(combinedPoolTracks),
        },
        sectionCandidateCounts: Object.fromEntries(
          result.sections.map((s) => [s.sectionLabel, s.candidateCount]),
        ),
      });
      setEligibilityAudit(audit);
      setGenerationState(derivePlaylistGenerationState(result));
      // Always store the result, including a zero-track ("blocked") one —
      // §11 requires showing every section's warning, not just the first,
      // and the render layer needs shapeResult.sections for that regardless
      // of whether generation succeeded.
      setShapeResult(result);

      if (result.tracks.length === 0) {
        setShapeSlots([]);
        setGenerated(true);
        setGenerating(false);
        return;
      }

      const rawSlots = buildSlotsFromShapeResult(result);
      const tracksById = new Map(libraryTracks.map((t) => [t.trackId, t]));
      const finalized = finalizeGeneratedPlaylistSlots({
        entryPoint: "NewPlaylistWizard.runGenerate.shape",
        slots: rawSlots,
        candidatePool: gate.eligibleTracks,
        tracksById,
        eligibilityContext: { playbackIssues: trackPlaybackIssues },
      });
      const slots = finalized.slots ?? rawSlots.map((s) => ({ ...s, assignedTrackId: undefined }));

      setShapeSlots(slots);
      setGenerated(true);
      setGenerating(false);
    }, 50);
  }

  // ── Accept the generated arrangement → complete ──
  function handleAccept() {
    if (!shapeConfig || shapeSlots.length === 0) return;
    const now = new Date().toISOString();
    onComplete({
      title: title.trim() || defaultTitle,
      targetDurationMinutes: effectiveMinutes,
      crateIds: referencedCrateIds,
      acceptedSlots: shapeSlots,
      optionsGeneratedAt: now,
      optionsGeneratedFromCrateIds: referencedCrateIds,
      mode: "accepted",
      shapeConfig,
    });
  }

  function handleCreateDraft() {
    onComplete({
      title: title.trim() || defaultTitle,
      targetDurationMinutes: effectiveMinutes,
      crateIds: referencedCrateIds,
      mode: "empty",
      shapeConfig: shapeConfig ?? undefined,
    });
  }

  function handleCreateEmpty() {
    onComplete({
      title: title.trim() || defaultTitle,
      targetDurationMinutes: effectiveMinutes,
      crateIds: [],
      mode: "empty",
    });
  }

  // ── Render ──

  return (
    <div className="npw-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className={`npw-modal${step === 2 ? " npw-modal--shape" : ""}`}>
        {/* Header */}
        <div className="npw-header">
          <div className="npw-header-title">New Playlist</div>
          <div className="npw-steps">
            {([1, 2, 3] as Step[]).map((s) => (
              <span
                key={s}
                className={`npw-step-dot${s === step ? " npw-step-dot--active" : s < step ? " npw-step-dot--done" : ""}`}
              >
                {s < step ? "✓" : s}
              </span>
            ))}
          </div>
          <button className="npw-close" onClick={onCancel}>✕</button>
        </div>

        {/* ── Step 1: Identity ── */}
        {step === 1 && (
          <div className="npw-body">
            <div className="npw-step-label">Playlist identity</div>

            <div className="npw-field">
              <label className="npw-label">Name</label>
              <input
                ref={titleRef}
                className="npw-input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") goToStep2(); if (e.key === "Escape") onCancel(); }}
                placeholder="Playlist name…"
                autoFocus
              />
            </div>

            <div className="npw-field">
              <label className="npw-label">Target Duration</label>
              <div className="npw-duration-row">
                {DURATION_PRESETS.map((p) => (
                  <button
                    key={p.minutes}
                    className={`npw-dur-btn${!useCustom && targetMinutes === p.minutes ? " npw-dur-btn--active" : ""}`}
                    onClick={() => { setTargetMinutes(p.minutes); setUseCustom(false); }}
                  >
                    {p.label}
                  </button>
                ))}
                <button
                  className={`npw-dur-btn${useCustom ? " npw-dur-btn--active" : ""}`}
                  onClick={() => setUseCustom(true)}
                >
                  Custom
                </button>
              </div>
              {useCustom && (
                <div className="npw-custom-dur">
                  <input
                    className="tb-num"
                    type="number"
                    min={10}
                    max={720}
                    value={customMinutes}
                    onChange={(e) => {
                      const v = parseInt(e.target.value, 10);
                      if (!isNaN(v) && v >= 10) setCustomMinutes(v);
                    }}
                  />
                  <span className="npw-dur-unit">min</span>
                </div>
              )}
            </div>

            <div className="npw-actions">
              <button className="npw-btn npw-btn--ghost" onClick={handleCreateEmpty}>
                Skip setup · Create empty playlist
              </button>
              <button
                className="npw-btn npw-btn--primary"
                onClick={goToStep2}
                disabled={!title.trim()}
              >
                Shape Playlist →
              </button>
            </div>
          </div>
        )}

        {/* ── Step 2: Shape + Crates ── */}
        {step === 2 && shapeConfig && (
          <div className="npw-body">
            <div className="npw-step-label">
              Shape · Intro {"→"} {shapeConfig.sections.length - 2 > 0 ? `S01–S${String(shapeConfig.sections.length - 2).padStart(2, "0")}` : ""} {"→"} Outro
            </div>

            <div className="playlist-shape-table">
              <table className="npw-shape-table">
                <thead>
                  <tr>
                    <th>Section</th>
                    <th>Time</th>
                    <th>Crates / Weights</th>
                    <th>Energy</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {shapeConfig.sections.map((sec) => (
                    <PlaylistShapeSectionRow
                      key={sec.id}
                      section={sec}
                      cratesMap={cratesMap}
                      availableCrates={crates}
                      crateCountsById={crateCountsById}
                      onRename={(next) => updateSection(sec.id, { label: next })}
                      onDurationChange={(minutes) => updateSection(sec.id, { durationMinutes: minutes })}
                      onAddCrate={(crateId) => addCrateToSection(sec.id, crateId)}
                      onRemoveCrate={(crateId) => removeCrateFromSection(sec.id, crateId)}
                      onCrateWeightChange={(crateId, weight) => setCrateWeight(sec.id, crateId, weight)}
                      onEnergyStartChange={(value) => setEnergyStart(sec, value)}
                      onEnergyEndChange={(value) => setEnergyEnd(sec, value)}
                      onEnergyBracketChange={(start, end) => updateEnergyEnvelope(sec.id, { start, end })}
                      onEnergyShapeChange={(value) => setEnergyShape(sec.id, value)}
                      onDuplicate={() => duplicateSection(sec.id)}
                      onRemove={() => removeSection(sec.id)}
                    />
                  ))}
                </tbody>
              </table>
            </div>

            <button type="button" className="npw-btn npw-btn--ghost npw-btn--small npw-add-section" onClick={addSection}>
              + Add Section
            </button>

            {crates.length === 0 && (
              <div className="npw-no-crates">No crates available. Create a crate in the Crates section first.</div>
            )}

            <div className="npw-actions">
              <button className="npw-btn npw-btn--ghost" onClick={() => setStep(1)}>← Back</button>
              <button className="npw-btn npw-btn--ghost" onClick={handleCreateDraft}>
                Create Draft Without Generating
              </button>
              <button
                className="npw-btn npw-btn--primary"
                onClick={goToGenerate}
                disabled={referencedCrateIds.length === 0}
              >
                Generate →
              </button>
            </div>
          </div>
        )}

        {/* ── Step 3: Generate ── */}
        {step === 3 && shapeConfig && (
          <div className="npw-body">
            <div className="npw-step-label">Generated playlist</div>

            <div className="npw-gate-summary">
              Target: {fmtDur(effectiveMinutes * 60)}
              {" · "}Sections: {shapeConfig.sections.length}
              {" · "}Crates: {referencedCrateIds.length}
            </div>

            {generating && (
              <div className="npw-generating">
                <div className="npw-generating-spinner" />
                Generating playlist from {shapeConfig.sections.length} sections…
              </div>
            )}

            {/* 0804_MUSIC_Playlist_Eligibility_Repair §11 — replaces the old
                single pre-formatted "N eligible of M — skipped..." string
                (whose denominator/numerator came from two different
                populations, the actual root cause this build fixed) with
                the full reconciled audit: every considered track is
                accounted for, and a details disclosure covers rejection
                reasons, per-section candidate counts, the Intro fallback
                level, unresolved-metadata warnings, and whether a partial
                draft can be saved. */}
            {eligibilityAudit && (
              <div className="npw-gate-summary">
                {eligibilityAudit.considered} considered · {eligibilityAudit.hardEligible} hard-eligible · {eligibilityAudit.hardRejectedUnique} rejected
                {shapeResult && (() => {
                  const blocking = shapeResult.sections.find((s) => s.tracks.length === 0);
                  return blocking ? ` · blocking section: "${blocking.sectionLabel}"` : "";
                })()}
                <details className="cat-review-details">
                  <summary>details</summary>
                  <div className="cat-review-details-body">
                    <div>Rejection reasons: {describeSkipReport(eligibilityAudit.rejectionCounts) || "none"}</div>
                    {eligibilityAudit.multiReasonRejectedCount > 0 && (
                      <div>{eligibilityAudit.multiReasonRejectedCount} rejected track{eligibilityAudit.multiReasonRejectedCount !== 1 ? "s" : ""} matched more than one reason (not double-counted above).</div>
                    )}
                    {Object.entries(eligibilityAudit.unresolvedMetadataWarnings).filter(([, n]) => n > 0).map(([k, n]) => (
                      <div key={k}>{n} unresolved metadata warning{n !== 1 ? "s" : ""}: {k.replace(/_/g, " ")} (eligible, not excluded)</div>
                    ))}
                    {Object.entries(eligibilityAudit.sectionCandidateCounts).map(([label, n]) => (
                      <div key={label}>{label}: {n} candidate{n !== 1 ? "s" : ""}</div>
                    ))}
                    {/* 0804_MUSIC_Crate_BPM_Group_Filters §10 — outside_assigned_crate,
                        distinct from an unexplained rejection: tracks that passed
                        every other gate but were excluded by a crate's own BPM/Group
                        filters specifically. */}
                    {shapeResult?.sections.filter((s) => s.outsideAssignedCrateCount > 0).map((s) => (
                      <div key={`oac-${s.sectionId}`}>{s.sectionLabel}: {s.outsideAssignedCrateCount} track{s.outsideAssignedCrateCount !== 1 ? "s" : ""} outside assigned crate's BPM/Group filters</div>
                    ))}
                    {shapeResult?.sections.find((s) => s.sectionId === "intro")?.introFallbackLevel != null && (
                      <div>Intro fallback level used: {shapeResult.sections.find((s) => s.sectionId === "intro")!.introFallbackLevel}</div>
                    )}
                    <div>Draft save possible: {generationState !== "blocked" ? "yes" : "no"}</div>
                  </div>
                </details>
              </div>
            )}

            {generated && generationState === "blocked" && (
              <div className="npw-no-options">
                {shapeResult && shapeResult.warnings.length > 0
                  ? shapeResult.warnings.map((w, i) => <div key={i}>⚠ {w}</div>)
                  : <div>No tracks could be generated — assign crates to at least one section.</div>}
              </div>
            )}

            {generated && generationState !== "blocked" && shapeResult && (
              <div className="npw-option-list">
                <div className="npw-option-card npw-option-card--highlighted">
                  <div className="npw-option-head">
                    <span className="npw-option-name">Organized arrangement{generationState === "partial" ? " (partial)" : ""}</span>
                    <span className="npw-option-score">{shapeSlots.filter((s) => s.assignedTrackId).length} tracks</span>
                  </div>
                  <div className="npw-shape-preview">
                    {shapeResult.sections.map((s) => (
                      <div key={s.sectionId} className="npw-shape-preview-row">
                        <span className="npw-shape-preview-label">{s.sectionLabel}</span>
                        <span className="npw-shape-preview-stats">
                          {Math.round(s.targetDurationSeconds / 60)}m target / {Math.round(s.actualDurationSeconds / 60)}m actual / {s.tracks.length} tracks
                        </span>
                      </div>
                    ))}
                  </div>
                  {shapeResult.warnings.length > 0 && (
                    <div className="npw-option-note">⚠ {shapeResult.warnings.join("; ")}</div>
                  )}
                  <button className="npw-btn npw-btn--accept" onClick={handleAccept}>
                    Accept as Playlist ✓
                  </button>
                </div>
              </div>
            )}

            <div className="npw-actions">
              <button
                className="npw-btn npw-btn--ghost"
                onClick={() => { setStep(2); setGenerated(false); setShapeResult(null); setShapeSlots([]); setEligibilityAudit(null); setGenerationState(null); }}
              >
                ← Back to Shape
              </button>
              {generated && (
                <button className="npw-btn npw-btn--ghost" onClick={runGenerate}>
                  Regenerate
                </button>
              )}
              {/* §11/§15 — a zero-output draft must never be saveable as if
                  it contains a playlist; only offered once generation
                  produced at least one track (complete or partial). */}
              {generated && generationState !== "blocked" && (
                <button className="npw-btn npw-btn--ghost" onClick={handleCreateDraft}>
                  {generationState === "partial" ? "Save Partial Draft" : "Save Draft Without Accepting"}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
