0512_WOS_UniversalDrawerSystem_v1.0.0
Purpose

Introduce a unified expandable drawer architecture for WOS so systems like:

Sampler
GlyphLab
SVG Library
World Layers
Materials
MIDI Routing

can exist without overcrowding the topbar or permanently consuming canvas space.

This becomes the foundation for future expandable systems.

Core Principle

Replace:

toolbar = all controls

With:

toolbar = launchers
drawer = system workspace

The canvas remains the primary visual surface.

Goals
Immediate
Integrate GlyphLab into WOS cleanly
Reuse sampler slideout behavior
Remove future topbar bloat
Allow contextual systems to appear/disappear
Long-Term
Unified drawer framework
Scalable UI architecture
OBS-friendly clean presentation
Multi-system world editing
UI Architecture
Launcher Rail

Minimal vertical launcher strip.

Example:

[🎵] sampler
[✒] glyph
[🧱] shapes
[🌍] worlds
[⚙] systems

Launchers DO NOT contain controls.

They ONLY open systems.

Drawer Layout
┌────────────────────────────┐
│ Drawer Header │
├────────────────────────────┤
│ System Content │
│ │
│ sampler / glyph / etc │
│ │
├────────────────────────────┤
│ contextual footer │
└────────────────────────────┘
Required State
main.js
state.ui = {
activeDrawer: null, // "sampler" | "glyph" | etc
};
Drawer Registry
NEW

ui/drawerSystem.js

(function initDrawerSystem(global) {
"use strict";

const SBE = (global.SBE = global.SBE || {});

const registry = {};

function registerDrawer(config) {
registry[config.id] = config;
}

function getDrawer(id) {
return registry[id] || null;
}

function getAllDrawers() {
return Object.values(registry);
}

SBE.DrawerSystem = {
registerDrawer,
getDrawer,
getAllDrawers,
};

})(window);
Drawer API
Register
SBE.DrawerSystem.registerDrawer({
id: "glyph",
title: "GlyphLab",
side: "right",
width: 420,
render: renderGlyphDrawer,
});
index.html
ADD

<script src="./ui/drawerSystem.js"></script>

Load BEFORE:

<script src="./ui/controls.js"></script>

Launcher Rail HTML
ADD

Inside <body>

<div id="launcher-rail" class="launcher-rail">
  <button class="launcher-btn" data-drawer="sampler">🎵</button>
  <button class="launcher-btn" data-drawer="glyph">✒</button>
</div>
Drawer Container HTML
ADD
<aside id="drawer-panel" class="drawer-panel hidden">
  <div id="drawer-content"></div>
</aside>
styles.css
ADD
.launcher-rail {
  position: absolute;
  top: 80px;
  right: 20px;

display: flex;
flex-direction: column;
gap: 8px;

z-index: 2000;
}

.launcher-btn {
width: 42px;
height: 42px;

border: 1px solid rgba(255,255,255,0.08);
background: rgba(20,20,20,0.92);

color: white;

border-radius: 10px;

cursor: pointer;
}

.launcher-btn:hover {
background: rgba(40,40,40,0.95);
}

.drawer-panel {
position: absolute;

top: 0;
right: 0;

width: 420px;
height: 100vh;

background: rgba(10,10,10,0.98);

border-left: 1px solid rgba(255,255,255,0.08);

transform: translateX(100%);
transition: transform 0.24s ease;

z-index: 1999;

overflow: hidden;
}

.drawer-panel.open {
transform: translateX(0%);
}

.drawer-panel.hidden {
display: block;
}

#drawer-content {
width: 100%;
height: 100%;
overflow-y: auto;
}
controls.js
ADD
const launcherButtons =
document.querySelectorAll(".launcher-btn");

const drawerPanel =
document.getElementById("drawer-panel");

const drawerContent =
document.getElementById("drawer-content");

launcherButtons.forEach((button) => {

button.addEventListener("click", () => {

    const drawerId =
      button.dataset.drawer;

    if (state.ui.activeDrawer === drawerId) {

      state.ui.activeDrawer = null;

      drawerPanel.classList.remove("open");

      drawerContent.innerHTML = "";

      return;
    }

    state.ui.activeDrawer = drawerId;

    drawerPanel.classList.add("open");

    const drawer =
      SBE.DrawerSystem.getDrawer(drawerId);

    if (!drawer) {
      return;
    }

    drawerContent.innerHTML = "";

    drawer.render(drawerContent);

});
});
GlyphLab Integration
NEW

ui/glyphDrawer.js

Initial temporary version:

(function initGlyphDrawer(global) {
"use strict";

const SBE = (global.SBE = global.SBE || {});

function renderGlyphDrawer(container) {

    container.innerHTML = `
      <div class="glyph-drawer">
        <h2>GlyphLab</h2>

        <p>Glyph system connected.</p>

        <button id="open-glyph-editor">
          Open Editor
        </button>
      </div>
    `;

}

SBE.DrawerSystem.registerDrawer({
id: "glyph",
title: "GlyphLab",
side: "right",
width: 420,
render: renderGlyphDrawer,
});

})(window);
Sampler Migration

Move existing sampler UI into:

ui/samplerDrawer.js

using same registration pattern.

Important Rule
Drawers MUST NOT:
directly mutate unrelated UI
reposition canvas
create floating windows
permanently occupy screen space

They are temporary contextual systems.

Architectural Win

This creates:

WOS = runtime world
Drawers = contextual creation systems

That separation is critical.

Immediate Outcome

After this spec:

GlyphLab can live INSIDE WOS
Canvas remains clean
Future systems scale properly
Topbar stops collapsing
Maps/worlds can continue cleanly
