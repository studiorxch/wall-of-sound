import type { HomeSurfaceIdentity } from "../data/homeRouteTypes";
import { homeRouteKey, parseHomeSearch } from "../logic/home/homeRoutes";
import type { HomeSurfaceHost } from "./homeSurfaceContract";

if (!import.meta.env.DEV) throw new Error("host01_surface_development_only");
const params = new URLSearchParams(location.search);
const runtimeId = params.get("runtime");
const navigationId = Number(params.get("navigation"));
params.delete("runtime"); params.delete("navigation");
const route = parseHomeSearch(params.toString());
let host: HomeSurfaceHost | undefined;
try { if (window.parent !== window && window.parent.location.origin === location.origin) host = window.parent.StudioRichHome; }
catch { host = undefined; }
const result = document.querySelector<HTMLElement>("#result")!;
if (!route || !runtimeId || !Number.isSafeInteger(navigationId) || navigationId < 1 || host?.version !== 1) {
  result.textContent = "HOST-01 requires its same-origin HOME parent and valid route identity.";
  document.querySelectorAll("button").forEach(button => { button.disabled = true; });
} else {
  const identity: HomeSurfaceIdentity = Object.freeze({ runtimeId, navigationId, routeKey: homeRouteKey(route) });
  document.querySelector("#surface-title")!.textContent = `Controlled ${route.surface === "map" ? "A · MAP" : "B · BLACKBOOK"} test surface`;
  document.querySelector("#identity")!.textContent = JSON.stringify(identity);
  const bind = (selector: string, action: () => boolean) => document.querySelector(selector)!.addEventListener("click", () => {
    result.textContent = action() ? "Accepted by HOME" : "Rejected by HOME";
  });
  bind("#map", () => host!.requestNavigate(document, identity, { surface: "map" }));
  bind("#blackbook", () => host!.requestNavigate(document, identity, { surface: "blackbook" }));
  bind("#artwork-a", () => host!.replaceArtwork(document, identity, "A"));
  bind("#artwork-b", () => host!.replaceArtwork(document, identity, "B"));
  bind("#bad-route", () => host!.requestNavigate(document, identity, "https://invalid.example/"));
  bind("#bad-ready", () => host!.ready(document, { ...identity, routeKey: "wrong-surface" }));
  bind("#ready-again", () => host!.ready(document, identity));
  document.documentElement.dataset.homeReady = JSON.stringify(identity);
  host.ready(document, identity);
}
