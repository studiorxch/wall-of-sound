/**
 * β0.1 -- BLACKBOOK's own wiring for the canonical RADIO Channel receiver.
 * Reads/controls ONLY through window.SBE.RadioChannelReceiver (constructed
 * by radioChannelReceiverRuntime.ts, imported as a sibling <script> in
 * blackbook.html -- the exact same bridge MAP's radioChannelHud.js already
 * uses). This file computes NOTHING about Channel/Program/track
 * resolution -- no clock, no resolver, no playback-position authority of
 * its own. BLACKBOOK is a receiver, same as MAP; both read the one shared
 * "studiorich-radio" broadcast.
 */
import type { RadioChannelReceiver, RadioChannelReceiverState } from "./radioChannelReceiverRuntime";

function required<T>(value: T | null, error: string): T { if (!value) throw new Error(error); return value; }

const liveEl = required(document.querySelector<HTMLElement>("#event-music-live"), "blackbook_radio_surface_missing");
const toggleButton = required(document.querySelector<HTMLButtonElement>("#event-music-toggle"), "blackbook_radio_surface_missing");
const volumeInput = required(document.querySelector<HTMLInputElement>("#event-music-volume"), "blackbook_radio_surface_missing");
const titleEl = required(document.querySelector<HTMLElement>("#event-music-title"), "blackbook_radio_surface_missing");
const artistEl = required(document.querySelector<HTMLElement>("#event-music-artist"), "blackbook_radio_surface_missing");

function render(state: RadioChannelReceiverState): void {
  liveEl.setAttribute("data-live", String(state.live));
  const isOn = state.status === "on";
  toggleButton.setAttribute("data-on", String(isOn));
  toggleButton.textContent = isOn ? "RADIO ON" : "RADIO OFF";
  if (isOn && state.nowPlaying) {
    titleEl.textContent = state.nowPlaying.title;
    artistEl.textContent = state.nowPlaying.artist;
  } else if (state.status === "failed") {
    // Represent a genuinely inactive/unavailable Channel truthfully --
    // never silently fall back to local playback or a fabricated title.
    titleEl.textContent = "RADIO unavailable";
    artistEl.textContent = state.reason;
  } else {
    titleEl.textContent = "";
    artistEl.textContent = "";
  }
}

function init(attempt = 0): void {
  const receiver = (window as unknown as { SBE?: { RadioChannelReceiver?: RadioChannelReceiver } }).SBE?.RadioChannelReceiver;
  if (!receiver) {
    if (attempt < 100) window.setTimeout(() => init(attempt + 1), 50);
    return;
  }
  volumeInput.value = String(receiver.getVolume());
  toggleButton.addEventListener("click", () => {
    if (receiver.isOn()) receiver.turnOff();
    else receiver.turnOn();
  });
  volumeInput.addEventListener("input", (event) => {
    receiver.setVolume(parseFloat((event.target as HTMLInputElement).value));
  });
  receiver.subscribe(render);
}
init();
