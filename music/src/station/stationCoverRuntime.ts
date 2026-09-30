// STATION-01/02/03 -- the Station Cover page. A hosted StudioRich surface,
// alongside MAP and BLACKBOOK, that CONSUMES existing canonical Station
// Truth (stationTruth.ts) and renders the smallest reusable Cover
// presentation (stationCoverPresentation.ts) -- it owns neither of those,
// and owns no station database of its own. MEMBER and RADIO remain
// entirely the persistent parent's (see homeMemberAvatar.ts/
// homeRadioSession.ts) -- this page constructs neither, deliberately.
//
// STATION-02 -- adds the route-symbol visual refinement, a Northbound/
// Southbound direction control, and the arrival-rows display rule.
//
// STATION-03 -- MAP -> STATION presentation boundary. Detailed live
// arrivals are now canonically presented HERE (moved off MAP's own
// selected-station HUD -- see wall/systems/presentation/subwayStationHud.js's
// own updated header and docs/architecture/subway/README.md §14). The
// underlying live-arrival data authority (`SubwayArrivalIntelligence`)
// remains a live, in-memory `wall/`-JS-realm object with no static/
// cross-document access path -- STILL unreachable from this separately-
// hosted document (that STOP finding is unchanged by this batch; see the
// architecture doc). This page shows an honest "not yet available" state
// for arrivals rather than inventing data -- never a fabricated arrival.
//
// STATION-03 also adds real local-line orientation
// (stationLineOrientation.ts), which DOES NOT depend on `wall/`'s live
// runtime -- it's a pure projection over the same static GTFS snapshot
// already fetched for station identity, so real neighboring-station names
// now render here. The obsolete "Enter station creative space" dead-end
// placeholder is removed -- the real future path is Station Cover ->
// Station Model, which does not exist yet, and this page adds no fake
// destination in its place.
//
// STATION-04 -- this exact runtime is now ALSO the Mezzanine Drawer's
// content, loaded in a same-origin iframe MAP itself hosts
// (wall/systems/presentation/subwayMezzanineDrawer.js), never a second,
// duplicated station-information implementation. `?embedded=1` (present
// only when loaded that way) switches two things, both purely
// presentational: the standalone "<- MAP" link is hidden (MAP already
// provides its own close/deselect affordance for the drawer hosting this
// page), and outer page padding shrinks to fit the drawer's own
// resizable 315-540px width rather than the standalone page's fixed
// max-width. Every other behavior -- fetch, direction state, arrivals,
// line orientation -- is identical in both modes; this is real reuse, not
// a fork. `station.html`'s own static markup is unchanged by embedded
// mode; only this script's applied classes/markup differ.
//
// An "ENTER PLATFORM" action is added (disabled placeholder, same honest
// "coming soon" pattern the old creative-space button used) -- Platform
// itself does not exist yet (STATION-04's own explicit scope boundary).
//
// STATION-04A -- corrective batch. Route badges are now clickable when
// embedded, posting a same-origin message
// (`{type:"stationCover:showLineMode", routeId}`) up to
// subwayMezzanineDrawer.js, which calls the real
// SBE.SubwayLineRibbon.showLineMode() on MAP's own side -- restoring the
// Line Mode entry point STATION-04's own MAP cleanup removed (this
// document has no way to reach that wall/-realm function directly, the
// same reachability class as live arrivals). Route symbols themselves
// never shrink/deform to fit -- see station.html's own updated CSS
// (flex-wrap + flex-shrink:0) for the layout-width-only wrapping rule.
//
// STATION-08 -- ENTER PLATFORM is now functional, carrying this SAME
// canonical stationId forward (never Bay Ridge Av hardcoded here -- only
// stationGeometryRegistry.ts's own honest data-availability table is
// Bay-Ridge-specific today, and that's Platform's own concern, not this
// button's). Three real contexts this document can be in, each with its
// own navigation path, same "isHome vs. isEmbedded vs. fully standalone"
// split the back link above already established:
//   - isHome (hosted directly via HOME's {surface:"station"} route):
//     homeSurface.requestNavigateToPlatform() -- HOME's own authority.
//   - isEmbedded (inside MAP's own Mezzanine Drawer): postMessage up to
//     subwayMezzanineDrawer.js, mirroring postShowLineMode() below exactly.
//   - neither (fully standalone): a plain same-origin navigation, same
//     posture the standalone back link's own real <a href> already has.

import { fetchStaticSnapshot } from "../logic/maps/stationTruth";
import { resolveStationTruth, type StationTruth } from "../logic/maps/stationTruth";
import { deriveStationCoverDisplay, type StationCoverDisplay } from "../logic/maps/stationCoverPresentation";
import { resolveStationLineOrientation, type StationLineOrientation } from "../logic/maps/stationLineOrientation";
import { selectStationArrivalRows, type StationArrival, type StationArrivalDirection } from "../logic/maps/stationArrivalPresentation";
import { createStationHomeSurface } from "../home/stationHomeSurface";

