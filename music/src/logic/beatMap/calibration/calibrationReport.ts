// Beat Map Confidence Calibration — diagnostic runner + report generator
// (§7, §21, §22, §23). Runs the REAL canonical beat-map computation
// (computeTrackBeatMap) against fixtures — no separate/duplicated
// detection logic.

import type {
  BeatMapCalibrationDiagnostic, BeatMapCalibrationSummary, BeatMapGroundTruth, BeatMapTrackClass,
} from "../../../data/beatMapCalibrationTypes";
import type { TrackBeatMap } from "../../../data/beatMapTypes";
import { computeTrackBeatMap } from "../computeTrackBeatMap";
import { classifyStatus, evaluateTrust } from "./calibrationThresholds";
import { computeDominantFailureCauses } from "./confidenceComponents";
import { computeBeatMapAccuracy } from "./accuracyMetrics";
import type { CalibrationFixture } from "./calibrationFixtures";

export function diagnoseFixture(fixture: CalibrationFixture): BeatMapCalibrationDiagnostic {
  const beatMap = computeTrackBeatMap(fixture.input, fixture.bpmResult);
  return buildDiagnostic(fixture.fixtureId, fixture.trackClass, beatMap, fixture.groundTruth, fixture.bpmResult.bpm);
}

export function buildDiagnostic(
  trackId: string,
  trackClass: BeatMapTrackClass,
  beatMap: TrackBeatMap | undefined,
  groundTruth: BeatMapGroundTruth | undefined,
  priorBpm: number | undefined,
): BeatMapCalibrationDiagnostic {
  if (!beatMap || !beatMap.confidenceComponents) {
    return {
      trackId, trackClass,
      confidence: {
        onsetStrength: 0, onsetRegularity: 0, beatPhaseFit: 0, beatCoverage: 0, beatContinuity: 0,
        downbeatRecurrence: 0, barAlignment: 0, tempoStability: 0, segmentConsistency: 0,
        introRegionConfidence: 0, outroRegionConfidence: 0, priorAgreement: 0, warningPenalty: 1, total: 0,
      },
      trusted: false,
      status: "unusable",
      warnings: ["BEAT_MAP_MISSING"],
      dominantFailureCauses: ["beat map could not be computed — no usable BPM period evidence"],
      priorBpm,
      beatCount: 0,
      barCount: 0,
      tempoStabilityScore: 0,
    };
  }

  const trusted = evaluateTrust(beatMap.confidenceComponents, beatMap.warnings);
  const status = classifyStatus(beatMap.confidenceComponents.total);
  const dominantFailureCauses = status === "trusted" ? [] : computeDominantFailureCauses(beatMap.confidenceComponents);
  const accuracy = groundTruth ? computeBeatMapAccuracy(beatMap, groundTruth) : undefined;

  return {
    trackId, trackClass,
    confidence: beatMap.confidenceComponents,
    trusted,
    status,
    warnings: beatMap.warnings,
    dominantFailureCauses,
    estimatedBpm: beatMap.bpm,
    priorBpm,
    beatCount: beatMap.beatTimesSeconds.length,
    barCount: beatMap.barStartTimesSeconds.length,
    firstBeatSeconds: beatMap.firstBeatSeconds,
    firstDownbeatSeconds: beatMap.firstDownbeatSeconds,
    tempoStabilityScore: beatMap.tempoStabilityScore,
    accuracy,
  };
}

// §23 — false-trust priority: a "trusted" diagnostic is judged accurate
// when its beat F-measure clears an accuracy bar (only computed when
// ground truth is available, i.e. synthetic fixtures).
const ACCURATE_F_MEASURE_THRESHOLD = 0.9;

export function summarizeCalibration(diagnostics: BeatMapCalibrationDiagnostic[]): BeatMapCalibrationSummary {
  const trustedCount = diagnostics.filter((d) => d.status === "trusted").length;
  const partialCount = diagnostics.filter((d) => d.status === "partial").length;
  const uncertainCount = diagnostics.filter((d) => d.status === "uncertain").length;
  const unusableCount = diagnostics.filter((d) => d.status === "unusable").length;

  const trustedWithTruth = diagnostics.filter((d) => d.status === "trusted" && d.accuracy);
  const trustedAccurateCount = trustedWithTruth.filter((d) => (d.accuracy?.beatFMeasure ?? 0) >= ACCURATE_F_MEASURE_THRESHOLD).length;
  const trustedWrongCount = trustedWithTruth.length - trustedAccurateCount;

  const rejectedWithTruth = diagnostics.filter((d) => d.status !== "trusted" && d.accuracy);
  const wronglyRejected = rejectedWithTruth.filter((d) => (d.accuracy?.beatFMeasure ?? 0) >= ACCURATE_F_MEASURE_THRESHOLD).length;

  return {
    trustedCount, partialCount, uncertainCount, unusableCount,
    trustedAccurateCount, trustedWrongCount,
    falseTrustRate: trustedWithTruth.length > 0 ? +(trustedWrongCount / trustedWithTruth.length).toFixed(3) : 0,
    falseRejectionRate: rejectedWithTruth.length > 0 ? +(wronglyRejected / rejectedWithTruth.length).toFixed(3) : 0,
  };
}

function fmtPct(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}

