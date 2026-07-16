import { describe, it, expect } from "vitest";
import { estimateDecodedSourceOffsets } from "./mp3SourceTiming";

const SR = 44100;

function buffer(length: number, fill: (i: number) => number): Float32Array {
  const arr = new Float32Array(length);
  for (let i = 0; i < length; i++) arr[i] = fill(i);
  return arr;
}

describe("estimateDecodedSourceOffsets", () => {
  it("detects a real leading silence run before loud content", () => {
    const silentFrames = 500;
    const data = buffer(SR, (i) => (i < silentFrames ? 0 : 0.5));
    const result = estimateDecodedSourceOffsets(data, SR);
    expect(result.confidence).toBe("estimated");
    expect(result.source).toBe("analysis");
    expect(result.decodedStartOffsetFrames).toBe(silentFrames);
  });

  it("detects trailing silence (padding) at the end", () => {
    const paddingFrames = 300;
    const data = buffer(SR, (i) => (i >= SR - paddingFrames ? 0 : 0.5));
    const result = estimateDecodedSourceOffsets(data, SR);
    expect(result.confidence).toBe("estimated");
    expect(result.decodedEndPaddingFrames).toBe(paddingFrames);
  });

  it("reports unknown when the very first and last samples are already loud", () => {
    const data = buffer(SR, () => 0.5);
    const result = estimateDecodedSourceOffsets(data, SR);
    expect(result.confidence).toBe("unknown");
    expect(result.source).toBe("none");
  });

  it("reports unknown for a too-short buffer rather than guessing", () => {
    const data = buffer(10, () => 0);
    const result = estimateDecodedSourceOffsets(data, SR);
    expect(result.confidence).toBe("unknown");
  });

  it("reports unknown (not a confident full-track offset) when silence runs to the scan bound", () => {
    // Entirely silent well past the 2-second scan bound — can't tell padding
    // from a genuinely/intentionally silent track.
    const data = buffer(SR * 3, () => 0);
    const result = estimateDecodedSourceOffsets(data, SR);
    expect(result.confidence).toBe("unknown");
  });
});
