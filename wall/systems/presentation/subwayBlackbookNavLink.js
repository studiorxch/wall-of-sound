// SubwayBlackbookNavLink v1.1.0
// MAP / Blackbook / RADIO Integration Beta -- decision 3/4: MAP stays the
// navigational surface; Blackbook is the primary creative destination for
// every member (not gated -- unlike SubwayMapPaintSurface's own StudioRich-
// only toolbar). This is the MAP -> Blackbook half of the required
// bidirectional link; music/blackbook.html carries its own "<- MAP" link
// back. A plain same-tab `<a href>` on purpose, not `target="_blank"`: the
// app's own architectural constraint is ONE authoritative RADIO playback
// engine at a time, and opening Blackbook in a second tab while this tab's
// MAP RADIO receiver kept running would risk exactly the duplicate-player
// condition that rule forbids. Same-tab navigation also matches the target
// same-origin architecture this build's RADIO session persistence
// (radioResumableSession.ts) is designed for.
//
// β0.1 PRODUCT CONVERGENCE (v1.1.0): no more hardcoded localhost dev port --
// resolved relative to THIS page's own window.location, deployment-safe on
// any host/port. In the real production build, `wall/` is copied to
// `dist/wall-app/` and `blackbook.html` sits at `dist/`'s own root (see
// music/vite.config.ts's copy-wall-app-public plugin), so from
// `.../wall-app/index.html`, `../blackbook.html` always lands on the real
// `blackbook.html` at the SAME origin. Same-origin-only by design, matching
// this codebase's existing nowPlaying/palette bridges -- a wall/ instance
// served standalone (no MUSIC alongside it) was never a supported target
// for this link either way.
(function (global) {
  "use strict";
  var SBE = (global.SBE = global.SBE || {});
  var LINK_ID = "subway-blackbook-nav-link";
  var BLACKBOOK_URL = new URL("../blackbook.html", global.location.href).href;

  function _ensureLink() {
    if (!global.document || global.document.getElementById(LINK_ID)) return;
    var link = global.document.createElement("a");
    link.id = LINK_ID;
    link.className = "subway-blackbook-nav-link";
    link.href = BLACKBOOK_URL;
    link.textContent = "BLACKBOOK";
    link.setAttribute("aria-label", "Open Blackbook to draw");
    // Inline styling on purpose -- this is a minimal beta addition and
    // should not require touching wall/'s own stylesheets to be visible.
    // β0.1 PRODUCT CONVERGENCE: top:60px (not 16px) -- radioChannelHud.js's
    // own LIVE RADIO/RADIO ON-OFF/volume bar already occupies top:16px at
    // this same right:16px anchor; stacking vertically avoids the two
    // overlapping and swallowing each other's clicks.
    link.style.cssText = "position:fixed;top:60px;right:16px;z-index:10000;"
      + "padding:8px 14px;border-radius:9px;font:700 11px/1 -apple-system,sans-serif;"
      + "letter-spacing:.07em;text-decoration:none;color:#f4efe7;"
      + "background:rgba(14,13,11,.86);border:1px solid rgba(255,255,255,.16);";
    global.document.body.appendChild(link);
  }

  try { _ensureLink(); } catch (error) {
    console.warn("[SubwayBlackbookNavLink] init failed:", error && error.message || error);
  }

  SBE.SubwayBlackbookNavLink = Object.freeze({
    VERSION: "1.1.0",
    __test: { linkId: LINK_ID, blackbookUrl: BLACKBOOK_URL },
  });
})(window);
