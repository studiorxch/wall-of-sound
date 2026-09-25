/**
 * Batch 02S -- the smallest reusable listener runtime proving the full
 * chain end to end:
 *
 *   listener presses Play
 *        v
 *   channelId + Date.now()
 *        v
 *   resolveChannelTrackBroadcast()
 *        v
 *   authoritative Program + Track + exact trackOffsetSeconds
 *        v
 *   DualDeckPlaybackEngine (via the EXISTING radioPlayerStartSequence.ts
 *   preload -> restore-gain -> play -> confirm-audible sequence, reused
 *   verbatim -- no second playback engine)
 *        v
 *   audible RADIO
 *
 * NOT wired into Channel Control -- that page stays an operator/editor
 * surface (Batch 02Q/02R), never a permanent listener, per this batch's
 * own instruction.
 *
 * AUTHORITY, NOT AVAILABILITY, at every step: a resolution failure
 * (inactive/before-start/package-unavailable/etc.) is reported as a
 * `"failed"` outcome carrying the ORIGINAL `ChannelTrackBroadcastResult`
 * verbatim -- never silently replaced with a different Program. Track end
 * re-resolves Channel authority fresh (`Date.now()` at the moment of the
 * `ended` event) rather than advancing a client-local playlist cursor,
 * exactly per this batch's own required behavior.
 *
 * LATENCY CORRECTION (this batch's own required behavior): real wall-clock
 * time elapses between resolving a position and actually starting audible
 * playback (fetch/preload/decode). Before preloading, this module adds
 * that elapsed time to the resolved `trackOffsetSeconds` -- UNLESS doing
 * so would cross the current track's own boundary, in which case it
 * re-resolves once (bounded, not a loop) rather than blindly extrapolating
 * across a track/Program boundary it was never told about.
 */

import type { EventRadioRepository, RadioChannelRepository } from "@studiorich/member-identity";
import type { RadioWebManifest } from "../../data/radioWebBundleTypes";
import type { EngineAudibleReadiness } from "../../audio/dualDeckTypes";
import { restoreGainAndStartDeck, type DeckId, type StartDeckEngineLike } from "../../radioPlayerStartSequence";
import { resolveChannelTrackBroadcast, type ChannelTrackBroadcastResult } from "./channelTrackBroadcast";

export interface ChannelListenerEngineLike extends StartDeckEngineLike {
  onDeckEnded(handler: (deckId: DeckId) => void): () => void;
  stopAll(): void;
}

export type ChannelListenerPlaybackOutcome =
  | {
      readonly status: "started";
      readonly programId: string;
      readonly trackId: string;
      readonly cueStartSeconds: number;
      /** True when the resolved offset was corrected for click-to-audible latency (see this module's own doc); false when a boundary-crossing re-resolution happened instead. */
      readonly latencyCorrected: boolean;
    }
  | {
      readonly status: "failed";
      readonly reason: string;
      /** The ORIGINAL, unaltered resolver result -- never a fabricated fallback. */
      readonly broadcastResult: ChannelTrackBroadcastResult;
    };

export interface StartChannelPlaybackInput {
  readonly channelId: string;
  readonly radioChannelRepository: Pick<RadioChannelRepository, "getRadioChannel">;
  readonly eventRadioRepository: Pick<EventRadioRepository, "listRadioPrograms">;
  readonly fetchManifest: (manifestBaseUrl: string) => Promise<RadioWebManifest>;
  readonly engine: ChannelListenerEngineLike;
  /** Injectable for tests -- defaults to the real Date.now/resolveChannelTrackBroadcast. */
  readonly nowMs?: () => number;
  readonly resolve?: typeof resolveChannelTrackBroadcast;
}

function otherDeck(deck: DeckId): DeckId {
  return deck === "A" ? "B" : "A";
}

