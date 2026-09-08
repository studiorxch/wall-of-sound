import { describe, expect, it } from "vitest";
import { INITIAL_PLAYER_STATE, reducePlayerState } from "./PlayerState";

describe("session player state", () => {
  it("loads, plays, pauses, and seeks within duration", () => {
    const loaded = reducePlayerState(INITIAL_PLAYER_STATE, { type: "load", trackName: "set.wav", duration: 120 });
    expect(reducePlayerState(loaded, { type: "play" }).status).toBe("playing");
    expect(reducePlayerState(loaded, { type: "seek", currentTime: 500 }).currentTime).toBe(120);
    expect(reducePlayerState(loaded, { type: "pause" }).status).toBe("paused");
  });

  it("loops ended playback by default and can disable looping", () => {
    const loaded = reducePlayerState(INITIAL_PLAYER_STATE, { type: "load", trackName: "set.wav", duration: 60 });
    const looped = reducePlayerState(loaded, { type: "ended" });
    expect(looped).toMatchObject({ status: "playing", currentTime: 0, loop: true });
    const noLoop = reducePlayerState(loaded, { type: "toggle-loop" });
    expect(reducePlayerState(noLoop, { type: "ended" })).toMatchObject({ status: "paused", currentTime: 60, loop: false });
  });
});
