import { describe, it, expect } from "vitest";
import { runTrackPreparationBatch } from "./radioTrackPreparationOrchestrator";
import type { PrepareEntryTask } from "./radioTrackPreparationOrchestrator";
import type { RadioTrackPrepareRequest, RadioTrackPrepareResponse } from "../../data/radioTrackPackageTypes";

function makeRequest(sourceTrackId: string): RadioTrackPrepareRequest {
  return {
    sourceTrackId,
    audioRelPath: `Catalog/${sourceTrackId}.wav`,
    display: { title: sourceTrackId, artist: "Artist" },
    musical: {},
    songIntelligence: { sections: [] },
    approval: { approved: true, approvedAt: "2026-07-20T00:00:00.000Z", sourceAssetHash: "hash" },
  };
}

function makeTasks(ids: string[]): PrepareEntryTask[] {
  return ids.map((id) => ({ entryId: id, request: makeRequest(id) }));
}

describe("runTrackPreparationBatch", () => {
  it("runs every task in order and reports every success", async () => {
    const calledWith: string[] = [];
    const result = await runTrackPreparationBatch(makeTasks(["e1", "e2", "e3"]), {
      prepareTrack: async (request) => {
        calledWith.push(request.sourceTrackId);
        return { ok: true, reused: false, radioTrackId: `rtrack_${request.sourceTrackId}`, packageVersion: 1, issues: [] };
      },
    });
    expect(calledWith).toEqual(["e1", "e2", "e3"]);
    expect(result).toEqual({ succeeded: ["e1", "e2", "e3"], failed: [], cancelled: false });
  });

  it("isolates a failed entry — the batch continues to the remaining entries", async () => {
    const result = await runTrackPreparationBatch(makeTasks(["e1", "e2", "e3"]), {
      prepareTrack: async (request) => {
        if (request.sourceTrackId === "e2") {
          return { ok: false, reused: false, issues: [{ code: "RADIO_TRACK_PREPARE_ENCODE_FAILED", message: "ffmpeg failed", severity: "error" }] };
        }
        return { ok: true, reused: false, radioTrackId: "rtrack_000001", packageVersion: 1, issues: [] };
      },
    });
    expect(result.succeeded).toEqual(["e1", "e3"]);
    expect(result.failed).toEqual(["e2"]);
    expect(result.cancelled).toBe(false);
  });

  it("records a thrown network error as a failure for that entry only, without stopping the batch", async () => {
    const result = await runTrackPreparationBatch(makeTasks(["e1", "e2"]), {
      prepareTrack: async (request) => {
        if (request.sourceTrackId === "e1") throw new Error("network down");
        return { ok: true, reused: false, radioTrackId: "rtrack_000001", packageVersion: 1, issues: [] };
      },
    });
    expect(result.failed).toEqual(["e1"]);
    expect(result.succeeded).toEqual(["e2"]);
  });

  it("stops between entries once the signal is aborted — an in-flight entry always finishes first", async () => {
    const controller = new AbortController();
    const calledWith: string[] = [];
    const result = await runTrackPreparationBatch(makeTasks(["e1", "e2", "e3"]), {
      signal: controller.signal,
      prepareTrack: async (request) => {
        calledWith.push(request.sourceTrackId);
        if (request.sourceTrackId === "e1") controller.abort(); // abort fires only AFTER e1's own call finishes
        return { ok: true, reused: false, radioTrackId: "rtrack_000001", packageVersion: 1, issues: [] };
      },
    });
    expect(calledWith).toEqual(["e1"]);
    expect(result).toEqual({ succeeded: ["e1"], failed: [], cancelled: true });
  });

  it("never starts any task when the signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    let calls = 0;
    const result = await runTrackPreparationBatch(makeTasks(["e1", "e2"]), {
      signal: controller.signal,
      prepareTrack: async () => { calls++; return { ok: true, reused: false, issues: [] }; },
    });
    expect(calls).toBe(0);
    expect(result).toEqual({ succeeded: [], failed: [], cancelled: true });
  });

  it("invokes onEntryStart and onEntryComplete for every attempted entry", async () => {
    const started: string[] = [];
    const completed: Array<{ entryId: string; ok: boolean }> = [];
    await runTrackPreparationBatch(makeTasks(["e1", "e2"]), {
      prepareTrack: async (request): Promise<RadioTrackPrepareResponse> => ({ ok: request.sourceTrackId === "e1", reused: false, issues: [] }),
      onEntryStart: (entryId) => started.push(entryId),
      onEntryComplete: (entryId, response) => completed.push({ entryId, ok: response.ok }),
    });
    expect(started).toEqual(["e1", "e2"]);
    expect(completed).toEqual([{ entryId: "e1", ok: true }, { entryId: "e2", ok: false }]);
  });
});
