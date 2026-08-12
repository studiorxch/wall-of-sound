// Machine Life review export/import (0811_MACHINE-LIFE_MUSIC-Research-
// Workspace-Handoff_v1.0.0, Logic Layer — "Review validation and export").
// Deterministic JSON envelope (mirrors playProjectExport.ts's envelope
// pattern) plus a readable Markdown export (mirrors gptExport.ts's
// YAML-frontmatter-then-prose shape). Exports only editable review data —
// never the immutable imported manifest fields.

import type { MachineLifeCollection, MachineLifeRecordingReview } from "../../data/machineLifeTypes";
import { downloadFile } from "../../data/exportPlaylist";
import { summarizeMachineLifeCollection } from "./machineLifeSelectors";

export const MACHINE_LIFE_REVIEW_EXPORT_KIND = "MACHINE_LIFE_REVIEWS" as const;
export const MACHINE_LIFE_REVIEW_EXPORT_VERSION = "1.0.0" as const;

export interface MachineLifeReviewExport {
  exportKind: typeof MACHINE_LIFE_REVIEW_EXPORT_KIND;
  exportVersion: typeof MACHINE_LIFE_REVIEW_EXPORT_VERSION;
  collectionId: string;
  exportedAt: string;
  reviews: MachineLifeRecordingReview[];
}

function sortedReviews(reviews: MachineLifeRecordingReview[]): MachineLifeRecordingReview[] {
  return [...reviews].sort((a, b) => a.recordingId.localeCompare(b.recordingId));
}

/** Deterministic by construction: reviews are always sorted by recordingId. */
export function createMachineLifeReviewExport(
  collectionId: string,
  reviews: MachineLifeRecordingReview[],
  now: string,
): MachineLifeReviewExport {
  return {
    exportKind: MACHINE_LIFE_REVIEW_EXPORT_KIND,
    exportVersion: MACHINE_LIFE_REVIEW_EXPORT_VERSION,
    collectionId,
    exportedAt: now,
    reviews: sortedReviews(reviews),
  };
}

export function machineLifeReviewExportJson(exportData: MachineLifeReviewExport): string {
  return JSON.stringify(exportData, null, 2);
}

export function downloadMachineLifeReviewExport(collectionId: string, reviews: MachineLifeRecordingReview[], now: string): string {
  const exportData = createMachineLifeReviewExport(collectionId, reviews, now);
  const dateStr = now.slice(0, 10);
  const filename = `MachineLife_Reviews_${collectionId}_${dateStr}.json`;
  downloadFile(filename, machineLifeReviewExportJson(exportData), "application/json");
  return exportData.exportedAt;
}

// ── Re-import + round-trip validation ────────────────────────────────────

export type MachineLifeReviewImportResult =
  | { ok: true; exportData: MachineLifeReviewExport }
  | { ok: false; error: string };

export function parseMachineLifeReviewExport(jsonText: string): MachineLifeReviewImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return { ok: false, error: "Could not parse review export JSON." };
  }
  if (!parsed || typeof parsed !== "object") return { ok: false, error: "Review export is not a JSON object." };
  const v = parsed as Record<string, unknown>;
  if (v.exportKind !== MACHINE_LIFE_REVIEW_EXPORT_KIND) return { ok: false, error: `Unexpected exportKind: ${String(v.exportKind)}` };
  if (typeof v.collectionId !== "string") return { ok: false, error: "Missing collectionId." };
  if (!Array.isArray(v.reviews)) return { ok: false, error: "Missing reviews array." };
  return { ok: true, exportData: parsed as MachineLifeReviewExport };
}

/** Order-independent equality: sorts both sides by recordingId before comparing. */
export function machineLifeReviewsRoundTripEquals(a: MachineLifeRecordingReview[], b: MachineLifeRecordingReview[]): boolean {
  return JSON.stringify(sortedReviews(a)) === JSON.stringify(sortedReviews(b));
}

// ── Readable Markdown export ──────────────────────────────────────────────

