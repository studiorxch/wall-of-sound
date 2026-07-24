// RADIO Web Playback Vertical Slice — the smallest public listener page:
// fetch an already-published RadioWebManifest (radioWebBundleWriter.ts's
// own output, now served by the /radio-web-export static route added in
// vite.config.ts), then drive the SAME DualDeckPlaybackEngine MUSIC's own
// prepared-playback path uses to play it continuously across track
// boundaries. No new playback engine, no new transition logic: every
// advance is DualDeckPlaybackEngine.executeHardCut — the identical method
// both the active DJ adapter's clean_cut strategy and MUSIC's own legacy
// hard-cut fallback already call. This playlist has no approved
// DjTransitionPlan bound to any pair (RADIO has no such data today), so
// every transition here legitimately takes the legacy path — that is
// disclosed in the on-screen status line rather than faked.
//
// First-track startup: preload() always leaves a deck silent (gain 0) —
// correct for a crossfade's incoming deck, wrong for a track that will
// never go through executeHardCut (which is the only place gain gets
// restored). See radioPlayerStartSequence.ts for the fix — the exact
// preload → restore gain → play → confirm REAL audible readiness sequence
// usePreparedPlaybackController.ts's own non-crossfade handoff already
// uses, reused here rather than reinvented.

import { DualDeckPlaybackEngine } from "./audio/DualDeckPlaybackEngine";
import type { RadioWebManifest, RadioWebManifestEntry } from "./data/radioWebBundleTypes";
import { startFirstAvailableTrack, tryAcquireStartLock } from "./radioPlayerStartSequence";

const params = new URLSearchParams(window.location.search);
const slug = params.get("slug") ?? "new-playlist";
const version = params.get("v") ?? "1";
const bundleBase = `/radio-web-export/${encodeURIComponent(slug)}/v${encodeURIComponent(version)}/`;

const root = document.getElementById("radio-root")!;
root.innerHTML = `
  <div style="text-align:center">
    <div style="font-size:12px;letter-spacing:0.15em;text-transform:uppercase;opacity:0.5;margin-bottom:8px">StudioRich Radio</div>
    <div id="rp-title" style="font-size:20px;font-weight:600;min-height:26px">Loading station…</div>
    <div id="rp-artist" style="font-size:14px;opacity:0.7;min-height:18px"></div>
    <button id="rp-play" style="margin-top:24px;padding:14px 32px;font-size:16px;border-radius:999px;border:none;background:#e8e8ec;color:#0a0a0c;cursor:pointer" disabled>Loading…</button>
    <div id="rp-status" style="margin-top:20px;font-size:12px;opacity:0.5;line-height:1.6"></div>
  </div>
`;

const titleEl = document.getElementById("rp-title")!;
const artistEl = document.getElementById("rp-artist")!;
const playBtn = document.getElementById("rp-play") as HTMLButtonElement;
const statusEl = document.getElementById("rp-status")!;

function setStatus(line: string) {
  statusEl.textContent = line;
}

function buildSourceUrl(entry: RadioWebManifestEntry): string {
  return bundleBase + entry.audioUrl;
}

let manifest: RadioWebManifest | null = null;

async function loadManifest() {
  const res = await fetch(bundleBase + "radio-manifest.json");
  if (!res.ok) throw new Error(`manifest fetch failed: ${res.status}`);
  manifest = (await res.json()) as RadioWebManifest;
  if (manifest.entries.length === 0) throw new Error("station has no playable entries");
  titleEl.textContent = manifest.title || "Untitled Station";
  artistEl.textContent = `${manifest.entries.length} tracks`;
  playBtn.disabled = false;
  playBtn.textContent = "▶ Play";
}

loadManifest().catch((e) => {
  titleEl.textContent = "Station unavailable";
  setStatus(String(e instanceof Error ? e.message : e));
});

// ── Playback ────────────────────────────────────────────────────────────

let engine: DualDeckPlaybackEngine | null = null;
let activeDeck: "A" | "B" = "A";
let incomingDeck: "A" | "B" = "B";
let activeIndex = -1; // index into manifest.entries currently on activeDeck
let incomingIndex = -1; // index queued on incomingDeck, or -1 if none queued
let transitionCounter = 0;

// Synchronous UI-boundary lock — the actual rapid-double-click protection.
// Checked-and-set as the very first line of the click handler, before any
// engine lookup or async work, so a second click can never observe an
// engine-less state and race the first into constructing a second engine.
const startLock = { current: false };

