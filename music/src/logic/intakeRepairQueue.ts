// Intake repair queue generator (0705R)
// Builds reviewable repair candidates from identity/trust/mood/source-role findings.

import type { Track } from "../data/trackTypes";
import type { CrateRecord } from "../data/crateTypes";
import { parseTrackIdentityFromTitle, parsePostArtistTitleCleanup } from "./trackIdentityParser";
import { checkTrackAnalysisTrust, detectBatchAnalysisTrust } from "./analysisTrustChecks";
import { suggestMoodsAndClusters } from "./moodSuggestionEngine";
import { resolveCrateTracks } from "./resolveCrate";

// ── Types ─────────────────────────────────────────────────────────────────────

export type IntakeRepairKind =
  | "identity_split"
  | "track_number_cleanup"
  | "artist_fill"
  | "title_cleanup"
  | "post_artist_title_cleanup"
  | "analysis_trust_update"
  | "mood_cluster_apply"
  | "source_role_review"
  | "readiness_refresh";

export type IntakeRepairStatus =
  | "pending"
  | "selected"
  | "applied"
  | "deferred"
  | "ignored"
  | "blocked";

export type IntakeRepairRisk = "safe" | "review" | "blocked";

export type IntakeRepairItem = {
  repairId: string;
  trackId: string;
  kind: IntakeRepairKind;
  status: IntakeRepairStatus;
  risk: IntakeRepairRisk;
  confidence: number;
  reason: string;
  before: Partial<Track>;
  after: Partial<Track>;
  fieldsChanged: string[];
  blockerReason?: string;
};

export type IntakeRepairBatch = {
  batchId: string;
  appliedAt: string;
  itemIds: string[];
  trackSnapshotsBefore: Record<string, Partial<Track>>;
  trackSnapshotsAfter: Record<string, Partial<Track>>;
  summary: {
    applied: number;
    blocked: number;
    deferred: number;
    ignored: number;
  };
};

// ── ID generation ─────────────────────────────────────────────────────────────

function repairId(trackId: string, kind: IntakeRepairKind, ...extra: string[]): string {
  return [trackId.slice(0, 16), kind, ...extra.map(s => s.replace(/[^a-z0-9]/gi, "_").slice(0, 12))].join(":");
}

// ── Individual generators ─────────────────────────────────────────────────────

function identityRepairs(track: Track, ignoredIds: Set<string>, deferredIds: Set<string>): IntakeRepairItem[] {
  const items: IntakeRepairItem[] = [];

  // Skip if manually set
  if (track.identitySource === "manual" || track.identityStatus === "manual_override") {
    return items;
  }

  const titleRaw = track.title ?? "";
  const artistRaw = track.artist ?? "";
  const parsed = parseTrackIdentityFromTitle(titleRaw);

  // identity_split: fused "01 Artist - Title" in title field
  if (
    parsed.artist && parsed.title && parsed.title !== titleRaw
  ) {
    const id = repairId(track.trackId, "identity_split", titleRaw);
    if (!ignoredIds.has(id)) {
      const before: Partial<Track> = { title: titleRaw, artist: artistRaw };
      const after: Partial<Track> = {
        title: parsed.title,
        artist: parsed.artist,
        identityStatus: "clean",
        identityConfidence: parsed.identityConfidence,
        identitySource: "import",
      };
      if (parsed.trackNumber != null) {
        (after as Record<string, unknown>).trackNumber = parsed.trackNumber;
      }
      const risk: IntakeRepairRisk =
        artistRaw && artistRaw !== parsed.artist ? "blocked"
        : parsed.identityConfidence >= 0.85 ? "safe"
        : "review";
      const blockerReason =
        artistRaw && artistRaw !== parsed.artist
          ? `Artist field already set to "${artistRaw}" — would overwrite`
          : undefined;
      items.push({
        repairId: id,
        trackId: track.trackId,
        kind: "identity_split",
        status: deferredIds.has(id) ? "deferred" : risk === "blocked" ? "blocked" : "pending",
        risk,
        confidence: parsed.identityConfidence,
        reason: parsed.reason,
        before,
        after,
        fieldsChanged: Object.keys(after),
        blockerReason,
      });
    }
  }

  // track_number_cleanup: number prefix in title with no artist split
  if (parsed.trackNumber != null && !parsed.artist && parsed.title && parsed.title !== titleRaw) {
    const id = repairId(track.trackId, "track_number_cleanup", titleRaw);
    if (!ignoredIds.has(id)) {
      const before: Partial<Track> = { title: titleRaw };
      const after: Partial<Track> = {
        title: parsed.title,
        identityStatus: "track_number_detected",
        identityConfidence: parsed.identityConfidence,
        identitySource: "import",
      };
      (after as Record<string, unknown>).trackNumber = parsed.trackNumber;
      items.push({
        repairId: id,
        trackId: track.trackId,
        kind: "track_number_cleanup",
        status: deferredIds.has(id) ? "deferred" : "pending",
        risk: parsed.identityConfidence >= 0.7 ? "safe" : "review",
        confidence: parsed.identityConfidence,
        reason: `Track number ${parsed.trackNumber} detected in title`,
        before,
        after,
        fieldsChanged: Object.keys(after),
      });
    }
  }

  // artist_fill: artist missing but parser found one
  if (!artistRaw && parsed.artist && parsed.title) {
    const id = repairId(track.trackId, "artist_fill", parsed.artist);
    if (!ignoredIds.has(id)) {
      const risk: IntakeRepairRisk = parsed.identityConfidence >= 0.85 ? "safe" : "review";
      items.push({
        repairId: id,
        trackId: track.trackId,
        kind: "artist_fill",
        status: deferredIds.has(id) ? "deferred" : "pending",
        risk,
        confidence: parsed.identityConfidence,
        reason: `Artist "${parsed.artist}" extracted from title`,
        before: { artist: "" },
        after: { artist: parsed.artist, identityStatus: "clean", identitySource: "import" },
        fieldsChanged: ["artist", "identityStatus", "identitySource"],
      });
    }
  }

  return items;
}

