import { createFirebaseGoogleAuthPopupInitiator, type GoogleAuthPopupInitiator, type MemberIdentityAuthority } from "@studiorich/member-identity";
import type { HomeRoute, HomeSurfaceIdentity } from "../data/homeRouteTypes";
import type { HostedGoogleCredentialResult } from "../data/hostedAuthTypes";
import { createHomeNavigation } from "../logic/home/homeNavigation";
import { performHostedGoogleCredentialRequest } from "../logic/home/hostedGoogleAuth";
import { matchesSurfaceIdentity, serializeHomeRoute } from "../logic/home/homeRoutes";
import type { RadioChannelReceiver } from "../logic/radio/createRadioChannelReceiver";
import { createHomeRadioSessionManager } from "./homeRadioSession";
import { createHomeMemberSessionManager } from "./homeMemberSession";
import { renderMemberAvatar } from "./homeMemberAvatar";
import type { HomeMountIdentity, HomeSurfaceHost } from "./homeSurfaceContract";

// Deliberately excluded from production Rollup inputs; also fail closed if imported in a production bundle.
if (!import.meta.env.DEV) throw new Error("home_skeleton_development_only");
const required = <T extends Element>(selector: string): T => {
  const node = document.querySelector<T>(selector);
  if (!node) throw new Error(`home_element_missing:${selector}`);
  return node;
};
const frame = required<HTMLIFrameElement>("#surface");
const runtimeId = crypto.randomUUID();
required("#runtime-id").textContent = runtimeId;
let expectedUrl = "";
let readinessTimer: ReturnType<typeof setTimeout> | undefined;
const cancelReadinessTimer = () => { if (readinessTimer !== undefined) clearTimeout(readinessTimer); readinessTimer = undefined; };
const childUrl = (route: HomeRoute, identity: HomeSurfaceIdentity): string => {
  if (route.surface === "map") {
    const url = new URL("/wall-app/", location.origin);
    url.search = new URLSearchParams({ host: "home", homeRuntime: identity.runtimeId, homeNavigation: String(identity.navigationId) }).toString();
    return url.href;
  }
  if (route.surface === "station") {
    // STATION-01 -- the real Station Cover document (music/station.html),
    // same same-origin/query-identity contract as MAP/BLACKBOOK above.
    // `stationId` is the real GTFS station-level stop id (validated by
    // homeRoutes.ts's own isStationId before a route can ever reach here).
    const url = new URL("/station.html", location.origin);
    url.search = new URLSearchParams({ host: "home", homeRuntime: identity.runtimeId, homeNavigation: String(identity.navigationId), station: route.stationId }).toString();
    return url.href;
  }
  // HOST-03 -- the real BLACKBOOK document, not the HOST-01/02 fixture.
  // Mounted either bare (no prior artwork route -- BLACKBOOK resolves its
  // own initial artwork internally via localStorage/fallback, same as
  // standalone) or, on a reload/restore of a route that already names an
  // artwork, with that same `?artwork=` param BLACKBOOK's OWN existing
  // `resolveInitialActiveArtwork()` already reads -- no new resolution
  // logic, just forwarding the identity HOME's URL already carries. Either
  // way BLACKBOOK reports back via `syncArtworkRoute` once resolved.
  const url = new URL("/blackbook.html", location.origin);
  const params = new URLSearchParams({ host: "home", homeRuntime: identity.runtimeId, homeNavigation: String(identity.navigationId) });
  if (route.surface === "blackbook" && route.artworkId !== undefined) params.set("artwork", route.artworkId);
  url.search = params.toString();
  return url.href;
};
const navigation = createHomeNavigation(runtimeId, {
  writeHistory(mode, route) {
    const url = new URL("/home-dev.html", location.origin);
    url.search = serializeHomeRoute(route);
    history[mode === "push" ? "pushState" : "replaceState"]({ home: 1 }, "", url);
  },
  leave() { cancelReadinessTimer(); frame.style.visibility = "hidden"; },
  mount(route, identity) {
    expectedUrl = childUrl(route, identity);
    frame.style.visibility = "hidden";
    readinessTimer = setTimeout(() => navigation.fail(identity.navigationId, "surface_ready_timeout"), route.surface === "map" ? 30000 : 5000);
    try { frame.contentWindow!.location.replace(expectedUrl); }
    catch { navigation.fail(identity.navigationId, "surface_mount_failed"); }
  },
  render(state) {
    if (state.phase === "failed") cancelReadinessTimer();
    required("#route").textContent = state.route ? serializeHomeRoute(state.route) : "No valid route";
    required("#phase").textContent = state.phase;
    required("#failure").textContent = state.diagnostic ?? "";
    required("#diagnostics").textContent = JSON.stringify(state, null, 2);
    frame.hidden = state.phase === "failed" || state.phase === "idle";
    frame.style.visibility = state.phase === "active" ? "visible" : "hidden";
    required<HTMLButtonElement>("#retry").disabled = state.route === null;
  },
});

