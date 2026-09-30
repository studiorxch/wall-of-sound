// ── Platform ─────────────────────────────────────────────────────────────────
// STATION-08 (0914_WOS_Subway_First_Platform_Surface_v1.0.0)
//
// The first real Platform product surface. Joins the existing persistent
// StudioRich shell architecture exactly like Station Cover already does
// (see stationCoverRuntime.ts's own identical framing) -- MEMBER and RADIO
// remain entirely the persistent parent's. This page constructs neither its
// own member-identity authority nor its own radio-receiver session
// anywhere in this file (verified directly by platformRuntime.test.ts's
// own static-source assertion, which names the exact construction
// functions this file must never import), and renders no MEMBER/RADIO UI
// of its own -- both already persist automatically as HOME's own permanent
// chrome, outside whichever surface is currently mounted.
//
// Permanent composition this batch establishes:
//   MAP -> select station -> MEZZANINE DRAWER -> ENTER PLATFORM -> PLATFORM
//   PLATFORM = header (identity/direction/route/honest-arrival-state)
//            + DETAIL VIEW (~87.5%, intentionally neutral -- no writable
//              surface architecture is decided here)
//            + PLATFORM OVERVIEW (~12.5%, the STATION-07 topology pipeline,
//              unmodified -- StationGeometryData -> projectStationTopology()
//              -> renderStationTopologySvg())
//
// Canonical station identity carries through the SAME `stationId` query
// param/route field Station Cover already uses -- never a second id scheme,
// never hardcoded to Bay Ridge Av (R42) anywhere in THIS file; R42 is simply
// the only station with real canonical geometry today (see
// stationGeometryRegistry.ts's own header) -- any other real/valid stationId
// reaches this exact same code path and renders an honest "topology not yet
// available" Overview state instead of silently substituting Bay Ridge.
import { fetchStaticSnapshot, resolveStationTruth, type StationTruth } from "../logic/maps/stationTruth";
import { deriveStationCoverDisplay, type StationCoverDisplay } from "../logic/maps/stationCoverPresentation";
import { resolveKnownStationGeometry } from "../logic/maps/stationGeometryRegistry";
import { projectStationTopology } from "../logic/maps/stationTopologyProjection";
import { renderStationTopologySvg } from "../logic/maps/stationTopologySvgRenderer";
import { selectStationArrivalRows, type StationArrival, type StationArrivalDirection } from "../logic/maps/stationArrivalPresentation";
import { createPlatformHomeSurface } from "../home/platformHomeSurface";

const required = <T extends Element>(selector: string): T => {
  const node = document.querySelector<T>(selector);
  if (!node) throw new Error(`platform_element_missing:${selector}`);
  return node;
};

const homeSurface = createPlatformHomeSurface();

const backLink = required<HTMLAnchorElement>("#platform-back-to-map");
const headerEl = required<HTMLElement>("#platform-header");
const bodyEl = required<HTMLElement>("#platform-body");
const statusRoot = required<HTMLElement>("#platform-status-root");
const overviewContent = required<HTMLElement>("#platform-overview-content");

// Same standalone-vs-hosted delegation pattern stationCoverRuntime.ts's own
// back link already uses -- intercept only when truly HOME-hosted, a plain
// anchor otherwise.
if (homeSurface.isHome) {
  backLink.addEventListener("click", (event) => {
    event.preventDefault();
    if (!homeSurface.requestNavigateToMap()) {
      backLink.setAttribute("aria-label", "HOME rejected MAP navigation; retry from HOME");
    }
  });
}

// STATION-08 -- direction is informational only, reused from Station
// Cover's own N/S semantics for the header display -- not yet an
// interactive toggle in this minimal shell (a future batch may add one).
// Deliberately NOT wired to "which platform is selected" -- service/
// direction belongs to tracks, platforms are physical geometry (see this
// batch's own explicit instruction); an island station has no "the
// northbound platform" at all.
const direction: StationArrivalDirection = "N";
const ARRIVALS: readonly StationArrival[] = []; // honest -- see stationCoverRuntime.ts's own identical STOP-finding note; live arrival authority is still unreachable here.

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}

function renderHeader(display: StationCoverDisplay): void {
  if (display.kind !== "resolved") return;
  const routeBadges = display.routes
    .map((route) => `<span class="station-route-badge" style="--route-color:${route.color};--route-text:${route.textColor};--route-tint:${route.tintBackground}">${escapeHtml(route.label)}</span>`)
    .join("");
  const arrivalLabel = selectStationArrivalRows(ARRIVALS, direction).length > 0 ? "" : "arrival unavailable";
  headerEl.innerHTML = [
    `<span id="platform-header-name">${escapeHtml(display.name.toUpperCase())}</span>`,
    `<span class="platform-header-sep">|</span>`,
    `<span id="platform-header-direction">${direction === "N" ? "NORTHBOUND" : "SOUTHBOUND"}</span>`,
    `<span class="platform-header-sep">|</span>`,
    routeBadges,
    `<span class="platform-header-sep">|</span>`,
    `<span id="platform-header-arrival">${escapeHtml(arrivalLabel)}</span>`,
  ].join("");
  headerEl.hidden = false;
}

function renderOverview(stationId: string): void {
  const geometry = resolveKnownStationGeometry(stationId);
  if (!geometry) {
    overviewContent.innerHTML = `<p class="platform-overview-note">Station topology isn’t available in this view yet.</p>`;
    return;
  }
  // The exact, unmodified STATION-07 pipeline -- no archetype branch, no
  // second topology model. This module never inspects `stationId` beyond
  // the registry lookup above; everything downstream reads only real
  // StationGeometryData fields.
  const model = projectStationTopology({ platforms: geometry.platforms, trackCenterlines: geometry.trackCenterlines, wallSurfaces: geometry.wallSurfaces });
  overviewContent.innerHTML = renderStationTopologySvg(model);
}

async function boot(): Promise<void> {
  const stationId = homeSurface.stationId;
  if (!stationId) {
    // Honest failure -- never silently substitutes Bay Ridge Av or any
    // other station.
    statusRoot.innerHTML = `<p class="platform-status">No station selected.</p>`;
    homeSurface.reportReady(); // never hang HOME's readiness handshake
    return;
  }

  try {
    const snapshot = await fetchStaticSnapshot();
    const truth: StationTruth | null = resolveStationTruth(snapshot, stationId);
    const display = deriveStationCoverDisplay(stationId, truth);
    if (display.kind !== "resolved") {
      statusRoot.innerHTML = `<p class="platform-status">Unknown station (${escapeHtml(stationId)}).</p>`;
      return;
    }
    statusRoot.innerHTML = "";
    renderHeader(display);
    renderOverview(stationId);
    bodyEl.hidden = false;
  } catch {
    statusRoot.innerHTML = `<p class="platform-status">Unknown station (${escapeHtml(stationId)}).</p>`;
  } finally {
    // Same "first stable, interactive state" contract every other hosted
    // surface's own reportReady() uses -- never gated on the fetch
    // succeeding.
    homeSurface.reportReady();
  }
}

void boot();
