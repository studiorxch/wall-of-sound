// STATION-01/02 -- the Station Cover page. A hosted StudioRich surface,
// alongside MAP and BLACKBOOK, that CONSUMES existing canonical Station
// Truth (stationTruth.ts) and renders the smallest reusable Cover
// presentation (stationCoverPresentation.ts) -- it owns neither of those,
// and owns no station database of its own. MEMBER and RADIO remain
// entirely the persistent parent's (see homeMemberAvatar.ts/
// homeRadioSession.ts) -- this page constructs neither, deliberately.
//
// STATION-02 -- adds the route-symbol visual refinement, a Northbound/
// Southbound direction control, and the (currently empty) arrival-rows
// display rule. Live arrivals and local line orientation are DELIBERATELY
// not wired to real data this pass -- both would-be canonical authorities
// (`SubwayArrivalIntelligence`, and any station-ordering-along-a-route
// source) are live, in-memory objects scoped to `wall/`'s own JS realm,
// structurally unreachable from this separately-hosted document today.
// See docs/architecture/subway/README.md's STATION-02 section for the
// full recon and the smallest recommended resolution for each gap. This
// page shows an honest "not yet available" state for both rather than
// inventing data -- never a fabricated arrival, never a fabricated
// neighboring station.

import { fetchStationTruth } from "../logic/maps/stationTruth";
import { deriveStationCoverDisplay, type StationCoverDisplay } from "../logic/maps/stationCoverPresentation";
import { selectStationArrivalRows, type StationArrival, type StationArrivalDirection } from "../logic/maps/stationArrivalPresentation";
import { createStationHomeSurface } from "../home/stationHomeSurface";

const required = <T extends Element>(selector: string): T => {
  const node = document.querySelector<T>(selector);
  if (!node) throw new Error(`station_cover_element_missing:${selector}`);
  return node;
};

const homeSurface = createStationHomeSurface();

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

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}

function renderRouteBadge(route: StationCoverDisplay extends { kind: "resolved"; routes: readonly (infer R)[] } ? R : never): string {
  return `<span class="station-route-badge" style="--route-color:${route.color};--route-text:${route.textColor};--route-tint:${route.tintBackground}">${escapeHtml(route.label)}</span>`;
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
  // Minimal resting state -- only the current station, never a
  // fabricated neighbor (see this file's own header). "—" marks stand in
  // for unknown adjacent stops rather than omitting the idea of a line
  // entirely.
  return `
    <div class="station-line-orientation" aria-hidden="false">
      <div class="station-line-mark station-line-mark--dim">—</div>
      <div class="station-line-mark station-line-mark--current"><span class="station-line-dot"></span> ${escapeHtml(name.toUpperCase())}</div>
      <div class="station-line-mark station-line-mark--dim">—</div>
    </div>
    <p class="station-cover-note">Neighboring stations aren’t available in this view yet.</p>
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

    <button type="button" class="station-cover-creative-space" disabled
      title="Bay Ridge Av's public creative space doesn't exist yet -- this is the navigation boundary a future batch completes.">
      Enter station creative space — coming soon
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
    const truth = await fetchStationTruth(stationId);
    currentDisplay = deriveStationCoverDisplay(stationId, truth);
  } catch {
    currentDisplay = deriveStationCoverDisplay(stationId, null); // fails safely, never a fabricated record
  } finally {
    render();
    // Same "first stable, interactive state" contract BLACKBOOK's own
    // reportReady() uses -- never gated on the fetch succeeding, so a
    // real network failure can't hang HOME's own mount readiness timer.
    homeSurface.reportReady();
  }
}

void boot();