const required = <T extends Element>(selector: string): T => {
  const node = document.querySelector<T>(selector);
  if (!node) throw new Error(`station_cover_element_missing:${selector}`);
  return node;
};

const homeSurface = createStationHomeSurface();

// STATION-04 -- the one flag distinguishing "Mezzanine Drawer content"
// from "standalone Station Cover page". Never read anywhere except here
// and the two presentational branches below.
const isEmbedded = new URLSearchParams(location.search).get("embedded") === "1";
if (isEmbedded) document.body.classList.add("embedded");

const root = required<HTMLElement>("#station-cover-root");
const backLink = required<HTMLAnchorElement>("#station-back-to-map");

// Standalone/embedded: a plain anchor (already the correct href in the
// static HTML). Hosted: intercept and delegate through HOME's own
// navigation authority instead of a native cross-document navigation --
// same pattern `subwayBlackbookNavLink.js`/`blackbookRuntime.ts`'s own
// "#map-nav-link" already use for the equivalent BLACKBOOK -> MAP link.
if (homeSurface.isHome) {
  backLink.addEventListener("click", (event) => {
    event.preventDefault();
    if (!homeSurface.requestNavigateToMap()) {
      backLink.setAttribute("aria-label", "HOME rejected MAP navigation; retry from HOME");
    }
  });
}

// STATION-02 -- no directional entry state exists in the current
// navigation contract ({surface:"station", stationId} carries no
// direction), so the smallest deterministic default is used and
// documented here rather than inventing routing to carry one in. A
// future batch adding a real directional entry point should replace
// this constant with that context.
let direction: StationArrivalDirection = "N";

// Empty on purpose (see this file's own header) -- a real feed is not
// yet reachable from this document. selectStationArrivalRows' own
// max-two-per-service-per-direction rule is already fully implemented
// and tested; only the DATA is missing, not the display logic.
const ARRIVALS: readonly StationArrival[] = [];

let currentDisplay: StationCoverDisplay = { kind: "loading" };
let currentOrientation: StationLineOrientation | null = null;

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}

function renderRouteBadge(route: StationCoverDisplay extends { kind: "resolved"; routes: readonly (infer R)[] } ? R : never): string {
  // STATION-04A -- only interactive when embedded (there's no MAP/Line
  // Ribbon to message when this page is standalone); the click/keydown
  // handlers are wired in render() below, gated the same way.
  const interactiveAttrs = isEmbedded
    ? ` data-route-id="${escapeHtml(route.routeId)}" role="button" tabindex="0" aria-label="Show ${escapeHtml(route.label)} line on the map"`
    : "";
  const interactiveClass = isEmbedded ? " station-route-badge--interactive" : "";
  return `<span class="station-route-badge${interactiveClass}" style="--route-color:${route.color};--route-text:${route.textColor};--route-tint:${route.tintBackground}"${interactiveAttrs}>${escapeHtml(route.label)}</span>`;
}

// STATION-04A -- the one postMessage this document ever sends. Same-origin
// targetOrigin (the drawer's parent, wall/, is always same-origin -- see
// subwayMezzanineDrawer.js's own iframe src construction). The receiving
// side re-validates event.origin/event.source before acting on this --
// this document never assumes the message was trusted just because it was
// sent correctly.
function postShowLineMode(routeId: string): void {
  if (!isEmbedded || window.parent === window) return;
  window.parent.postMessage({ type: "stationCover:showLineMode", routeId }, window.location.origin);
}

function postEnterPlatform(stationId: string): void {
  if (window.parent === window) return;
  window.parent.postMessage({ type: "stationCover:enterPlatform", stationId }, window.location.origin);
}

function handleEnterPlatformClick(stationId: string): void {
  if (homeSurface.isHome) {
    homeSurface.requestNavigateToPlatform();
    return;
  }
  if (isEmbedded) {
    postEnterPlatform(stationId);
    return;
  }
  location.href = new URL(`platform.html?station=${encodeURIComponent(stationId)}`, location.href).href;
}

function renderDirectionControl(): string {
  return `
    <div class="station-direction-control" role="group" aria-label="Direction">
      <button type="button" class="station-direction-option${direction === "N" ? " station-direction-option--active" : ""}" data-direction="N" aria-pressed="${direction === "N"}">NORTHBOUND</button>
      <span class="station-direction-sep">|</span>
      <button type="button" class="station-direction-option${direction === "S" ? " station-direction-option--active" : ""}" data-direction="S" aria-pressed="${direction === "S"}">SOUTHBOUND</button>
    </div>
  `;
}

function renderArrivals(): string {
  const rows = selectStationArrivalRows(ARRIVALS, direction);
  if (rows.length === 0) {
    // Honest, quiet -- never a fabricated arrival. See this file's own header.
    return `<p class="station-cover-note">Live arrivals aren’t available in this view yet.</p>`;
  }
  return `<div class="station-arrivals">${rows.map((row) => `
    <div class="station-arrival-row">
      <span class="station-arrival-route">${escapeHtml(row.routeId)}</span>
      <span class="station-arrival-eta">${escapeHtml(row.label)}</span>
    </div>`).join("")}</div>`;
}

