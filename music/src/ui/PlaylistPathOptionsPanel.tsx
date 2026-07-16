import { useState, useMemo, useRef, useEffect } from "react";
import type { PlaylistPathOption, PlaylistMetadataRepairImpact } from "../data/playlistPathTypes";
import type { CrateRecord } from "../data/crateTypes";
import type { Track } from "../data/trackTypes";
import {
  summarizeMetadataReadiness,
  deriveTrustGrade,
  trustGradeAllowsNormalScore,
  type MetadataTrustGrade,
} from "../logic/metadataReadiness";

type Props = {
  options: PlaylistPathOption[];
  acceptedOptionId?: string;
  crates: CrateRecord[];
  tracksById?: Map<string, Track>;
  targetDurationSeconds: number;
  isGenerating: boolean;
  onGenerate: () => void;
  onAccept: (optionId: string) => void;
  onDuplicate: (optionId: string) => void;
  // Stale detection (0705E)
  currentMetadataRevision?: string;
  metadataRepairImpact?: PlaylistMetadataRepairImpact;
  // Accepted playlist read mode (0705K)
  isAcceptedMode?: boolean;
  // Whether the crate options panel is expanded (controls action button visibility)
  isCrateOptionsOpen?: boolean;
  // Hide the accepted summary bar (it's now shown in the Flow panel)
  hideAcceptedBar?: boolean;
};

