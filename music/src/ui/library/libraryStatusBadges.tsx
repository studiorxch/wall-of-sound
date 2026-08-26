// MUSIC P0 Clean Library Foundation — Step C: Analysis Status + File Health
// (0826B_MUSIC_P0_Clean_Library_Foundation_StepC).
//
// Compact row-level indicators for the Library grid's existing "status"
// column, alongside the pre-existing archive-status pills (ARC/REV/REJ).
// Reuses the same .warn-badge visual weight and the existing badge color
// classes (badge-blue/badge-yellow/badge-red) rather than inventing new
// CSS. Renders nothing for the quiet/default case (Ready analysis, Healthy
// file) — per the Creative Interface Doctrine, normal state stays visually
// quiet; a track that's never been analyzed also renders nothing here,
// since its blank BPM/Key/Mood cells already say so without repeating it.
// Analysis and file health are deliberately two separate badges/tooltips —
// never merged into one signal.

import type { Track } from "../../data/trackTypes";
import type { TrackPlaybackIssue } from "../../data/playProjectTypes";
import { getAnalysisDisplayState, ANALYSIS_DISPLAY_LABELS } from "../../logic/analysisStatusDisplay";
import { computeTrackOverallFileHealth } from "../../logic/trackFileHealth";
import { FILE_HEALTH_LABELS } from "../../data/fileHealthTypes";

const ANALYSIS_BADGE: Record<string, { code: string; cls: string } | null> = {
  not_analyzed: null,
  ready: null,
  queued: { code: "QUE", cls: "badge-blue" },
  analyzing: { code: "ANL", cls: "badge-blue" },
  needs_review: { code: "NDR", cls: "badge-yellow" },
  failed: { code: "ERR", cls: "badge-red" },
};

export function AnalysisStateBadge({ track }: { track: Track }) {
  const state = getAnalysisDisplayState(track);
  const badge = ANALYSIS_BADGE[state];
  if (!badge) return null;
  return (
    <span className={`warn-badge ${badge.cls}`} title={`Analysis: ${ANALYSIS_DISPLAY_LABELS[state]}`}>
      {badge.code}
    </span>
  );
}

const HEALTH_BADGE: Record<string, { code: string; cls: string } | null> = {
  healthy: null,
  unknown: null,
  missing: { code: "MIA", cls: "badge-red" },
  codec_blocked: { code: "COD", cls: "badge-red" },
  unresolved: { code: "UNR", cls: "badge-yellow" },
  unavailable: { code: "OFF", cls: "badge-yellow" },
};

export function FileHealthBadge({ track, playbackIssues }: { track: Track; playbackIssues?: Record<string, TrackPlaybackIssue> }) {
  const { overall, perAsset } = computeTrackOverallFileHealth(track, playbackIssues);
  const badge = HEALTH_BADGE[overall];
  if (!badge) return null;
  const detail = perAsset.length > 1
    ? perAsset.map((a) => `${a.format.toUpperCase()}: ${FILE_HEALTH_LABELS[a.status]}`).join(", ")
    : FILE_HEALTH_LABELS[overall];
  return (
    <span className={`warn-badge ${badge.cls}`} title={`File: ${detail}`}>
      {badge.code}
    </span>
  );
}
