import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { reconcileAbandonedStemStaging, listInterruptedStemJobs } from "./stemStartupReconciliation";
import { createStagingOperation } from "../radio/radioStagingFs";

describe("stemStartupReconciliation", () => {
  let root: string;
  beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), "stem-reconcile-")); });
  afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

  it("finds no abandoned staging when none exists", () => {
    expect(reconcileAbandonedStemStaging(root)).toEqual([]);
  });

  it("marks an abandoned staging dir as interrupted, never promoting it", () => {
    const opId = "op-abandoned-1".replace(/^op-/, "");
    const dir = createStagingOperation(root, opId);
    fs.writeFileSync(path.join(dir, "vocals.wav"), "partial-bytes"); // simulates a job mid-Demucs when the process died

    const found = reconcileAbandonedStemStaging(root);
    expect(found.length).toBe(1);
    expect(found[0].operationId).toBe(opId);
    expect(fs.existsSync(path.join(dir, "interrupted-job.json"))).toBe(true);

    // Never promoted — the "vocals.wav" partial file just sits there, still in staging/, not in sets/.
    const setsRoot = path.join(root, "sets");
    expect(fs.existsSync(setsRoot)).toBe(false);
  });

  it("is idempotent — re-running preserves the original detectedAt", () => {
    const opId = "reconcile-idempotent";
    createStagingOperation(root, opId);
    const first = reconcileAbandonedStemStaging(root);
    const second = reconcileAbandonedStemStaging(root);
    expect(first[0].detectedAt).toBe(second[0].detectedAt);
  });

  it("listInterruptedStemJobs reflects what reconciliation found", () => {
    createStagingOperation(root, "job-a");
    createStagingOperation(root, "job-b");
    reconcileAbandonedStemStaging(root);
    const listed = listInterruptedStemJobs(root);
    expect(listed.map((j) => j.operationId).sort()).toEqual(["job-a", "job-b"]);
  });
});
