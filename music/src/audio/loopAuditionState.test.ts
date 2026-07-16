import { describe, it, expect } from "vitest";
import {
  shouldStopAuditionForBoundaryEdit, shouldStopMediaElementBeforeWebAudioStart, describeResumeAction,
} from "./loopAuditionState";

describe("shouldStopAuditionForBoundaryEdit", () => {
  it("is false when there is no active session", () => {
    expect(shouldStopAuditionForBoundaryEdit(null, "t1")).toBe(false);
  });

  it("is true when the edit targets the same source and the session is active", () => {
    expect(shouldStopAuditionForBoundaryEdit({ sourceTrackId: "t1", status: "playing" }, "t1")).toBe(true);
    expect(shouldStopAuditionForBoundaryEdit({ sourceTrackId: "t1", status: "paused" }, "t1")).toBe(true);
    expect(shouldStopAuditionForBoundaryEdit({ sourceTrackId: "t1", status: "loading" }, "t1")).toBe(true);
  });

  it("is false when the edit targets a different source", () => {
    expect(shouldStopAuditionForBoundaryEdit({ sourceTrackId: "t1", status: "playing" }, "t2")).toBe(false);
  });

  it("is false when the session has already stopped or errored", () => {
    expect(shouldStopAuditionForBoundaryEdit({ sourceTrackId: "t1", status: "stopped" }, "t1")).toBe(false);
    expect(shouldStopAuditionForBoundaryEdit({ sourceTrackId: "t1", status: "error" }, "t1")).toBe(false);
  });
});

describe("shouldStopMediaElementBeforeWebAudioStart", () => {
  it("is false when there is no active session", () => {
    expect(shouldStopMediaElementBeforeWebAudioStart(null)).toBe(false);
  });

  it("is true when a media-element fallback session is active", () => {
    expect(shouldStopMediaElementBeforeWebAudioStart({ timingAuthority: "media_element", status: "playing" })).toBe(true);
  });

  it("is false when the active session is already web_audio", () => {
    expect(shouldStopMediaElementBeforeWebAudioStart({ timingAuthority: "web_audio", status: "playing" })).toBe(false);
  });

  it("is false when the media-element session has already stopped", () => {
    expect(shouldStopMediaElementBeforeWebAudioStart({ timingAuthority: "media_element", status: "stopped" })).toBe(false);
  });
});

describe("describeResumeAction", () => {
  it("always signals creating a new source node, never restarting one", () => {
    const action = describeResumeAction(44100, 44100);
    expect(action.kind).toBe("create_new_source_node");
  });

  it("computes the correct buffer-offset seconds from the paused frame", () => {
    const action = describeResumeAction(22050, 44100);
    expect(action.startOffsetSeconds).toBeCloseTo(0.5, 5);
  });
});
