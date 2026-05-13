// 0512_WOS_UniversalDrawerSystem_v1.0.0
// Sampler Drawer — mounts the existing #overlay-view-sampler into the drawer runtime.
// Vanilla IIFE. Registers with SBE.DrawerSystem.
// Load order: drawerSystem.js → samplerDrawer.js → controls.js
//
// Uses DOM-move pattern: mount() physically relocates #overlay-view-sampler
// into the drawer container so all existing IDs and event listeners are preserved.
// unmount() returns it to #overlay-panel__body for context-menu compatibility.

(function initSamplerDrawer(global) {
  "use strict";

  const SBE = (global.SBE = global.SBE || {});

  var OVERLAY_VIEW_ID = "overlay-view-sampler";
  var FALLBACK_PARENT_ID = "overlay-panel-body-inner"; // see unmount fallback below

  // ── Mount ─────────────────────────────────────────────────────────────────
  // Moves the real #overlay-view-sampler node into the drawer container.
  // renderBankGrid() in main.js uses document.getElementById("bank-grid") —
  // that ID is preserved on the moved node, so bank rendering keeps working.

  function mount(container) {
    var el = document.getElementById(OVERLAY_VIEW_ID);
    if (!el) {
      container.innerHTML = '<div class="drawer-view"><div class="drawer-view__body"><p class="drawer-hint" style="opacity:0.4;">Sampler view not found.</p></div></div>';
      return;
    }

    // Wrap in drawer chrome
    var wrapper = document.createElement("div");
    wrapper.className = "drawer-view";
    wrapper.id = "drawer-sampler-wrapper";

    var header = document.createElement("div");
    header.className = "drawer-view__header";
    header.innerHTML = '<span class="drawer-view__title">Sampler</span>';

    var body = document.createElement("div");
    body.className = "drawer-view__body";

    el.style.display = "";
    body.appendChild(el);
    wrapper.appendChild(header);
    wrapper.appendChild(body);
    container.appendChild(wrapper);

    // Re-render bank grid after the current paint cycle so the element
    // is fully in the layout tree before grid dimensions are measured.
    if (global._wos && typeof global._wos.refreshBankGrid === "function") {
      setTimeout(function () { global._wos.refreshBankGrid(); }, 0);
    }
  }

  // ── Unmount ───────────────────────────────────────────────────────────────
  // Returns #overlay-view-sampler to the overlay panel body so context-menu
  // openPanel("sampler") continues to work.

  function unmount(container) {
    var el = document.getElementById(OVERLAY_VIEW_ID);
    if (!el) return;

    el.style.display = "none";

    // Return to original parent (.overlay-panel__body)
    var originalParent = document.querySelector(".overlay-panel__body");
    if (originalParent) {
      originalParent.appendChild(el);
    }

    // Clear drawer wrapper
    container.innerHTML = "";
  }

  // ── Registration ──────────────────────────────────────────────────────────

  SBE.DrawerSystem.registerDrawer({
    id:      "sampler",
    title:   "Sampler",
    side:    "right",
    width:   420,
    mount:   mount,
    unmount: unmount,
  });

})(window);
