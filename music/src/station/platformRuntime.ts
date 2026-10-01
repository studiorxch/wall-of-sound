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
import type { StationGeometryData } from "../data/stationGeometryTypes";
import type { StationDetailSubjectRef } from "../data/stationDetailSubjectTypes";
import { fetchStaticSnapshot, resolveStationTruth, type StationTruth } from "../logic/maps/stationTruth";
import { deriveStationCoverDisplay, type StationCoverDisplay } from "../logic/maps/stationCoverPresentation";
import { resolveKnownStationGeometry } from "../logic/maps/stationGeometryRegistry";
import { projectStationTopology } from "../logic/maps/stationTopologyProjection";
import { renderStationTopologySvg } from "../logic/maps/stationTopologySvgRenderer";
import { isStationDetailSubjectKind, resolveStationDetailSubject } from "../logic/maps/stationDetailSubjectResolver";
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
const detailViewEl = required<HTMLElement>("#platform-detail-view");
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

// ── STATION-10 -- Detail Subject selection proof ────────────────────────────
// The real Base Truth record currently backing the Overview, kept ONLY so a
// click can be resolved against it -- never a second topology model, never
// read by the projection/renderer above (both stay exactly as STATION-07
// left them). Reset on every renderOverview() call (i.e. once per real
// boot()); a station with no real geometry never reaches here at all.
let currentGeometry: StationGeometryData | null = null;
let selectedSubjectRef: StationDetailSubjectRef | null = null;

const DETAIL_SUBJECT_KIND_LABEL: Readonly<Record<StationDetailSubjectRef["subjectKind"], string>> = {
  platform: "Platform",
  track: "Track",
  wall: "Wall",
};

function renderDetailSubject(): void {
  if (!selectedSubjectRef || !currentGeometry) {
    detailViewEl.textContent = "DETAIL VIEW";
    return;
  }
  const ref = selectedSubjectRef;
  detailViewEl.innerHTML = [
    `<div class="platform-detail-subject">`,
    `<div class="platform-detail-row"><span class="platform-detail-label">SUBJECT</span><span class="platform-detail-value">${escapeHtml(DETAIL_SUBJECT_KIND_LABEL[ref.subjectKind])}</span></div>`,
    `<div class="platform-detail-row"><span class="platform-detail-label">ID</span><span class="platform-detail-value">${escapeHtml(ref.subjectId)}</span></div>`,
    `<div class="platform-detail-row"><span class="platform-detail-label">STATION</span><span class="platform-detail-value">${escapeHtml(currentGeometry.stationRef.gtfsStopId)}</span></div>`,
    `</div>`,
  ].join("");
}

// Pure DOM feedback only -- never the source of selection identity (that is
// always `selectedSubjectRef`, resolved against real Base Truth). Matches
// the rendered SVG's own `data-lane-kind`/`data-lane-id` attributes
// (stationTopologySvgRenderer.ts), never a second id scheme.
function applySelectionHighlight(): void {
  overviewContent.querySelectorAll("[data-selected]").forEach((el) => el.removeAttribute("data-selected"));
  if (!selectedSubjectRef) return;
  const ref = selectedSubjectRef;
  const laneEl = Array.from(overviewContent.querySelectorAll(`[data-lane-kind="${ref.subjectKind}"]`)).find(
    (el) => el.getAttribute("data-lane-id") === ref.subjectId,
  );
  laneEl?.setAttribute("data-selected", "true");
}

// Reads the already-existing `data-lane-kind`/`data-lane-id` the STATION-07
// renderer emits on every drawn shape (stationTopologySvgRenderer.ts) --
// never a replaced/forked renderer, never a new rendering-layer identity.
// SVG DOM identity (`data-lane-id`) is only the bridge back to real Base
// Truth: every click builds a StationDetailSubjectRef and resolves it
// against `currentGeometry` via resolveStationDetailSubject() -- the
// rendered element itself is never treated as canonical.
function handleOverviewClick(event: MouseEvent): void {
  if (!currentGeometry) return;
  const target = event.target;
  if (!(target instanceof Element)) return;
  // A lane's own label <text> sits as a sibling, not a descendant, of the
  // shape that actually carries data-lane-id -- fall back to the previous
  // sibling so clicking a lane's own label selects the lane it labels.
  const laneEl = target.closest("[data-lane-id]") ?? (target.tagName === "text" ? target.previousElementSibling : null);
  if (!laneEl || !overviewContent.contains(laneEl)) return;
  const laneKind = laneEl.getAttribute("data-lane-kind");
  const laneId = laneEl.getAttribute("data-lane-id");
  if (!laneId || !laneKind || !isStationDetailSubjectKind(laneKind)) return;

  const ref: StationDetailSubjectRef = {
    stationGeometryId: currentGeometry.id,
    subjectKind: laneKind,
    subjectId: laneId,
  };
  // Resolution never depends on writability (`suitableForArt`) -- a track
  // (which has no such field at all) is exactly as selectable as a wall.
  const resolved = resolveStationDetailSubject(currentGeometry, ref);
  selectedSubjectRef = resolved ? ref : null;
  applySelectionHighlight();
  renderDetailSubject();
}

overviewContent.addEventListener("click", handleOverviewClick);

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
  currentGeometry = geometry;
  selectedSubjectRef = null;
  renderDetailSubject();
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
