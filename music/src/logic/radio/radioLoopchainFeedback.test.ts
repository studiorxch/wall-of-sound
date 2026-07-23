import { describe, expect, it } from "vitest";
import { recordSave, recordLessLikeThis, recordComment } from "./radioLoopchainFeedback";
import type { LoopchainResolvedTransitionDecision } from "../../data/radioLoopchainTypes";

const NOW = "2026-07-22T00:00:00.000Z";

describe("recordSave", () => {
  it("attaches stable chain id/version/session and defaults to overall_chain scope", () => {
    const fb = recordSave("chain1", "v1", "sess1", 42.5, NOW);
    expect(fb.kind).toBe("save");
    expect(fb.target).toEqual({ scope: "overall_chain" });
    expect(fb.chainId).toBe("chain1");
    expect(fb.chainVersion).toBe("v1");
    expect(fb.sessionId).toBe("sess1");
    expect(fb.playbackTimeSeconds).toBe(42.5);
    expect(fb.recordedAt).toBe(NOW);
    expect(fb.id).toBeTruthy();
  });

  it("generates distinct ids across calls", () => {
    const a = recordSave("c1", "v1", "s1");
    const b = recordSave("c1", "v1", "s1");
    expect(a.id).not.toBe(b.id);
  });
});

describe("recordLessLikeThis", () => {
  it("requires and attaches a real target", () => {
    const fb = recordLessLikeThis("chain1", "v1", "sess1", { scope: "repetition", blockId: "b1", occurrenceIndexInBlock: 2 }, undefined, 10, NOW);
    expect(fb.kind).toBe("less_like_this");
    expect(fb.target).toEqual({ scope: "repetition", blockId: "b1", occurrenceIndexInBlock: 2 });
  });

  it("attaches a resolvedTransitionSettings snapshot only when the target is a transition", () => {
    const decision: LoopchainResolvedTransitionDecision = {
      junctionId: "j1", request: { kind: "auto" }, alignment: "bar_aligned",
      computedDurationSeconds: 4, confidence: 0.8, reason: "test", resolvedAt: NOW,
    };
    const transitionFb = recordLessLikeThis("chain1", "v1", "sess1", { scope: "transition", junctionId: "j1" }, decision, 10, NOW);
    expect(transitionFb.resolvedTransitionSettings).toEqual(decision);

    const sectionFb = recordLessLikeThis("chain1", "v1", "sess1", { scope: "section", blockId: "b1" }, decision, 10, NOW);
    expect(sectionFb.resolvedTransitionSettings).toBeUndefined();
  });
});

describe("recordComment", () => {
  it("attaches free text and defaults to overall_chain scope", () => {
    const fb = recordComment("chain1", "v1", "sess1", "Love this handoff", undefined, 5, NOW);
    expect(fb.kind).toBe("comment");
    expect(fb.commentText).toBe("Love this handoff");
    expect(fb.target).toEqual({ scope: "overall_chain" });
  });

  it("accepts an explicit target scope", () => {
    const fb = recordComment("chain1", "v1", "sess1", "Nice fade", { scope: "transition", junctionId: "j2" }, 5, NOW);
    expect(fb.target).toEqual({ scope: "transition", junctionId: "j2" });
  });
});
