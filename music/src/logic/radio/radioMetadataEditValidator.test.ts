import { describe, it, expect } from "vitest";
import { validateMetadataEditRequest } from "./radioMetadataEditValidator";
import type { RadioLoopMetadataEditRequest } from "../../data/radioWorkspaceTypes";

function baseRequest(overrides: Partial<RadioLoopMetadataEditRequest> = {}): RadioLoopMetadataEditRequest {
  return {
    radioLoopId: "rloop_000001",
    sourcePackageVersion: 1,
    roles: ["foundation"],
    publicUseApproved: true,
    approvalChangeConfirmed: false,
    ...overrides,
  };
}

describe("validateMetadataEditRequest", () => {
  it("passes a valid request with an unchanged approval value", () => {
    expect(validateMetadataEditRequest(baseRequest(), true)).toEqual([]);
  });

  it("rejects an unknown role", () => {
    const issues = validateMetadataEditRequest(baseRequest({ roles: ["atmosphere"] }), true);
    expect(issues.some((i) => i.code === "RADIO_EDIT_UNKNOWN_ROLE")).toBe(true);
  });

  it("requires at least one role", () => {
    expect(validateMetadataEditRequest(baseRequest({ roles: [] }), true).some((i) => i.code === "RADIO_EDIT_ROLE_REQUIRED")).toBe(true);
  });

  // 0717C §3.4 — Compatibility Family removed, not merely relaxed.
  it("never requires or flags a Compatibility Family (removed in 0717C)", () => {
    expect(validateMetadataEditRequest(baseRequest(), true)).toEqual([]);
    expect("familyIds" in baseRequest()).toBe(false);
  });

  it("rejects out-of-range normalized fields", () => {
    expect(validateMetadataEditRequest(baseRequest({ energy: 1.5 }), true).some((i) => i.code === "RADIO_EDIT_FIELD_OUT_OF_RANGE")).toBe(true);
    expect(validateMetadataEditRequest(baseRequest({ stability: -0.1 }), true).some((i) => i.code === "RADIO_EDIT_FIELD_OUT_OF_RANGE")).toBe(true);
  });

  it("rejects invalid repeat/rest bounds", () => {
    expect(validateMetadataEditRequest(baseRequest({ maximumConsecutiveRepeats: 0 }), true).some((i) => i.code === "RADIO_EDIT_FIELD_OUT_OF_RANGE")).toBe(true);
    expect(validateMetadataEditRequest(baseRequest({ minimumRestCycles: -1 }), true).some((i) => i.code === "RADIO_EDIT_FIELD_OUT_OF_RANGE")).toBe(true);
  });

  it("requires explicit confirmation when the approval value changes", () => {
    const issues = validateMetadataEditRequest(baseRequest({ publicUseApproved: false, approvalChangeConfirmed: false }), true);
    expect(issues.some((i) => i.code === "RADIO_EDIT_APPROVAL_CHANGE_UNCONFIRMED")).toBe(true);
  });

  it("accepts an approval change once explicitly confirmed", () => {
    const issues = validateMetadataEditRequest(baseRequest({ publicUseApproved: false, approvalChangeConfirmed: true }), true);
    expect(issues.some((i) => i.code === "RADIO_EDIT_APPROVAL_CHANGE_UNCONFIRMED")).toBe(false);
  });

  it("does not require confirmation when approval is unchanged", () => {
    const issues = validateMetadataEditRequest(baseRequest({ publicUseApproved: true, approvalChangeConfirmed: false }), true);
    expect(issues.some((i) => i.code === "RADIO_EDIT_APPROVAL_CHANGE_UNCONFIRMED")).toBe(false);
  });
});
