// ── graffitiRandom ─────────────────────────────────────────────────────────────
// Deterministic PRNG (mulberry32) — every brush that wants organic-looking
// jitter (fatcap spray scatter, mop drip spawn points) seeds one of these
// from the stroke's own stored `seed` field, never from `Math.random()`
// directly. Same stroke data + same seed always renders pixel-identical,
// which is what makes undo/redo, serialization, and page-reload replay
// consistent (BUILD §11/§12 "deterministic enough for undo/redo and
// serialization").

export function createSeededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A stroke's seed is fixed once at creation — derived from the creation
// timestamp plus a per-session counter, so two strokes never accidentally
// share a seed within one session (session-scoped uniqueness is all that
// matters here; this is a rendering seed, not an identity).
export function makeStrokeSeed(counter: number): number {
  return (Date.now() ^ (counter * 2654435761)) >>> 0;
}
