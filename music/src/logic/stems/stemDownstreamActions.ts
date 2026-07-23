// 0722C_MUSIC_Production_Stem_Export — downstream destination gating.
//
// Only Send to Looper is a real, functional destination in this build (see
// stemLooperSource.ts) — Add to Bank and Prepare for RADIO have NO builder
// here at all, deliberately: making Bank membership stem-aware would mean
// touching several already-shipped, independent playback surfaces
// (MainTrackWindow/PlaylistDeck/DeckBPlayer/FlowCurveCanvas/
// BroadcastHudShell) that each resolve TrackSlot.assignedTrackId straight
// to a real Track's own audio with no shared interception point; RADIO has
// no pipeline that consumes stem material at all (encoding/publishing is
// explicitly out of scope for this spec). Both are honestly disabled in
// the UI with the exact reason below — never an enabled button wired to a
// reference nothing reads.

import type { StemSetLifecycle } from "../../data/trackStemTypes";

export const BANK_UNAVAILABLE_REASON =
  "Bank playback is resolved independently across several already-shipped playback surfaces, none of which have a shared interception point for stem-aware audio. Not implemented in this build.";

export const RADIO_UNAVAILABLE_REASON =
  "RADIO encoding and publishing are out of scope for this build — no RADIO pipeline exists yet that consumes stem material.";

// Looper is the one CURRENT-only-gated destination — this is the single
// place that decision is made, so the UI never has to re-derive it.
export function canSendToLooper(lifecycle: StemSetLifecycle | undefined): boolean {
  return lifecycle === "current";
}

export function canShowInFinder(lifecycle: StemSetLifecycle | undefined): boolean {
  // Any registered set may be revealed in Finder — that's the sanctioned
  // way to inspect an archived/outdated/orphaned set. Only synchronized
  // playback and Looper delivery are CURRENT-gated.
  return lifecycle != null && lifecycle !== "unavailable";
}

export function canPlaySynchronized(lifecycle: StemSetLifecycle | undefined): boolean {
  return lifecycle === "current";
}

export function canReStem(lifecycle: StemSetLifecycle | undefined): boolean {
  return lifecycle === "outdated" || lifecycle === "orphaned" || lifecycle === "unavailable";
}
