import type { PlaylistRecord } from "../data/playProjectTypes";
import { DEFAULT_WOS_LOCAL_URL } from "../ui/mapRegionFeedConfig";

/** The base WOS URL without embed params — for opening in a new tab (Canvas access). */
export function wosCanvasUrl(playlist: PlaylistRecord): string {
  return playlist.broadcastIdentity?.mapChannelUrl?.trim() || DEFAULT_WOS_LOCAL_URL;
}

export type BroadcastRouteStatus = "idle" | "launching" | "live" | "error";

export type BroadcastRouteSource =
  | "configured"
  | "playlist"
  | "wos-local-fallback"
  | "missing";

export type BroadcastRouteResolution = {
  url: string | null;
  source: BroadcastRouteSource;
  error?: string;
};

/** Append embed/clean-mode query params to a WOS URL without duplicating them. */
function toEmbedUrl(base: string): string {
  try {
    const u = new URL(base);
    u.searchParams.set("embed", "1");
    u.searchParams.set("controls", "0");
    u.searchParams.set("hud", "0");
    u.searchParams.set("chrome", "0");
    return u.toString();
  } catch {
    // Malformed URL — return as-is
    return base;
  }
}

/**
 * Resolves the best available route/map URL for the Broadcast HUD.
 * Fallback order:
 *   1. playlist.broadcastIdentity.mapChannelUrl (operator-configured)
 *   2. WOS local fallback (DEFAULT_WOS_LOCAL_URL)
 * Always appends embed params to hide WOS control chrome.
 */
export function resolveBroadcastRouteUrl(playlist: PlaylistRecord): BroadcastRouteResolution {
  const configured = playlist.broadcastIdentity?.mapChannelUrl?.trim();
  if (configured) {
    return { url: toEmbedUrl(configured), source: "configured" };
  }
  if (DEFAULT_WOS_LOCAL_URL) {
    return { url: toEmbedUrl(DEFAULT_WOS_LOCAL_URL), source: "wos-local-fallback" };
  }
  return {
    url: null,
    source: "missing",
    error: "No route/map URL configured and no WOS local fallback available.",
  };
}