/**
 * `resolveChannelTrackBroadcast`/`resolveCurrentChannelBroadcast` return
 * `"channel-not-found"` for a genuinely absent document, but a REJECTED
 * repository call (a real network/permissions error, distinct from "not
 * found") is not a status they model at all -- it throws instead. Caught
 * here, once, so this controller's own promise chain never becomes an
 * unhandled rejection that leaves a caller's UI stuck; turned into the
 * same `"failed"` outcome shape every other failure already uses, with a
 * synthetic `channel-not-found`-shaped `broadcastResult` (the closest
 * honest approximation available -- this module doesn't know what the
 * real resolver status would have been) and the real error preserved in
 * `reason`.
 */
function unexpectedErrorOutcome(channelId: string, error: unknown): ChannelListenerPlaybackOutcome {
  return {
    status: "failed",
    reason: `unexpected_error:${error instanceof Error ? error.message : String(error)}`,
    broadcastResult: { status: "channel-not-found", channelId },
  };
}

type OnAirResult = Extract<ChannelTrackBroadcastResult, { status: "on-air" }>;

/**
 * Owns exactly one engine instance for its whole lifetime (injected, never
 * constructed internally) -- repeated `play()` calls never create a second
 * engine or a second `onDeckEnded` subscription; the `onDeckEnded`
 * listener is registered exactly once, in the constructor.
 */
export class ChannelListenerPlaybackController {
  private readonly channelId: string;
  private readonly radioChannelRepository: Pick<RadioChannelRepository, "getRadioChannel">;
  private readonly eventRadioRepository: Pick<EventRadioRepository, "listRadioPrograms">;
  private readonly fetchManifest: (manifestBaseUrl: string) => Promise<RadioWebManifest>;
  private readonly engine: ChannelListenerEngineLike;
  private readonly nowMsFn: () => number;
  private readonly resolveFn: typeof resolveChannelTrackBroadcast;
  private readonly unsubscribeDeckEnded: () => void;
  private readonly listeners = new Set<(outcome: ChannelListenerPlaybackOutcome) => void>();

  private activeDeck: DeckId = "A";
  private starting = false;
  private started = false;
  private lastOutcome: ChannelListenerPlaybackOutcome | null = null;

  constructor(input: StartChannelPlaybackInput) {
    this.channelId = input.channelId;
    this.radioChannelRepository = input.radioChannelRepository;
    this.eventRadioRepository = input.eventRadioRepository;
    this.fetchManifest = input.fetchManifest;
    this.engine = input.engine;
    this.nowMsFn = input.nowMs ?? Date.now;
    this.resolveFn = input.resolve ?? resolveChannelTrackBroadcast;
    this.unsubscribeDeckEnded = this.engine.onDeckEnded((deckId) => {
      if (deckId !== this.activeDeck) return;
      void this.handleTrackEnded();
    });
  }

