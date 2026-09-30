// STATION-01 -- the Station Cover page. A hosted StudioRich surface,
// alongside MAP and BLACKBOOK, that CONSUMES existing canonical Station
// Truth (stationTruth.ts) and renders the smallest reusable Cover
// presentation (stationCoverPresentation.ts) -- it owns neither of those,
// and owns no station database of its own. MEMBER and RADIO remain
// entirely the persistent parent's (see homeMemberAvatar.ts/
// homeRadioSession.ts) -- this page constructs neither, deliberately.

import { fetchStationTruth } from "../logic/maps/stationTruth";
import { deriveStationCoverDisplay, type StationCoverDisplay } from "../logic/maps/stationCoverPresentation";
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

function render(display: StationCoverDisplay): void {
  if (display.kind === "loading") {
    root.innerHTML = `<p class="station-cover-status">Loading station…</p>`;
    return;
  }
  if (display.kind === "unknown-station") {
    root.innerHTML = `<p class="station-cover-status">Unknown station (${escapeHtml(display.stationId)}).</p>`;
    return;
  }
  const badges = display.routes
    .map((route) => `<span class="station-route-badge" style="background:${route.color};color:${route.textColor}">${escapeHtml(route.label)}</span>`)
    .join("");
  root.innerHTML = `
    <h1 class="station-cover-name">${escapeHtml(display.name)}</h1>
    <div class="station-cover-routes">${badges}</div>
    ${display.boroughLabel ? `<p class="station-cover-location">${escapeHtml(display.boroughLabel)}</p>` : ""}
    <button type="button" class="station-cover-creative-space" disabled
      title="Bay Ridge Av's public creative space doesn't exist yet -- this is the navigation boundary a future batch completes.">
      Enter station creative space — coming soon
    </button>
  `;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}

async function boot(): Promise<void> {
  const stationId = homeSurface.stationId;
  if (!stationId) {
    render({ kind: "unknown-station", stationId: "" });
    homeSurface.reportReady(); // never hang HOME's readiness handshake on a missing param
    return;
  }
  render(deriveStationCoverDisplay(stationId, undefined)); // "loading"
  try {
    const truth = await fetchStationTruth(stationId);
    render(deriveStationCoverDisplay(stationId, truth));
  } catch {
    render(deriveStationCoverDisplay(stationId, null)); // fails safely, never a fabricated record
  } finally {
    // Same "first stable, interactive state" contract BLACKBOOK's own
    // reportReady() uses -- never gated on the fetch succeeding, so a
    // real network failure can't hang HOME's own mount readiness timer.
    homeSurface.reportReady();
  }
}

void boot();
