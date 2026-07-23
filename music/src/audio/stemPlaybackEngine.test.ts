import { describe, expect, it } from "vitest";
import { computeStemStartContextTime, stemElapsedSeconds, resolveStemGainForMuteSolo } from "./stemPlaybackEngine";

describe("computeStemStartContextTime", () => {
  it("returns ctxCurrentTime + lead when offset is 0", () => {
    expect(computeStemStartContextTime(10, 0, 0.05)).toBeCloseTo(10.05);
  });

  it("shifts the anchor backward by the offset so real start stays ctxCurrentTime + lead", () => {
    const anchor = computeStemStartContextTime(10, 30, 0.05);
    expect(anchor).toBeCloseTo(10 - 30 + 0.05);
    // real .start() time is always anchor + offset == ctxCurrentTime + lead
    expect(anchor + 30).toBeCloseTo(10.05);
  });

  it("uses the default lead when omitted", () => {
    const withDefault = computeStemStartContextTime(5, 0);
    const withExplicit = computeStemStartContextTime(5, 0, 0.05);
    expect(withDefault).toBeCloseTo(withExplicit);
  });
});

describe("stemElapsedSeconds", () => {
  it("is ctxCurrentTime - anchorContextTime", () => {
    expect(stemElapsedSeconds(15, 5)).toBe(10);
  });

  it("round-trips through computeStemStartContextTime for a resumed offset", () => {
    const anchor = computeStemStartContextTime(100, 42, 0.05);
    // a moment later, exactly at the real start instant
    expect(stemElapsedSeconds(100.05, anchor)).toBeCloseTo(42);
  });
});

describe("resolveStemGainForMuteSolo", () => {
  it("is 1 for every role when nothing is muted or soloed", () => {
    expect(resolveStemGainForMuteSolo("vocals", {}, {})).toBe(1);
    expect(resolveStemGainForMuteSolo("drums", {}, {})).toBe(1);
  });

  it("mutes exactly the muted role", () => {
    expect(resolveStemGainForMuteSolo("vocals", { vocals: true }, {})).toBe(0);
    expect(resolveStemGainForMuteSolo("drums", { vocals: true }, {})).toBe(1);
  });

  it("when one role is soloed, only that role plays", () => {
    const soloed = { drums: true };
    expect(resolveStemGainForMuteSolo("drums", {}, soloed)).toBe(1);
    expect(resolveStemGainForMuteSolo("vocals", {}, soloed)).toBe(0);
    expect(resolveStemGainForMuteSolo("bass", {}, soloed)).toBe(0);
    expect(resolveStemGainForMuteSolo("other", {}, soloed)).toBe(0);
  });

  it("multiple soloed roles all play, everything else silent", () => {
    const soloed = { drums: true, bass: true };
    expect(resolveStemGainForMuteSolo("drums", {}, soloed)).toBe(1);
    expect(resolveStemGainForMuteSolo("bass", {}, soloed)).toBe(1);
    expect(resolveStemGainForMuteSolo("vocals", {}, soloed)).toBe(0);
  });

  it("mute always wins over solo — a soloed-and-muted role stays silent", () => {
    expect(resolveStemGainForMuteSolo("drums", { drums: true }, { drums: true })).toBe(0);
  });
});
