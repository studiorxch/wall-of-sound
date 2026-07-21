import { describe, it, expect } from "vitest";
import { validateRadioEligibility, isEligibleForPromotion } from "./radioEligibilityValidator";
import type { LoopAsset } from "../../data/loopTypes";
import type { Track } from "../../data/trackTypes";
import type { RadioPromotionFormInput } from "../../data/radioLoopTypes";

const baseLoop = { id: "loop_1", sourceTrackId: "track_1", status: "approved" } as LoopAsset;
const baseTrack = { trackId: "track_1" } as Track;
const validForm: RadioPromotionFormInput = { arrangementRole: "foundation", publicUseApproved: true };

function baseInput(overrides: Partial<Parameters<typeof validateRadioEligibility>[0]> = {}) {
  return {
    loop: baseLoop,
    track: baseTrack,
    sourceBufferAvailable: true,
    sourceDurationSeconds: 10,
    activeStartSeconds: 1,
    activeEndSeconds: 5,
    formInput: validForm,
    libraryWritable: true,
    ...overrides,
  };
}

describe("validateRadioEligibility", () => {
  it("passes for a fully valid input", () => {
    const issues = validateRadioEligibility(baseInput());
    expect(issues).toEqual([]);
    expect(isEligibleForPromotion(issues)).toBe(true);
  });

  it("flags a missing loop", () => {
    const issues = validateRadioEligibility(baseInput({ loop: undefined }));
    expect(issues.some((i) => i.code === "RADIO_ELIGIBILITY_LOOP_MISSING")).toBe(true);
  });

  it("flags an unapproved loop", () => {
    const issues = validateRadioEligibility(baseInput({ loop: { ...baseLoop, status: "candidate" } as LoopAsset }));
    expect(issues.some((i) => i.code === "RADIO_ELIGIBILITY_NOT_APPROVED")).toBe(true);
  });

  it("flags a missing source track", () => {
    const issues = validateRadioEligibility(baseInput({ track: undefined }));
    expect(issues.some((i) => i.code === "RADIO_ELIGIBILITY_SOURCE_TRACK_MISSING")).toBe(true);
  });

  it("flags an unreadable source", () => {
    const issues = validateRadioEligibility(baseInput({ sourceBufferAvailable: false }));
    expect(issues.some((i) => i.code === "RADIO_ELIGIBILITY_SOURCE_UNREADABLE")).toBe(true);
  });

  it("flags inverted or non-finite boundaries", () => {
    expect(validateRadioEligibility(baseInput({ activeStartSeconds: 5, activeEndSeconds: 1 })).some((i) => i.code === "RADIO_ELIGIBILITY_BOUNDARY_INVALID")).toBe(true);
    expect(validateRadioEligibility(baseInput({ activeStartSeconds: NaN })).some((i) => i.code === "RADIO_ELIGIBILITY_BOUNDARY_INVALID")).toBe(true);
  });

  it("flags a boundary that exceeds the decoded source duration", () => {
    const issues = validateRadioEligibility(baseInput({ activeEndSeconds: 20, sourceDurationSeconds: 10 }));
    expect(issues.some((i) => i.code === "RADIO_ELIGIBILITY_BOUNDARY_OUT_OF_RANGE")).toBe(true);
  });

  it("flags missing public-use approval and role", () => {
    const issues = validateRadioEligibility(baseInput({ formInput: { arrangementRole: "", publicUseApproved: false } }));
    expect(issues.some((i) => i.code === "RADIO_ELIGIBILITY_APPROVAL_MISSING")).toBe(true);
    expect(issues.some((i) => i.code === "RADIO_ELIGIBILITY_ROLE_MISSING")).toBe(true);
  });

  // 0717C §3.4 — Compatibility Family removed, not merely relaxed: a fully
  // valid promotion with no family value supplied anywhere succeeds cleanly,
  // and no validator ever emits a family-related issue code.
  it("never requires or flags a Compatibility Family (removed in 0717C)", () => {
    const issues = validateRadioEligibility(baseInput());
    expect(issues).toEqual([]);
    expect(issues.some((i) => i.code === "RADIO_ELIGIBILITY_FAMILY_MISSING")).toBe(false);
    expect(Object.keys(validForm)).not.toContain("compatibilityFamilyId");
  });

  it("flags out-of-range optional fields", () => {
    expect(validateRadioEligibility(baseInput({ formInput: { ...validForm, energy: 1.5 } })).some((i) => i.code === "RADIO_ELIGIBILITY_FIELD_OUT_OF_RANGE")).toBe(true);
    expect(validateRadioEligibility(baseInput({ formInput: { ...validForm, maximumConsecutiveRepeats: 0 } })).some((i) => i.code === "RADIO_ELIGIBILITY_FIELD_OUT_OF_RANGE")).toBe(true);
    expect(validateRadioEligibility(baseInput({ formInput: { ...validForm, minimumRestCycles: -1 } })).some((i) => i.code === "RADIO_ELIGIBILITY_FIELD_OUT_OF_RANGE")).toBe(true);
  });

  it("flags a non-writable library root", () => {
    const issues = validateRadioEligibility(baseInput({ libraryWritable: false }));
    expect(issues.some((i) => i.code === "RADIO_ELIGIBILITY_LIBRARY_NOT_WRITABLE")).toBe(true);
  });
});

describe("isEligibleForPromotion", () => {
  it("is false when any issue is severity error, true otherwise", () => {
    expect(isEligibleForPromotion([])).toBe(true);
    expect(isEligibleForPromotion([{ code: "X", message: "m", severity: "warning" }])).toBe(true);
    expect(isEligibleForPromotion([{ code: "X", message: "m", severity: "error" }])).toBe(false);
  });
});
