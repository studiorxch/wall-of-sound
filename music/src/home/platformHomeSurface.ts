import type { HomeSurfaceIdentity } from "../data/homeRouteTypes";
import { homeRouteKey } from "../logic/home/homeRoutes";
import "./homeSurfaceContract"; // side-effect only: declares window.StudioRichHome

/**
 * STATION-08 -- Platform's own narrow HOME adapter, the same shape
 * `stationHomeSurface.ts` already establishes for Station Cover (explicit
 * query-based detection, never bare `window.self !== window.top`).
 * Deliberately just as small: Platform has no MEMBER/RADIO concerns of its
 * own -- both stay entirely the persistent parent's (see
 * homeMemberAvatar.ts/homeRadioSession.ts; Platform never calls
 * `getMemberIdentity`/`getRadioSession` at all, since it renders no
 * MEMBER/RADIO UI of its own -- see platformRuntime.ts's own header) --
 * this adapter only needs readiness reporting and a Platform -> MAP
 * navigation request (STATION-08's own "smallest clear return path,"
 * never a larger invented navigation system).
 */
export interface PlatformHomeSurface {
  readonly isHome: boolean;
  readonly stationId: string | null;
  /** Reports the first stable, interactive state -- idempotent, at most one report. */
  reportReady(): void;
  /** Delegates the Platform -> MAP control through HOME's navigation authority instead of a native anchor navigation. */
  requestNavigateToMap(): boolean;
}

// Deliberately NOT a module-level constant -- see stationHomeSurface.ts's
// own identical rationale: must never touch `location`/`window` at import
// time.
function notHome(stationId: string | null): PlatformHomeSurface {
  return Object.freeze({
    isHome: false,
    stationId,
    reportReady() { /* standalone: nothing to report */ },
    requestNavigateToMap: () => false,
  });
}

export function createPlatformHomeSurface(): PlatformHomeSurface {
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

    const identity = (): HomeSurfaceIdentity => Object.freeze({ runtimeId, navigationId, routeKey: homeRouteKey({ surface: "platform", stationId }) });
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
    });
  } catch {
    return notHome(stationIdForFallback);
  }
}
