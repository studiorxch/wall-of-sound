import { describe, expect, it } from "vitest";
import { defaultPlayability, resolveSectionPlayability, buildSectionAcceptance, type CurrentSectionBounds } from "./radioSectionPlayability";
import type { RadioLoopchainSectionAcceptance } from "../../data/radioLoopchainTypes";

function bounds(overrides: Partial<CurrentSectionBounds> = {}): CurrentSectionBounds {
  return {
    sourceTrackId: "ext_mr9smtpl_wb0b",
    sectionId: "songsec_mru7euhj_bgtflb",
    startFrame: 1_000_000,
    endFrame: 8_500_000,
    ...overrides,
  };
}

describe("defaultPlayability", () => {
  it("classifies intro as forward_only", () => {
    expect(defaultPlayability("intro")).toBe("forward_only");
  });
  it("classifies outro as forward_only", () => {
    expect(defaultPlayability("outro")).toBe("forward_only");
  });
  it("classifies body (and every other structural type) as review", () => {
    expect(defaultPlayability("body")).toBe("review");
    expect(defaultPlayability("chorus")).toBe("review");
    expect(defaultPlayability("unknown")).toBe("review");
  });
});

describe("resolveSectionPlayability", () => {
  it("resolves loopable when an acceptance exactly matches current bounds", () => {
    const current = bounds();
    const acceptance = buildSectionAcceptance(current, "2026-07-21T00:00:00.000Z");
    expect(resolveSectionPlayability(current, "body", [acceptance])).toBe("loopable");
  });

  it("falls back to the default when no acceptance exists", () => {
    expect(resolveSectionPlayability(bounds(), "body", [])).toBe("review");
    expect(resolveSectionPlayability(bounds(), "intro", [])).toBe("forward_only");
  });

  it("invalidates a stale acceptance when the section has been resized, without deleting the record", () => {
    const original = bounds();
    const acceptance = buildSectionAcceptance(original, "2026-07-21T00:00:00.000Z");
    const resized = bounds({ endFrame: original.endFrame + 500 });
    const acceptances: RadioLoopchainSectionAcceptance[] = [acceptance];
    expect(resolveSectionPlayability(resized, "body", acceptances)).toBe("review");
    // the superseded record is untouched — still present, still matches the OLD bounds.
    expect(acceptances).toHaveLength(1);
    expect(resolveSectionPlayability(original, "body", acceptances)).toBe("loopable");
  });

  it("invalidates a stale acceptance when the section has been reanalyzed onto a new revision", () => {
    const original = bounds({ revisionId: undefined });
    const acceptance = buildSectionAcceptance(original, "2026-07-21T00:00:00.000Z");
    const revised = bounds({ revisionId: "songsecrev_abc123" });
    expect(resolveSectionPlayability(revised, "body", [acceptance])).toBe("review");
  });

  it("matches when both current and stored revisionId are undefined", () => {
    const current = bounds({ revisionId: undefined });
    const acceptance = buildSectionAcceptance(current);
    expect(resolveSectionPlayability(current, "body", [acceptance])).toBe("loopable");
  });
});

describe("buildSectionAcceptance", () => {
  it("stamps the exact current bounds and identity fields", () => {
    const current = bounds({ revisionId: "songsecrev_1" });
    const acceptance = buildSectionAcceptance(current, "2026-07-21T00:00:00.000Z");
    expect(acceptance.sourceTrackId).toBe(current.sourceTrackId);
    expect(acceptance.sectionId).toBe(current.sectionId);
    expect(acceptance.startFrame).toBe(current.startFrame);
    expect(acceptance.endFrame).toBe(current.endFrame);
    expect(acceptance.revisionId).toBe("songsecrev_1");
    expect(acceptance.acceptedAt).toBe("2026-07-21T00:00:00.000Z");
    expect(acceptance.id).toMatch(/^loopchainaccept_/);
  });
});
