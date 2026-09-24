import { describe, expect, it, vi } from "vitest";
import { createCurrentArtworkSession } from "./currentArtworkSession";

describe("createCurrentArtworkSession", () => {
  it("starts with no Current Artwork", () => {
    const session = createCurrentArtworkSession();
    expect(session.getState()).toEqual({ kind: "none" });
  });

  it("setPendingNewArtwork arms a pending state carrying type/title, with no artworkId yet", () => {
    const session = createCurrentArtworkSession();
    session.setPendingNewArtwork("blank", "0923");
    expect(session.getState()).toEqual({ kind: "pending", artworkType: "blank", title: "0923" });
  });

  it("setCurrentArtwork makes an explicit Artwork id Current", () => {
    const session = createCurrentArtworkSession();
    session.setCurrentArtwork("artwork-a");
    expect(session.getState()).toEqual({ kind: "artwork", artworkId: "artwork-a" });
  });

  it("clear returns to the no-Current-Artwork default", () => {
    const session = createCurrentArtworkSession();
    session.setCurrentArtwork("artwork-a");
    session.clear();
    expect(session.getState()).toEqual({ kind: "none" });
  });

  it("notifies subscribers on every state change", () => {
    const session = createCurrentArtworkSession();
    const listener = vi.fn();
    session.subscribe(listener);

    session.setPendingNewArtwork("map", "0923");
    session.setCurrentArtwork("artwork-a");
    session.clear();

    expect(listener).toHaveBeenCalledTimes(3);
    expect(listener).toHaveBeenNthCalledWith(1, { kind: "pending", artworkType: "map", title: "0923" });
    expect(listener).toHaveBeenNthCalledWith(2, { kind: "artwork", artworkId: "artwork-a" });
    expect(listener).toHaveBeenNthCalledWith(3, { kind: "none" });
  });

  it("subscribe returns a working unsubscribe function", () => {
    const session = createCurrentArtworkSession();
    const listener = vi.fn();
    const unsubscribe = session.subscribe(listener);
    unsubscribe();
    session.setPendingNewArtwork("map", "0923");
    expect(listener).not.toHaveBeenCalled();
  });
});
