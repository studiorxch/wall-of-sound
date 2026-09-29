import type { HomeRoute, HomeSurfaceIdentity } from "../data/homeRouteTypes";
import type { HostedGoogleCredentialResult } from "../data/hostedAuthTypes";
import { homeRouteKey } from "../logic/home/homeRoutes";
import "./homeSurfaceContract"; // side-effect only: declares window.StudioRichHome

/**
 * HOST-03 -- the real BLACKBOOK's own narrow HOME adapter, the BLACKBOOK-side
 * counterpart to `wall/systems/presentation/homeMapSurface.js`. BLACKBOOK is
 * part of the same MUSIC/Vite build as HOME itself (unlike MAP, which is
 * `wall/`'s separate plain-JS bundle), so this reuses HOME's own typed route
 * helpers directly instead of a parallel same-origin query-parsing contract.
 *
 * Detection is explicit and query-based (`?host=home&homeRuntime=...&
 * homeNavigation=...` plus a live `parent.StudioRichHome.version === 1`
 * check) -- deliberately never bare `window.self !== window.top`, since
 * BLACKBOOK can have other iframe consumers (a future embed, a preview) that
 * must not be mistaken for HOME hosting.
 *
 * `route` here is a local mirror of HOME's own `state.route`, updated only
 * after a call this module itself made is accepted -- HOME always mounts
 * BLACKBOOK at the bare `{surface:"blackbook"}` route (no artworkId), so
 * this mirror starts there too and evolves in lockstep with HOME's real
 * state via `syncArtworkRoute`'s own return value, never guessed ahead of
 * an accepted call.
 */
export interface BlackbookHomeSurface {
  readonly isHome: boolean;
  /** Reports the FIRST stable, interactive state (signed-in-and-hydrated, or signed-out) -- idempotent, at most one report. */
  reportReady(): void;
  /** Reports BLACKBOOK's OWN already-resolved artwork identity (its existing no-reload openArtwork/PAGES path) for HOME's URL/history sync only -- never a remount request. */
  reportArtworkChange(artworkId: string | null): boolean;
  /** Delegates the BLACKBOOK -> MAP control through HOME's navigation authority instead of a native anchor navigation. */
  requestNavigateToMap(): boolean;
  /**
   * HOST-03B -- requests HOME's own never-nested window initiate and
   * complete a Google sign-in popup, resolving to an opaque credential this
   * surface's OWN `memberIdentity.signInWithCredential` completes with. Must
   * be called synchronously within the sign-in button's own click handler
   * to preserve the user gesture -- see the caller in `blackbookRuntime.ts`.
   */
  requestGoogleCredential(): Promise<HostedGoogleCredentialResult>;
}

const NOT_HOME: BlackbookHomeSurface = Object.freeze({
  isHome: false,
  reportReady() { /* standalone/non-HOME: nothing to report */ },
  reportArtworkChange: () => false,
  requestNavigateToMap: () => false,
  requestGoogleCredential: () => Promise.resolve({ ok: false as const, reason: "home_unavailable" as const }),
});

export function createBlackbookHomeSurface(): BlackbookHomeSurface {
  try {
    const params = new URLSearchParams(location.search);
    const runtimeId = params.get("homeRuntime");
    const navigationId = Number(params.get("homeNavigation"));
    if (params.get("host") !== "home" || window.parent === window) return NOT_HOME;
    if (window.parent.location.origin !== location.origin) return NOT_HOME;
    const host = window.parent.StudioRichHome;
    if (host?.version !== 1 || !runtimeId || !Number.isSafeInteger(navigationId) || navigationId < 1) return NOT_HOME;

    // Must mirror EXACTLY what HOME mounted with (`homeRuntime.ts`'s own
    // `childUrl()` forwards `?artwork=` only when the route it mounted
    // already named one -- e.g. a direct reload/restore of a specific
    // Artwork's HOME URL). Seeding anything else here would desync from
    // HOME's `state.route` and fail the very first `ready()`/
    // `syncArtworkRoute()` identity check.
    const initialArtworkId = params.get("artwork");
    let route: HomeRoute = initialArtworkId !== null
      ? Object.freeze({ surface: "blackbook", artworkId: initialArtworkId })
      : Object.freeze({ surface: "blackbook" });
    let reported = false;
    const identity = (): HomeSurfaceIdentity => Object.freeze({ runtimeId, navigationId, routeKey: homeRouteKey(route) });

    return Object.freeze({
      isHome: true,
      reportReady() {
        if (reported) return;
        reported = true;
        document.documentElement.dataset.homeReady = JSON.stringify(identity());
        host.ready(document, identity());
      },
      reportArtworkChange(artworkId: string | null): boolean {
        const nextRoute: HomeRoute = artworkId === null ? { surface: "blackbook" } : { surface: "blackbook", artworkId };
        const accepted = host.syncArtworkRoute(document, identity(), artworkId);
        if (accepted) route = Object.freeze(nextRoute);
        return accepted;
      },
      requestNavigateToMap(): boolean {
        return host.requestNavigate(document, identity(), { surface: "map" });
      },
      requestGoogleCredential(): Promise<HostedGoogleCredentialResult> {
        return host.requestGoogleCredential(document, identity());
      },
    });
  } catch {
    return NOT_HOME;
  }
}
