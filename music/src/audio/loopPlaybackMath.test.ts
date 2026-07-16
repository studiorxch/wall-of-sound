import { describe, it, expect } from "vitest";
import {
  secondsToFrame, frameToSeconds, loopDurationFrames, loopDurationSeconds,
  wrapFrame, frameFromAudioClock, pausedFrameFromClock, resumeOffsetSeconds,
  expectedWrapAudioTime,
} from "./loopPlaybackMath";

const SR = 44100;

describe("secondsToFrame / frameToSeconds", () => {
  it("round-trips within rounding tolerance", () => {
    const frame = secondsToFrame(1.5, SR);
    expect(frame).toBe(Math.round(1.5 * SR));
    expect(frameToSeconds(frame, SR)).toBeCloseTo(1.5, 5);
  });
});

describe("loopDurationFrames / loopDurationSeconds", () => {
  it("computes the exact frame and seconds span", () => {
    const start = secondsToFrame(1, SR);
    const end = secondsToFrame(3, SR);
    expect(loopDurationFrames(start, end)).toBe(end - start);
    expect(loopDurationSeconds(start, end, SR)).toBeCloseTo(2, 5);
  });
});

describe("wrapFrame", () => {
  const loopStart = 1000;
  const loopEnd = 5000; // length 4000

  it("leaves an in-range frame untouched", () => {
    expect(wrapFrame(2000, loopStart, loopEnd)).toBe(2000);
  });

  it("wraps a frame exactly at the end boundary back to loop start", () => {
    expect(wrapFrame(loopEnd, loopStart, loopEnd)).toBe(loopStart);
  });

  it("wraps a frame past the end boundary", () => {
    expect(wrapFrame(loopEnd + 500, loopStart, loopEnd)).toBe(loopStart + 500);
  });

  it("wraps a frame before the start boundary (negative relative)", () => {
    expect(wrapFrame(loopStart - 500, loopStart, loopEnd)).toBe(loopEnd - 500);
  });

  it("returns loopStart for a zero/negative-length loop rather than throwing", () => {
    expect(wrapFrame(2000, 1000, 1000)).toBe(1000);
    expect(wrapFrame(2000, 1000, 900)).toBe(1000);
  });
});

describe("frameFromAudioClock", () => {
  const loopStart = secondsToFrame(0, SR);
  const loopEnd = secondsToFrame(2, SR); // 2-second loop

  it("returns loopStart at the moment playback started", () => {
    expect(frameFromAudioClock(10, 10, loopStart, loopEnd, SR)).toBe(loopStart);
  });

  it("advances linearly with elapsed audio-clock time before the first wrap", () => {
    const frame = frameFromAudioClock(10.5, 10, loopStart, loopEnd, SR);
    expect(frame).toBe(loopStart + Math.floor(0.5 * SR));
  });

  it("wraps back to loop start exactly at one full loop duration", () => {
    expect(frameFromAudioClock(12, 10, loopStart, loopEnd, SR)).toBe(loopStart);
  });

  it("does not drift after many loop periods have elapsed", () => {
    // 50 full loop periods (100s) plus 0.25s into the 51st.
    const t = 10 + 50 * 2 + 0.25;
    const frame = frameFromAudioClock(t, 10, loopStart, loopEnd, SR);
    expect(frame).toBe(loopStart + Math.floor(0.25 * SR));
  });
});

describe("pausedFrameFromClock", () => {
  it("matches frameFromAudioClock for the same inputs", () => {
    const loopStart = secondsToFrame(1, SR);
    const loopEnd = secondsToFrame(3, SR);
    const a = frameFromAudioClock(11.3, 10, loopStart, loopEnd, SR);
    const b = pausedFrameFromClock(11.3, 10, loopStart, loopEnd, SR);
    expect(b).toBe(a);
  });
});

describe("resumeOffsetSeconds", () => {
  it("converts an absolute paused frame back to a buffer-offset in seconds", () => {
    const pausedFrame = secondsToFrame(4.25, SR);
    expect(resumeOffsetSeconds(pausedFrame, SR)).toBeCloseTo(4.25, 4);
  });
});

describe("expectedWrapAudioTime", () => {
  it("computes the Nth wrap's expected audio-clock time", () => {
    expect(expectedWrapAudioTime(10, 2, 1)).toBeCloseTo(12, 5);
    expect(expectedWrapAudioTime(10, 2, 5)).toBeCloseTo(20, 5);
  });
});
