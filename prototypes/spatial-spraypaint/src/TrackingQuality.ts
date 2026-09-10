export type TrackingQuality = "good" | "degraded" | "poor";

export interface TrackingQualitySample {
  confidence: number | null;
  resultIntervalMs: number | null;
  landmarkIntervalMs: number | null;
  consecutiveMissingHandFrames: number;
  pinchTransitions: number;
  cameraLuminance?: number | null;
}

export interface TrackingQualityAssessment {
  quality: TrackingQuality;
  warningVisible: boolean;
  evidence: readonly string[];
}

export const TRACKING_WARNING_DELAY_MS = 900;
export const TRACKING_WARNING_RECOVERY_MS = 1400;

export function deriveTrackingQuality(
  sample: TrackingQualitySample,
  pinchTransitionsSinceLastSample = 0,
): Omit<TrackingQualityAssessment, "warningVisible"> {
  const poor: string[] = [];
  const degraded: string[] = [];
  const classify = (condition: boolean, evidence: string, target: string[]) => {
    if (condition) target.push(evidence);
  };

  classify(sample.consecutiveMissingHandFrames >= 5, "MISSED HANDS", poor);
  classify((sample.resultIntervalMs ?? 0) > 240, "RESULT GAP", poor);
  classify((sample.landmarkIntervalMs ?? 0) > 240, "LANDMARK GAP", poor);
  classify(sample.confidence !== null && sample.confidence < 0.35, "LOW CONFIDENCE", poor);
  classify(pinchTransitionsSinceLastSample >= 4, "PINCH FLICKER", poor);
  classify(sample.cameraLuminance !== null && sample.cameraLuminance !== undefined && sample.cameraLuminance < 0.12, "DARK FRAME", poor);

  classify(sample.consecutiveMissingHandFrames >= 2, "MISSED HANDS", degraded);
  classify((sample.resultIntervalMs ?? 0) > 100, "RESULT CADENCE", degraded);
  classify((sample.landmarkIntervalMs ?? 0) > 100, "LANDMARK CADENCE", degraded);
  classify(sample.confidence !== null && sample.confidence < 0.65, "LOW CONFIDENCE", degraded);
  classify(pinchTransitionsSinceLastSample >= 2, "PINCH INSTABILITY", degraded);
  classify(sample.cameraLuminance !== null && sample.cameraLuminance !== undefined && sample.cameraLuminance < 0.22, "LOW BRIGHTNESS", degraded);

  if (poor.length > 0) return { quality: "poor", evidence: poor };
  if (degraded.length > 0) return { quality: "degraded", evidence: [...new Set(degraded)] };
  return { quality: "good", evidence: [] };
}

export class TrackingQualityMonitor {
  private warningVisible = false;
  private strugglingSince: number | null = null;
  private healthySince: number | null = null;
  private lastPinchTransitions: number | null = null;

  public update(sample: TrackingQualitySample, now: number): TrackingQualityAssessment {
    const pinchTransitionsSinceLastSample = this.lastPinchTransitions === null
      ? 0
      : Math.max(0, sample.pinchTransitions - this.lastPinchTransitions);
    this.lastPinchTransitions = sample.pinchTransitions;
    const assessment = deriveTrackingQuality(sample, pinchTransitionsSinceLastSample);

    if (assessment.quality === "good") {
      this.strugglingSince = null;
      if (this.warningVisible) {
        this.healthySince ??= now;
        if (now - this.healthySince >= TRACKING_WARNING_RECOVERY_MS) this.warningVisible = false;
      } else {
        this.healthySince = null;
      }
    } else {
      this.healthySince = null;
      this.strugglingSince ??= now;
      if (now - this.strugglingSince >= TRACKING_WARNING_DELAY_MS) this.warningVisible = true;
    }

    return { ...assessment, warningVisible: this.warningVisible };
  }

  public reset(): TrackingQualityAssessment {
    this.warningVisible = false;
    this.strugglingSince = null;
    this.healthySince = null;
    this.lastPinchTransitions = null;
    return { quality: "good", warningVisible: false, evidence: [] };
  }
}
