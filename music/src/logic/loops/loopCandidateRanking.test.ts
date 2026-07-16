import { describe, it, expect } from "vitest";
import { scoreLoopCandidate, rankAndLimitCandidates } from "./loopCandidateRanking";

describe("scoreLoopCandidate", () => {
  it("scores a trusted, 8-bar candidate higher than an untrusted (non-provisional) one", () => {
    const trusted = scoreLoopCandidate({ startSeconds: 0, barCount: 8, gridTrusted: true, provisional: false, tempoStabilityScore: 0.9 }, []);
    const untrusted = scoreLoopCandidate({ startSeconds: 0, barCount: 8, gridTrusted: false, provisional: false, tempoStabilityScore: 0.9 }, []);
    expect(trusted.total).toBeGreaterThan(untrusted.total);
  });

  it("does not rank uniqueness from a single spectral-like signal — uses boundary separation instead", () => {
    const close = scoreLoopCandidate({ startSeconds: 10, barCount: 8, gridTrusted: true, provisional: false }, [10.5]);
    const far = scoreLoopCandidate({ startSeconds: 10, barCount: 8, gridTrusted: true, provisional: false }, [200]);
    expect(far.uniqueness).toBeGreaterThan(close.uniqueness);
  });

  it("prefers 8/16-bar usability over 64-bar for otherwise-identical evidence", () => {
    const eight = scoreLoopCandidate({ startSeconds: 0, barCount: 8, gridTrusted: true, provisional: false }, []);
    const sixtyFour = scoreLoopCandidate({ startSeconds: 0, barCount: 64, gridTrusted: true, provisional: false }, []);
    expect(eight.usability).toBeGreaterThan(sixtyFour.usability);
  });
});

describe("rankAndLimitCandidates", () => {
  it("limits the chosen set to maxVisible", () => {
    const pool = Array.from({ length: 10 }, (_, i) => ({ startSeconds: i * 20, barCount: 8 as const, gridTrusted: true, provisional: false }));
    const chosen = rankAndLimitCandidates(pool, 2);
    expect(chosen.length).toBe(2);
  });

  it("assigns rank 1..N in selection order", () => {
    const pool = Array.from({ length: 5 }, (_, i) => ({ startSeconds: i * 20, barCount: 8 as const, gridTrusted: true, provisional: false }));
    const chosen = rankAndLimitCandidates(pool, 3);
    expect(chosen.map((c) => c.rank)).toEqual([1, 2, 3]);
  });

  it("prefers well-separated candidates over redundant near-duplicates", () => {
    const pool = [
      { startSeconds: 0, barCount: 8 as const, gridTrusted: true, provisional: false },
      { startSeconds: 2, barCount: 8 as const, gridTrusted: true, provisional: false }, // near-duplicate of the first
      { startSeconds: 100, barCount: 8 as const, gridTrusted: true, provisional: false }, // well separated
    ];
    const chosen = rankAndLimitCandidates(pool, 2);
    const chosenStarts = chosen.map((c) => c.candidate.startSeconds);
    expect(chosenStarts).toContain(0);
    expect(chosenStarts).toContain(100);
  });

  it("returns fewer than maxVisible when the pool itself is smaller", () => {
    const pool = [{ startSeconds: 0, barCount: 8 as const, gridTrusted: true, provisional: false }];
    const chosen = rankAndLimitCandidates(pool, 5);
    expect(chosen.length).toBe(1);
  });
});
