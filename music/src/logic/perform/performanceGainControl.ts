import type { DeckPlaybackState, PlaybackAuthority, PlaylistPlaybackSessionStatus } from "../../audio/dualDeckTypes";

export type ManualDeckGainWriteFailureReason =
  | "wrong_authority"
  | "no_session"
  | "transition_claimed"
  | "deck_not_loaded";

export type ManualDeckGainWriteResult =
  | { accepted: true }
  | { accepted: false; reason: ManualDeckGainWriteFailureReason };

export interface ManualDeckGainWriteContext {
  authority: PlaybackAuthority;
  sessionStatus: PlaylistPlaybackSessionStatus | null;
  transitionClaimed: boolean;
  decks: Record<"A" | "B", { trackId?: string; state: DeckPlaybackState }> | null;
}

export function clampPerformanceGain(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export function gainsForPerformanceFader(position: number): { A: number; B: number } {
  const x = clampPerformanceGain(position);
  return {
    A: Math.cos((x * Math.PI) / 2),
    B: Math.sin((x * Math.PI) / 2),
  };
}

export function performanceFaderPositionForGains(deckAGain: number, deckBGain: number): number {
  const a = clampPerformanceGain(deckAGain);
  const b = clampPerformanceGain(deckBGain);
  if (a === 0 && b === 0) return 0.5;
  return clampPerformanceGain((Math.atan2(b, a) * 2) / Math.PI);
}

function isLoadedForManualGain(deck: { trackId?: string; state: DeckPlaybackState } | undefined): boolean {
  return Boolean(deck?.trackId) && (deck?.state === "ready" || deck?.state === "playing" || deck?.state === "paused");
}

export function authorizeManualDeckGainWrite(
  context: ManualDeckGainWriteContext,
  deckIds: readonly ("A" | "B")[],
): ManualDeckGainWriteResult {
  if (context.authority !== "dual_deck_engine") return { accepted: false, reason: "wrong_authority" };
  if (context.sessionStatus == null) return { accepted: false, reason: "no_session" };
  if (context.sessionStatus === "transitioning" || context.transitionClaimed) {
    return { accepted: false, reason: "transition_claimed" };
  }
  if (!context.decks || deckIds.some((deckId) => !isLoadedForManualGain(context.decks?.[deckId]))) {
    return { accepted: false, reason: "deck_not_loaded" };
  }
  return { accepted: true };
}
