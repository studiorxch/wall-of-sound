# BLACKBOOK Architecture Map

Read this before any BLACKBOOK-related task. See [../README.md](../README.md)
for what this directory is.

**BLACKBOOK's product definition has recently become clearer than some
historical naming in this repository.** This page distinguishes what exists
today from architectural direction throughout — do not read a DIRECTION
section as already-built.

## 1. Product/runtime role

BLACKBOOK is StudioRich's art-book / publishing / creative-authoring domain
— **not** one HTML page, not WALL, not spraypaint, not SUBWAY graffiti.
Those are related but distinct: WALL is `wall/`'s own runtime/product
naming (increasingly meaning a public/map-associated writable location, not
a universal abstraction — see [../DEBT.md](../DEBT.md) if a naming
collision needs tracking); SUBWAY's own separate car-surface graffiti system
is documented in [../subway/README.md](../subway/README.md)§8 and is not
BLACKBOOK.

## 2. Current canonical implementation

Entry point: `music/blackbook.html` → `music/src/member/blackbookRuntime.ts`
— a real page in MUSIC's own Vite build (not a separate app, not `wall/`).
Explicit in its own header comment: reuses `prototypes/spatial-spraypaint`'s
**visual language only** (translucent/blurred panel styling) — no Spatial
Spraypaint runtime code (`HandTracker`/`PersonSegmenter`/`WetDripEngine`/cap
engine/camera) is imported or depended on.

## 3. Major components

| Component | File | Role |
|---|---|---|
| Runtime/entry | `music/src/member/blackbookRuntime.ts` | camera, rendering, input, ties everything below together |
| Page/artwork bridge | `music/src/member/blackbookArtworkBridge.ts` | the one canonical Blackbook page identity + default page frame (§5) |
| Blank-canvas bridge | `music/src/member/blankArtworkBridge.ts` + `blankCanvasRuntime.ts` | a second, simpler `blank:default` surface, distinct from the Blackbook page surface |
| Shared authoring persistence | `music/src/member/mapArtworkBridge.ts`'s `createArtworkPersistenceBridge`/`createMapArtworkPersistenceBridge` | the one bridge implementation both Blackbook and MAP paint reuse — not a duplicate |
| Gallery ordering | `music/src/member/artworkGallery.ts` (`sortArtworksByRecency`) | presentation-only helper |
| Art Supplies | `shared/member-identity/src/data/artSupplyTypes.ts` (`PENCIL_SUPPLY`, `PEN_SUPPLY`, `MARKER_SUPPLY`, `MOP_SUPPLY`, `SPRAY_SUPPLY`, `DRAWING_SUPPLY_ORDER`) | the one canonical supply set — MAP's own paint surface reuses this same set (see [../subway/README.md](../subway/README.md)§2), never a second one |

## 4. Data / persistence authority

Same underlying store as everything else in the Artwork family (see
[../members/README.md](../members/README.md)§4): Firestore `artworks`,
`artworkType: "blank"` (there is **no** dedicated `"blackbook"`
`ArtworkType` — `ArtworkType` is currently only `"map" | "blank"`,
`shared/member-identity/src/data/artworkTypes.ts:41`). A Blackbook page is
identified by its `surfaceId`, not a type value:

```
surfaceId = `blackbook:${blackbookId}:page:${pageId}`
```

Today there is exactly **one** hardcoded Blackbook and page:
`STUDIO_RICH_BLACKBOOK_ID = "studio-rich-main"`,
`STUDIO_RICH_BLACKBOOK_PAGE_ID = "page-1"` → surface
`blackbook:studio-rich-main:page:page-1`. **This is a single fixed
page, not yet a multi-page or multi-book system** — "networked art-book"
(§9) is direction, not current state.

## 5. PAGE / SPREAD (current vs. direction)

**Current**: one page = one Artwork document with a `PageFrame` (`x, y,
width, height` — a bounded region inside the unbounded Cartesian
authoring workspace, rendered by the runtime's own camera, never CSS
aspect-ratio). The current default page frame is landscape 16:9
(`BLACKBOOK_PAGE_FRAME`), explicitly chosen because Blackbook content isn't
assumed to be only a conventional portrait sketchbook sheet. An existing
Artwork's own already-persisted `pageFrame` always takes precedence over
this default. A page today contains only drawn **marks** (strokes /
material-erasures) — no photography, environmental imagery, text/editorial
content, characters, or product/object content exists as an implemented
concept anywhere in the current schema.

**Direction (not current)**: a page may eventually contain blank drawing
space, photography, environmental imagery, text/editorial content,
artwork, characters, products/objects, and one or more writable Surfaces,
composed together. None of this is implemented; only the single
mark-drawing case exists today.

## 5a. WORKSPACE / ARTWORK / ARTBOARD (current, established this batch)