function fmtDur(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function fmtRawScore(score: number): { label: string; cls: string } {
  if (score >= 80) return { label: "Excellent", cls: "ppo-score--excellent" };
  if (score >= 65) return { label: "Good", cls: "ppo-score--good" };
  if (score >= 50) return { label: "Fair", cls: "ppo-score--fair" };
  return { label: "Weak", cls: "ppo-score--weak" };
}

function fmtTrustGrade(grade: MetadataTrustGrade): { label: string; cls: string } {
  switch (grade) {
    case "excellent": return { label: "Excellent", cls: "ppo-score--excellent" };
    case "usable":    return { label: "Good", cls: "ppo-score--good" };
    case "provisional": return { label: "Provisional", cls: "ppo-score--provisional" };
    case "weak":      return { label: "Metadata Weak", cls: "ppo-score--provisional" };
    case "blocked":   return { label: "Blocked", cls: "ppo-score--weak" };
  }
}

function acceptLabel(grade: MetadataTrustGrade): string {
  if (grade === "blocked") return "Repair Metadata Required";
  if (grade === "provisional" || grade === "weak") return "Accept Provisional Playlist";
  return "Accept as Playlist";
}

const SCORE_LABELS: Record<string, [string, number]> = {
  warnings:        ["Warnings",          25],
  durationFit:     ["Duration fit",      15],
  energyContinuity:["Energy continuity", 15],
  keyCompatibility:["Key compatibility", 15],
  bpmContinuity:   ["BPM continuity",    10],
  movement:        ["Movement",          10],
  rating:          ["Rating",             5],
  fillRatio:       ["Fill ratio",         5],
};

const WARN_LABELS: Record<string, string> = {
  bpmJump:         "BPM jumps",
  keyRisk:         "Key risks",
  energyJump:      "Energy jumps",
  emptySlot:       "Empty slots",
  missingMetadata: "Missing metadata",
  unknown:         "Other",
};

function OptionCard({
  opt,
  isAccepted,
  cratesById,
  tracksById,
  onAccept,
  onDuplicate,
}: {
  opt: PlaylistPathOption;
  isAccepted: boolean;
  cratesById: Map<string, CrateRecord>;
  tracksById?: Map<string, Track>;
  onAccept: () => void;
  onDuplicate: () => void;
}) {
  const [showDetails, setShowDetails] = useState(false);
  const crateUsageEntries = Object.entries(opt.stats.crateUsage ?? {}).filter(([, n]) => n > 0);

  const optionReadiness = useMemo(() => {
    if (!tracksById) return null;
    const tracks = opt.trackIds.map((id) => tracksById.get(id)).filter((t): t is Track => !!t);
    return summarizeMetadataReadiness(tracks, opt.trackIds);
  }, [opt.trackIds, tracksById]);

  const trustGrade = optionReadiness ? deriveTrustGrade(optionReadiness) : null;
  const showTrustGrade = trustGrade !== null;
  const trustAllows = trustGrade ? trustGradeAllowsNormalScore(trustGrade) : true;
  const { label: scoreLabel, cls: scoreCls } = trustGrade && !trustAllows
    ? fmtTrustGrade(trustGrade)
    : fmtRawScore(opt.score);

  const provisionalNote = trustGrade && !trustAllows
    ? (trustGrade === "provisional"
        ? "Generated order available, but musical scoring is limited by missing metadata."
        : null)
    : (trustGrade === "excellent" || trustGrade === "usable"
        ? "Scored from complete duration, BPM, key, and energy metadata."
        : null);

  const totalWarnings = (opt.stats.redWarnings ?? 0) + (opt.stats.yellowWarnings ?? 0);
  const breakdownTotal = opt.stats.warningBreakdown
    ? Object.values(opt.stats.warningBreakdown).reduce((a, b) => a + b, 0)
    : 0;

  return (
    <div className={`ppo-card${isAccepted ? " ppo-card--accepted" : ""}`}>
      {/* Top row */}
      <div className="ppo-card-top">
        <div className="ppo-card-rank">
          {isAccepted
            ? <span className="ppo-badge ppo-badge--accepted">Active</span>
            : null}
        </div>
        <div className="ppo-card-name">{opt.name}</div>
        <div className={`ppo-score ${scoreCls}`}>
          {showTrustGrade && !trustAllows
            ? <span className="ppo-score-num ppo-score-raw">Raw {opt.score}</span>
            : <span className="ppo-score-num">{opt.score}</span>
          }
          <span className="ppo-score-label">{scoreLabel}</span>
        </div>
      </div>

      {/* Stats row */}
      <div className="ppo-card-stats">
        <span className="ppo-stat">
          <span className="ppo-stat-val">{opt.trackIds.length}</span> tracks
        </span>
        <span className="ppo-sep">·</span>
        <span className="ppo-stat">
          <span className="ppo-stat-val">{fmtDur(opt.durationSeconds)}</span>
        </span>
        {(opt.stats.redWarnings ?? 0) > 0 && (
          <><span className="ppo-sep">·</span>
          <span className="ppo-stat ppo-stat--red">
            <span className="ppo-stat-val">{opt.stats.redWarnings}</span> red events
          </span></>
        )}
        {(opt.stats.yellowWarnings ?? 0) > 0 && (
          <><span className="ppo-sep">·</span>
          <span className="ppo-stat ppo-stat--yellow">
            <span className="ppo-stat-val">{opt.stats.yellowWarnings}</span> yellow events
          </span></>
        )}
        {totalWarnings === 0 && (
          <><span className="ppo-sep">·</span>
          <span className="ppo-stat ppo-stat--clean">Clean</span></>
        )}
      </div>

      {/* Detail chips */}
      <div className="ppo-card-detail">
        {optionReadiness && (
          <span className={`ppo-detail-chip ppo-readiness-chip ppo-readiness--${optionReadiness.status}`}>
            {optionReadiness.status.toUpperCase()}
            {optionReadiness.estimatedDurationCount > 0
              ? ` · ${optionReadiness.totalTracks - optionReadiness.estimatedDurationCount}/${optionReadiness.totalTracks} dur`
              : ""}
          </span>
        )}
        {opt.metadataSnapshot && (
          <span className={`ppo-detail-chip ppo-gen-grade-chip ppo-gen-grade--${opt.metadataSnapshot.readinessGrade}`}>
            {opt.metadataSnapshot.readinessGrade.toUpperCase()} at generation
          </span>
        )}
        {opt.staleReason && (
          <span className="ppo-detail-chip ppo-stale-chip">Stale</span>
        )}
        {(opt.stats.bpmMin ?? 0) > 0 && (opt.stats.bpmMax ?? 0) > 0 && (
          <span className="ppo-detail-chip">BPM {opt.stats.bpmMin}–{opt.stats.bpmMax}</span>
        )}
        <span className="ppo-detail-chip">
          Key compat {Math.round((opt.stats.keyCompatibilityScore ?? 0) * 100)}%
        </span>
        <span className="ppo-detail-chip">
          Movement {Math.round((opt.stats.movementScore ?? 0) * 100)}%
        </span>
        {crateUsageEntries.length > 0 && (
          <span className="ppo-detail-chip ppo-detail-chip--crate">
            {crateUsageEntries
              .map(([id, n]) => `${cratesById.get(id)?.name ?? id} ${n}`)
              .join(" · ")}
          </span>
        )}
      </div>

      {/* Explanation */}
      <div className="ppo-card-explanation">{opt.explanation}</div>
      {provisionalNote && (
        <div className={`ppo-card-provisional-note${trustAllows ? " ppo-provisional--trust" : ""}`}>
          {provisionalNote}
        </div>
      )}

      {/* Details section */}
      {showDetails && (
        <div className="ppo-details">
          {/* Score breakdown */}
          {opt.stats.scoreBreakdown && (
            <div className="ppo-details-section">
              <div className="ppo-details-heading">Score Breakdown</div>
              {Object.entries(SCORE_LABELS).map(([key, [label, max]]) => {
                const val = (opt.stats.scoreBreakdown as Record<string, number>)[key] ?? 0;
                return (
                  <div key={key} className="ppo-breakdown-row">
                    <span className="ppo-breakdown-label">{label}</span>
                    <div className="ppo-breakdown-bar-wrap">
                      <div
                        className="ppo-breakdown-bar"
                        style={{ width: `${(val / max) * 100}%` }}
                      />
                    </div>
                    <span className="ppo-breakdown-val">{val} / {max}</span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Warning breakdown */}
          {opt.stats.warningBreakdown && breakdownTotal > 0 && (
            <div className="ppo-details-section">
              <div className="ppo-details-heading">Warning Breakdown</div>
              {Object.entries(WARN_LABELS).map(([key, label]) => {
                const count = (opt.stats.warningBreakdown as Record<string, number>)[key] ?? 0;
                if (count === 0) return null;
                return (
                  <div key={key} className="ppo-breakdown-row">
                    <span className="ppo-breakdown-label">{label}</span>
                    <span className="ppo-breakdown-val ppo-breakdown-val--warn">{count}</span>
                  </div>
                );
              })}
            </div>
          )}
          {opt.stats.warningBreakdown && breakdownTotal === 0 && (
            <div className="ppo-details-section">
              <div className="ppo-details-clean">No warnings detected.</div>
            </div>
          )}

          {/* Improvement hints */}
          {(opt.stats.improvementHints ?? []).length > 0 && (
            <div className="ppo-details-section">
              <div className="ppo-details-heading">Next Steps</div>
              {(opt.stats.improvementHints ?? []).map((hint, i) => (
                <div key={i} className="ppo-hint">{hint}</div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="ppo-card-actions">
        {isAccepted ? (
          <span className="ppo-card-active-label">Active Playlist Output</span>
        ) : (
          <button
            className={`tb-btn ppo-accept-btn${trustGrade && trustAllows ? " ph-btn-primary" : " ppo-accept-btn--provisional"}`}
            onClick={onAccept}
          >
            {trustGrade ? acceptLabel(trustGrade) : "Accept as Playlist"}
          </button>
        )}
        <button className="tb-btn ppo-dup-btn" onClick={onDuplicate}>
          Duplicate as New Playlist
        </button>
        <button
          className="tb-btn ppo-details-btn"
          onClick={() => setShowDetails((v) => !v)}
        >
          {showDetails ? "Hide Details" : "Details"}
        </button>
      </div>
    </div>
  );
}

export function PlaylistPathOptionsPanel({
  options,
  acceptedOptionId,
  crates,
  tracksById,
  targetDurationSeconds,
  isGenerating,
  onGenerate,
  onAccept,
  onDuplicate,
  currentMetadataRevision,
  metadataRepairImpact,
  isAcceptedMode = false,
  isCrateOptionsOpen = false,
  hideAcceptedBar = false,
}: Props) {
  const cratesById = new Map(crates.map((c) => [c.id, c]));
  const hasOptions = options.length > 0;
  const [showAllOptions, setShowAllOptions] = useState(false);

  const acceptedOpt = acceptedOptionId ? options.find((o) => o.id === acceptedOptionId) : null;

  // Stale detection: any option with staleReason, or revision mismatch
  const isStale = hasOptions && options.some(
    (o) =>
      o.staleReason != null ||
      (currentMetadataRevision &&
        o.metadataRevision &&
        o.metadataRevision !== currentMetadataRevision),
  );

  // Delta tracking — capture prev top option before regeneration
  const prevTopRef = useRef<{ score: number; grade: string; red: number } | null>(null);
  const [delta, setDelta] = useState<{
    prevScore: number; newScore: number;
    prevGrade: string; newGrade: string;
    prevRed: number; newRed: number;
  } | null>(null);

  // Watch options change to compute delta
  const prevOptionsIdRef = useRef<string>("");
  useEffect(() => {
    const topId = options[0]?.id ?? "";
    if (topId !== prevOptionsIdRef.current && prevTopRef.current && options.length > 0) {
      const top = options[0];
      setDelta({
        prevScore: prevTopRef.current.score,
        newScore: top.score,
        prevGrade: prevTopRef.current.grade,
        newGrade: top.metadataSnapshot?.readinessGrade ?? "unknown",
        prevRed: prevTopRef.current.red,
        newRed: top.stats.redWarnings ?? 0,
      });
      prevTopRef.current = null;
    }
    prevOptionsIdRef.current = topId;
  }, [options]);

  function handleGenerate() {
    // Capture current top before regenerating
    if (options.length > 0) {
      prevTopRef.current = {
        score: options[0].score,
        grade: options[0].metadataSnapshot?.readinessGrade ?? "unknown",
        red: options[0].stats.redWarnings ?? 0,
      };
    }
    setDelta(null);
    onGenerate();
  }

  // Compact accepted-mode summary bar — hidden when Flow panel owns it
  if (isAcceptedMode && acceptedOpt && !showAllOptions && !hideAcceptedBar) {
    const optReadiness = tracksById
      ? (() => {
          const tracks = acceptedOpt.trackIds.map((id) => tracksById.get(id)).filter((t): t is Track => !!t);
          return summarizeMetadataReadiness(tracks, acceptedOpt.trackIds);
        })()
      : null;
    const trustGrade = optReadiness ? deriveTrustGrade(optReadiness) : null;
    const trustAllows = trustGrade ? trustGradeAllowsNormalScore(trustGrade) : true;
    const { label: scoreLabel, cls: scoreCls } = trustGrade && !trustAllows
      ? fmtTrustGrade(trustGrade)
      : fmtRawScore(acceptedOpt.score);
    const totalWarnings = (acceptedOpt.stats.redWarnings ?? 0) + (acceptedOpt.stats.yellowWarnings ?? 0);
    return (
      <div className="ppo-accepted-bar">
        <span className="ppo-accepted-bar-label">Accepted:</span>
        <span className="ppo-accepted-bar-name">{acceptedOpt.name}</span>
        <span className="ppo-sep">·</span>
        <span className="ppo-accepted-bar-tracks">{acceptedOpt.trackIds.length} tracks · {fmtDur(acceptedOpt.durationSeconds)}</span>
        {(acceptedOpt.stats.redWarnings ?? 0) > 0 && (
          <><span className="ppo-sep">·</span><span className="ppo-accepted-bar-warn ppo-stat--red">{acceptedOpt.stats.redWarnings} red</span></>
        )}
        {(acceptedOpt.stats.yellowWarnings ?? 0) > 0 && (
          <><span className="ppo-sep">·</span><span className="ppo-accepted-bar-warn ppo-stat--yellow">{acceptedOpt.stats.yellowWarnings} yellow</span></>
        )}
        {totalWarnings === 0 && <><span className="ppo-sep">·</span><span className="ppo-stat--clean">Clean</span></>}
        {isStale && <span className="ppo-accepted-bar-stale">Stale — regenerate to update</span>}
        {isCrateOptionsOpen && (
          <div className="ppo-accepted-bar-actions">
            <span className={`ppo-accepted-bar-score ${scoreCls}`}>{scoreLabel}</span>
            <button className="tb-btn" onClick={() => setShowAllOptions(true)}>Change Option</button>
            <button className="tb-btn" onClick={handleGenerate} disabled={isGenerating}>
              {isGenerating ? "Generating…" : "Regenerate Options"}
            </button>
            <button className="tb-btn" onClick={() => onDuplicate(acceptedOpt.id)}>Duplicate as New Playlist</button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="ppo-panel">
      {isAcceptedMode && showAllOptions && (
        <div className="ppo-change-option-bar">
          <span className="ppo-change-option-label">Choose a different option to replace the current playlist output.</span>
          <button className="tb-btn" onClick={() => setShowAllOptions(false)}>← Back</button>
        </div>
      )}
      <div className="ppo-header ppo-header--compact">
        <span className="ppo-header-label">
          {hasOptions ? `${options.length} Playlist Option${options.length !== 1 ? "s" : ""}` : "Options"}
        </span>
        {!hasOptions && !isGenerating && (
          <span className="ppo-status-pill">Crate pool ready</span>
        )}
        {isGenerating && (
          <span className="ppo-status-pill">
            Analyzing{targetDurationSeconds > 0 ? ` ${fmtDur(targetDurationSeconds)}` : ""} target…
          </span>
        )}
        <button
          className={`tb-btn ${hasOptions && !isStale ? "" : "ph-btn-primary"} ppo-generate-btn`}
          onClick={handleGenerate}
          disabled={isGenerating}
        >
          {isGenerating ? "Generating…" : hasOptions ? "Regenerate Options" : "Generate Options"}
        </button>
      </div>

      {/* Stale warning */}
      {isStale && !isGenerating && (
        <div className="ppo-stale-banner">
          <div className="ppo-stale-banner-main">
            AudioLab metadata changed after these options were generated.
            Regenerate Options to rescore with current metadata.
          </div>
          {metadataRepairImpact && (
            <div className="ppo-stale-before-after">
              <span className="ppo-stale-before">
                Before: {metadataRepairImpact.beforeSnapshot.readinessGrade.toUpperCase()} ·{" "}
                Dur {metadataRepairImpact.beforeSnapshot.durationReady}/{metadataRepairImpact.beforeSnapshot.totalTracks} ·{" "}
                BPM {metadataRepairImpact.beforeSnapshot.bpmReady}/{metadataRepairImpact.beforeSnapshot.totalTracks}
              </span>
              <span className="ppo-stale-arrow">→</span>
              <span className="ppo-stale-after">
                After: {metadataRepairImpact.afterSnapshot.readinessGrade.toUpperCase()} ·{" "}
                Dur {metadataRepairImpact.afterSnapshot.durationReady}/{metadataRepairImpact.afterSnapshot.totalTracks} ·{" "}
                BPM {metadataRepairImpact.afterSnapshot.bpmReady}/{metadataRepairImpact.afterSnapshot.totalTracks}
              </span>
            </div>
          )}
          <div className="ppo-stale-note">
            Existing accepted playlist output will not change until you accept a new option.
          </div>
        </div>
      )}

      {/* Score delta after regeneration */}
      {delta && !isStale && (
        <div className="ppo-delta-card">
          <div className="ppo-delta-note">
            ⚠ Previous score reflects prior crate pool and analyzer settings — comparison is approximate.
          </div>
          <div className="ppo-delta-row ppo-delta-prev">
            Previous top: Raw {delta.prevScore} · {delta.prevGrade.toUpperCase()} · {delta.prevRed} red events
          </div>
          <div className="ppo-delta-row ppo-delta-new">
            New top: Raw {delta.newScore} · {delta.newGrade.toUpperCase()} · {delta.newRed} red events
          </div>
          <div className="ppo-delta-summary">
            {delta.newScore > delta.prevScore
              ? <span className="ppo-delta-plus">+{delta.newScore - delta.prevScore} score</span>
              : delta.newScore < delta.prevScore
              ? <span className="ppo-delta-minus">{delta.newScore - delta.prevScore} score</span>
              : <span>Score unchanged</span>}
            {delta.newGrade !== delta.prevGrade && (
              <span className="ppo-delta-trust">
                {" "}· Trust {delta.prevGrade.toUpperCase()} → {delta.newGrade.toUpperCase()}
              </span>
            )}
            {delta.newRed !== delta.prevRed && (
              <span className={delta.newRed < delta.prevRed ? "ppo-delta-plus" : "ppo-delta-minus"}>
                {" "}· Warnings {delta.newRed < delta.prevRed ? "" : "+"}{delta.newRed - delta.prevRed}
              </span>
            )}
          </div>
          <button className="tb-btn ppo-delta-dismiss" onClick={() => setDelta(null)}>×</button>
        </div>
      )}

      {hasOptions && (
        <div className="ppo-cards">
          {options.map((opt) => (
            <OptionCard
              key={opt.id}
              opt={opt}
              isAccepted={opt.id === acceptedOptionId}
              cratesById={cratesById}
              tracksById={tracksById}
              onAccept={() => onAccept(opt.id)}
              onDuplicate={() => onDuplicate(opt.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
