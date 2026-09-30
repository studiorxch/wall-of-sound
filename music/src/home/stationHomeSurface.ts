import type { HomeSurfaceIdentity } from "../data/homeRouteTypes";
import { homeRouteKey } from "../logic/home/homeRoutes";
import "./homeSurfaceContract"; // side-effect only: declares window.StudioRichHome

/**
 * STATION-01 -- Station Cover's own narrow HOME adapter, the same shape
 * `blackbookHomeSurface.ts` already establishes (explicit query-based
 * detection, never bare `window.self !== window.top`). Deliberately
 * smaller: Station Cover has no artwork-route concept and no MEMBER/
 * credential concerns of its own (MEMBER stays entirely the persistent
 * parent's -- see homeMemberAvatar.ts/hostAwareMemberIdentity.ts), so this
 * adapter only needs readiness reporting and a Station -> MAP navigation
 * request.
 */
export interface StationHomeSurface {
  readonly isHome: boolean;
  readonly stationId: string | null;
  /** Reports the first stable, interactive state -- idempotent, at most one report. */
  reportReady(): void;
  /** Delegates the Station -> MAP control through HOME's navigation authority instead of a native anchor navigation. */
  requestNavigateToMap(): boolean;
  /**
   * STATION-08 -- delegates Station Cover's own ENTER PLATFORM action
   * through HOME's navigation authority, carrying this SAME canonical
   * station id forward (never Bay Ridge Av hardcoded) -- only meaningful
   * when this page is hosted directly via HOME's own `{surface:"station"}`
   * route (`isHome`). When Station Cover is instead embedded inside MAP's
   * own Mezzanine Drawer, `stationCoverRuntime.ts` uses a separate
   * postMessage path instead (see subwayMezzanineDrawer.js) -- this
   * surface has no parent `StudioRichHome` to call directly in that case.
   */
  requestNavigateToPlatform(): boolean;
}

// Deliberately NOT a module-level constant: it must never touch
// `location`/`window` at import time (this module can be imported before
// those globals are meaningfully available, e.g. under test) -- only
// `createStationHomeSurface()`'s own call, inside its try block, reads
// them.
function notHome(stationId: string | null): StationHomeSurface {
  return Object.freeze({
    isHome: false,
    stationId,
    reportReady() { /* standalone: nothing to report */ },
    requestNavigateToMap: () => false,
    requestNavigateToPlatform: () => false,
  });
}

export function createStationHomeSurface(): StationHomeSurface {
  let stationIdForFallback: string | null = null;
  try {
    const params = new URLSearchParams(location.search);
    const runtimeId = params.get("homeRuntime");
    const navigationId = Number(params.get("homeNavigation"));
    const stationId = params.get("station");
    stationIdForFallback = stationId && stationId.length > 0 && stationId.length <= 64 ? stationId : null;
    if (params.get("host") !== "home" || window.parent === window) return notHome(stationIdForFallback);
    if (window.parent.location.origin !== location.origin) return notHome(stationIdForFallback);
    const host = window.parent.StudioRichHome;
    if (host?.version !== 1 || !runtimeId || !Number.isSafeInteger(navigationId) || navigationId < 1 || !stationId) return notHome(stationIdForFallback);

    const identity = (): HomeSurfaceIdentity => Object.freeze({ runtimeId, navigationId, routeKey: homeRouteKey({ surface: "station", stationId }) });
    let reported = false;

    return Object.freeze({
      isHome: true,
      stationId,
      reportReady() {
        if (reported) return;
        reported = true;
        document.documentElement.dataset.homeReady = JSON.stringify(identity());
        host.ready(document, identity());
      },
      requestNavigateToMap(): boolean {
        return host.requestNavigate(document, identity(), { surface: "map" });
      },
      requestNavigateToPlatform(): boolean {
        return host.requestNavigate(document, identity(), { surface: "platform", stationId });
      },
    });
  } catch {
    return notHome(stationIdForFallback);
  }
}
