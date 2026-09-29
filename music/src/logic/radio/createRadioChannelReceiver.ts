// RADIO-01 -- extracted from radioChannelReceiverRuntime.ts's own former
// top-level script body, unchanged in behavior. This factory is the ONE
// canonical listener-receiver implementation -- constructed fresh by a
// standalone document's own bootstrap script exactly as before, OR
// constructed ONCE by persistent HOME (homeRadioSession.ts) and reused
// across every hosted surface swap. Never a second/parallel engine
// implementation for either case -- both paths call this same function.
//
// Owns NO clock, NO Program/track resolution, and NO playback-position
// authority of its own -- every decision is delegated to the existing
// RADIO resolver chain (resolveChannelTrackBroadcast -> resolveChannelRotation),
// exactly as before extraction. A receiver, never a second broadcast
// authority.
//
// RADIO-04 (batch 0929-6) -- the real listener path now resolves through
// resolveChannelTrackBroadcastWithSchedule instead of
// resolveChannelTrackBroadcast directly, via a thin closure
// (`resolveWithSchedule` below) that partially applies the schedule
// repository and otherwise has the EXACT SAME signature
// channelListenerPlayback.ts's own `resolve?: typeof resolveChannelTrackBroadcast`
// injection point already expects -- zero changes to that file. When no
// scheduled block is active, this wrapper delegates 100% to
// resolveChannelTrackBroadcast unchanged (see radioScheduleBroadcastPriority.ts's
// own doc); a scheduled Program only ever WINS during its own window,
// never mutates Channel rotation.

import {
  createFirebaseEventRadioRepository,
  createFirebaseRadioChannelRepository,
  createFirebaseRadioScheduleRepository,
} from "@studiorich/member-identity";
import type { RadioWebManifest } from "../../data/radioWebBundleTypes";
import { DualDeckPlaybackEngine } from "../../audio/DualDeckPlaybackEngine";
import {
  createChannelListenerPlaybackController,
  type ChannelListenerPlaybackController,
  type ChannelListenerPlaybackOutcome,
} from "./channelListenerPlayback";
import { resolveChannelTrackBroadcastWithSchedule } from "./radioScheduleBroadcastPriority";
import type { ResolveChannelTrackBroadcastInput } from "./channelTrackBroadcast";

/** The one canonical production Channel -- see docs/architecture/radio/README.md. Never a second Channel identity invented here. */
const CHANNEL_ID = "studiorich-radio";

/** Personal, local-only preference -- explicitly not a broadcast-authority concern. Origin-scoped localStorage, so it is already correctly shared between HOME and any hosted surface (same origin), with no extra wiring. */
const VOLUME_STORAGE_KEY = "wos:radioChannel:volume";

export type RadioChannelReceiverState =
  | { readonly status: "off"; readonly live: boolean }
  | { readonly status: "on"; readonly live: boolean; readonly nowPlaying: { readonly title: string; readonly artist: string } | null }
  | { readonly status: "failed"; readonly live: boolean; readonly reason: string };

export interface RadioChannelReceiver {
  turnOn(): void;
  turnOff(): void;
  setVolume(value: number): void;
  getVolume(): number;
  isOn(): boolean;
  subscribe(listener: RadioChannelReceiverListener): () => void;
}

export type RadioChannelReceiverListener = (state: RadioChannelReceiverState) => void;

function readStoredVolume(): number {
  try {
    const raw = window.localStorage.getItem(VOLUME_STORAGE_KEY);
    const parsed = raw === null ? NaN : Number(raw);
    return Number.isFinite(parsed) ? Math.min(1, Math.max(0, parsed)) : 1;
  } catch {
    return 1;
  }
}

function storeVolume(value: number): void {
  try {
    window.localStorage.setItem(VOLUME_STORAGE_KEY, String(value));
  } catch {
    // Storage unavailable -- volume simply won't persist across reload.
  }
}

/**
 * The ONE canonical receiver implementation. Each call creates a fresh,
 * independent instance (its own engine/controller/listeners) -- callers
 * decide the LIFETIME (a standalone document constructs one per page load
 * and lets it die with the page; persistent HOME constructs exactly one
 * and keeps it for the document's own lifetime, handing the SAME instance
 * to every surface that mounts).
 */
