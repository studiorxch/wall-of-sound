---
date_generated: 2026-06-30
project: WALL
source_pack: decisions
coverage_start: 2026-06-28
coverage_end: 2026-06-30
---

# WALL Decisions

## Decisions Made in This Rollup (2026-06-28 — Globe + Broadcast Surface)

### Orbital Earth Uses Satellite Imagery, Not WOS Dark Styles (0628B-HOTFIX-02)
- WOS styles (harbor night, dark-v11) render as a dim black/cyan bowl in globe projection. The fix is source texture, not brightening filters.
- Orbital entry swaps to `mapbox://styles/mapbox/satellite-v9`. WOS style saved as full JSON and restored on exit.
- Projection and camera must be applied in the `style.load` callback — `map.setStyle()` resets projection synchronously.

### Fog, Atmosphere Overlay, and Rim Gradient Are All Off (0628B-HOTFIX-03)
- `map.setFog(null)` clears the Mapbox brownish bowl ring in globe projection.
- `orbitalAtmosphereOpacity: 0` and `orbitalRimOpacity: 0` — satellite globe has its own natural limb; CSS radial overlays damage the planet read.
- 500ms deferred overlay init timer removed — `applyCleanEarthBaseline()` in `_onOrbitalStyleReady` is the single authority for overlay opacities.

### AtmosphereComposite Is Suppressed During Orbital, Not Modified (0628C)
- `#atmosphere-composite` draws WOS weather/night tint (nav ~35% dark coverage) above the Mapbox canvas. It persists through `map.setStyle()`.
- Fix: CSS class scoping (`body.wos-orbital-earth-active #atmosphere-composite { display: none }`). `atmosphereComposite.js` and `worldAtmosphere.js` not touched.
- If future specs add Orbital-specific atmosphere (auroras, space weather), they must NOT re-enable the general atmosphere canvas — implement as a separate Orbital-only canvas or scope the general one to read `wos-orbital-earth-active`.

### CSS Injection Must Run Before Submode Branch (0628D)
- `_injectOrbitalCSS()` was only called inside `_buildScene()`, which the earth submode bypasses. All Orbital CSS (left-rail, transport-bar, atmosphere-composite, Mapbox ctrl) was never injected for Orbital Earth.
- Fix: extracted as standalone method; called from `enterFromMapContext()` before the submode dispatch.

### Entry Failures Must Revert the UI (0628C-FOLLOWUP)
- `enter()` setup failures left the transport deck on Orbital with no active Orbital state — UI/runtime desync.
- Entry setup wrapped in try/catch. `transitionToOrbital()` checks `isActive()` after `enter()` returns; reverts to `selectTransport('flight')` on both thrown failure and silent `_active=false`.

### `getGlobeVisibilityReport()` Is Non-Authoritative Before Active (0628C-FOLLOWUP)
- Called during the 0–900ms entry delay window, the report returned misleading `projection: null`. Now returns early with `blockers: ['orbital-earth-mode-not-active']` when `_active` is false.

## Decisions Made in Prior Rollups (2026-06-27)

### Orbital Earth Is Mapbox-First (0627–0627H)
- Canonical entry does not call `_buildScene()` or `_applyPreset()` for the earth submode.
- Legacy submodes (portal_orb, deep_space_listen, minimal_dark_sphere, three_fake_sphere) are manual-only.
- `applyCleanEarthBaseline()` is the entry contract — all FX defaults enforced on every entry.

### Camera Presets (0627D)
- `readable_orbit` zoom=1.0, `broadcast_orbit` zoom=0.8, `deep_orbit` zoom=0.45, `cinematic_crop` zoom=1.35 (manual-only).
- Retry step 0.10 (not 0.25). Failure logged as `CAMERA RESTORE FAILED`.

### CSS Isolation (0627E)
- `body.wos-orbital-active:not(.wos-orbital-earth-active)` — legacy dimming does not apply in Earth mode.

### Transition Cleanup (0627G)
- `wos-transition-active` and `wos-map-dimmed` must be cleared in both `WosModeTransitionController` and inline fallback.
- `.mapboxgl-canvas-container` filter/opacity must be explicitly cleared — class removal alone is not sufficient.

### Moon Gate (0627I)
- `OrbitalEarthMode.isActive()` is the single authorization source for Moon entry.
- `enter()` on `MoonModeController` is an alias that always goes through the gate.

## Three Sky Decisions (2026-06-25)

- Sky rendering in WALL custom layer (not PLAY). `SKY_PARAMS` in `threeSkyLayer.js` is the single source.
- Sky brightness fixed in shader parameters + `MIN_LUM` only — no CSS overlay.
- `cloudAtmosphereRenderer.js` preserved as separate renderer.

## Architecture Locks

- WALL runtime root: `wall/`
- Orbital Earth owner: `wall/systems/orbital/OrbitalEarthMode.js`
- Orbital dispatch / CSS injection: `wall/systems/orbital/OrbitalModeController.js`
- Transition cleanup: `wall/systems/runtime/WosModeTransitionController.js`
- Orbital style: `satellite-v9` on entry; saved WOS style on exit
- Three Sky: `wall/threeSkyLayer.js`
- Cloud renderer: `wall/cloudAtmosphereRenderer.js` (preserved, separate)
- PLAY bridge: `wall/index.html` postMessage listener

## Open Questions

- What is the next WALL build target after Orbital Earth?
- Should Three Sky persist across Orbital entry/exit via explicit re-add, or is auto-removal-by-setStyle correct?
- Is the live time-of-day phase sync needed before next major build?
