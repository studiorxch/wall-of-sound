// SubwayBlackbookNavLink v1.0.0
// MAP / Blackbook / RADIO Integration Beta -- decision 3/4: MAP stays the
// navigational surface; Blackbook is the primary creative destination for
// every member (not gated -- unlike SubwayMapPaintSurface's own StudioRich-
// only toolbar). This is the MAP -> Blackbook half of the required
// bidirectional link; music/blackbook.html carries its own "<- MAP" link
// back. A plain same-tab `<a href>` on purpose, not `target="_blank"`: the
// app's own architectural constraint is ONE authoritative RADIO playback
// engine at a time, and opening Blackbook in a second tab while this tab's
// (currently nonexistent -- see this build's own recon) MAP player kept
// running would risk exactly the duplicate-player condition that rule
// forbids. Same-tab navigation also matches the target same-origin
// architecture this build's RADIO session persistence (radioResumableSession.ts)
// is designed for.
(function (global) {
  "use strict";
  var SBE = (global.SBE = global.SBE || {});
  var LINK_ID = "subway-blackbook-nav-link";
  // Matches this repo's own existing dev-server convention (see
  // wall/maps/index.html's own MUSIC link) -- update alongside that one if
  // the MUSIC dev server's port ever changes.
  var BLACKBOOK_URL = "http://localhost:5173/blackbook.html";

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
    link.style.cssText = "position:fixed;top:16px;right:16px;z-index:10000;"
      + "padding:8px 14px;border-radius:9px;font:700 11px/1 -apple-system,sans-serif;"
      + "letter-spacing:.07em;text-decoration:none;color:#f4efe7;"
      + "background:rgba(14,13,11,.86);border:1px solid rgba(255,255,255,.16);";
    global.document.body.appendChild(link);
  }

  try { _ensureLink(); } catch (error) {
    console.warn("[SubwayBlackbookNavLink] init failed:", error && error.message || error);
  }

  SBE.SubwayBlackbookNavLink = Object.freeze({
    VERSION: "1.0.0",
    __test: { linkId: LINK_ID, blackbookUrl: BLACKBOOK_URL },
  });
})(window);
