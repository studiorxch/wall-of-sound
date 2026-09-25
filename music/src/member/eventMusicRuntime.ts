/**
 * Event Music + Clock Radio Foundation V1 -- the minimum integration point
 * that lets Blackbook play a real StudioRich MUSIC playlist while the
 * member draws, without owning a second playback system or being coupled
 * to any Artwork.
 *
 * REUSE, NOT REINVENTION: this drives the SAME `DualDeckPlaybackEngine`
 * MUSIC's own prepared-playback path and the existing RADIO web player
 * (`radioPlayerMain.ts`) already use, via the SAME proven first-track
 * start sequence (`radioPlayerStartSequence.ts`'s `restoreGainAndStartDeck`)
 * and the SAME continuous-advance pattern (`executeHardCut` on natural
 * `ended`). No new playback engine, no new transition logic, no new audio
 * format -- this module is only the wiring between that existing engine,
 * an existing published `RadioWebManifest` bundle, and Blackbook's own
 * small Now-Playing UI island.
 *
 * LIFECYCLE INDEPENDENCE (this build's own core requirement): this module
 * is a plain top-level singleton, initialized exactly once when
 * blackbook.html loads it as its own <script type="module"> tag --
 * completely outside `blackbookRuntime.ts`'s Artwork/page lifecycle
 * (`currentArtwork`, `hydrate()`, NEW, MY PAGES, `openArtwork`). Switching,
 * creating, or reopening an Artwork never touches this module's state, so
 * the engine, deck, and playback position it owns simply keep running.
 *
 * TWO PLAYBACK MODES (this build's own architecture requirement):
 * - "personal": ordinary continuous playback from track 0, listener owns
 *   local pause/resume (`pauseAll`/`resumeAll`).
 * - "clock": an authoritative program timeline (`radioProgramClock.ts`)
 *   determines what should currently be playing; a joining listener
 *   resolves the current track + offset and starts THERE (`preload`'s own
 *   `cueStartSeconds`), never restarting Track 1 for a late arrival.
 *
 * AUTHORITATIVE TIME (V1): `Date.now()` -- the same wall-clock time source
 * `radioProgramClock.ts`'s own doc documents as this build's declared V1
 * authority. No server-time endpoint exists in this codebase to consult
 * instead (see this build's own recon report); this is a documented V1
 * choice, not an oversight, and the resolver itself is authority-source
 * agnostic (it only ever consumes a `nowMs` number).
 */

import { DualDeckPlaybackEngine } from "../audio/DualDeckPlaybackEngine";
import type { RadioWebManifest, RadioWebManifestEntry } from "../data/radioWebBundleTypes";
import { restoreGainAndStartDeck, tryAcquireStartLock, type DeckId } from "../radioPlayerStartSequence";
import { loadEventProgramConfig, type EventProgramConfig } from "./eventProgramConfig";
import { TOLERATED_DRIFT_SECONDS, CORRECTABLE_DRIFT_SECONDS } from "../logic/radio/radioProgramClock";
import { readRadioResumableSession, writeRadioResumableSession, type RadioResumableSession } from "../audio/radioResumableSession";
import { resolveBroadcastState, type BroadcastProgramInput } from "../logic/radio/resolvedBroadcastState";

function required<T>(value: T | null, error: string): T { if (!value) throw new Error(error); return value; }

const toggleButton = document.querySelector<HTMLButtonElement>("#event-music-toggle");
const titleEl = document.querySelector<HTMLElement>("#event-music-title");
const artistEl = document.querySelector<HTMLElement>("#event-music-artist");

// A page that hasn't added the Now Playing island yet (or a different host
// page reusing this same runtime) degrades to a silent no-op rather than
// throwing -- this module must never be the reason Blackbook's drawing
// surface fails to load.
const hasUI = toggleButton !== null && titleEl !== null && artistEl !== null;

function setStatus(title: string, artist: string): void {
  if (titleEl) titleEl.textContent = title;
  if (artistEl) artistEl.textContent = artist;
}

let config: EventProgramConfig | null = null;
let manifest: RadioWebManifest | null = null;
let engine: DualDeckPlaybackEngine | null = null;
let activeDeck: DeckId = "A";
let incomingDeck: DeckId = "B";
let activeIndex = -1;
let incomingIndex = -1;
let isPlaying = false;
let firstTrackSettled = false;
const startLock = { current: false };

function otherDeck(deck: DeckId): DeckId {
  return deck === "A" ? "B" : "A";
}