function currentDocument(source: Document): boolean {
  try { return source === frame.contentDocument; } catch { return false; }
}
function expectedDocument(source: Document): boolean {
  return currentDocument(source) && source.URL === expectedUrl;
}
function acceptReady(source: Document, identity: unknown): boolean {
  if (!currentDocument(source)) return false; // Obsolete child closures cannot poison the new route.
  if (!expectedDocument(source)) {
    navigation.fail(navigation.getState().navigationId, "surface_document_mismatch");
    return false;
  }
  const accepted = navigation.ready(identity);
  if (accepted) cancelReadinessTimer();
  return accepted;
}
function activeCaller(source: Document, identity: HomeSurfaceIdentity): boolean {
  const expected = navigation.getExpectedIdentity();
  return navigation.getState().phase === "active" && expectedDocument(source) && expected !== null && matchesSurfaceIdentity(expected, identity);
}
/**
 * RADIO-01 -- deliberately narrower than `activeCaller`: matches only
 * runtime + navigation generation, never `routeKey`/Artwork identity, so a
 * `syncArtworkRoute` call (which never remounts) can never invalidate an
 * already-granted RADIO session handle. `expectedDocument` itself is
 * already safe to reuse here -- `expectedUrl` is only ever set inside
 * `mount()`, never touched by `syncArtworkRoute`, so it stays stable
 * across Artwork-only route churn for the SAME mount.
 */
function activeMount(source: Document, identity: HomeMountIdentity): boolean {
  const state = navigation.getState();
  return state.phase === "active" && expectedDocument(source) && state.runtimeId === identity.runtimeId && state.navigationId === identity.navigationId;
}
// HOST-03B -- constructed lazily (only once a hosted surface actually
// requests it), reusing the exact same config/emulator bootstrap every
// other Firebase consumer in this repo already goes through. HOME never
// otherwise touches Firebase Auth -- this is the one, minimum dependency
// the hosted-authentication transport requires (see HOST_03A_MEMBER_AUTH_BOUNDARY.md).
let googleAuthPopupInitiator: GoogleAuthPopupInitiator | undefined;
function getGoogleAuthPopupInitiator(): GoogleAuthPopupInitiator {
  googleAuthPopupInitiator ??= createFirebaseGoogleAuthPopupInitiator(import.meta.env);
  return googleAuthPopupInitiator;
}
/**
 * HOST-03B -- the hosted authentication transport's DOM/Firebase adapter.
 * Orchestration (identity gating, error classification, never falling back)
 * lives in `performHostedGoogleCredentialRequest` (`logic/home/hostedGoogleAuth.ts`),
 * unit tested there without a browser or a real Firebase Auth instance.
 */
function requestGoogleCredential(source: Document, identity: HomeSurfaceIdentity): Promise<HostedGoogleCredentialResult> {
  return performHostedGoogleCredentialRequest({
    isActiveCaller: () => activeCaller(source, identity),
    signInWithGooglePopup: () => getGoogleAuthPopupInitiator().signInWithGooglePopup(),
  });
}
const radioSessionManager = createHomeRadioSessionManager();
/**
 * RADIO-01 -- fail closed on rejection: returns `null`, never a
 * locally-usable fallback. `radioSessionManager.acquire()` is only called
 * once the caller is confirmed to be the active mount, and hands back a
 * handle bound to HOME's ONE persistent session (lazily constructed on
 * first use, reused verbatim across every later surface swap).
 */