// §22 — required sections, in order. Never averages-only (§22).
export function buildCalibrationReportMarkdown(diagnostics: BeatMapCalibrationDiagnostic[]): string {
  const summary = summarizeCalibration(diagnostics);
  const lines: string[] = [];

  lines.push("# MUSIC Beat Map Confidence Calibration Report");
  lines.push("");
  lines.push(`Generated: ${new Date(0).toISOString()} (stamp applied by caller — see report file header)`);
  lines.push("");

  lines.push("## 1. Dataset Summary");
  lines.push(`Total fixtures: ${diagnostics.length}`);
  const classCounts = new Map<string, number>();
  for (const d of diagnostics) classCounts.set(d.trackClass, (classCounts.get(d.trackClass) ?? 0) + 1);
  for (const [cls, count] of classCounts) lines.push(`- ${cls}: ${count}`);
  lines.push("");

  lines.push("## 2. Confidence Distribution");
  lines.push("| Fixture | Class | Total | Status |");
  lines.push("|---|---|---|---|");
  for (const d of diagnostics) lines.push(`| ${d.trackId} | ${d.trackClass} | ${d.confidence.total.toFixed(3)} | ${d.status} |`);
  lines.push("");

  lines.push("## 3. Accuracy Distribution");
  lines.push("| Fixture | Beat F | Mean Offset (ms) | P95 Offset (ms) | Downbeat Acc | Bar Acc |");
  lines.push("|---|---|---|---|---|---|");
  for (const d of diagnostics) {
    const a = d.accuracy;
    lines.push(`| ${d.trackId} | ${a?.beatFMeasure?.toFixed(3) ?? "—"} | ${a?.meanBeatOffsetMs?.toFixed(1) ?? "—"} | ${a?.p95BeatOffsetMs?.toFixed(1) ?? "—"} | ${a?.downbeatAccuracy ?? "—"} | ${a?.barStartAccuracy?.toFixed(2) ?? "—"} |`);
  }
  lines.push("");

  lines.push("## 4. Trust-Threshold Analysis");
  lines.push(`Trusted: ${summary.trustedCount} · Partial: ${summary.partialCount} · Uncertain: ${summary.uncertainCount} · Unusable: ${summary.unusableCount}`);
  lines.push(`False-trust rate (trusted but F-measure < ${ACCURATE_F_MEASURE_THRESHOLD}): ${fmtPct(summary.falseTrustRate)}`);
  lines.push(`False-rejection rate (not trusted but F-measure >= ${ACCURATE_F_MEASURE_THRESHOLD}): ${fmtPct(summary.falseRejectionRate)}`);
  lines.push("");

  lines.push("## 5. False-Trust Cases");
  const falseTrust = diagnostics.filter((d) => d.status === "trusted" && d.accuracy && d.accuracy.beatFMeasure < ACCURATE_F_MEASURE_THRESHOLD);
  lines.push(falseTrust.length === 0 ? "None." : falseTrust.map((d) => `- ${d.trackId} (${d.trackClass}): F=${d.accuracy?.beatFMeasure.toFixed(3)}, total=${d.confidence.total.toFixed(3)}`).join("\n"));
  lines.push("");

  lines.push("## 6. False-Rejection Cases");
  const falseRejections = diagnostics.filter((d) => d.status !== "trusted" && d.accuracy && d.accuracy.beatFMeasure >= ACCURATE_F_MEASURE_THRESHOLD);
  lines.push(falseRejections.length === 0 ? "None." : falseRejections.map((d) => `- ${d.trackId} (${d.trackClass}): F=${d.accuracy?.beatFMeasure.toFixed(3)}, status=${d.status}, dominant causes: ${d.dominantFailureCauses.join(", ") || "none"}`).join("\n"));
  lines.push("");

  lines.push("## 7. Results by Rhythm Class");
  for (const [cls] of classCounts) {
    const inClass = diagnostics.filter((d) => d.trackClass === cls);
    const avgTotal = inClass.reduce((s, d) => s + d.confidence.total, 0) / inClass.length;
    const trustedInClass = inClass.filter((d) => d.status === "trusted").length;
    lines.push(`- **${cls}**: n=${inClass.length}, avg total=${avgTotal.toFixed(3)}, trusted=${trustedInClass}/${inClass.length}`);
  }
  lines.push("");

  lines.push("## 8. Warning Effectiveness");
  const warningCounts = new Map<string, number>();
  for (const d of diagnostics) for (const w of d.warnings) warningCounts.set(w, (warningCounts.get(w) ?? 0) + 1);
  for (const [code, count] of warningCounts) lines.push(`- ${code}: fired ${count}/${diagnostics.length}`);
  if (warningCounts.size === 0) lines.push("No warnings fired across the dataset.");
  lines.push("");

  lines.push("## 9. Weight Changes");
  lines.push("No weight changes made this build beyond the initial §5 allocation — see the completion report's 'Threshold Decisions' section for the evidence considered and why the initial allocation was kept as-measured.");
  lines.push("");

  lines.push("## 10. Threshold Changes");
  lines.push("Status bands and trust-rule minimums kept at their §14/§15 starting values — see the completion report for the evidence and reasoning.");
  lines.push("");

  lines.push("## 11. Unresolved Limitations");
  lines.push("- Real-audio ground truth is unavailable in this environment (no manually-annotated real tracks) — real-track rows in this report have no `accuracy` column and are evaluated qualitatively only.");
  lines.push("- Swing/broken-beat classes are approximated with jitter/dropout/off-grid-distractor synthetic proxies, not authentic genre recordings.");
  lines.push("- Percussion-only and noise-heavy classes are approximated with amplitude/noise parameters on the same click generator, not real percussion timbre.");
  lines.push("");

  lines.push("## 12. Detector-Version Recommendation");
  lines.push("`beat-map-v2` — confidence formula and trust thresholds materially changed this build (named component decomposition, critical-minimum trust rule). See beatMapTypes.ts's BEAT_MAP_DETECTOR_VERSION comment for the migration note (stale v1 maps are automatically superseded on next analysis, no separate migration code needed).");

  return lines.join("\n");
}
