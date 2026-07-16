// Reusable audio playability scanner (0711_MUSIC_Import_To_Crate_Intake_Pipeline).
// Extracted from the single-track probe already used by App.tsx's
// recheckTrackPlayback — same technique (offscreen <audio>, canplay vs error,
// 8s timeout, MediaError → code mapping), but as a pure function with no
// React state so the intake pipeline can batch-scan before anything commits
// to the active library.

import type { TrackPlaybackIssue } from "../data/playProjectTypes";

export const DEFAULT_SCAN_TIMEOUT_MS = 8000;
export const DEFAULT_SCAN_CONCURRENCY = 3;

export type PlaybackProbeResult = Pick<TrackPlaybackIssue, "status" | "code" | "message">;

/** Probes a single audio URL for playability. Never rejects. */
export function probeTrackPlayability(url: string | null, timeoutMs = DEFAULT_SCAN_TIMEOUT_MS): Promise<PlaybackProbeResult> {
  if (!url) {
    return Promise.resolve({ status: "unplayable", code: "NO_SOURCE", message: "no audio path" });
  }

  return new Promise((resolve) => {
    const probe = new Audio();
    let settled = false;
    const finish = (result: PlaybackProbeResult) => {
      if (settled) return;
      settled = true;
      probe.src = "";
      resolve(result);
    };

    probe.addEventListener("canplay", () => finish({ status: "playable" }), { once: true });
    probe.addEventListener("error", () => {
      const code = probe.error?.code;
      if (code === MediaError.MEDIA_ERR_DECODE) finish({ status: "unplayable", code: "CODEC", message: "codec decode failure" });
      else if (code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) finish({ status: "unplayable", code: "CODEC", message: "format not supported" });
      else if (code === MediaError.MEDIA_ERR_NETWORK) finish({ status: "unplayable", code: "NETWORK", message: "network error" });
      else finish({ status: "unplayable", code: "UNKNOWN", message: "playback probe failed" });
    }, { once: true });
    // Bound the probe — a hanging load must not block a batch scan forever.
    setTimeout(() => finish({ status: "unplayable", code: "UNKNOWN", message: "scan timed out" }), timeoutMs);

    probe.preload = "auto";
    probe.src = url;
    probe.load();
  });
}

/**
 * Runs probeTrackPlayability over a list of items with bounded concurrency
 * (default 3, per spec). `getUrl` resolves each item to its audio URL;
 * `onItemDone` fires as each result lands so UI can update incrementally.
 */
export async function scanPlaybackBatch<T>(
  items: T[],
  getUrl: (item: T) => string | null,
  onItemDone: (item: T, result: PlaybackProbeResult) => void,
  opts?: { timeoutMs?: number; concurrency?: number },
): Promise<void> {
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_SCAN_TIMEOUT_MS;
  const concurrency = Math.max(1, opts?.concurrency ?? DEFAULT_SCAN_CONCURRENCY);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const i = nextIndex++;
      const item = items[i];
      const result = await probeTrackPlayability(getUrl(item), timeoutMs);
      onItemDone(item, result);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
}
