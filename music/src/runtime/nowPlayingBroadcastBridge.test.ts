import { describe, it, expect } from "vitest";
import { buildNowPlayingSnapshot } from "./nowPlayingBroadcastBridge";
import type { Track } from "../data/trackTypes";
import type { PlaybackSurfaceSnapshot } from "../audio/dualDeckTypes";

function track(overrides: Partial<Track> & { trackId: string }): Track {
  return {
    title: "T", artist: "A", durationSeconds: 100, energy: 0.5, energySource: "manual",
    ...overrides,
  } as Track;
}

function surface(overrides: Partial<PlaybackSurfaceSnapshot> = {}): PlaybackSurfaceSnapshot {
  return {
    authority: "standard_player",
    positionSeconds: 0,
    isPlaying: false,
    isPaused: false,
    isTransitioning: false,
    statusLabel: "Idle",
    ...overrides,
  } as PlaybackSurfaceSnapshot;
}

describe("buildNowPlayingSnapshot", () => {
  it("returns null when there is no resolved track — HUD hides itself, not a fake 'nothing' row", () => {
    expect(buildNowPlayingSnapshot(null, 0, undefined, false, false, null)).toBeNull();
    expect(buildNowPlayingSnapshot(undefined, 0, undefined, false, false, null)).toBeNull();
  });

  it("carries the real track title/artist and transport values through untouched", () => {
    const t = track({ trackId: "t1", title: "Real Title", artist: "Real Artist" });
    const snap = buildNowPlayingSnapshot(t, 42.5, 180, true, false, surface({ isPlaying: true }));
    expect(snap).toEqual({
      trackId: "t1", title: "Real Title", artist: "Real Artist",
      positionSeconds: 42.5, durationSeconds: 180,
      isPlaying: true, isPaused: false, isTransitioning: false,
    });
  });

  it("falls back to the track's own durationSeconds when the transport duration is unknown", () => {
    const t = track({ trackId: "t1", durationSeconds: 210 });
    const snap = buildNowPlayingSnapshot(t, 0, undefined, false, true, null);
    expect(snap?.durationSeconds).toBe(210);
  });

  it("reflects isTransitioning from the playback surface snapshot when present", () => {
    const t = track({ trackId: "t1" });
    const snap = buildNowPlayingSnapshot(t, 0, 100, true, false, surface({ isTransitioning: true }));
    expect(snap?.isTransitioning).toBe(true);
  });
});
