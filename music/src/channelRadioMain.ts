/**
 * Batch 02S -- RADIO Deterministic Listener Playback proof surface.
 * Proves: listener presses Play -> resolveChannelTrackBroadcast() ->
 * authoritative Program/Track/offset -> DualDeckPlaybackEngine -> audible
 * RADIO. No sign-in (radioPrograms/radioChannels are public-read, same as
 * every other public RADIO surface). Does not replace or modify
 * radioPlayerMain.ts's own slug+v package-player.
 */

import { createFirebaseEventRadioRepository, createFirebaseRadioChannelRepository } from "@studiorich/member-identity";
import { DualDeckPlaybackEngine } from "./audio/DualDeckPlaybackEngine";
import type { RadioWebManifest } from "./data/radioWebBundleTypes";
import { createChannelListenerPlaybackController, type ChannelListenerPlaybackOutcome } from "./logic/radio/channelListenerPlayback";

/** Same fixed V1 Channel identity Channel Control itself assumes. */
const CHANNEL_ID = "studiorich-radio";

function required<T>(value: T | null, error: string): T { if (!value) throw new Error(error); return value; }

const playButton = required(document.querySelector<HTMLButtonElement>("#play"), "channel_radio_surface_missing");
const headlineEl = required(document.querySelector<HTMLElement>("#diagnostic-headline"), "channel_radio_surface_missing");
const detailEl = required(document.querySelector<HTMLElement>("#diagnostic-detail"), "channel_radio_surface_missing");
const fieldsEl = required(document.querySelector<HTMLElement>("#diagnostic-fields"), "channel_radio_surface_missing");
const programEl = required(document.querySelector<HTMLElement>("#diagnostic-program"), "channel_radio_surface_missing");
const trackEl = required(document.querySelector<HTMLElement>("#diagnostic-track"), "channel_radio_surface_missing");

const radioChannelRepository = createFirebaseRadioChannelRepository(import.meta.env);
const eventRadioRepository = createFirebaseEventRadioRepository(import.meta.env);

/** Same path-string fetch convention every other RADIO surface uses. */
async function fetchManifest(manifestBaseUrl: string): Promise<RadioWebManifest> {
  const response = await fetch(`${manifestBaseUrl}radio-manifest.json`);
  if (!response.ok) throw new Error(`manifest fetch failed: ${response.status}`);
  return (await response.json()) as RadioWebManifest;
}

function renderOutcome(outcome: ChannelListenerPlaybackOutcome): void {
  if (outcome.status === "started") {
    headlineEl.textContent = "ON AIR";
    headlineEl.dataset.kind = "on-air";
    detailEl.textContent = "";
    fieldsEl.hidden = false;
    programEl.textContent = outcome.programId;
    trackEl.textContent = outcome.trackId;
  } else {
    headlineEl.textContent = outcome.reason === "channel-inactive" ? "INACTIVE" : outcome.reason === "before-start" ? "BEFORE START" : "ERROR";
    headlineEl.dataset.kind = outcome.reason === "channel-inactive" ? "inactive" : outcome.reason === "before-start" ? "before-start" : "error";
    detailEl.textContent = `RADIO authority: ${outcome.reason}`;
    fieldsEl.hidden = true;
  }
}

// Engine (and its AudioContext) is created lazily, on the explicit Play
// gesture -- never before -- same posture as every other real playback
// entry point in this codebase (radioPlayerMain.ts/eventMusicRuntime.ts).
let controller: ReturnType<typeof createChannelListenerPlaybackController> | null = null;

playButton.addEventListener("click", () => {
  if (controller) return; // repeated Play never creates a second engine/controller
  playButton.disabled = true;
  playButton.textContent = "Starting…";

  const engine = new DualDeckPlaybackEngine();
  // URGENT REGRESSION FIX -- see DualDeckPlaybackEngine.primeForUserGesture's
  // own doc: must run synchronously, inside this click handler, before the
  // async Channel/Program/manifest resolution below (controller.play())
  // can outlast the browser's transient user-activation window.
  engine.primeForUserGesture();
  controller = createChannelListenerPlaybackController({
    channelId: CHANNEL_ID,
    radioChannelRepository,
    eventRadioRepository,
    fetchManifest,
    engine,
  });
  controller.subscribe(renderOutcome);

  void controller.play().then((outcome) => {
    playButton.hidden = outcome.status === "started";
    if (outcome.status !== "started") {
      playButton.disabled = false;
      playButton.textContent = "Play Radio";
      controller = null; // allow retry after a failure
    }
  });
});

playButton.disabled = false;
playButton.textContent = "Play Radio";
