import { describe, it, expect } from "vitest";
import { resolveRadioLoopSource } from "./radioSourceResolver";
import type { Track } from "../../data/trackTypes";
import type { LoopAsset } from "../../data/loopTypes";

const track = { trackId: "track_a", title: "Some Track" } as Track;
const loop = { id: "loop_a", sourceTrackId: "track_a", sourceTitle: "Loop Title", sourceArtist: "The Artist", status: "approved" } as LoopAsset;

describe("resolveRadioLoopSource", () => {
  it("resolves when both the track and loop are found", () => {
    const result = resolveRadioLoopSource("track_a", "loop_a", [track], [loop]);
    expect(result.resolved).toBe(true);
    expect(result.displayName).toBe("Loop Title — The Artist");
  });

  it("omits the artist suffix when the loop has no sourceArtist", () => {
    const loopNoArtist = { id: "loop_b", sourceTrackId: "track_a", sourceTitle: "Solo Loop", status: "approved" } as LoopAsset;
    const result = resolveRadioLoopSource("track_a", "loop_b", [track], [loopNoArtist]);
    expect(result.displayName).toBe("Solo Loop");
  });

  it("returns unresolved with a reason when the track is missing", () => {
    const result = resolveRadioLoopSource("track_missing", "loop_a", [track], [loop]);
    expect(result.resolved).toBe(false);
    expect(result.unresolvedReason).toBe("source_track_not_found");
    // The RadioLoop stays identifiable even when unresolved.
    expect(result.sourceTrackId).toBe("track_missing");
  });

  it("returns unresolved with a reason when the loop is missing", () => {
    const result = resolveRadioLoopSource("track_a", "loop_missing", [track], [loop]);
    expect(result.resolved).toBe(false);
    expect(result.unresolvedReason).toBe("source_loop_not_found");
  });

  it("returns unresolved when both are missing, never throws", () => {
    expect(() => resolveRadioLoopSource("x", "y", [], [])).not.toThrow();
    const result = resolveRadioLoopSource("x", "y", [], []);
    expect(result.resolved).toBe(false);
    expect(result.unresolvedReason).toBe("source_track_and_loop_not_found");
  });
});
