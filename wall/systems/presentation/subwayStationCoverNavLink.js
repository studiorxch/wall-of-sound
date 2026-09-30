// SubwayStationCoverNavLink v1.0.0
// STATION-01 -- the smallest clear station-entry interaction for this
// batch's own calibration station, Bay Ridge Av (R42). Deliberately
// modeled on subwayBlackbookNavLink.js's exact same pattern (a small,
// always-visible link, real href standalone, HomeMapSurface.requestNavigate
// when hosted) rather than touching subwayStationHud.js's own,
// more complex, actively-used per-station hover/click interaction --
// general "click any station to enter its Cover" wiring is future work,
// not this batch's scope. Bay Ridge Av's own gtfsStopId ("R42") is
// hardcoded here on purpose -- Station Cover itself
// (music/station.html/stationCoverRuntime.ts) is already fully
// parameterized by stationId and is NOT a one-off; only this entry
// point's own calibration scope is.
//
// Same-tab navigation always (not target="_blank"), same reasoning as
// subwayBlackbookNavLink.js's own doc: one authoritative RADIO playback
// engine at a time. Standalone/legacy-embedded gets a plain, real
// same-origin `<a href>` to station.html?station=R42 (Station Cover
// itself works standalone -- see stationCoverRuntime.ts) exactly like
// BLACKBOOK's own link; hosted intercepts the click and delegates through
// HOME's navigation authority instead.
(function (global) {
  "use strict";
  var SBE = (global.SBE = global.SBE || {});
  var LINK_ID = "subway-station-cover-nav-link";
  var BAY_RIDGE_AV_GTFS_STOP_ID = "R42";
  var STATION_URL = new URL("../station.html?station=" + BAY_RIDGE_AV_GTFS_STOP_ID, global.location.href).href;

  function _ensureLink() {
    if (!global.document || global.document.getElementById(LINK_ID)) return;
    var link = global.document.createElement("a");
    link.id = LINK_ID;
    link.className = "subway-blackbook-nav-link"; // reuse the existing top-chrome pill styling, no new CSS
    link.href = STATION_URL;
    link.textContent = "BAY RIDGE AV STATION";
    link.setAttribute("aria-label", "Open the Bay Ridge Av Station Cover");
    // HOME owns the current-tab route when hosted -- same gate subwayBlackbookNavLink.js already uses.
    if (SBE.WosEndpointGuard?.isHome) {
      link.addEventListener("click", function (event) {
        event.preventDefault();
        if (!SBE.HomeMapSurface.requestNavigate({ surface: "station", stationId: BAY_RIDGE_AV_GTFS_STOP_ID })) {
          link.setAttribute("aria-label", "HOME rejected Station navigation; retry from HOME");
        }
      });
    }
    // top:148px -- below radioChannelHud.js (16px), subwayBlackbookNavLink.js
    // (60px), and the MEMBER-01A-era subway-member-topbar/subway-admin-nav-link
    // slot (104px, hidden when hosted) -- next free slot in the same
    // vertical stack, same right:16px anchor.
    link.style.cssText = "position:fixed;top:148px;right:16px;z-index:10000;"
      + "padding:8px 14px;border-radius:9px;font:700 11px/1 -apple-system,sans-serif;"
      + "letter-spacing:.07em;text-decoration:none;color:#f4efe7;"
      + "background:rgba(14,13,11,.86);border:1px solid rgba(255,255,255,.16);";
    global.document.body.appendChild(link);
  }

  try { _ensureLink(); } catch (error) {
    console.warn("[SubwayStationCoverNavLink] init failed:", error && error.message || error);
  }

  SBE.SubwayStationCoverNavLink = Object.freeze({
    VERSION: "1.0.0",
    __test: { linkId: LINK_ID, bayRidgeAvGtfsStopId: BAY_RIDGE_AV_GTFS_STOP_ID },
  });
})(window);