BLACKBOOK Live Stroke Stability + Open Workspace (β0.1) replaced the
previous assumption that the opaque page-fill rectangle *was* the creative
page. Three distinct concepts now exist, deliberately never collapsed into
each other:

- **Workspace** — the open authoring area (`renderWorkspace()`,
  `blackbookRuntime.ts`). An effectively unconstrained dark (`#0f0d0b`)
  backdrop, never a bounded "sheet of paper." UI/rendering chrome only —
  never a Mark, never persisted, never affects `composition.bounds`, never
  appears in a thumbnail as Artwork content.
- **Artwork** — authored Marks (unchanged: `LocalStrokeMark`/
  `LocalMaterialErasureMark`, §7). Conceptually independent of both
  Workspace appearance and the Artboard: Marks render directly over the
  open Workspace at their own already-authored coordinates regardless of
  whether they fall inside or outside the Artboard outline. Removing the
  opaque page fill did not move, rescale, or reinterpret a single existing
  Mark — same `PageFrame`, same coordinate system, same camera transform.
- **Artboard** — the finite presentation/export region. This IS the
  existing `PageFrame`/`pageFrameRect()` (§5) — same position, dimensions,
  and coordinate system as before this batch — now represented as a
  subtle thin dotted boundary (`renderArtboardOutline()`) instead of an
  opaque fill. The Artboard is not a physical sheet of paper and is not
  the total available creative world; it indicates the current
  presentation/export region, nothing more. **Not movable or resizable
  yet** — an Artboard Tool (move/resize/aspect-ratio presets/export
  dimensions/export-the-region/multiple presentation formats) is future
  direction, not implemented, and this batch deliberately does not
  establish unrestricted Artboard movement/resizing as a universal
  BLACKBOOK invariant (see the Wallpaper note below).

**Workspace appearance ≠ Wallpaper/world ≠ Artwork ≠ Artboard.** Workspace
appearance (currently a fixed dark backdrop; a future Dark/Light authoring
preference would live here) is an authoring-interface concern and must
never mutate artwork data. It is explicitly NOT Wallpaper — no Wallpaper
content (photographic/material/behavioral) is implemented anywhere in
BLACKBOOK today; the dark Workspace backdrop is a placeholder authoring
surface, not a Wallpaper.

**Future Wallpaper/Artboard relationship (principle only, not
implemented)**: different future Wallpaper/world types may have different
spatial relationships to the Artboard — an extensible/procedural Wallpaper
may continue indefinitely beyond an Artboard; a finite photographic or
panoramic Wallpaper may establish meaningful available bounds; a
spatially/world-registered Wallpaper may define or constrain Artboard
geometry according to physical/environmental geometry. Wallpaper may
therefore eventually *provide default* or *constrain available* Artboard
geometry. None of those behaviors exist yet — recorded here only so a
future Wallpaper batch doesn't have to reverse an incorrectly-assumed
"Artboard is always freely movable/resizable" invariant that was never
actually established.

## 6. SURFACE (current vs. direction)

**Current**: `surfaceId` is already a real, required, immutable-after-
creation string field on every Artwork (enforced in
`hasValidArtworkV1Shape`/the `update` rule's immutability clause in
`firestore.rules`). Three concrete surface identities exist today:
`blackbook:studio-rich-main:page:page-1` (this page), `blank:default`
(`BLANK_SURFACE_ID`), and `map:new-york` (`SUBWAY_MAP_SURFACE_ID`, gated
StudioRich-operator-only — see [../members/README.md](../members/README.md)
§6). SUBWAY's own separate car-surface graffiti system
(`SubwayCarSurfaceAuthority`, [../subway/README.md](../subway/README.md)§8)
is a **distinct**, non-Artwork-collection identity space — do not treat its
`CarSurface` identities as the same `surfaceId` namespace.

**Direction (not current)**: a generalized `surfaces/` namespace
(`map:new-york`, `blackbook:page-001`, `ugc-wall:001`,
`station:bay-ridge-av:wall-001`, `train:r46-car-5482:exterior-left`, etc.)
as a deliberate, unified technical boundary for "addressable writable
target." **Not implemented, not schematized — no final Surface schema
should be inferred from the three concrete prefixes that happen to exist
today.**

## 7. READ / WRITE (current vs. direction)

**Current — WRITE only**: drawing marks (stroke or material-erasure) via
the shared Art Supply set (pencil/pen/marker/mop/spray), single-creator
authorship (`creatorId == request.auth.uid`), save/versioning via ordinary
Firestore document updates (`updatedAt`, `state: draft|archived`). No
collaboration model exists (one `creatorId` per Artwork, immutable).

**Direction (not current)**: READ content (photography, artwork, editorial,
station/neighborhood stories, characters, products, location information,
links/actions) and richer WRITE behavior (multi-author collaboration, a
formal save/version history beyond the current single-document
overwrite). None of this exists today.

## 8. WORLD LAYERS — naming collision warning

