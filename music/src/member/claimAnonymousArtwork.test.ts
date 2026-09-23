import { describe, expect, it, vi } from "vitest";
import { createAnonymousArtworkClaimer } from "./claimAnonymousArtwork";

interface FakeStroke {
  readonly id: string;
  artworkId?: string;
}

function fakeDrawing(strokes: FakeStroke[]) {
  return { getUnclaimedStrokes: () => strokes.filter((stroke) => !stroke.artworkId) };
}

describe("createAnonymousArtworkClaimer", () => {
  it("attempts persistStroke for every eligible unbound operation", async () => {
    const strokes: FakeStroke[] = [{ id: "a" }, { id: "b" }];
    const drawing = fakeDrawing(strokes);
    const persistStroke = vi.fn(async (stroke: FakeStroke) => {
      stroke.artworkId = "artwork-" + stroke.id;
    });
    const claimer = createAnonymousArtworkClaimer<FakeStroke>();

    const result = await claimer.claimAnonymousStrokes(drawing, { persistStroke });

    expect(persistStroke).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ attemptedCount: 2, succeededCount: 2, failedCount: 0, complete: true });
  });

  it("skips an operation already bound to an artworkId", async () => {
    const strokes: FakeStroke[] = [{ id: "a", artworkId: "artwork-a" }, { id: "b" }];
    const drawing = fakeDrawing(strokes);
    const persistStroke = vi.fn(async (stroke: FakeStroke) => {
      stroke.artworkId = "artwork-" + stroke.id;
    });
    const claimer = createAnonymousArtworkClaimer<FakeStroke>();

    const result = await claimer.claimAnonymousStrokes(drawing, { persistStroke });

    expect(persistStroke).toHaveBeenCalledTimes(1);
    expect(persistStroke).toHaveBeenCalledWith(strokes[1]);
    expect(result.attemptedCount).toBe(1);
  });

  it("does not double-persist the same operation on a concurrent/duplicate claim invocation", async () => {
    let resolvePersist!: () => void;
    const pending = new Promise<void>((resolve) => { resolvePersist = resolve; });
    const strokes: FakeStroke[] = [{ id: "a" }];
    const drawing = fakeDrawing(strokes);
    const persistStroke = vi.fn(() => pending);
    const claimer = createAnonymousArtworkClaimer<FakeStroke>();

    const first = claimer.claimAnonymousStrokes(drawing, { persistStroke });
    const second = claimer.claimAnonymousStrokes(drawing, { persistStroke });

    resolvePersist();
    await Promise.all([first, second]);

    expect(persistStroke).toHaveBeenCalledTimes(1);
  });

  it("a failed operation remains unbound and is retried on the next invocation", async () => {
    const strokes: FakeStroke[] = [{ id: "a" }];
    const drawing = fakeDrawing(strokes);
    const persistStroke = vi.fn().mockRejectedValueOnce(new Error("offline")).mockImplementationOnce(async (stroke: FakeStroke) => {
      stroke.artworkId = "artwork-a";
    });
    const claimer = createAnonymousArtworkClaimer<FakeStroke>();

    const firstAttempt = await claimer.claimAnonymousStrokes(drawing, { persistStroke });
    expect(firstAttempt).toEqual({ attemptedCount: 1, succeededCount: 0, failedCount: 1, complete: false });
    expect(strokes[0].artworkId).toBeUndefined();

    const secondAttempt = await claimer.claimAnonymousStrokes(drawing, { persistStroke });
    expect(secondAttempt).toEqual({ attemptedCount: 1, succeededCount: 1, failedCount: 0, complete: true });
    expect(strokes[0].artworkId).toBe("artwork-a");
  });

  it("partial batch failure: successful operations bind, failed ones remain retryable, complete is false", async () => {
    const strokes: FakeStroke[] = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];
    const drawing = fakeDrawing(strokes);
    const persistStroke = vi.fn(async (stroke: FakeStroke) => {
      if (stroke.id === "c") throw new Error("write failed");
      stroke.artworkId = "artwork-" + stroke.id;
    });
    const claimer = createAnonymousArtworkClaimer<FakeStroke>();

    const result = await claimer.claimAnonymousStrokes(drawing, { persistStroke });

    expect(result).toEqual({ attemptedCount: 4, succeededCount: 3, failedCount: 1, complete: false });
    expect(strokes[0].artworkId).toBe("artwork-a");
    expect(strokes[1].artworkId).toBe("artwork-b");
    expect(strokes[2].artworkId).toBeUndefined();
    expect(strokes[3].artworkId).toBe("artwork-d");
  });

  it("returns a trivially complete result when there is nothing eligible to claim", async () => {
    const drawing = fakeDrawing([]);
    const persistStroke = vi.fn();
    const claimer = createAnonymousArtworkClaimer<FakeStroke>();

    const result = await claimer.claimAnonymousStrokes(drawing, { persistStroke });

    expect(result).toEqual({ attemptedCount: 0, succeededCount: 0, failedCount: 0, complete: true });
    expect(persistStroke).not.toHaveBeenCalled();
  });
});
