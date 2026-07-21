import { describe, expect, it } from "vitest";
import {
  recordChainPlayed, recordEarlyStop, recordOccurrenceSkip, recordJunctionAudition,
  recordEnduranceCompleted, recordChainDisposition,
} from "./radioLoopchainObservations";

const NOW = "2026-07-21T00:00:00.000Z";

describe("radioLoopchainObservations builders", () => {
  it("recordChainPlayed captures the planned residence and occurrence count", () => {
    const obs = recordChainPlayed("chain1", 300, 20, NOW);
    expect(obs.kind).toBe("chain_played");
    expect(obs.chainId).toBe("chain1");
    expect(obs.plannedResidenceSeconds).toBe(300);
    expect(obs.occurrenceCount).toBe(20);
    expect(obs.recordedAt).toBe(NOW);
    expect(obs.id).toMatch(/^loopchainobs_/);
  });

  it("recordEarlyStop captures actual residence, not planned", () => {
    const obs = recordEarlyStop("chain1", 42.5, NOW);
    expect(obs.kind).toBe("early_stop");
    expect(obs.actualResidenceSeconds).toBe(42.5);
    expect(obs.plannedResidenceSeconds).toBeUndefined();
  });

  it("recordOccurrenceSkip captures the block id", () => {
    const obs = recordOccurrenceSkip("chain1", "loopchainblk_1", NOW);
    expect(obs.kind).toBe("occurrence_skip");
    expect(obs.blockId).toBe("loopchainblk_1");
  });

  it("recordJunctionAudition captures the junction id", () => {
    const obs = recordJunctionAudition("chain1", "loopchainjct_1", NOW);
    expect(obs.kind).toBe("junction_audition");
    expect(obs.junctionId).toBe("loopchainjct_1");
  });

  it("recordEnduranceCompleted captures a genuine multi-minute actual residence", () => {
    const obs = recordEnduranceCompleted("chain1", 480, NOW);
    expect(obs.kind).toBe("endurance_completed");
    expect(obs.actualResidenceSeconds).toBe(480);
  });

  it("recordChainDisposition distinguishes accepted from abandoned", () => {
    const accepted = recordChainDisposition("chain1", true, "sustained focus for 8 minutes", NOW);
    expect(accepted.kind).toBe("chain_accepted");
    expect(accepted.note).toBe("sustained focus for 8 minutes");
    const abandoned = recordChainDisposition("chain1", false, undefined, NOW);
    expect(abandoned.kind).toBe("chain_abandoned");
  });

  it("generates distinct ids across calls", () => {
    const a = recordChainPlayed("chain1", 1, 1, NOW);
    const b = recordChainPlayed("chain1", 1, 1, NOW);
    expect(a.id).not.toBe(b.id);
  });
});
