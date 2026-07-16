// Intake readiness grading (0705Q)
// Per-track grade + issue reasons for External, Catalog, and Reference tracks.

import type { Track, IntakeReadinessGrade } from "../data/trackTypes";
import { checkTrackAnalysisTrust } from "./analysisTrustChecks";
import { parseTrackIdentityFromTitle } from "./trackIdentityParser";

export type IntakeReadinessIssue = {
  issueId: string;
  severity: "info" | "warning" | "blocker";
  code: string;
  message: string;
  field?: string;
};

export type TrackIntakeReadiness = {
  grade: IntakeReadinessGrade;
  issues: IntakeReadinessIssue[];
};

function issue(
  code: string,
  severity: IntakeReadinessIssue["severity"],
  message: string,
  field?: string,
): IntakeReadinessIssue {
  return { issueId: code, severity, code, message, field };
}

export function gradeTrackIntake(track: Track): TrackIntakeReadiness {
  const issues: IntakeReadinessIssue[] = [];
  const sourceRole = track.sourceOwner ?? "external";

  // ── Identity checks ────────────────────────────────────────────────────────

  if (!track.title?.trim()) {
    issues.push(issue("missing_title", "blocker", "Track has no title", "title"));
  }

  if (!track.artist?.trim()) {
    issues.push(issue("missing_artist", "warning", "Artist is missing", "artist"));
  }

  // Detect fused track number in title if identityStatus not already set
  const titleLooks = track.title ?? "";
  if (!track.identityStatus || track.identityStatus === "needs_review") {
    const parsed = parseTrackIdentityFromTitle(titleLooks);
    if (parsed.identityStatus === "track_number_detected") {
      issues.push(issue(
        "track_number_embedded",
        "warning",
        `Track number appears embedded in title: "${titleLooks}"`,
        "title",
      ));
    }
    if (parsed.identityStatus === "title_artist_fused" || parsed.identityStatus === "filename_only") {
      issues.push(issue(
        "title_artist_fused",
        "warning",
        `Title may contain fused artist/number: "${titleLooks}"`,
        "title",
      ));
    }
  }

  // ── Path check ─────────────────────────────────────────────────────────────

  if (!track.filePath && !track.audioFilename && !track.fileName) {
    issues.push(issue("path_missing", "blocker", "No file path — cannot analyze or play", "filePath"));
  }

  // ── Duration ───────────────────────────────────────────────────────────────

  if (!(track.durationSeconds > 0)) {
    issues.push(issue("duration_missing", "warning", "Duration not recorded — using estimated 3:00", "durationSeconds"));
  }

  // ── Analysis trust ─────────────────────────────────────────────────────────

  const trust = checkTrackAnalysisTrust(track);

  if (trust.bpmTrust === "missing") {
    issues.push(issue("bpm_missing", "warning", "BPM not set", "bpm"));
  } else if (trust.bpmTrust === "untrusted") {
    issues.push(issue("bpm_untrusted", "warning", "BPM marked untrusted (suspicious batch)", "bpm"));
  }

  if (trust.keyTrust === "missing") {
    issues.push(issue("key_missing", "info", "Camelot key not set", "camelotKey"));
  } else if (trust.keyTrust === "untrusted") {
    issues.push(issue("key_batch_suspicious", "warning", "Key is untrusted — likely defaulted across batch", "camelotKey"));
  } else if (trust.keyTrust === "low_confidence") {
    issues.push(issue("key_untrusted", "info", "Key confidence is low", "camelotKey"));
  }

  if (trust.energyTrust === "missing") {
    issues.push(issue("energy_missing", "warning", "Energy not set", "energy"));
  }

  // ── Source role ────────────────────────────────────────────────────────────

  if (sourceRole === "reference") {
    issues.push(issue("reference_only", "info", "Reference track — excluded from playlist output by default", "sourceOwner"));
  }

  // ── Manual review flag ─────────────────────────────────────────────────────

  if (track.archiveStatus === "needs_review") {
    issues.push(issue("manual_review_required", "warning", "Marked as needs review", "archiveStatus"));
  }

  // ── Grade ─────────────────────────────────────────────────────────────────

  const hasBlocker = issues.some(i => i.severity === "blocker");
  const warningCount = issues.filter(i => i.severity === "warning").length;

  let grade: IntakeReadinessGrade;
  if (hasBlocker) {
    grade = "BLOCKED";
  } else if (warningCount >= 3) {
    grade = "REVIEW";
  } else if (warningCount >= 1) {
    grade = "GOOD";
  } else {
    grade = "EXCELLENT";
  }

  return { grade, issues };
}

export type IntakeReadinessSummary = {
  total: number;
  excellent: number;
  good: number;
  review: number;
  blocked: number;
  identityIssues: number;
  analysisTrustIssues: number;
  moodSuggestionsGenerated: number;
  referenceCount: number;
};

export function summarizeIntakeReadiness(tracks: Track[]): IntakeReadinessSummary {
  let excellent = 0, good = 0, review = 0, blocked = 0;
  let identityIssues = 0, analysisTrustIssues = 0, moodSuggestionsGenerated = 0, referenceCount = 0;

  for (const t of tracks) {
    const { grade, issues } = gradeTrackIntake(t);
    if (grade === "EXCELLENT") excellent++;
    else if (grade === "GOOD") good++;
    else if (grade === "REVIEW") review++;
    else blocked++;

    if (issues.some(i => ["missing_artist", "missing_title", "track_number_embedded", "title_artist_fused"].includes(i.code))) {
      identityIssues++;
    }
    if (issues.some(i => ["key_batch_suspicious", "key_untrusted", "bpm_untrusted"].includes(i.code))) {
      analysisTrustIssues++;
    }
    if ((t.moodSuggestions?.length ?? 0) > 0 || (t.clusterTags?.length ?? 0) > 0) {
      moodSuggestionsGenerated++;
    }
    if (t.sourceOwner === "reference") referenceCount++;
  }

  return {
    total: tracks.length,
    excellent, good, review, blocked,
    identityIssues, analysisTrustIssues, moodSuggestionsGenerated, referenceCount,
  };
}
