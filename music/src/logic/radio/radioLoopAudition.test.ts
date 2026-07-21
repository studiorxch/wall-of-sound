import { describe, it, expect } from "vitest";
import { estimateBufferBytes, selectCacheEvictions, type CacheEntrySize } from "./radioLoopAudition";

describe("estimateBufferBytes", () => {
  it("computes 4 bytes per Float32 sample per channel", () => {
    expect(estimateBufferBytes(1000, 2)).toBe(1000 * 2 * 4);
    expect(estimateBufferBytes(48000, 1)).toBe(48000 * 4);
  });
});

describe("selectCacheEvictions", () => {
  it("evicts nothing when under both caps", () => {
    const entries: CacheEntrySize[] = [{ key: "a", approxBytes: 100 }, { key: "b", approxBytes: 100 }];
    expect(selectCacheEvictions(entries, 16, 32 * 1024 * 1024)).toEqual([]);
  });

  it("evicts oldest-first when over the entry-count cap", () => {
    const entries: CacheEntrySize[] = [
      { key: "oldest", approxBytes: 10 },
      { key: "middle", approxBytes: 10 },
      { key: "newest", approxBytes: 10 },
    ];
    expect(selectCacheEvictions(entries, 2, 1024)).toEqual(["oldest"]);
  });

  it("evicts oldest-first when over the byte cap", () => {
    const entries: CacheEntrySize[] = [
      { key: "oldest", approxBytes: 20 * 1024 * 1024 },
      { key: "newest", approxBytes: 20 * 1024 * 1024 },
    ];
    expect(selectCacheEvictions(entries, 16, 32 * 1024 * 1024)).toEqual(["oldest"]);
  });

  it("evicts multiple entries until both caps are satisfied", () => {
    const entries: CacheEntrySize[] = Array.from({ length: 20 }, (_, i) => ({ key: `k${i}`, approxBytes: 1024 }));
    const evicted = selectCacheEvictions(entries, 16, 32 * 1024 * 1024);
    expect(evicted).toEqual(["k0", "k1", "k2", "k3"]);
    expect(entries.length - evicted.length).toBe(16);
  });

  it("never evicts everything if a single entry alone exceeds the byte cap (stops once list is empty)", () => {
    const entries: CacheEntrySize[] = [{ key: "huge", approxBytes: 64 * 1024 * 1024 }];
    // The loop stops once `remaining` is empty even if still "over" — no
    // infinite loop, no negative-length array.
    expect(() => selectCacheEvictions(entries, 16, 32 * 1024 * 1024)).not.toThrow();
    expect(selectCacheEvictions(entries, 16, 32 * 1024 * 1024)).toEqual(["huge"]);
  });
});
