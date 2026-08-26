// MUSIC P0 Clean Library Foundation — Step C: Analysis Status + File Health
// (0826B_MUSIC_P0_Clean_Library_Foundation_StepC).
//
// The actual playability probe, extracted from App.tsx's pre-existing
// recheckTrackPlayback (0709) so the same mechanism can check a Step B
// asset's URL too, not just a Track's single legacy file. Behavior is
// unchanged from the original inline version — same events, same 8s bound —
// just parameterized on a raw URL instead of reading it off a Track. Not
// pure (touches the DOM Audio element), but has no React/App state of its
// own; the caller owns what to do with the result.

export type AudioPlaybackProbeResult =
  | { playable: true }
  | { playable: false; code: "CODEC" | "NETWORK" | "UNKNOWN"; message: string };

export function probeAudioPlayability(url: string, timeoutMs = 8000): Promise<AudioPlaybackProbeResult> {
  return new Promise((resolve) => {
    const probe = new Audio();
    let settled = false;
    const finish = (result: AudioPlaybackProbeResult) => {
      if (settled) return;
      settled = true;
      probe.src = "";
      resolve(result);
    };

    probe.addEventListener("canplay", () => finish({ playable: true }), { once: true });
    probe.addEventListener("error", () => {
      const code = probe.error?.code;
      if (code === MediaError.MEDIA_ERR_DECODE) finish({ playable: false, code: "CODEC", message: "codec decode failure (recheck)" });
      else if (code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) finish({ playable: false, code: "CODEC", message: "format not supported (recheck)" });
      else if (code === MediaError.MEDIA_ERR_NETWORK) finish({ playable: false, code: "NETWORK", message: "network error (recheck)" });
      else finish({ playable: false, code: "UNKNOWN", message: "playback recheck failed" });
    }, { once: true });
    // Bound the probe — a hanging load should not block a bulk recheck forever.
    setTimeout(() => finish({ playable: false, code: "UNKNOWN", message: "recheck timed out" }), timeoutMs);

    probe.preload = "auto";
    probe.src = url;
    probe.load();
  });
}