  subscribe(listener: (outcome: ChannelListenerPlaybackOutcome) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(outcome: ChannelListenerPlaybackOutcome): void {
    this.lastOutcome = outcome;
    this.listeners.forEach((listener) => listener(outcome));
  }

  getLastOutcome(): ChannelListenerPlaybackOutcome | null {
    return this.lastOutcome;
  }

  isStarted(): boolean {
    return this.started;
  }

  /**
   * Must be called only from an explicit user gesture -- this module makes
   * no attempt to start audio itself; that requirement belongs to the
   * caller's own click handler, exactly like every other real playback
   * entry point in this codebase (`radioPlayerMain.ts`, `eventMusicRuntime.ts`).
   */
  async play(): Promise<ChannelListenerPlaybackOutcome> {
    if (this.starting) {
      // Repeated Play while already starting must not create a competing
      // engine/listener -- report the in-flight/last known outcome rather
      // than starting a second resolution+preload sequence.
      return this.lastOutcome ?? { status: "failed", reason: "already-starting", broadcastResult: { status: "channel-not-found", channelId: this.channelId } };
    }
    this.starting = true;
    try {
      const resolvedAtMs = this.nowMsFn();
      let result;
      try {
        result = await this.resolveFn({
          channelId: this.channelId,
          nowMs: resolvedAtMs,
          radioChannelRepository: this.radioChannelRepository,
          eventRadioRepository: this.eventRadioRepository,
          fetchManifest: this.fetchManifest,
        });
      } catch (error) {
        const outcome = unexpectedErrorOutcome(this.channelId, error);
        this.notify(outcome);
        return outcome;
      }
      if (result.status !== "on-air") {
        const outcome: ChannelListenerPlaybackOutcome = { status: "failed", reason: result.status, broadcastResult: result };
        this.notify(outcome);
        return outcome;
      }
      const outcome = await this.startAtResolution(result, resolvedAtMs);
      this.started = outcome.status === "started";
      this.notify(outcome);
      return outcome;
    } finally {
      this.starting = false;
    }
  }

  private async handleTrackEnded(): Promise<void> {
    const resolvedAtMs = this.nowMsFn();
    let result;
    try {
      result = await this.resolveFn({
        channelId: this.channelId,
        nowMs: resolvedAtMs,
        radioChannelRepository: this.radioChannelRepository,
        eventRadioRepository: this.eventRadioRepository,
        fetchManifest: this.fetchManifest,
      });
    } catch (error) {
      this.notify(unexpectedErrorOutcome(this.channelId, error));
      return;
    }
    if (result.status !== "on-air") {
      this.notify({ status: "failed", reason: result.status, broadcastResult: result });
      return;
    }
    this.activeDeck = otherDeck(this.activeDeck);
    const outcome = await this.startAtResolution(result, resolvedAtMs);
    this.notify(outcome);
  }

  /**
   * Latency correction: `elapsedSeconds` since `resolvedAtMs`. If adding it
   * to `trackOffsetSeconds` would still land inside the SAME track, apply
   * it directly. If it would cross that track's own boundary, re-resolve
   * once (bounded) rather than extrapolate across a boundary this result
   * knows nothing about.
   */
  private async startAtResolution(result: OnAirResult, resolvedAtMs: number): Promise<ChannelListenerPlaybackOutcome> {
    const elapsedSeconds = Math.max(0, (this.nowMsFn() - resolvedAtMs) / 1000);
    let effective = result;
    let latencyCorrected = false;

    if (elapsedSeconds > 0) {
      const wouldCrossTrackBoundary = result.trackOffsetSeconds + elapsedSeconds >= result.trackDurationSeconds;
      if (wouldCrossTrackBoundary) {
        let reResolved;
        try {
          reResolved = await this.resolveFn({
            channelId: this.channelId,
            nowMs: this.nowMsFn(),
            radioChannelRepository: this.radioChannelRepository,
            eventRadioRepository: this.eventRadioRepository,
            fetchManifest: this.fetchManifest,
          });
        } catch (error) {
          return unexpectedErrorOutcome(this.channelId, error);
        }
        if (reResolved.status !== "on-air") return { status: "failed", reason: reResolved.status, broadcastResult: reResolved };
        effective = reResolved;
      } else {
        effective = { ...result, trackOffsetSeconds: result.trackOffsetSeconds + elapsedSeconds };
        latencyCorrected = true;
      }
    }

    const sourceUrl = effective.manifestBaseUrl + effective.audioUrl;
    const deckId = this.activeDeck;
    try {
      await this.engine.preload(deckId, { trackId: effective.trackId, slotId: effective.trackId, sourceUrl, cueStartSeconds: effective.trackOffsetSeconds });
    } catch (error) {
      return { status: "failed", reason: `preload_failed:${error instanceof Error ? error.message : String(error)}`, broadcastResult: effective };
    }

    const startOutcome = await restoreGainAndStartDeck(this.engine, deckId);
    if (!startOutcome.ok) {
      return { status: "failed", reason: `engine_start_failed:${startOutcome.failureReason}`, broadcastResult: effective };
    }

    return { status: "started", programId: effective.programId, trackId: effective.trackId, cueStartSeconds: effective.trackOffsetSeconds, latencyCorrected };
  }

  /** Stops the engine and unsubscribes from deck-ended -- the safe dispose path. */
  stop(): void {
    this.engine.stopAll();
    this.unsubscribeDeckEnded();
  }
}

export function createChannelListenerPlaybackController(input: StartChannelPlaybackInput): ChannelListenerPlaybackController {
  return new ChannelListenerPlaybackController(input);
}

// Re-exported only for consumers that want the readiness type without a
// second import path.
export type { EngineAudibleReadiness };
