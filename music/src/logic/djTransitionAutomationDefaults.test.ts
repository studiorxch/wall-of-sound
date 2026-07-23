import { describe, it, expect } from "vitest";
import { buildDjTransitionAutomationDefaults } from "./djTransitionAutomationDefaults";

describe("buildDjTransitionAutomationDefaults", () => {
  it("never has both outgoing and incoming low bands reduced at the same time for a managed bass family", () => {
    const lane = buildDjTransitionAutomationDefaults({ family: "phrase_eq_blend", bassTransferProgress: 0.5 });
    const outgoingAtStart = lane.outgoingEq[0].lowDb;
    const incomingAtStart = lane.incomingEq[0].lowDb;
    const outgoingAtEnd = lane.outgoingEq[lane.outgoingEq.length - 1].lowDb;
    const incomingAtEnd = lane.incomingEq[lane.incomingEq.length - 1].lowDb;
    // At start: outgoing owns bass (0dB), incoming reduced.
    expect(outgoingAtStart).toBe(0);
    expect(incomingAtStart).toBeLessThan(0);
    // At end: incoming owns bass (0dB), outgoing reduced.
    expect(outgoingAtEnd).toBeLessThan(0);
    expect(incomingAtEnd).toBe(0);
    expect(lane.bassTransferProgress).toBe(0.5);
  });

  it("clean_cut and reset_bridge never claim a bass-transfer point", () => {
    expect(buildDjTransitionAutomationDefaults({ family: "clean_cut", bassTransferProgress: 0.5 }).bassTransferProgress).toBeNull();
    expect(buildDjTransitionAutomationDefaults({ family: "reset_bridge", bassTransferProgress: 0.5 }).bassTransferProgress).toBeNull();
  });

  it("free_time_perceptual_handoff never invents EQ automation", () => {
    const lane = buildDjTransitionAutomationDefaults({ family: "free_time_perceptual_handoff", bassTransferProgress: null });
    expect(lane.outgoingEq).toEqual([]);
    expect(lane.incomingEq).toEqual([]);
    expect(lane.bassTransferProgress).toBeNull();
  });

  it("effect_handoff stays an honest plain crossfade — no fabricated effect automation", () => {
    const lane = buildDjTransitionAutomationDefaults({ family: "effect_handoff", bassTransferProgress: 0.4 });
    expect(lane.bassTransferProgress).toBeNull();
    expect(lane.outgoingEq.every((p) => p.lowDb === 0 && p.midDb === 0 && p.highDb === 0)).toBe(true);
  });

  it("do_not_place_adjacent produces a neutral, silent-both-ends lane rather than looking playable", () => {
    const lane = buildDjTransitionAutomationDefaults({ family: "do_not_place_adjacent", bassTransferProgress: 0.5 });
    expect(lane.outgoingGain.every((p) => p.gainDb === -60)).toBe(true);
    expect(lane.incomingGain.every((p) => p.gainDb === -60)).toBe(true);
  });

  it("defaults the bass-transfer point to the overlap midpoint when the resolver found no anchor", () => {
    const lane = buildDjTransitionAutomationDefaults({ family: "short_rhythmic_blend", bassTransferProgress: null });
    expect(lane.bassTransferProgress).toBe(0.5);
  });
});