function buildSourceUrl(entry: RadioWebManifestEntry): string {
  return required(config, "event_program_config_missing").manifestBaseUrl + entry.audioUrl;
}

/** The `BroadcastProgramInput` `resolveBroadcastState` needs, built from the already-resolved `EventProgramConfig` -- see resolvedBroadcastState.ts's own doc for why this omits Firestore-only bookkeeping fields. `programId` is null: this config shape never carried one. */
function broadcastProgramInput(): BroadcastProgramInput {
  const current = required(config, "event_program_config_missing");
  return { programId: null, playbackMode: current.playbackMode, startAtMs: current.startAtMs, endPolicy: current.endPolicy };
}

function displayNowPlaying(entry: RadioWebManifestEntry): void {
  setStatus(entry.title, entry.artist || "StudioRich");
  if (toggleButton) toggleButton.textContent = "⏸";
}

/**
 * MAP / Blackbook / RADIO Integration Beta: writes the resumable session on
 * every meaningful playback event (track start/advance, pause, resume) --
 * see radioResumableSession.ts's own doc for why sessionStorage, and why
 * CLOCK mode still writes one despite never reading it back for position.
 * A missing `sessionStorage` (e.g. a non-browser test environment) is a
 * silent no-op, matching this module's existing "never break the drawing
 * surface" posture.
 */
function persistSession(): void {
  if (!engine || !manifest || !config || activeIndex === -1) return;
  const entry = manifest.entries[activeIndex];
  if (!entry) return;
  const session: RadioResumableSession = {
    schemaVersion: 1,
    manifestBaseUrl: config.manifestBaseUrl,
    trackId: entry.radioTrackId,
    trackIndex: activeIndex,
    offsetSeconds: engine.getCurrentTime(activeDeck),
    referenceAtMs: Date.now(),
    isPlaying,
    volume: 1,
    playbackMode: config.playbackMode,
  };
  try {
    writeRadioResumableSession(window.sessionStorage, session);
  } catch {
    // sessionStorage unavailable (private mode, disabled storage) -- resuming just starts fresh next time.
  }
}

/** Preloads (only) the first entry from `fromIndex` that loads successfully, at `cueStartSeconds`, into `deckId` -- never stops the whole station over one bad file. */
async function preloadFirstAvailable(deckId: DeckId, fromIndex: number, cueStartSeconds = 0): Promise<number> {
  if (!manifest || !engine) return -1;
  for (let i = fromIndex; i < manifest.entries.length; i += 1) {
    const entry = manifest.entries[i];
    try {
      await engine.preload(deckId, { trackId: entry.radioTrackId, slotId: entry.radioTrackId, sourceUrl: buildSourceUrl(entry), cueStartSeconds: i === fromIndex ? cueStartSeconds : 0 });
      return i;
    } catch {
      // try the next entry
    }
  }
  return -1;
}

async function queueNextAfter(index: number): Promise<void> {
  incomingIndex = await preloadFirstAvailable(incomingDeck, index + 1);
}

async function advanceOrStop(): Promise<void> {
  if (!manifest || !engine) return;
  if (incomingIndex === -1) {
    setStatus("Event music ended", "");
    isPlaying = false;
    if (toggleButton) toggleButton.textContent = "▶";
    return;
  }
  const result = await engine.executeHardCut(`event-${Date.now()}`, activeDeck, incomingDeck, "media_ended");
  if (result.executed) {
    activeDeck = otherDeck(activeDeck);
    incomingDeck = otherDeck(activeDeck);
    activeIndex = incomingIndex;
    incomingIndex = -1;
    displayNowPlaying(manifest.entries[activeIndex]);
    persistSession();
    void queueNextAfter(activeIndex);
  } else {
    incomingIndex = await preloadFirstAvailable(incomingDeck, incomingIndex + 1);
    await advanceOrStop();
  }
}

/**
 * Resolves where THIS session should start, via the canonical
 * `resolveBroadcastState` resolver (Batch 02C) -- Clock mode's track+offset
 * or Personal mode's matching-session track+offset when the resolver
 * returns `"playing"`, falling back to track 0 at offset 0 for every other
 * resolved status (`inactive`/`before-start`/`ended`/`empty`) exactly as
 * this function already did before this refactor, rather than refusing to
 * play at all.
 */
