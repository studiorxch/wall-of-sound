// Prepared Playback Handoff and Hard-Cut Repair (0714_MUSIC_Prepared_
// Playback_Handoff_And_Hard_Cut_Repair v1.0.0) — §4, §5. Pure decision logic
// only: "engine state says playing" is NOT the same as "audible output is
// actually happening" — this function is the single place that draws that
// line, so the engine and the hook never each invent their own definition.

import type { EngineAudibleReadiness, PreparedPlaybackHandoffFailureReason } from "./dualDeckTypes";

export interface RawReadinessSignals {
  audioContextState: AudioContextState | "closed";
  audioElementPaused: boolean;
  elementMuted: boolean;
  elementVolume: number;
  deckGain: number;
  sourceConnected: boolean;
  positionBeforeSeconds: number;
  positionAfterSeconds: number;
  playRejected: boolean;
  sourceLoadFailed: boolean;
}

export interface AudibleReadinessOptions {
  // RADIO ROOT-CAUSE REPAIR -- `elementVolume` doubles as two genuinely
  // different signals depending on the caller: for MUSIC's own prepared
  // playback (usePreparedPlaybackController.ts), HTMLAudioElement.volume is
  // never deliberately touched by any UI, so a real zero there does
  // indicate a broken engine/element -- that existing, tested contract is
  // unchanged (default false). For RADIO's Channel listener
  // (channelListenerPlayback.ts), the SAME field is, by this engine's own
  // documented design (see DualDeckPlaybackEngine.setMasterVolume), the
  // listener's own persisted personal volume preference -- a real user can
  // legitimately choose 0, and that must report a successfully started,
  // genuinely audible-capable engine, not "engine_start_failed". Set true
  // only at that one RADIO call site.
  ignoreZeroVolume?: boolean;
}

// §5/§6 — checked in a fixed, documented priority order so a given failure
// always reports the same, most-actionable reason rather than whichever
// condition happened to be checked first in an unordered pass.
export function evaluateAudibleReadiness(signals: RawReadinessSignals, options: AudibleReadinessOptions = {}): EngineAudibleReadiness {
  const audioElementPlaying = !signals.audioElementPaused;
  const audioContextRunning = signals.audioContextState === "running";
  const positionAdvanced = signals.positionAfterSeconds > signals.positionBeforeSeconds;

  const base = {
    audioElementPlaying,
    audioContextRunning,
    sourceConnected: signals.sourceConnected,
    elementMuted: signals.elementMuted,
    elementVolume: signals.elementVolume,
    deckGain: signals.deckGain,
    positionAdvanced,
  };

  let failureReason: PreparedPlaybackHandoffFailureReason | undefined;
  if (signals.playRejected) failureReason = "play_rejected";
  else if (signals.sourceLoadFailed) failureReason = "source_load_failed";
  else if (!signals.sourceConnected) failureReason = "source_not_connected";
  else if (!audioContextRunning) failureReason = "audio_context_suspended";
  else if (!audioElementPlaying) failureReason = "audio_element_not_playing";
  else if (signals.elementMuted) failureReason = "audio_element_muted";
  else if (signals.elementVolume <= 0 && !options.ignoreZeroVolume) failureReason = "audio_element_zero_volume";
  else if (signals.deckGain <= 0) failureReason = "gain_zero";
  else if (!positionAdvanced) failureReason = "position_not_advancing";

  return {
    ...base,
    ok: failureReason === undefined,
    failureReason,
  };
}
