// RADIO web player — first-track startup sequence, extracted as pure,
// DI'd orchestration (same pattern as radioOnePublishOrchestrator.ts) so
// it's unit-testable without a real AudioContext.
//
// Root cause this exists to fix: DualDeckPlaybackEngine.preload() always
// starts a deck silent (gain 0) — correct for a crossfade's incoming deck,
// which only becomes audible once executeHardCut() explicitly restores its
// gain. The very FIRST track never goes through executeHardCut, so nothing
// ever restored its gain — it played its full real duration completely
// inaudibly, then genuinely reached `ended`, advancing to track 2 (which
// *does* go through executeHardCut and so becomes audible). This mirrors
// the exact, already-solved case in usePreparedPlaybackController.ts's own
// non-crossfade handoff sequence: preload → restore gain → play → confirm
// REAL audible readiness → only then commit UI state. This module is that
// same sequence, scoped to the RADIO player.
//
// "Confirmed audible" is never inferred from a resolved play() promise or
// an HTTP 206 Range response alone — both are necessary but not
// sufficient. The one source of truth is EngineAudibleReadiness (deck gain
// > 0, AudioContext running, element actually playing, position
// genuinely advancing), already implemented and tested via
// confirmAudibleReadiness/handoffReadiness.ts — reused verbatim, not
// reimplemented.

import type { EngineAudibleReadiness } from "./audio/dualDeckTypes";
import type { RadioWebManifestEntry } from "./data/radioWebBundleTypes";

export type DeckId = "A" | "B";

export interface StartDeckEngineLike {
  preload(deckId: DeckId, params: { trackId: string; slotId: string; sourceUrl: string; cueStartSeconds: number }): Promise<void>;
  setDeckGainValue(deckId: DeckId, value: number): void;
  playDeck(deckId: DeckId): Promise<void>;
  pauseDeck(deckId: DeckId): void;
  confirmAudibleReadiness(deckId: DeckId, observationWindowMs?: number): Promise<EngineAudibleReadiness>;
}

export interface StartDeckOutcome {
  ok: boolean;
  // Preserved verbatim from the ORIGINAL failure (playDeck rejection or
  // confirmAudibleReadiness's own failureReason) — cleanup below never
  // overwrites this, even though cleanup itself is always attempted on a
  // failure path.
  failureReason: string;
  readiness?: EngineAudibleReadiness;
}

// Best-effort: stop/silence a deck that failed to start audibly so its
// `<audio>` element can never reach a real `ended` event in the background
// and silently advance the station. Never lets a cleanup failure mask the
// original failureReason the caller already captured.
function abortFailedDeck(engine: StartDeckEngineLike, deckId: DeckId): void {
  try {
    engine.pauseDeck(deckId);
    engine.setDeckGainValue(deckId, 0);
  } catch {
    // cleanup is best-effort only — the original failureReason is still returned
  }
}

// The exact proven sequence from usePreparedPlaybackController.ts's own
// non-crossfade handoff, reused verbatim: preload() left the deck silent
// by design, so restore full gain, start it, then require REAL confirmed
// audible readiness before reporting success. A rejected play() or a
// failed readiness check both abort the deck and report — never throw.
export async function restoreGainAndStartDeck(engine: StartDeckEngineLike, deckId: DeckId): Promise<StartDeckOutcome> {
  engine.setDeckGainValue(deckId, 1);

  try {
    await engine.playDeck(deckId);
  } catch (err) {
    const failureReason = `play_rejected: ${err instanceof Error ? err.message : String(err)}`;
    abortFailedDeck(engine, deckId);
    return { ok: false, failureReason };
  }

  const readiness = await engine.confirmAudibleReadiness(deckId);
  if (!readiness.ok) {
    const failureReason = readiness.failureReason ?? "unknown";
    abortFailedDeck(engine, deckId);
    return { ok: false, failureReason, readiness };
  }

  return { ok: true, failureReason: "", readiness };
}

export interface StartFirstAvailableTrackResult {
  startedIndex: number | null;
  skipped: Array<{ index: number; title: string; reason: string }>;
}

// Tries entries[fromIndex..] in order on the SAME already-initialized
// engine/deck — never constructs a second engine, never leaves a failed
// deck playing in the background (each failure is aborted via
// restoreGainAndStartDeck/abortFailedDeck before moving on). Returns the
// first index that is genuinely, confirmedly audible, or null if none is.
export async function startFirstAvailableTrack(
  engine: StartDeckEngineLike,
  entries: RadioWebManifestEntry[],
  deckId: DeckId,
  buildSourceUrl: (entry: RadioWebManifestEntry) => string,
  fromIndex = 0,
): Promise<StartFirstAvailableTrackResult> {
  const skipped: StartFirstAvailableTrackResult["skipped"] = [];

  for (let i = fromIndex; i < entries.length; i++) {
    const entry = entries[i];

    try {
      await engine.preload(deckId, {
        trackId: entry.radioTrackId, slotId: entry.radioTrackId,
        sourceUrl: buildSourceUrl(entry), cueStartSeconds: 0,
      });
    } catch (err) {
      skipped.push({ index: i, title: entry.title, reason: `preload_failed: ${err instanceof Error ? err.message : String(err)}` });
      continue;
    }

    const outcome = await restoreGainAndStartDeck(engine, deckId);
    if (!outcome.ok) {
      skipped.push({ index: i, title: entry.title, reason: outcome.failureReason });
      continue;
    }

    return { startedIndex: i, skipped };
  }

  return { startedIndex: null, skipped };
}

// Synchronous UI-boundary lock — the actual rapid-double-click protection.
// Must be checked-and-set as the very first line of the click handler,
// before any engine lookup: if two click events were ever dispatched
// before either handler's synchronous portion ran (they aren't, in a
// single-threaded DOM event loop, but this makes the guarantee explicit
// and independently testable rather than relying on that timing subtlety).
export function tryAcquireStartLock(lock: { current: boolean }): boolean {
  if (lock.current) return false;
  lock.current = true;
  return true;
}