function getRadioSession(source: Document, identity: HomeMountIdentity): RadioChannelReceiver | null {
  if (!activeMount(source, identity)) return null;
  return radioSessionManager.acquire();
}
// MEMBER-01A -- same lazy-singleton/fail-closed shape as radioSessionManager
// above, applied to MEMBER identity: exactly one live, hosted
// `MemberIdentityAuthority` for this HOME document's lifetime. The
// persistent avatar (mounted below) acquires its own handle directly, not
// through this gated bridge function -- it IS the active/owning context,
// not a hosted surface asking permission.
const memberSessionManager = createHomeMemberSessionManager();
function getMemberIdentity(source: Document, identity: HomeMountIdentity): MemberIdentityAuthority | null {
  if (!activeMount(source, identity)) return null;
  return memberSessionManager.acquire();
}
const api: HomeSurfaceHost = Object.freeze({
  version: 1,
  ready: acceptReady,
  requestNavigate: (source: Document, identity: HomeSurfaceIdentity, destination: unknown) => activeCaller(source, identity) && navigation.requestNavigate(destination),
  replaceArtwork: (source: Document, identity: HomeSurfaceIdentity, artworkId: unknown) => activeCaller(source, identity) && navigation.replaceArtwork(artworkId),
  syncArtworkRoute: (source: Document, identity: HomeSurfaceIdentity, artworkId: unknown) => activeCaller(source, identity) && navigation.syncArtworkRoute(artworkId),
  requestGoogleCredential,
  getRadioSession,
  getMemberIdentity,
});
window.StudioRichHome = api;

// HOST-00: restoration can supersede a popstate-time replacement. Check the actual loaded document too.
frame.addEventListener("load", () => {
  const doc = frame.contentDocument;
  if (!doc) { navigation.fail(navigation.getState().navigationId, "surface_document_unavailable"); return; }
  if (doc.URL === "about:blank" || doc.readyState !== "complete") return;
  // MAP becomes ready asynchronously after its real viewport loads, not merely HTML load.
  if (!doc.documentElement.dataset.homeReady && expectedDocument(doc)) return;
  let report: unknown;
  try { report = JSON.parse(doc.documentElement.dataset.homeReady ?? "null"); }
  catch { report = null; }
  acceptReady(doc, report);
});
frame.addEventListener("error", () => navigation.fail(navigation.getState().navigationId, "surface_load_failed"));
window.addEventListener("popstate", () => navigation.restore(location.search));
required("#map").addEventListener("click", () => navigation.requestNavigate({ surface: "map" }));
required("#blackbook").addEventListener("click", () => navigation.requestNavigate({ surface: "blackbook" }));
// STATION-01 -- dev-harness entry for direct acceptance testing, same
// posture as #map/#blackbook above (not chrome polish -- the minimum
// needed to reach the new surface at all from this harness). Bay Ridge Av
// (R42) is this batch's own calibration station.
required("#station").addEventListener("click", () => navigation.requestNavigate({ surface: "station", stationId: "R42" }));
required("#back").addEventListener("click", () => history.back());
required("#forward").addEventListener("click", () => history.forward());
required("#retry").addEventListener("click", () => navigation.retry());
window.addEventListener("pagehide", cancelReadinessTimer);
navigation.restore(location.search, true);

// MEMBER-01A -- the ONE persistent avatar, mounted once into
// `#member-avatar-root` (a sibling of `#surface`, never inside it) for the
// lifetime of this document. Acquires its own handle to the SAME session
// `getMemberIdentity` above hands out to hosted surfaces -- the parent
// renders from the exact live instance it owns, not a snapshot.
renderMemberAvatar(required("#member-avatar-root"), memberSessionManager.acquire());