function resolveStartPosition(): { index: number; offsetSeconds: number } {
  if (!config) return { index: 0, offsetSeconds: 0 };
  const resolved = resolveBroadcastState({
    program: broadcastProgramInput(),
    manifestBaseUrl: config.manifestBaseUrl,
    manifest,
    nowMs: Date.now(),
    resumableSession: readSessionSafely(),
  });
  if (resolved.status === "playing") return { index: resolved.trackIndex, offsetSeconds: resolved.offsetSeconds };
  return { index: 0, offsetSeconds: 0 };
}

function readSessionSafely(): RadioResumableSession | null {
  try {
    return readRadioResumableSession(window.sessionStorage);
  } catch {
    return null;
  }
}

async function startPlayback(): Promise<void> {
  if (!manifest || !engine) return;
  const { index: startIndex, offsetSeconds } = resolveStartPosition();

  for (let i = startIndex; i < manifest.entries.length; i += 1) {
    const entry = manifest.entries[i];
    try {
      await engine.preload(activeDeck, { trackId: entry.radioTrackId, slotId: entry.radioTrackId, sourceUrl: buildSourceUrl(entry), cueStartSeconds: i === startIndex ? offsetSeconds : 0 });
    } catch {
      continue;
    }
    const outcome = await restoreGainAndStartDeck(engine, activeDeck);
    if (!outcome.ok) continue;

    activeIndex = i;
    displayNowPlaying(entry);
    firstTrackSettled = true;
    isPlaying = true;
    persistSession();
    void queueNextAfter(activeIndex);
    return;
  }
  setStatus("Event music unavailable", "");
}

function togglePlayPause(): void {
  if (!hasUI) return;

  if (!engine) {
    if (!tryAcquireStartLock(startLock)) return;
    engine = new DualDeckPlaybackEngine();
    engine.onDeckEnded((deckId) => {
      if (!firstTrackSettled || deckId !== activeDeck) return;
      void advanceOrStop();
    });
    if (toggleButton) toggleButton.textContent = "…";
    void startPlayback();
    return;
  }

  if (isPlaying) {
    engine.pauseAll();
    isPlaying = false;
    if (toggleButton) toggleButton.textContent = "▶";
    persistSession();
  } else {
    void engine.resumeAll();
    isPlaying = true;
    if (toggleButton) toggleButton.textContent = "⏸";
    persistSession();
  }
}

/**
 * DRIFT CHECK (V1): compares the active deck's own reported time against a
 * fresh clock resolution every 20s (never per-frame) -- see
 * radioProgramClock.ts's own drift-policy doc for the tolerated/correctable
 * thresholds and why no periodic seeking happens for ordinary jitter. Only
 * "clock" mode has an authoritative position to drift FROM; "personal"
 * mode has no shared timeline to correct against and is skipped entirely.
 */
function checkDrift(): void {
  if (!engine || !manifest || !isPlaying || !config || config.playbackMode !== "clock" || config.startAtMs === null) return;
  const resolved = resolveBroadcastState({
    program: broadcastProgramInput(),
    manifestBaseUrl: config.manifestBaseUrl,
    manifest,
    nowMs: Date.now(),
    resumableSession: null,
  });
  if (resolved.status !== "playing" || resolved.trackIndex !== activeIndex) return;
  const localSeconds = engine.getCurrentTime(activeDeck);
  const drift = Math.abs(localSeconds - resolved.offsetSeconds);
  if (drift > CORRECTABLE_DRIFT_SECONDS) {
    engine.seekDeck(activeDeck, resolved.offsetSeconds);
  } else if (drift > TOLERATED_DRIFT_SECONDS) {
    // eslint-disable-next-line no-console -- V1 reports only; no audible correction (see module doc).
    console.info(`[event-music] drift ${drift.toFixed(1)}s (tolerated, not corrected)`);
  }
}

async function initialize(): Promise<void> {
  if (!hasUI) return;
  config = await loadEventProgramConfig(import.meta.env);
  try {
    const response = await fetch(`${config.manifestBaseUrl}radio-manifest.json`);
    if (!response.ok) throw new Error(`manifest fetch failed: ${response.status}`);
    manifest = (await response.json()) as RadioWebManifest;
  } catch (error) {
    setStatus("Event music unavailable", "");
    console.error("[event-music] failed to load program manifest", error);
    return;
  }
  if (manifest.entries.length === 0) {
    setStatus("Event music unavailable", "");
    return;
  }
  setStatus(manifest.title || "Event Music", `${manifest.entries.length} tracks — tap play`);
  if (toggleButton) {
    toggleButton.disabled = false;
    toggleButton.addEventListener("click", togglePlayPause);
  }
  window.setInterval(checkDrift, 20_000);
}

void initialize();