function analysisTrustRepairs(
  track: Track,
  batchSuspiciousKey: boolean,
  batchSuspiciousKeyReason: string | undefined,
  batchSuspiciousBpm: boolean,
  batchSuspiciousBpmReason: string | undefined,
  ignoredIds: Set<string>,
  deferredIds: Set<string>,
): IntakeRepairItem[] {
  const items: IntakeRepairItem[] = [];
  const per = checkTrackAnalysisTrust(track);

  // Key trust — suspicious batch
  if (batchSuspiciousKey && (track.keyTrust ?? "trusted") !== "untrusted" && (track.camelotKey || track.key)) {
    const id = repairId(track.trackId, "analysis_trust_update", "key");
    if (!ignoredIds.has(id)) {
      items.push({
        repairId: id,
        trackId: track.trackId,
        kind: "analysis_trust_update",
        status: deferredIds.has(id) ? "deferred" : "pending",
        risk: "safe",
        confidence: 0.92,
        reason: batchSuspiciousKeyReason ?? "Key trust downgrade — suspicious batch",
        before: { keyTrust: track.keyTrust ?? "trusted" } as Partial<Track>,
        after: { keyTrust: "untrusted", analysisTrustWarnings: [...(track.analysisTrustWarnings ?? []), batchSuspiciousKeyReason ?? "Key batch suspicious"] } as Partial<Track>,
        fieldsChanged: ["keyTrust", "analysisTrustWarnings"],
      });
    }
  }

  // BPM trust — per-track issues
  if (per.bpmTrust === "low_confidence" && (track.bpmTrust ?? "trusted") !== "low_confidence") {
    const id = repairId(track.trackId, "analysis_trust_update", "bpm_low");
    if (!ignoredIds.has(id)) {
      items.push({
        repairId: id,
        trackId: track.trackId,
        kind: "analysis_trust_update",
        status: deferredIds.has(id) ? "deferred" : "pending",
        risk: "safe",
        confidence: 0.85,
        reason: per.warnings.find(w => w.includes("BPM")) ?? "BPM low confidence",
        before: { bpmTrust: track.bpmTrust ?? "trusted" } as Partial<Track>,
        after: { bpmTrust: "low_confidence" } as Partial<Track>,
        fieldsChanged: ["bpmTrust"],
      });
    }
  }

  if (batchSuspiciousBpm && (track.bpmTrust ?? "trusted") !== "untrusted" && (track.bpm ?? 0) > 0) {
    const id = repairId(track.trackId, "analysis_trust_update", "bpm_batch");
    if (!ignoredIds.has(id)) {
      items.push({
        repairId: id,
        trackId: track.trackId,
        kind: "analysis_trust_update",
        status: deferredIds.has(id) ? "deferred" : "pending",
        risk: "safe",
        confidence: 0.90,
        reason: batchSuspiciousBpmReason ?? "BPM batch suspicious",
        before: { bpmTrust: track.bpmTrust ?? "trusted" } as Partial<Track>,
        after: { bpmTrust: "untrusted" } as Partial<Track>,
        fieldsChanged: ["bpmTrust"],
      });
    }
  }

  return items;
}

