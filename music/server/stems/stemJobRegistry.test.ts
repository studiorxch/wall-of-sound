import { describe, it, expect } from "vitest";
import { StemJobRegistry, dedupeKeyFor } from "./stemJobRegistry";
import type { StemExportCallbacks, StemExportJobParams, StemExportJobResult } from "./stemExportOrchestrator";

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

describe("dedupeKeyFor", () => {
  it("combines sourceTrackId, fingerprint, and model", () => {
    expect(dedupeKeyFor("track_1", "fp1", "htdemucs")).toBe("track_1::fp1::htdemucs");
  });
});

describe("StemJobRegistry", () => {
  it("a duplicate request for the same (track, fingerprint, model) focuses the existing job, never spawns a second", async () => {
    let runCount = 0;
    const gate = deferred<StemExportJobResult>();
    const registry = new StemJobRegistry(async () => { runCount++; return gate.promise; });

    const first = registry.startJob("track_1", "catalog/audio/a.wav", "fp1", "htdemucs", "/stem-root", "/music-root");
    const second = registry.startJob("track_1", "catalog/audio/a.wav", "fp1", "htdemucs", "/stem-root", "/music-root");

    expect(second.focused).toBe(true);
    expect(second.jobId).toBe(first.jobId);
    await Promise.resolve(); // let the microtask queue run pump()
    expect(runCount).toBe(1);

    gate.resolve({ ok: true, stemSet: undefined });
  });

  it("a request for a DIFFERENT parent fingerprint is a genuinely new job, not focused", () => {
    const registry = new StemJobRegistry(async () => new Promise(() => { /* never resolves */ }));
    const a = registry.startJob("track_1", "rel.wav", "fp1", "htdemucs", "/root", "/music");
    const b = registry.startJob("track_1", "rel.wav", "fp2", "htdemucs", "/root", "/music");
    expect(a.jobId).not.toBe(b.jobId);
    expect(b.focused).toBe(false);
  });

  it("single-slot queue: a second distinct job stays queued while the first is running", async () => {
    const firstGate = deferred<StemExportJobResult>();
    let secondStarted = false;
    const registry = new StemJobRegistry(async (params: StemExportJobParams) => {
      if (params.sourceTrackId === "track_1") return firstGate.promise;
      secondStarted = true;
      return { ok: true };
    });

    registry.startJob("track_1", "a.wav", "fp1", "htdemucs", "/root", "/music");
    registry.startJob("track_2", "b.wav", "fp2", "htdemucs", "/root", "/music");
    await Promise.resolve();
    expect(secondStarted).toBe(false); // still waiting behind the single running slot

    firstGate.resolve({ ok: true });
    await Promise.resolve();
    await Promise.resolve();
    expect(secondStarted).toBe(true);
  });

  it("getStatus reflects phase transitions reported by onPhase", async () => {
    const gate = deferred<StemExportJobResult>();
    const registry = new StemJobRegistry(async (_params: StemExportJobParams, callbacks: StemExportCallbacks) => {
      callbacks.onPhase?.("preparing");
      callbacks.onPhase?.("separating");
      return gate.promise;
    });
    const { jobId } = registry.startJob("track_1", "a.wav", "fp1", "htdemucs", "/root", "/music");
    await Promise.resolve();
    expect(registry.getStatus(jobId)?.status).toBe("separating");
    gate.resolve({ ok: true });
  });

  it("cancelJob on a still-queued (never-started) job removes it and marks it cancelled", () => {
    const registry = new StemJobRegistry(async () => new Promise(() => {})); // first job never resolves, blocking the slot
    registry.startJob("track_1", "a.wav", "fp1", "htdemucs", "/root", "/music");
    const { jobId: secondId } = registry.startJob("track_2", "b.wav", "fp2", "htdemucs", "/root", "/music");
    const cancelled = registry.cancelJob(secondId);
    expect(cancelled).toBe(true);
    expect(registry.getStatus(secondId)?.status).toBe("cancelled");
  });

  it("cancelJob on an unknown jobId returns false", () => {
    const registry = new StemJobRegistry(async () => ({ ok: true }));
    expect(registry.cancelJob("nope")).toBe(false);
  });

  it("a completed job records failure with the reported message", async () => {
    const registry = new StemJobRegistry(async () => ({ ok: false, message: "boom" }));
    const { jobId } = registry.startJob("track_1", "a.wav", "fp1", "htdemucs", "/root", "/music");
    await Promise.resolve();
    await Promise.resolve();
    expect(registry.getStatus(jobId)?.status).toBe("failed");
    expect(registry.getStatus(jobId)?.error).toBe("boom");
  });

  it("a completed job records the resulting stem set id on success", async () => {
    const registry = new StemJobRegistry(async () => ({ ok: true, stemSet: { id: "set_123" } as never }));
    const { jobId } = registry.startJob("track_1", "a.wav", "fp1", "htdemucs", "/root", "/music");
    await Promise.resolve();
    await Promise.resolve();
    expect(registry.getStatus(jobId)?.status).toBe("complete");
    expect(registry.getStatus(jobId)?.resultStemSetId).toBe("set_123");
  });
});