// While the first track's start sequence is still resolving, its <audio>
// element may already be genuinely playing (just not yet gain-restored/
// confirmed audible) — a real `ended` firing during that window must NOT
// be allowed to advance the station before track 1 has even been
// committed as playing. Set true only once track 1 is confirmed audible.
let firstTrackSettled = false;

function otherDeck(d: "A" | "B"): "A" | "B" {
  return d === "A" ? "B" : "A";
}

function displayNowPlaying(entry: RadioWebManifestEntry) {
  titleEl.textContent = entry.title;
  artistEl.textContent = entry.artist;
}

// Preloads (only) entries starting at `fromIndex` into `deckId`, skipping
// any that fail, without ever stopping the station. Used solely to queue
// the NEXT (not-yet-audible, correctly-silent-by-design) deck ahead of an
// upcoming executeHardCut — never for the very first track, which needs
// the full gain-restore+confirm sequence in startFirstAvailableTrack.
async function preloadFirstAvailable(deckId: "A" | "B", fromIndex: number): Promise<number> {
  if (!manifest || !engine) return -1;
  for (let i = fromIndex; i < manifest.entries.length; i++) {
    const entry = manifest.entries[i];
    try {
      await engine.preload(deckId, {
        trackId: entry.radioTrackId,
        slotId: entry.radioTrackId,
        sourceUrl: buildSourceUrl(entry),
        cueStartSeconds: 0,
      });
      return i;
    } catch {
      setStatus(`Skipped unavailable track: ${entry.title}`);
    }
  }
  return -1;
}

async function queueNextAfter(index: number) {
  incomingIndex = await preloadFirstAvailable(incomingDeck, index + 1);
}

async function advanceOrStop() {
  if (!manifest) return;
  if (incomingIndex === -1) {
    setStatus("Station ended — no more playable tracks.");
    titleEl.textContent = "Station ended";
    artistEl.textContent = "";
    return;
  }
  const transitionId = `radio-${transitionCounter++}`;
  const result = await engine!.executeHardCut(transitionId, activeDeck, incomingDeck, "media_ended");
  if (result.executed) {
    activeDeck = otherDeck(activeDeck);
    incomingDeck = otherDeck(activeDeck);
    activeIndex = incomingIndex;
    incomingIndex = -1;
    displayNowPlaying(manifest.entries[activeIndex]);
    setStatus(`Strategy: hard_cut (legacy — no approved DJ plan for this pair) · ${activeIndex + 1}/${manifest.entries.length}`);
    void queueNextAfter(activeIndex);
  } else {
    // Incoming wasn't ready (e.g. its preload silently failed after being
    // queued, or the source errored post-load) — try the next track after
    // it instead of stalling the whole station, then retry the cut.
    setStatus(`Transition fallback (${result.reason}) — trying next track…`);
    incomingIndex = await preloadFirstAvailable(incomingDeck, incomingIndex + 1);
    await advanceOrStop();
  }
}

async function start() {
  if (!manifest || !engine) return;
  playBtn.disabled = true;
  playBtn.textContent = "Starting…";

  const result = await startFirstAvailableTrack(engine, manifest.entries, activeDeck, buildSourceUrl);

  if (result.startedIndex === null) {
    const reasons = result.skipped.map((s) => `"${s.title}": ${s.reason}`).join("; ");
    setStatus(`No track could start playing. ${reasons}`);
    titleEl.textContent = "Playback failed";
    playBtn.style.display = "none";
    return;
  }

  activeIndex = result.startedIndex;
  if (result.skipped.length > 0) {
    const reasons = result.skipped.map((s) => `"${s.title}": ${s.reason}`).join("; ");
    setStatus(`Skipped before start: ${reasons}`);
  }

  // Track 1 is genuinely, confirmedly audible now — only NOW commit it as
  // playing in the UI, and only NOW allow a real `ended` event to advance
  // the station.
  displayNowPlaying(manifest.entries[activeIndex]);
  setStatus(`Strategy: hard_cut (legacy — no approved DJ plan for this pair) · ${activeIndex + 1}/${manifest.entries.length}`);
  playBtn.style.display = "none";
  firstTrackSettled = true;

  void queueNextAfter(activeIndex);
}

playBtn.addEventListener("click", () => {
  if (!tryAcquireStartLock(startLock)) return;

  // Engine (and its AudioContext) is created lazily, on the explicit
  // listener gesture — never before, and never more than once per page
  // load (the lock above guarantees this branch runs at most once), so
  // node/context counts stay fixed for the whole session.
  engine = new DualDeckPlaybackEngine();
  engine.onDeckEnded((deckId) => {
    if (!firstTrackSettled) return;
    if (deckId !== activeDeck) return;
    void advanceOrStop();
  });

  void start();
});
