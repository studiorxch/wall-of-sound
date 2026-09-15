import { type SprayCapId } from "./SprayCapPresets";

/**
 * The Visual Audit's confidence classification for a cap — distinct from
 * `CustomBrush.ts`'s `BrushProvenance` (which asks "where did this brush come
 * from," not "how physically verified is it"). Mirrors the four values used
 * throughout `0915_SPRAY_CAP_VISUAL_AUDIT_V0.6.3.md`'s per-cap
 * "Classification:" line.
 */
export type CalibrationClassification = "VERIFIED" | "PROVISIONAL" | "NEEDS_CALIBRATION" | "DIGITAL_EFFECT";

/**
 * Hand-maintained mirror of the audit doc's per-cap "Classification:" lines —
 * the Calibration Bench only DISPLAYS this, it never derives, computes, or
 * promotes it. Moving a cap from PROVISIONAL/NEEDS_CALIBRATION to VERIFIED
 * is a human decision made after real physical-reference comparison, then
 * updated here AND in the audit doc together. Keep both in sync by hand.
 */
const SPRAY_CAP_CLASSIFICATION: Record<SprayCapId, CalibrationClassification> = {
  "new-york-fat": "PROVISIONAL",
  "pink-dot-fat": "NEEDS_CALIBRATION",
  "astro-fat": "PROVISIONAL",
  "german-fat": "NEEDS_CALIBRATION",
  "lego-thin": "PROVISIONAL",
  "universal-thin": "PROVISIONAL",
  "level-1": "PROVISIONAL",
  "new-york-thin": "VERIFIED",
  calligraphy: "NEEDS_CALIBRATION",
  "transversal-slot": "NEEDS_CALIBRATION",
  needle: "NEEDS_CALIBRATION",
  "wiggly-needle": "DIGITAL_EFFECT",
  "soft-fade": "VERIFIED",
  "fuzz-fat": "DIGITAL_EFFECT",
  "ring-donut": "DIGITAL_EFFECT",
  "dry-streak": "DIGITAL_EFFECT",
};

/** Unknown/custom ids (a Brush Studio duplicate, not part of the audited built-in set) default to PROVISIONAL — untested, but not asserted as a permanent digital effect either. */
export function getSprayCapClassification(id: string): CalibrationClassification {
  return SPRAY_CAP_CLASSIFICATION[id as SprayCapId] ?? "PROVISIONAL";
}

export function calibrationClassificationLabel(status: CalibrationClassification): string {
  switch (status) {
    case "VERIFIED": return "Verified";
    case "PROVISIONAL": return "Provisional";
    case "NEEDS_CALIBRATION": return "Needs calibration";
    case "DIGITAL_EFFECT": return "Digital effect";
  }
}