function renderLineOrientation(name: string): string {
  // STATION-03 -- real neighboring-station names when
  // `resolveStationLineOrientation` could confidently place this station
  // on its route's real shape; an honest "—" placeholder (never a
  // fabricated name) for whichever side it couldn't. Deliberately
  // non-directional (no claim about which neighbor is "north" vs
  // "south") -- the shape-projection direction is real but arbitrary
  // per GTFS shape, not a verified N/S mapping; see the architecture doc.
  const previousName = currentOrientation?.previous?.name;
  const nextName = currentOrientation?.next?.name;
  const previousLabel = previousName ? escapeHtml(previousName.toUpperCase()) : "—";
  const nextLabel = nextName ? escapeHtml(nextName.toUpperCase()) : "—";
  // STATION-04A -- these two marks can visually truncate (station.html's
  // own text-overflow:ellipsis) at narrow drawer widths; `title` keeps the
  // full real name available (native tooltip / long-press) rather than
  // simply losing it.
  const previousTitle = previousName ? ` title="${escapeHtml(previousName)}"` : "";
  const nextTitle = nextName ? ` title="${escapeHtml(nextName)}"` : "";
  return `
    <div class="station-line-orientation" aria-hidden="false">
      <div class="station-line-mark station-line-mark--dim"${previousTitle}>${previousLabel}</div>
      <div class="station-line-mark station-line-mark--current"><span class="station-line-dot"></span> ${escapeHtml(name.toUpperCase())}</div>
      <div class="station-line-mark station-line-mark--dim"${nextTitle}>${nextLabel}</div>
    </div>
    ${currentOrientation ? "" : `<p class="station-cover-note">Neighboring stations aren’t available in this view yet.</p>`}
  `;
}

function render(): void {
  const display = currentDisplay;
  if (display.kind === "loading") {
    root.innerHTML = `<p class="station-cover-status">Loading station…</p>`;
    return;
  }
  if (display.kind === "unknown-station") {
    root.innerHTML = `<p class="station-cover-status">Unknown station (${escapeHtml(display.stationId)}).</p>`;
    return;
  }
  const badges = display.routes.map(renderRouteBadge).join("");
  root.innerHTML = `
    <h1 class="station-cover-name">${escapeHtml(display.name)}</h1>
    <div class="station-cover-routes">${badges}</div>
    ${display.boroughLabel ? `<p class="station-cover-location">${escapeHtml(display.boroughLabel)}</p>` : ""}

    ${renderDirectionControl()}
    ${renderArrivals()}
    ${renderLineOrientation(display.name)}

    <button type="button" id="station-cover-enter-platform" class="station-cover-enter-platform">
      ENTER PLATFORM
    </button>
  `;

  root.querySelectorAll<HTMLButtonElement>("[data-direction]").forEach((button) => {
    button.addEventListener("click", () => {
      const next = button.dataset.direction as StationArrivalDirection;
      if (next === direction) return;
      direction = next;
      render();
    });
  });

  if (isEmbedded) {
    root.querySelectorAll<HTMLElement>("[data-route-id]").forEach((badge) => {
      const routeId = badge.dataset.routeId;
      if (!routeId) return;
      badge.addEventListener("click", () => postShowLineMode(routeId));
      badge.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        postShowLineMode(routeId);
      });
    });
  }

  root.querySelector<HTMLButtonElement>("#station-cover-enter-platform")?.addEventListener("click", () => handleEnterPlatformClick(display.stationId));
}

async function boot(): Promise<void> {
  const stationId = homeSurface.stationId;
  if (!stationId) {
    currentDisplay = { kind: "unknown-station", stationId: "" };
    render();
    homeSurface.reportReady(); // never hang HOME's readiness handshake on a missing param
    return;
  }
  currentDisplay = deriveStationCoverDisplay(stationId, undefined); // "loading"
  render();
  try {
    const snapshot = await fetchStaticSnapshot();
    const truth: StationTruth | null = resolveStationTruth(snapshot, stationId);
    currentDisplay = deriveStationCoverDisplay(stationId, truth);
    // STATION-03 -- a station can serve multiple routes; local-line
    // orientation is inherently per-route, so the first canonical route
    // is used (Bay Ridge Av serves exactly one, R, today). A future
    // multi-route station would need its own route-selection UI, not
    // silently picking one -- out of scope for this batch.
    const primaryRouteId = truth?.routes[0]?.routeId;
    currentOrientation = primaryRouteId ? resolveStationLineOrientation(snapshot, primaryRouteId, stationId) : null;
  } catch {
    currentDisplay = deriveStationCoverDisplay(stationId, null); // fails safely, never a fabricated record
    currentOrientation = null;
  } finally {
    render();
    // Same "first stable, interactive state" contract BLACKBOOK's own
    // reportReady() uses -- never gated on the fetch succeeding, so a
    // real network failure can't hang HOME's own mount readiness timer.
    homeSurface.reportReady();
  }
}

void boot();
