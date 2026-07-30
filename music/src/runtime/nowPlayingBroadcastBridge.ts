// HUD Recovery Addendum (0729C v1.1) — restores a "Now Playing" HUD on
// canonical LIVE MAP (wall/index.html, reached same-origin at
// localhost:5176/wall-app/ or standalone :5500). LIVE MAP opens in its own
// browser tab (top-nav link, not an iframe), so there is no postMessage
// channel to it — localStorage + the native 'storage' event is the same
// same-origin transport wallPaletteBridge.ts/mapsPaletteAuthority.js already
// use for cross-tab palette sync. This is a mirror, not a second authority:
// MUSIC's playbackAuthority.ts (buildSurfaceSnapshot) remains the ONE place
// playback state is computed; this module only serializes that snapshot to
// a shared channel so wall/'s vanilla-JS runtime can render it. Same reason
// mapsPaletteAuthority.js persisting to localStorage isn't a "duplicate
// store" — it's the existing authority's own transport, not a rival one.
//
// Same-origin only: this reaches the canonical localhost:5176/wall-app/ tab.
// It will NOT reach the deprecated standalone localhost:5500 (different
// origin — browsers scope localStorage per-origin; no cross-origin sync is
// built here, matching the standing decision already made for palettes).

import type { Track } from "../data/trackTypes";
import type { PlaybackSurfaceSnapshot } from "../audio/dualDeckTypes";

export const NOW_PLAYING_STORAGE_KEY = "wos:nowPlaying:snapshot";

export type NowPlayingSnapshot = {
  trackId: string;
  title: string;
  artist: string;
  positionSeconds: number;
  durationSeconds: number | null;
  isPlaying: boolean;
  isPaused: boolean;
  isTransitioning: boolean;
};

// Pure — no localStorage access, so it's directly testable. Returns null
// when there is genuinely nothing to show (no resolved track), so the
// wall-side HUD can hide itself rather than render empty/placeholder rows.
export function buildNowPlayingSnapshot(
  track: Track | null | undefined,
  positionSeconds: number,
  durationSeconds: number | undefined,
  isPlaying: boolean,
  isPaused: boolean,
  playbackSurface: PlaybackSurfaceSnapshot | null,
): NowPlayingSnapshot | null {
  if (!track) return null;
  return {
    trackId: track.trackId,
    title: track.title,
    artist: track.artist,
    positionSeconds,
    durationSeconds: durationSeconds ?? track.durationSeconds ?? null,
    isPlaying,
    isPaused,
    isTransitioning: playbackSurface?.isTransitioning ?? false,
  };
}

// The one write site. Removing the key (rather than writing a "no track"
// sentinel) lets the wall-side reader treat "key absent" and "nothing
// playing" as the same real state, not a third fake state.
export function publishNowPlayingSnapshot(snapshot: NowPlayingSnapshot | null): void {
  try {
    if (!snapshot) {
      window.localStorage.removeItem(NOW_PLAYING_STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(NOW_PLAYING_STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // Storage unavailable (private mode, quota) — Now Playing HUD just
    // won't update on LIVE MAP; never breaks playback itself.
  }
}
