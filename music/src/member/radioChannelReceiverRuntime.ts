// MAP × RADIO -- Production synchronized listener integration. The bridge
// that lets `wall/`'s own plain-JavaScript runtime (which cannot import an
// npm package directly -- same reason `subwayMemberRuntime.ts` exists for
// member identity) tune into the ONE canonical RADIO Channel using the
// SAME production-proven listener implementation `channel-radio.html`
// already uses (`createChannelListenerPlaybackController` +
// `DualDeckPlaybackEngine`). This file owns NO clock, NO Program/track
// resolution, and NO playback-position authority of its own -- every
// decision is delegated to the existing RADIO resolver chain
// (resolveChannelTrackBroadcast -> resolveChannelRotation), exactly as
// `channelRadioMain.ts` already does. MAP is a receiver, never a second
// broadcast authority.
//
// Published onto window.SBE.RadioChannelReceiver (control) and
// window.SBE.RadioChannelReceiverState (read-only snapshot) -- same
// convention subwayMemberRuntime.ts already uses for MemberIdentityState.

import {
  createFirebaseEventRadioRepository,
  createFirebaseRadioChannelRepository,
} from "@studiorich/member-identity";
import type { RadioWebManifest } from "../data/radioWebBundleTypes";
import { DualDeckPlaybackEngine } from "../audio/DualDeckPlaybackEngine";
import {
  createChannelListenerPlaybackController,
  type ChannelListenerPlaybackController,
  type ChannelListenerPlaybackOutcome,
} from "../logic/radio/channelListenerPlayback";

/** The one canonical production Channel -- see docs/architecture/radio/README.md. Never a second Channel identity invented here. */
const CHANNEL_ID = "studiorich-radio";

/** Personal, local-only preference -- explicitly not a broadcast-authority concern. */
const VOLUME_STORAGE_KEY = "wos:radioChannel:volume";

// Exported so any other real Vite/TS receiver (e.g. blackbookRadioUI.ts)
// can type window.SBE.RadioChannelReceiver precisely instead of casting to
// `unknown` -- the runtime object itself is unchanged, this is type-only.
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
  subscribe(listener: Listener): () => void;
}

type Listener = (state: RadioChannelReceiverState) => void;

interface RootWithSBE {
  SBE?: {
    RadioChannelReceiver?: unknown;
    RadioChannelReceiverState?: RadioChannelReceiverState;
  };
}

const root = window as unknown as RootWithSBE;
root.SBE = root.SBE || {};

const radioChannelRepository = createFirebaseRadioChannelRepository(import.meta.env);
const eventRadioRepository = createFirebaseEventRadioRepository(import.meta.env);

async function fetchManifest(manifestBaseUrl: string): Promise<RadioWebManifest> {
  const response = await fetch(`${manifestBaseUrl}radio-manifest.json`);
  if (!response.ok) throw new Error(`manifest fetch failed: ${response.status}`);
  return (await response.json()) as RadioWebManifest;
}

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

let controller: ChannelListenerPlaybackController | null = null;
let engine: DualDeckPlaybackEngine | null = null;
let live = false;
let state: RadioChannelReceiverState = { status: "off", live: false };
const listeners = new Set<Listener>();

function setState(next: RadioChannelReceiverState): void {
  state = next;
  root.SBE!.RadioChannelReceiverState = state;
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
  controller = createChannelListenerPlaybackController({
    channelId: CHANNEL_ID,
    radioChannelRepository,
    eventRadioRepository,
    fetchManifest,
    engine,
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

root.SBE.RadioChannelReceiver = {
  turnOn: () => void turnOn(),
  turnOff,
  setVolume,
  getVolume: readStoredVolume,
  isOn: () => controller !== null,
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    listener(state);
    return () => listeners.delete(listener);
  },
};
setState(state);

void pollLiveStatus();
window.setInterval(() => void pollLiveStatus(), 10000);
