import type { HomeRoute, HomeSurfaceIdentity } from "../data/homeRouteTypes";
import { createHomeNavigation } from "../logic/home/homeNavigation";
import { matchesSurfaceIdentity, serializeHomeRoute } from "../logic/home/homeRoutes";
import type { HomeSurfaceHost } from "./homeSurfaceContract";

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
  const url = new URL("/home-surface-dev.html", location.origin);
  url.search = serializeHomeRoute(route);
  url.searchParams.set("runtime", identity.runtimeId);
  url.searchParams.set("navigation", String(identity.navigationId));
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
const api: HomeSurfaceHost = Object.freeze({
  version: 1,
  ready: acceptReady,
  requestNavigate: (source: Document, identity: HomeSurfaceIdentity, destination: unknown) => activeCaller(source, identity) && navigation.requestNavigate(destination),
  replaceArtwork: (source: Document, identity: HomeSurfaceIdentity, artworkId: unknown) => activeCaller(source, identity) && navigation.replaceArtwork(artworkId),
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
required("#back").addEventListener("click", () => history.back());
required("#forward").addEventListener("click", () => history.forward());
required("#retry").addEventListener("click", () => navigation.retry());
window.addEventListener("pagehide", cancelReadinessTimer);
navigation.restore(location.search, true);