export function createRadioChannelReceiver(): RadioChannelReceiver {
  const radioChannelRepository = createFirebaseRadioChannelRepository(import.meta.env);
  const eventRadioRepository = createFirebaseEventRadioRepository(import.meta.env);
  const radioScheduleRepository = createFirebaseRadioScheduleRepository(import.meta.env);

  // Same signature as resolveChannelTrackBroadcast itself -- satisfies
  // channelListenerPlayback.ts's existing `resolve?: typeof
  // resolveChannelTrackBroadcast` injection point unchanged.
  function resolveWithSchedule(input: ResolveChannelTrackBroadcastInput) {
    return resolveChannelTrackBroadcastWithSchedule({ ...input, radioScheduleRepository });
  }

  async function fetchManifest(manifestBaseUrl: string): Promise<RadioWebManifest> {
    const response = await fetch(`${manifestBaseUrl}radio-manifest.json`);
    if (!response.ok) throw new Error(`manifest fetch failed: ${response.status}`);
    return (await response.json()) as RadioWebManifest;
  }

  let controller: ChannelListenerPlaybackController | null = null;
  let engine: DualDeckPlaybackEngine | null = null;
  let live = false;
  let state: RadioChannelReceiverState = { status: "off", live: false };
  const listeners = new Set<RadioChannelReceiverListener>();

  function setState(next: RadioChannelReceiverState): void {
    state = next;
    listeners.forEach((listener) => listener(state));
  }

  // "● LIVE RADIO" describes the BROADCAST, not the local receiver -- this
  // must keep polling regardless of on/off, per the doctrine that a visual
  // toggle is never a security/authority boundary and receiver state never
  // implies broadcast state. Reuses the existing repository read only --
  // no new resolver, no new authority.
  async function pollLiveStatus(): Promise<void> {
    try {
      const channel = await radioChannelRepository.getRadioChannel(CHANNEL_ID);
      const nextLive = channel?.status === "active";
      if (nextLive === live) return;
      live = nextLive;
      setState({ ...state, live });
    } catch {
      // A transient read failure never flips LIVE to false on its own --
      // only an actual "inactive"/absent Channel does. Leaves `live` as its
      // last known value, same "authority, not availability" posture RADIO
      // uses everywhere else.
    }
  }

  async function lookupNowPlayingMetadata(programManifestBaseUrl: string, trackId: string): Promise<{ title: string; artist: string } | null> {
    try {
      const manifest = await fetchManifest(programManifestBaseUrl);
      const entry = manifest.entries.find((candidate) => candidate.radioTrackId === trackId);
      return entry ? { title: entry.title, artist: entry.artist } : null;
    } catch {
      return null;
    }
  }

  async function handleOutcome(outcome: ChannelListenerPlaybackOutcome): Promise<void> {
    if (outcome.status !== "started") {
      setState({ status: "failed", live, reason: outcome.reason });
      return;
    }
    const programs = await eventRadioRepository.listRadioPrograms().catch(() => []);
    const program = programs.find((candidate) => candidate.id === outcome.programId);
    const nowPlaying = program ? await lookupNowPlayingMetadata(program.manifestBaseUrl, outcome.trackId) : null;
    setState({ status: "on", live, nowPlaying });
  }

  async function turnOn(): Promise<void> {
    if (controller) return; // ON is idempotent -- never a second engine/controller
    engine = new DualDeckPlaybackEngine();
    engine.setMasterVolume(readStoredVolume());
    // URGENT REGRESSION FIX -- must run synchronously, before the first
    // `await` below, so it stays inside the click's own transient user-
    // activation window. See DualDeckPlaybackEngine.primeForUserGesture's
    // own doc for why the later real playDeck() call needs this. RADIO-01:
    // this holds even when `turnOn()` is called across the same-origin
    // HOME/child window boundary -- the call itself is an ordinary
    // synchronous function invocation, not a message/async dispatch, so it
    // still executes inside the original click's own call stack. See
    // HOST-00's own findings in HOME_PERSISTENT_HOST_V1.md.
    engine.primeForUserGesture();
    controller = createChannelListenerPlaybackController({
      channelId: CHANNEL_ID,
      radioChannelRepository,
      eventRadioRepository,
      fetchManifest,
      engine,
      resolve: resolveWithSchedule,
    });
    controller.subscribe((outcome) => void handleOutcome(outcome));
    setState({ status: "on", live, nowPlaying: null });
    const outcome = await controller.play();
    void handleOutcome(outcome);
  }

  // OFF means stop/destroy -- no paused position is ever preserved. A later
  // ON always re-resolves the Channel's CURRENT shared-clock position, never
  // a locally-remembered offset.
  function turnOff(): void {
    if (!controller) {
      setState({ status: "off", live });
      return;
    }
    controller.destroy();
    controller = null;
    engine = null;
    setState({ status: "off", live });
  }

  function setVolume(value: number): void {
    const clamped = Math.min(1, Math.max(0, value));
    storeVolume(clamped);
    engine?.setMasterVolume(clamped);
  }

  void pollLiveStatus();
  window.setInterval(() => void pollLiveStatus(), 10000);

  return {
    turnOn: () => void turnOn(),
    turnOff,
    setVolume,
    getVolume: readStoredVolume,
    isOn: () => controller !== null,
    subscribe(listener: RadioChannelReceiverListener): () => void {
      listeners.add(listener);
      listener(state);
      return () => listeners.delete(listener);
    },
  };
}

/**
 * RADIO-01 -- the explicit, fail-closed stand-in for a hosted surface whose
 * request for the persistent HOME session was rejected (stale/wrong
 * runtime identity, HOME unavailable, etc.). Never constructs an engine,
 * never plays anything, never falls back to a locally-owned
 * `createRadioChannelReceiver()` -- exactly the "no silent fallback /
 * duplicate playback ownership" requirement this checkpoint exists to
 * satisfy. `turnOn()` immediately reports the same `"failed"` state shape
 * every other RADIO failure already uses, so `radioChannelHud.js`/
 * `blackbookRadioUI.ts` render it with their existing, unmodified failure
 * handling -- no new UI branch needed.
 */
export function createFailedRadioChannelReceiver(reason: string): RadioChannelReceiver {
  let state: RadioChannelReceiverState = { status: "off", live: false };
  const listeners = new Set<RadioChannelReceiverListener>();
  function setState(next: RadioChannelReceiverState): void {
    state = next;
    listeners.forEach((listener) => listener(state));
  }
  return {
    turnOn: () => setState({ status: "failed", live: false, reason }),
    turnOff: () => setState({ status: "off", live: false }),
    setVolume: () => {},
    getVolume: readStoredVolume,
    isOn: () => false,
    subscribe(listener: RadioChannelReceiverListener): () => void {
      listeners.add(listener);
      listener(state);
      return () => listeners.delete(listener);
    },
  };
}