function moodClusterRepairs(
  track: Track,
  crateNames: string[],
  ignoredIds: Set<string>,
  deferredIds: Set<string>,
): IntakeRepairItem[] {
  const items: IntakeRepairItem[] = [];

  // Skip if manually set
  if (track.identitySource === "manual") return items;
  // Skip if already has suggestions
  if ((track.moodSuggestions?.length ?? 0) > 0 && (track.clusterTags?.length ?? 0) > 0) return items;

  const result = suggestMoodsAndClusters(track, crateNames);
  if (result.moods.length === 0 && result.clusterTags.length === 0) return items;

  const id = repairId(track.trackId, "mood_cluster_apply", result.moods[0] ?? "");
  if (!ignoredIds.has(id)) {
    const after: Partial<Track> = {};
    const fieldsChanged: string[] = [];
    if (result.moods.length > 0 && (track.moodSuggestions?.length ?? 0) === 0) {
      after.moodSuggestions = result.moods;
      fieldsChanged.push("moodSuggestions");
    }
    if (result.clusterTags.length > 0 && (track.clusterTags?.length ?? 0) === 0) {
      after.clusterTags = result.clusterTags;
      fieldsChanged.push("clusterTags");
    }
    if (fieldsChanged.length === 0) return items;

    items.push({
      repairId: id,
      trackId: track.trackId,
      kind: "mood_cluster_apply",
      status: deferredIds.has(id) ? "deferred" : "pending",
      risk: "safe",
      confidence: 0.70,
      reason: result.reasons.slice(0, 2).join("; ") || "BPM/energy heuristics",
      before: {
        moodSuggestions: track.moodSuggestions ?? [],
        clusterTags: track.clusterTags ?? [],
      },
      after,
      fieldsChanged,
    });
  }

  return items;
}

// ── Post-artist title cleanup (0705S) ─────────────────────────────────────────

function postArtistTitleCleanupRepairs(
  track: Track,
  ignoredIds: Set<string>,
  deferredIds: Set<string>,
): IntakeRepairItem[] {
  const items: IntakeRepairItem[] = [];

  // Skip manual overrides
  if (track.identitySource === "manual" || track.identityStatus === "manual_override") return items;

  const title = track.title ?? "";
  const artist = track.artist ?? "";

  // Only run when artist is already populated
  if (!artist.trim()) return items;
  // Skip if title already looks clean (no track-number or artist prefix)
  if (!title.trim()) return items;

  const result = parsePostArtistTitleCleanup(title, artist);
  if (!result) return items;

  // Skip if cleaned title equals the existing title (already clean)
  if (result.cleanTitle === title) return items;

  const id = repairId(track.trackId, "post_artist_title_cleanup", title.slice(0, 20));
  if (ignoredIds.has(id)) return items;

  const after: Partial<Track> = {
    title: result.cleanTitle,
    identityStatus: result.trackNumber != null ? "track_number_detected" : "clean",
    identityConfidence: Math.max(result.confidence, track.identityConfidence ?? 0),
    // "manual" is already excluded by the early return above (line 303).
    identitySource: "hybrid",
  };
  const fieldsChanged: string[] = ["title", "identityStatus", "identityConfidence", "identitySource"];
  if (result.trackNumber != null && !track.trackNumber) {
    (after as Record<string, unknown>).trackNumber = result.trackNumber;
    fieldsChanged.push("trackNumber");
  }

  const risk: IntakeRepairRisk =
    result.artistMatch === "exact" ? "safe"
    : result.artistMatch === "close" ? "review"
    : "blocked";

  items.push({
    repairId: id,
    trackId: track.trackId,
    kind: "post_artist_title_cleanup",
    status: deferredIds.has(id) ? "deferred" : risk === "blocked" ? "blocked" : "pending",
    risk,
    confidence: result.confidence,
    reason: result.artistMatch === "exact"
      ? "Title contains the same artist already stored in Artist."
      : "Artist prefix in title is similar but not identical — needs review.",
    before: {
      title,
      artist,
      ...(track.trackNumber != null ? { trackNumber: track.trackNumber } : {}),
    },
    after,
    fieldsChanged,
  });

  return items;
}

// ── Main queue builder ────────────────────────────────────────────────────────

export function buildIntakeRepairQueue(
  tracks: Track[],
  crates: CrateRecord[],
  ignoredIds: string[],
  deferredIds: string[],
): IntakeRepairItem[] {
  const ignoredSet = new Set(ignoredIds);
  const deferredSet = new Set(deferredIds);

  const batchReport = detectBatchAnalysisTrust(tracks);

  // Crates are filter-based (no stored trackIds) — resolve membership against
  // the current library the same way playlist generation does.
  const cratesByTrack = new Map<string, string[]>();
  for (const crate of crates) {
    const { tracks: crateTracks } = resolveCrateTracks(crate, tracks);
    for (const t of crateTracks) {
      const names = cratesByTrack.get(t.trackId) ?? [];
      names.push(crate.name);
      cratesByTrack.set(t.trackId, names);
    }
  }

  const all: IntakeRepairItem[] = [];

  for (const track of tracks) {
    const crateNames = cratesByTrack.get(track.trackId) ?? [];

    all.push(...identityRepairs(track, ignoredSet, deferredSet));
    all.push(...postArtistTitleCleanupRepairs(track, ignoredSet, deferredSet));
    all.push(...analysisTrustRepairs(
      track,
      batchReport.suspiciousKey,
      batchReport.suspiciousKeyReason,
      batchReport.suspiciousBpm,
      batchReport.suspiciousBpmReason,
      ignoredSet,
      deferredSet,
    ));
    all.push(...moodClusterRepairs(track, crateNames, ignoredSet, deferredSet));
  }

  return all;
}

export function selectSafeRepairs(items: IntakeRepairItem[]): string[] {
  return items
    .filter(i => i.risk === "safe" && i.status === "pending")
    .map(i => i.repairId);
}