**WORLD LAYERS (Blackbook sense) are NOT implemented anywhere today.** The
brief's own definition — presentation/navigation through categories of
content in a Blackbook world/page (environment, public/private artwork,
collaborator content, people/activity, stories/editorial, live transit,
products/objects, sound/RADIO, surface guides, production information) — is
pure direction.

**Naming collision to be aware of**: `wall/main.js` already has an
unrelated, older `WorldLayer` concept (`state.world.layers`, types `"grid"`
and `"objectLayer"`, counted via `getWorldLayerCountByType`) — this is the
general MAP/World composition primitive for `wall/`'s own Worlds/Orb
infrastructure (see AGENTS.md's protected-infrastructure note), and has
**nothing to do** with Blackbook's future World Layers concept. Do not
conflate the two when this direction is eventually implemented — a
different name may be warranted specifically to avoid this collision.

## 9. ACCESS vs. VISIBILITY (current vs. direction)

**Current**: access is binary and already real — Firestore rules gate
`artworks` reads/writes to the owning `creatorId`, with the one
StudioRich-operator exception for `map:*` surfaces (§6,
[../members/README.md](../members/README.md)§6). There is no concept of
"visible in viewport but not authorized" today — nothing is partially
visible.

**Direction (not current)**: a formal distinction between
ACCESS/PERMISSIONS (what a member may retrieve/view/edit) and WORLD LAYER
VISIBILITY (which authorized content is currently toggled on in the
viewport) — with the explicit principle that a visual toggle must never be
treated as a security boundary. This distinction doesn't need to exist yet
because there's no multi-content-category viewport to toggle within;
recorded here so it's not invented incorrectly later (e.g. as a
client-side-only "hide" that's mistaken for real access control).

## 10. Integration boundaries

- **MEMBERS** — owns identity/authentication/shared operator authority; see
  [../members/README.md](../members/README.md). BLACKBOOK relies on it for
  *who's signed in*, never reimplements auth.
- **SUBWAY** — owns station/train/transit/spatial truth; see
  [../subway/README.md](../subway/README.md). No current integration exists
  between BLACKBOOK and SUBWAY beyond both reusing the same underlying
  Artwork persistence bridge (§3) and the same Art Supply set.
- **SURFACE** — the emerging technical boundary for writable targets (§6);
  today, three concrete prefixes exist with no unifying schema.
- **VIEWPORT** — presentation/context, the composition through which a
  world is currently experienced; not yet a distinct implemented concept
  separate from "the one page frame currently being rendered" (§5).
- **RADIO** — may eventually provide music/sound context to a Blackbook
  page (see World Layers direction, §8's `sound/RADIO` example), but
  **BLACKBOOK must not own broadcast authority** — that remains RADIO's own
  Channel/Program resolution, documented in
  [../radio/README.md](../radio/README.md). No such integration exists
  today.

## 11. Current event priority (direction, not implementation)

Documented here as intended direction only — **not implemented in this
batch or before it**:

```
Member
  ↓
Blackbook
  ↓
compelling photo/behavioral writable experience
  ↓
authentic spray + authentic mop/drip behavior + official Montana paint palette/catalog data
  ↓
save/member ownership
```

**Current spray/mop status**: `SPRAY_SUPPLY`/`MOP_SUPPLY` already exist as
real, canonical drawing supplies in the shared Art Supply set (§3) and are
already usable on Blackbook today — as ordinary stroke-style
(color/width/opacity) tools, not a physical wet-paint/drip simulation. The
richer "authentic spray/drip" *behavior* referenced above (hand tracking,
person segmentation, a wet-drip physics engine, cap/nozzle simulation)
exists only in the separate `prototypes/spatial-spraypaint/` prototype,
which `blackbook.html` explicitly does **not** import or depend on (§2).

**Montana palette data**: an existing, real Montana Gold 400ml swatch/
catalog dataset was found at
`prototypes/spatial-spraypaint/src/data/montanaGold400mlPalette.json`
(consumed by that prototype's own `ColorPalette.ts`). **It is not currently
wired into Blackbook's production runtime.** Per this batch's own scope,
this data is identified and not migrated, rebuilt, or imported here.

The eventual physical-planning workflow (private location photographs,
real paint identities/catalog numbers, material lists, physical dimensions,
location planning, public/private publishing) is **future/direction** —
none of it is implemented.

## 12. Known debt

See [../DEBT.md](../DEBT.md) for the tracked, actionable items. Nothing new
was added specific to BLACKBOOK in this pass — the naming-collision warning
in §8 is recorded here as a caution, not filed as debt, since no code
conflict currently exists (the two `WorldLayer` concepts don't interact).

## 13. Unresolved questions

- Whether a future formal `"blackbook"` `ArtworkType` value should be
  introduced (vs. continuing to distinguish purely by `surfaceId` prefix,
  as today) was not resolved — no current code answers this either way,
  and it wasn't asked to be decided in this pass.
