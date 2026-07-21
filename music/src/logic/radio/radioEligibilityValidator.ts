// RadioLoop Library Foundation — promotion eligibility checks (build spec
// §5.1). Pure — returns structured issues rather than throwing, so
// user-correctable failures (missing approval, out-of-range field, etc.)
// can be displayed rather than crashing the promotion attempt.

import type { LoopAsset } from "../../data/loopTypes";
import type { Track } from "../../data/trackTypes";
import type { RadioPromotionFormInput, RadioValidationIssue } from "../../data/radioLoopTypes";

export interface RadioEligibilityInput {
  loop: LoopAsset | undefined;
  track: Track | undefined;
  sourceBufferAvailable: boolean;
  sourceDurationSeconds: number | null;
  activeStartSeconds: number;
  activeEndSeconds: number;
  formInput: RadioPromotionFormInput;
  libraryWritable: boolean;
}

function pushRange01(issues: RadioValidationIssue[], label: string, value: number | undefined) {
  if (value != null && (value < 0 || value > 1)) {
    issues.push({ code: "RADIO_ELIGIBILITY_FIELD_OUT_OF_RANGE", message: `${label} must be between 0 and 1`, severity: "error" });
  }
}

export function validateRadioEligibility(input: RadioEligibilityInput): RadioValidationIssue[] {
  const issues: RadioValidationIssue[] = [];

  if (!input.loop) {
    issues.push({ code: "RADIO_ELIGIBILITY_LOOP_MISSING", message: "Loop not found", severity: "error" });
  } else if (input.loop.status !== "approved") {
    issues.push({ code: "RADIO_ELIGIBILITY_NOT_APPROVED", message: "Loop is not approved", severity: "error" });
  }
  if (!input.track) {
    issues.push({ code: "RADIO_ELIGIBILITY_SOURCE_TRACK_MISSING", message: "Source track not found", severity: "error" });
  }
  if (!input.sourceBufferAvailable) {
    issues.push({ code: "RADIO_ELIGIBILITY_SOURCE_UNREADABLE", message: "Lossless source audio could not be read/decoded", severity: "error" });
  }

  const { activeStartSeconds: s, activeEndSeconds: e } = input;
  if (!(Number.isFinite(s) && Number.isFinite(e) && s >= 0 && s < e)) {
    issues.push({ code: "RADIO_ELIGIBILITY_BOUNDARY_INVALID", message: "Loop boundaries are not finite and ordered", severity: "error" });
  } else if (input.sourceDurationSeconds != null && e > input.sourceDurationSeconds) {
    issues.push({ code: "RADIO_ELIGIBILITY_BOUNDARY_OUT_OF_RANGE", message: "Loop end exceeds the decoded source duration", severity: "error" });
  }

  if (!input.formInput.publicUseApproved) {
    issues.push({ code: "RADIO_ELIGIBILITY_APPROVAL_MISSING", message: "Public-use approval is required", severity: "error" });
  }
  if (!input.formInput.arrangementRole?.trim()) {
    issues.push({ code: "RADIO_ELIGIBILITY_ROLE_MISSING", message: "Arrangement role is required", severity: "error" });
  }
  // 0717C_MUSIC_Complete_Song_Intelligence_and_Section_Map §3.4 — no
  // Compatibility Family requirement. Removed, not merely relaxed.

  pushRange01(issues, "energy", input.formInput.energy);
  pushRange01(issues, "density", input.formInput.density);
  pushRange01(issues, "stability", input.formInput.stability);
  if (input.formInput.maximumConsecutiveRepeats != null && input.formInput.maximumConsecutiveRepeats < 1) {
    issues.push({ code: "RADIO_ELIGIBILITY_FIELD_OUT_OF_RANGE", message: "maximumConsecutiveRepeats must be at least 1", severity: "error" });
  }
  if (input.formInput.minimumRestCycles != null && input.formInput.minimumRestCycles < 0) {
    issues.push({ code: "RADIO_ELIGIBILITY_FIELD_OUT_OF_RANGE", message: "minimumRestCycles must not be negative", severity: "error" });
  }

  if (!input.libraryWritable) {
    issues.push({ code: "RADIO_ELIGIBILITY_LIBRARY_NOT_WRITABLE", message: "RadioLoop Library root is not writable", severity: "error" });
  }

  return issues;
}

export function isEligibleForPromotion(issues: RadioValidationIssue[]): boolean {
  return !issues.some((i) => i.severity === "error");
}