function yamlScalar(value: string | number | boolean | null): string {
  if (value === null) return "null";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  const needsQuoting = /[:#\-[\]{}",\n]/.test(value) || value.trim() !== value || value === "";
  return needsQuoting ? JSON.stringify(value) : value;
}

export function buildMachineLifeReviewsMarkdown(
  collection: MachineLifeCollection,
  reviews: MachineLifeRecordingReview[],
  now: string,
): string {
  const summary = summarizeMachineLifeCollection(collection, reviews, undefined);
  const lines: string[] = [];

  lines.push("---");
  lines.push(`collection_id: ${yamlScalar(collection.id)}`);
  lines.push(`collection_version: ${yamlScalar(collection.collectionVersion)}`);
  lines.push(`engine: ${yamlScalar(collection.engine)}`);
  lines.push(`engine_version: ${yamlScalar(collection.engineVersion)}`);
  lines.push(`recording_count: ${collection.recordings.length}`);
  lines.push(`exported_at: ${yamlScalar(now)}`);
  lines.push("---");
  lines.push("");
  lines.push(`# Machine Life — ${collection.collectionVersion} Reviews`);
  lines.push("");
  lines.push(`Deterministic Pre-Life recordings — procedural collages, not trained-model outputs. ${collection.identityNote}`);
  lines.push("");
  lines.push("## Collection Summary");
  lines.push("");
  lines.push(`- Recordings: ${summary.recordingCount}`);
  lines.push(`- Life distribution: 0=${summary.lifeDistribution[0]}, 1=${summary.lifeDistribution[1]}, 2=${summary.lifeDistribution[2]}, unreviewed=${summary.lifeDistribution.unreviewed}`);
  lines.push(`- Replay: yes=${summary.replayCount.yes}, no=${summary.replayCount.no}, unreviewed=${summary.replayCount.unreviewed}`);
  lines.push(`- Review completion: complete=${summary.reviewCompletion.complete}, partial=${summary.reviewCompletion.partial}, unreviewed=${summary.reviewCompletion.unreviewed}`);
  lines.push("");
  lines.push("## Reviews");
  lines.push("");

  for (const rec of [...collection.recordings].sort((a, b) => a.id.localeCompare(b.id))) {
    const review = reviews.find((r) => r.recordingId === rec.id);
    lines.push(`### ${rec.id} — ${rec.category} / ${rec.mode}`);
    lines.push("");
    lines.push(`- Seed: ${rec.seed}`);
    lines.push(`- Duration: ${rec.durationSeconds}s`);
    lines.push(`- Canonical checksum: \`${rec.canonicalChecksumSha256}\``);
    if (!review) {
      lines.push("- Review: unreviewed");
      lines.push("");
      continue;
    }
    lines.push(`- Life: ${review.lifeScore ?? "unreviewed"}`);
    lines.push(`- Replay: ${review.replay === null ? "unreviewed" : review.replay ? "yes" : "no"}`);
    lines.push(`- Disposition: ${review.disposition ?? "none"}`);
    if (review.firstImage) lines.push(`- First image: ${review.firstImage}`);
    if (review.strongestMomentStartSeconds !== null) {
      const end = review.strongestMomentEndSeconds !== null ? review.strongestMomentEndSeconds : review.strongestMomentStartSeconds;
      lines.push(`- Strongest moment: ${review.strongestMomentStartSeconds}s–${end}s`);
    }
    if (review.immediateNote) lines.push(`- Immediate note: ${review.immediateNote}`);
    if (review.usefulSourceRelationship) lines.push(`- Useful source relationship: ${review.usefulSourceRelationship}`);
    if (review.behaviorDiscovered) lines.push(`- Behavior discovered: ${review.behaviorDiscovered}`);
    if (review.nextAction) lines.push(`- Next action: ${review.nextAction}`);
    lines.push("");
  }

  return lines.join("\n");
}

export function downloadMachineLifeReviewsMarkdown(collection: MachineLifeCollection, reviews: MachineLifeRecordingReview[], now: string): void {
  const dateStr = now.slice(0, 10);
  const filename = `MachineLife_Reviews_${collection.id}_${dateStr}.md`;
  downloadFile(filename, buildMachineLifeReviewsMarkdown(collection, reviews, now), "text/markdown");
}
