# WOS Studio (0603N)

Separate authoring shell for Wall of Sound. **Wall** stays the live product/world
viewer; **Studio** is the full-page asset/identity workspace.

```
WOS
├─ Wall   (wall/index.html)   — live World View, Drive, feeds, actors
└─ Studio (studio/index.html) — Glyph Lab, Palette Lab, Actor Library, Proof Stage
```

## Run
Open `studio/index.html` via the same local dev server that serves `wall/`.
Studio loads the **shared** SBE actor/visual/palette modules from `../wall/systems/…`
(no duplication, no forked registries).

## Safety
Studio starts **nothing live**: no Drive, no Hero runtime, no Citi Bike / AIS /
aircraft polling, no ambient traffic, no Mapbox style mutation (Studio has no map
in v1). It only initializes data registries + the `_wos.debug` namespace.

## Panels
- **Actor Library** — identity profiles from `SBE.ActorVisualIdentityAuthority`, grouped by category.
- **Palette Lab** — swatches from `SBE.ActorPresentationPaletteRegistry`.
- **Proof Stage** — `Spawn / Clear / Refresh` wired to `_wos.debug.worldActors.visualProof*` (real pipeline; no map, so data-only here).
- **Glyph Lab** — placeholder home for the future full-page glyph tools (Wall's current glyph section remains functional).
- **Inspector** — read-only identity fields + palette preview for the selected profile.

## Debug
`_wos.debug.studio.state() | mode(name) | refresh() | selectActor(key)`

Hash routing: `studio/index.html#actor-library | #glyph-lab | #palette-lab | #proof-stage`.
