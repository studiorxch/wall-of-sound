import { describe, it, expect } from "vitest";
import { classifyTempoFamily } from "./bpmTempoFamilyReview";

describe("classifyTempoFamily — suspicious low (< 50)", () => {
  it("matches the spec's own worked examples exactly", () => {
    expect(classifyTempoFamily(40.06, null).candidateBpm).toBe(80.12);
    expect(classifyTempoFamily(41.68, null).candidateBpm).toBe(83.36);
    expect(classifyTempoFamily(42.02, null).candidateBpm).toBe(84.04);
    expect(classifyTempoFamily(47.85, null).candidateBpm).toBe(95.7);
  });
  it("flags concern as suspicious_low", () => {
    expect(classifyTempoFamily(42.02, null).concern).toBe("suspicious_low");
  });
  it("boundary: 49.99 is suspicious, exactly 50 is not", () => {
    expect(classifyTempoFamily(49.99, null).concern).toBe("suspicious_low");
    expect(classifyTempoFamily(50, null).concern).toBe("none");
  });
});

describe("classifyTempoFamily — suspicious high (> 150)", () => {
  it("matches the spec's own worked examples exactly", () => {
    expect(classifyTempoFamily(163, "ambient").candidateBpm).toBe(81.5);
    expect(classifyTempoFamily(172, "cinematic").candidateBpm).toBe(86);
    expect(classifyTempoFamily(185, "ambient").candidateBpm).toBe(92.5);
  });
  it("flags concern as suspicious_high", () => {
    expect(classifyTempoFamily(172, "cinematic").concern).toBe("suspicious_high");
  });
  it("boundary: 150.01 is suspicious, exactly 150 is not", () => {
    expect(classifyTempoFamily(150.01, null).concern).toBe("suspicious_high");
    expect(classifyTempoFamily(150, null).concern).toBe("none");
  });
});

describe("classifyTempoFamily — not suspicious", () => {
  it("is 'none' for any value strictly between 50 and 150 inclusive of the boundaries", () => {
    expect(classifyTempoFamily(50, null).concern).toBe("none");
    expect(classifyTempoFamily(101.33, null).concern).toBe("none");
    expect(classifyTempoFamily(128, null).concern).toBe("none");
    expect(classifyTempoFamily(150, null).concern).toBe("none");
  });
  it("candidateBpm is null when there is no concern", () => {
    expect(classifyTempoFamily(101.33, null).candidateBpm).toBeNull();
  });
  it("is 'none' for null/undefined/non-finite/non-positive bpm", () => {
    expect(classifyTempoFamily(null, null).concern).toBe("none");
    expect(classifyTempoFamily(undefined, null).concern).toBe("none");
    expect(classifyTempoFamily(NaN, null).concern).toBe("none");
    expect(classifyTempoFamily(0, null).concern).toBe("none");
    expect(classifyTempoFamily(-10, null).concern).toBe("none");
  });
});

describe("classifyTempoFamily — genre as a soft prior", () => {
  it("recognizes jungle/drum and bass/breakcore/breakbeat as fast_plausible, case-insensitively and with common spellings", () => {
    expect(classifyTempoFamily(172, "Jungle").genrePlausibility).toBe("fast_plausible");
    expect(classifyTempoFamily(172, "Drum and Bass").genrePlausibility).toBe("fast_plausible");
    expect(classifyTempoFamily(172, "Drum & Bass").genrePlausibility).toBe("fast_plausible");
    expect(classifyTempoFamily(172, "DnB").genrePlausibility).toBe("fast_plausible");
    expect(classifyTempoFamily(172, "Breakcore").genrePlausibility).toBe("fast_plausible");
    expect(classifyTempoFamily(172, "Breakbeat").genrePlausibility).toBe("fast_plausible");
  });
  it("recognizes ambient/cinematic/lo-fi/downtempo/dream pop/soft electronic as slow_suspicious", () => {
    expect(classifyTempoFamily(172, "Ambient").genrePlausibility).toBe("slow_suspicious");
    expect(classifyTempoFamily(172, "Cinematic").genrePlausibility).toBe("slow_suspicious");
    expect(classifyTempoFamily(172, "Lo-Fi").genrePlausibility).toBe("slow_suspicious");
    expect(classifyTempoFamily(172, "lofi").genrePlausibility).toBe("slow_suspicious");
    expect(classifyTempoFamily(172, "Downtempo").genrePlausibility).toBe("slow_suspicious");
    expect(classifyTempoFamily(172, "Dream Pop").genrePlausibility).toBe("slow_suspicious");
    expect(classifyTempoFamily(172, "Soft Electronic").genrePlausibility).toBe("slow_suspicious");
  });
  it("is 'unknown' for a missing genre — never auto-decides without one", () => {
    expect(classifyTempoFamily(172, null).genrePlausibility).toBe("unknown");
    expect(classifyTempoFamily(172, "").genrePlausibility).toBe("unknown");
    expect(classifyTempoFamily(172, "   ").genrePlausibility).toBe("unknown");
  });
  it("never infers hardcore techno / gabber / happy hardcore / speedcore / thrash metal as fast-plausible — StudioRich does not produce those styles", () => {
    expect(classifyTempoFamily(172, "Hardcore Techno").genrePlausibility).not.toBe("fast_plausible");
    expect(classifyTempoFamily(172, "Gabber").genrePlausibility).not.toBe("fast_plausible");
    expect(classifyTempoFamily(172, "Happy Hardcore").genrePlausibility).not.toBe("fast_plausible");
    expect(classifyTempoFamily(172, "Speedcore").genrePlausibility).not.toBe("fast_plausible");
    expect(classifyTempoFamily(172, "Thrash Metal").genrePlausibility).not.toBe("fast_plausible");
  });
  it("is 'unknown' for an unrecognized genre string rather than guessing either direction", () => {
    expect(classifyTempoFamily(172, "Folk").genrePlausibility).toBe("unknown");
  });
  it("computes genrePlausibility independent of whether the bpm itself is suspicious", () => {
    expect(classifyTempoFamily(101.33, "Ambient").genrePlausibility).toBe("slow_suspicious");
    expect(classifyTempoFamily(101.33, "Ambient").concern).toBe("none");
  });
});
