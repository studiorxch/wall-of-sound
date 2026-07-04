---
date_generated: 2026-06-30
project: WALL
source_pack: do_not_reopen
coverage_start: 2026-06-28
coverage_end: 2026-06-30
---

# WALL Do Not Reopen

## Closed Issues (This Rollup — Globe + Broadcast Surface 0628B–0628D)

- **Do not set `_ORBITAL_STYLE` to any WOS dark style.** Dark styles render as a dim bowl, not Planet Earth.
  - Closed by: 0628B-HOTFIX-02

- **Do not restore `orbitalAtmosphereOpacity > 0` for satellite Orbital Earth.** The satellite globe has its own natural limb. CSS radial overlays at any opacity damage the planet read.
  - Closed by: 0628B-HOTFIX-03

- **Do not remove `map.setFog(null)` from `_onOrbitalStyleReady()`.** Mapbox native fog in globe projection is the primary cause of the bowl ring.
  - Closed by: 0628B-HOTFIX-03

- **Do not apply projection or camera before the `style.load` callback.** `map.setStyle()` resets projection synchronously — any `setProjection()` call before `style.load` is overwritten.
  - Closed by: 0628B-HOTFIX-02

- **Do not re-enable `#atmosphere-composite` during Orbital Earth.** The canvas draws night tint and brightness veil driven by WOS weather state — not synchronized to Orbital mode. Re-enabling contaminates the satellite globe.
  - Closed by: 0628C

- **Do not put `_injectOrbitalCSS()` only inside `_buildScene()`.** The earth submode bypasses `_buildScene()`. CSS must be injected from `enterFromMapContext()`.
  - Closed by: 0628D

- **Do not use `display:none` for `.mapboxgl-ctrl-*` during Orbital.** Use `opacity:0; pointer-events:none` to avoid triggering Mapbox resize events.
  - Closed by: 0627J

- **Do not leave the transport deck on Orbital when entry fails.** All entry failure paths (throw or silent `_active=false`) must call `selectTransport('flight')`.
  - Closed by: 0628C-FOLLOWUP

## Closed Issues (Prior Rollup — Orbital Earth Recovery 0627–0627H)

- Do not add stars/haze/vignette/scan rings to the default Orbital Earth baseline. They are opt-in only. — 0627C
- Do not call `_buildScene()` or `_applyPreset()` in the earth submode dispatch. — 0627F
- Do not allow legacy submodes to reach default Orbital entry. — 0627F
- Do not remove the `:not(.wos-orbital-earth-active)` CSS scope guard. — 0627E
- Do not change camera retry step back to 0.25. — 0627D
- Do not remove `wos-transition-active` or `wos-map-dimmed` cleanup from either the coordinator or the inline fallback. — 0627G
- Do not clear `.mapboxgl-canvas-container` styles via class removal alone. — 0627G
- Do not split `applyCleanEarthBaseline()` or `_CLEAN_EARTH_TOKENS` to another file. — 0627E
- `enter()` on `MoonModeController` must always go through `enterFromOrbitalEarth()`. — 0627I
- Do not change `--orb-star-opacity` or `--orb-haze-opacity` CSS fallbacks away from `0`. — 0627H
- The audio shimmer guard `if (stars && baseStars > 0)` must remain. — 0627H

## Closed Issues (Three Sky 0625E–F)

- Do not move sky rendering back to PLAY. — 0625E
- Do not fix sky darkness with CSS overlay, vignette, or screen wash. — 0625F
- Do not remove `MIN_LUM` minimum luminance floor. — 0625F

## Closed Issues (Studio Recovery 0619–0620)

- Import button is topbar-only; not in Library panel column. — 0619G
- Building Inspector label is "Building"; not "Building Replacement". — 0620A

## Banned Patterns

- WOS dark styles as Orbital Earth map style
- Brightening filters as a substitute for correct source imagery in globe projection
- `_buildScene()` or `_applyPreset()` in the earth submode dispatch
- CSS radial atmosphere overlay at any opacity above 0 during satellite Orbital
- Mapbox native fog during Orbital Earth
- `#atmosphere-composite` visible during Orbital Earth
- `_injectOrbitalCSS()` only in `_buildScene()` — must run from `enterFromMapContext()`
- Projection/camera before `style.load` callback
- Silent Orbital entry failure leaving transport deck on Orbital
- Stars, haze, vignette, scan rings in the default Orbital Earth baseline
- CSS dimming on `body.wos-orbital-active` without `:not(.wos-orbital-earth-active)` scope
- `SKY_PARAMS` or `_CLEAN_EARTH_TOKENS` scattered across multiple files
- `_placementDiag` persisted to manifests

## Stable Assumptions

- `OrbitalEarthMode.js` owns: satellite style swap, globe projection, camera presets, clean baseline, all Orbital Earth diagnostics.
- Every Orbital Earth entry: `_injectOrbitalCSS()` → `enter()` → `style.load` → `setFog(null)` → `setProjection('globe')` → `applyCleanEarthBaseline()` → `setCameraPreset('readable_orbit')`.
- Map → Orbital → Map round trip leaves no stuck classes, styles, or filters.
- `wall/threeSkyLayer.js` is the sky renderer (removed by setStyle on Orbital entry; not explicitly restored — Three Sky re-adds itself via `style.load` on WOS style restore or map reload).
- `wosMapStyleAuthority.js` is the shared Mapbox token source. Do not call `map.setStyle()` through `MapboxViewportRuntime.setPresentationMode()` for the Orbital swap.
