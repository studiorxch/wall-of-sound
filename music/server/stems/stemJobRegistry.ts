// 0722C_MUSIC_Production_Stem_Export — in-memory job registry. Node-only,
// module-scope singleton (one per running Vite dev-server process).
//
// A duplicate export request for the same (sourceTrackId, parent
// fingerprint, model) FOCUSES the existing job rather than spawning a
// second one. A single-slot FIFO queue means only one Demucs subprocess
// ever runs at a time, regardless of how many different tracks are
// requested (GPU/RAM safety). Cancellation kills the real process group
// (`spawn(...,{detached:true})` gives us one to kill). Disclosed
// limitation: this registry is wiped by a Vite dev-server restart — that's
// exactly why stemStartupReconciliation.ts exists, so an abandoned job
// never LOOKS active forever; it becomes a distinct "interrupted" record
// instead of silently vanishing or silently resuming.

import { randomUUID } from "node:crypto";
import type { ChildProcess } from "node:child_process";
import { runStemExportJob, type StemExportJobParams, type StemExportCallbacks, type StemExportJobResult } from "./stemExportOrchestrator";
import type { StemJob, TrackStemSet } from "../../src/data/trackStemTypes";

interface QueuedJob {
  job: StemJob;
  dedupeKey: string;
  params: Omit<StemExportJobParams, "operationId">;
  child: ChildProcess | null;
  cancelRequested: boolean;
}

export function dedupeKeyFor(sourceTrackId: string, parentFingerprint: string, model: string): string {
  return `${sourceTrackId}::${parentFingerprint}::${model}`;
}

type RunJobFn = (params: StemExportJobParams, callbacks: StemExportCallbacks) => Promise<StemExportJobResult>;

// The real pipeline is the default — injectable purely so tests can
// substitute a fast fake instead of a real ffmpeg/Demucs run, without
// changing production wiring at all (vite.config.ts's `stemJobRegistry`
// singleton always uses the real one).
export class StemJobRegistry {
  private jobsById = new Map<string, QueuedJob>();
  private dedupeIndex = new Map<string, string>(); // dedupeKey -> jobId
  private queue: string[] = [];
  private runJob: RunJobFn;

  constructor(runJob: RunJobFn = runStemExportJob) {
    this.runJob = runJob;
  }
  private runningJobId: string | null = null;

  private touch(entry: QueuedJob, patch: Partial<StemJob>) {
    entry.job = { ...entry.job, ...patch, updatedAt: new Date().toISOString() };
  }

  // `parentFingerprintHint` is the parent's CURRENT raw-file hash, used
  // only for the dedupe key — a coarse-enough signal that "the same
  // parent, unchanged since the last request" doesn't spawn a second job,
  // without requiring the full canonical decode just to compute a dedupe key.
  startJob(sourceTrackId: string, audioRelPath: string, parentFingerprintHint: string, model: string, stemLibraryRoot: string, musicLibraryRoot: string): { jobId: string; focused: boolean } {
    const dedupeKey = dedupeKeyFor(sourceTrackId, parentFingerprintHint, model);
    const existingJobId = this.dedupeIndex.get(dedupeKey);
    if (existingJobId) {
      const existing = this.jobsById.get(existingJobId);
      if (existing && !["complete", "failed", "cancelled"].includes(existing.job.status)) {
        return { jobId: existingJobId, focused: true };
      }
    }

    const jobId = randomUUID();
    const now = new Date().toISOString();
    const entry: QueuedJob = {
      job: { jobId, sourceTrackId, model, status: "queued", phase: null, startedAt: now, updatedAt: now, elapsedMs: 0 },
      dedupeKey,
      params: { stemLibraryRoot, musicLibraryRoot, sourceTrackId, audioRelPath },
      child: null,
      cancelRequested: false,
    };
    this.jobsById.set(jobId, entry);
    this.dedupeIndex.set(dedupeKey, jobId);
    this.queue.push(jobId);
    this.pump();
    return { jobId, focused: false };
  }

  getStatus(jobId: string): StemJob | null {
    return this.jobsById.get(jobId)?.job ?? null;
  }

  cancelJob(jobId: string): boolean {
    const entry = this.jobsById.get(jobId);
    if (!entry) return false;
    entry.cancelRequested = true;
    if (entry.child && entry.child.pid) {
      try {
        process.kill(-entry.child.pid, "SIGTERM");
      } catch {
        try { entry.child.kill("SIGTERM"); } catch { /* already gone */ }
      }
    } else if (entry.job.status === "queued") {
      // Never started running — remove from queue and mark cancelled directly.
      this.queue = this.queue.filter((id) => id !== jobId);
      this.touch(entry, { status: "cancelled" });
      this.dedupeIndex.delete(entry.dedupeKey);
    }
    return true;
  }

  private pump(): void {
    if (this.runningJobId) return; // single-slot — one Demucs process at a time
    const nextId = this.queue.shift();
    if (!nextId) return;
    const entry = this.jobsById.get(nextId);
    if (!entry) { this.pump(); return; }
    if (entry.cancelRequested) { this.dedupeIndex.delete(entry.dedupeKey); this.pump(); return; }

    this.runningJobId = nextId;
    const operationId = nextId;
    this.touch(entry, { status: "preparing", phase: "preparing" });

    void this.runJob(
      { ...entry.params, operationId },
      {
        onPhase: (phase) => this.touch(entry, { status: phase, phase }),
        onChildSpawned: (child) => {
          entry.child = child;
          if (entry.cancelRequested && child.pid) {
            try { process.kill(-child.pid, "SIGTERM"); } catch { /* ignore */ }
          }
        },
      },
    ).then((result: { ok: boolean; stemSet?: TrackStemSet; message?: string }) => {
      if (entry.cancelRequested) {
        this.touch(entry, { status: "cancelled" });
      } else if (result.ok) {
        this.touch(entry, { status: "complete", phase: null, resultStemSetId: result.stemSet?.id });
      } else {
        this.touch(entry, { status: "failed", phase: null, error: result.message });
      }
      this.dedupeIndex.delete(entry.dedupeKey);
      this.runningJobId = null;
      this.pump();
    }).catch((err: unknown) => {
      this.touch(entry, { status: "failed", phase: null, error: String(err) });
      this.dedupeIndex.delete(entry.dedupeKey);
      this.runningJobId = null;
      this.pump();
    });
  }
}

// Module-scope singleton — one registry per running dev-server process,
// exactly matching the "serialize all jobs, one running at a time" and
// "reset on restart" behavior this design deliberately accepts.
export const stemJobRegistry = new StemJobRegistry();
