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
| Drip engine | `music/src/member/dripDeposition.ts` | shared, parameterized deterministic drip generator Mop's/Spray's own wrappers (`resolveMopDripPlans`/`resolveSprayDripPlans`) feed — see §11a |

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

## 5b. PAGE NAVIGATION (current: embedded PAGES Drawer V1.1)

**Current, as of the BLACKBOOK Embedded PAGES Drawer V1/V1.1 batches**:
the previous MY PAGES modal/overlay is replaced by a permanent LAYOUT
primitive — `#pages-drawer` is a real flex sibling of `#workspace`
(`music/blackbook.html`), not an overlay. Opening it narrows `#workspace`
(and everything positioned relative to it — canvas, toolbar, RADIO HUD,
status toast, all unchanged CSS, simply re-parented); closing restores
the width. The Workspace stays fully interactive and visible while the
drawer is open, and it never auto-closes on selection or on pressing "+".
It can be closed either from the toolbar's own PAGES toggle or from a
compact collapse control (`‹`) in the drawer's own header — both call the
same `closePagesDrawer()`.

Opening/closing the drawer is a VIEWPORT change only, and
`cameraView`'s own pan/zoom state is never touched — the same document-
space Artwork/Marks/PageFrame/Artboard simply get remapped onto the new
screen area, exactly like an ordinary browser window resize. No Artwork/
Mark/Artboard coordinate is ever mutated by opening or closing the
drawer. **V1.1 correction**: resyncing the canvas's own backing store to
its current CSS box is now done by a single `ResizeObserver` observing
the canvas element directly (`blackbookRuntime.ts`), not by a one-shot
`resizeCanvasesToDisplaySize()`/`render()` call at drawer-toggle time.
V1's one-shot call raced the drawer's own CSS `width` transition: it
fixed the backing store to whatever transitional width existed at the
instant of the call, not the drawer's final settled width, leaving the
backing store and the CSS box out of sync once the transition finished —
the browser then auto-scaled the mismatched bitmap onto its box, visibly
shifting where a Mark rendered relative to where the pointer that drew it
had been. The `ResizeObserver` fires continuously through any box change
for any reason (drawer transition, native window resize, a future
layout change this file doesn't yet know about), keeping the backing
store correct throughout — the canonical, general mechanism this
invariant now depends on, not a per-cause resize call.

Cards are deliberately minimal: a thumbnail (`drawArtworkThumbnail`,
reused verbatim) plus a PRESENTATION-ORDER number only. **V1.1
correction**: numbering (`artworkGallery.ts`'s `numberArtworksForPagesDrawer`)
now uses the NEW `sortArtworksByCreationOrder` (ascending `createdAt`,
"book order" — earliest page first, a newly materialized Artwork always
appends last) instead of V1's `sortArtworksByRecency` (descending
`updatedAt`), which reshuffled every page's number each time any one page
was merely edited — wrong for a stable page sequence. `sortArtworksByRecency`
itself is unchanged and still used for its own, genuinely different
concern (My Artwork's "resume what I was last working on",
`resolveActiveBlackbookArtworkId`'s reload fallback) — these are two
deliberately distinct orderings over the same Artwork set, never merged.
Timestamps/dimensions/mark-counts/ids are still not primary drawer UI —
that data still exists on each Artwork document, unchanged. The
presentation number is never Artwork identity and never persisted.
Selecting a card routes through the same canonical `openArtwork()`
(§ NEW/URL identity, `779af30`) every other Artwork-opening path already
uses — the drawer is not a second navigation/identity mechanism. The "+"
affordance calls the same canonical NEW/pending-Artwork lifecycle (§7's
CLEAR+Undo paragraph's sibling invariant) — pressing it never creates an
empty persisted Artwork.

**Known V1 limitation (thumbnail accuracy)**: thumbnails reuse the
existing `drawArtworkThumbnail` renderer as-is. It is a real, correct
rendering of an Artwork's own Marks (not a placeholder), but it is not
yet a dedicated, optimized preview/export pipeline — no bounded caching,
no incremental update as an Artwork's own Marks change while the drawer
is open. A substantially more accurate/efficient thumbnail subsystem
remains future work, not built in this batch.

**Direction (not current — none of the following is built)**:

- BLACKBOOK contains an ORDERED sequence of Artworks. An Artwork may
  eventually contain one or more Artboards (§5a) — a future connected/
  chained Artwork (e.g. a continuous train or wall composed of many
  Artboards) remains ONE item in that presentation order, never expanded
  into many separate drawer entries. The drawer represents the Artwork,
  not every Artboard it may eventually contain; a compact "this
  continues" indicator for such an Artwork is future direction with no
  chosen design yet.
- Drag reorder and a persisted presentation-order schema are later
  direction — the drawer's only ordering is the canonical book order
  above (§5c covers DELETE, which IS now implemented).
- Page naming and page folders are not implemented.
- At larger scale (a book of roughly 68-200+ Artworks), the current
  thumbnail-strip drawer is expected to remain ONE presentation mode, not
  necessarily the only one — a denser List View (title/tags/date/
  security-state metadata, alternate sorting/filtering by those fields)
  is plausible future direction. No such view, metadata schema, or
  sorting/filtering mechanism is implemented or designed yet; the current
  drawer's only sort is the canonical book order above.

MY PAGES (the modal) no longer exists — the drawer is now the one current
mechanism for Blackbook page navigation.

## 5c. CLEAR vs. NEW vs. DELETE (current, established BLACKBOOK Artwork DELETE V1)

Four distinct Artwork-lifecycle operations now exist and are deliberately
never collapsed into each other:

- **NEW** — arms `CurrentArtworkSession`'s `"pending"` state
  (`startNewPage()`). No document exists yet; one materializes lazily on
  the first persisted Mark. Pressing "+" never creates an empty persisted
  Artwork.
- **CLEAR** — `replaceOwnedArtworkMarks(artworkId, creatorId, [])`. The
  Artwork document, its id, and its place in the drawer all survive with
  `marks: []`; a single `lastClearSnapshot` (module-level state in
  `blackbookRuntime.ts`) permits exactly one Undo to restore the cleared
  Marks. CLEAR never asks for confirmation — Undo is its own safety net.
- **DELETE** — `deleteOwnedArtwork(artworkId, creatorId)`
  (`firestoreArtworkRepository.ts`). The Firestore document itself is
  removed; the id ceases to exist and the page disappears from the
  drawer/book order entirely. DELETE is NOT undoable — there is no Trash
  or Recently-Deleted (later direction, not implemented) — so unlike
  CLEAR it requires an explicit `window.confirm` ("Delete this Artwork
  from your Blackbook?") before doing anything. Canceling makes zero
  mutation. Ownership is enforced at the Firestore rules layer
  (`allow delete: if isSignedIn() && resource.data.creatorId ==
  request.auth.uid`, already present/deployed independently of this
  batch), not merely by hiding the UI control — a non-owner's
  `deleteOwnedArtwork` call is rejected by Firestore itself.
- **PAGES drawer** — navigate/manage identities only (§5b); the per-card
  delete affordance (a small hover-revealed `×`, `.pages-drawer-item-delete`
  in `blackbook.html`) is the one UI entry point into DELETE, kept
  deliberately restrained rather than a general context-menu system.

**Final-Mark-removal semantics (revisited this batch)**:
`removeOwnedArtworkMark` previously deleted the whole Artwork document the
instant an ordinary Undo emptied its `marks` array — a leftover assumption
from before CLEAR made an empty-but-existing Artwork valid. It now always
`transaction.set`s the surviving (possibly empty) Artwork and never
deletes the document; only `deleteOwnedArtwork` deletes. Undoing every
Mark one at a time is therefore CLEAR-equivalent, never DELETE-equivalent.

**Active-Artwork replacement on DELETE** (`pickReplacementArtworkId`,
`artworkGallery.ts`, pure/unit-tested): deleting the active Artwork
selects, in book order, (1) the next Artwork, else (2) the previous
Artwork, else (3) `null` — the caller then re-enters the existing NEW
pending state via the same canonical `openArtwork()`/`startNewPage()`
identity-sync path (never a second URL/localStorage mechanism). Deleting a
non-active Artwork only removes its card and renumbers; the active
Artwork's identity, state, and camera are left untouched.

Trash/Recently-Deleted, Undo-of-DELETE, bulk/multi-select delete, and drag
reorder all remain future direction — none is implemented.

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

**Current — WRITE only**: drawing marks (stroke, material-erasure, or —
Mop/Spray only, see §11a — a deterministic material-drip consequence) via
the shared Art Supply set (pencil/pen/marker/mop/spray), single-creator
authorship (`creatorId == request.auth.uid`), save/versioning via ordinary
Firestore document updates (`updatedAt`, `state: draft|archived`). No
collaboration model exists (one `creatorId` per Artwork, immutable).

**CLEAR + Single-Step Undo (current, as of the BLACKBOOK CLEAR +
Single-Step Undo batch)**: an Artwork's ENTIRE `marks` array can be
replaced in one write (`ArtworkRepository.replaceOwnedArtworkMarks`),
distinct from the per-Mark `appendOwnedArtworkMark`/`removeOwnedArtworkMark`
this file already documented. Unlike `removeOwnedArtworkMark` (which
deletes the whole document once its own removal empties `marks`),
`replaceOwnedArtworkMarks` never deletes the document, even when given an
empty array -- an Artwork document with zero Marks is now a valid,
intentional state (a cleared page), not a malformed one. This required
relaxing two previously-universal invariants, now precisely scoped:
`firestore.rules`' `hasValidArtworkV1Shape` accepts `marks.size() == 0`
on `update` only (never `create` -- a brand-new Artwork still always
requires a real first Mark), and `decodeArtworkData`'s client-side decoder
no longer rejects an empty `marks` array. CLEAR is one logical, one-write
action regardless of how many Marks existed (never a loop of per-Mark
removals); restoring via a single Undo is the same operation with the
pre-clear array. Runtime state for "is there a pending clear to undo"
(`lastClearSnapshot` in `blackbookRuntime.ts`) is transient/in-memory
only, invalidated the instant any other authoring action happens --
cross-reload Undo of an OLDER clear is not a guarantee this architecture
makes; only the immediate result of CLEAR, or of an immediate Undo of it,
is guaranteed persisted correctly.

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

- **HOME** (development-only, HOST-03) — `music/src/home/blackbookHomeSurface.ts`
  is BLACKBOOK's own narrow HOME-hosting adapter, detected only via an explicit
  validated same-origin query identity (`?host=home&homeRuntime=...&
  homeNavigation=...` plus a live `parent.StudioRichHome.version === 1` check —
  never bare `window.self !== window.top`, since BLACKBOOK can have other
  iframe consumers). When hosted, `setActiveArtworkIdentity` (§ NEW ARTWORK
  PERSISTENCE V1) reports its already-changed Artwork identity to HOME via
  `syncArtworkRoute` for HOME's own top-level URL sync, instead of writing this
  document's own (invisible, iframe-local) URL; standalone BLACKBOOK is
  unaffected. The `#map-nav-link` anchor is intercepted only when hosted,
  delegating to HOME's navigation authority instead of a native anchor
  navigation; standalone/other embeds keep the plain anchor. No BLACKBOOK
  domain behavior (drawing, PAGES, CLEAR/DELETE/NEW, persistence) changes when
  hosted — see [../home/README.md](../home/README.md) for the full contract.
  This remains a development-only, opt-in integration; production routing is
  unimplemented.
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
already usable on Blackbook today. Spray is already a real, deterministic
aerosol deposition engine (`music/src/member/sprayDeposition.ts`) with
genuine cap/nozzle simulation in production — **four** data-driven
`SprayCapProfile`s as of the SPRAY INSTRUMENT EXPRESSION PASS (§11b):
`STUDIORICH_STOCK_CAP`, `STUDIORICH_FAT_CAP`, `STUDIORICH_PRECISION_CAP`,
and `STUDIORICH_CALLIGRAPHY_CAP`, each with a distinct physical footprint,
particle density, core/edge behavior, and velocity/pressure response — not
merely a stroke-style (color/width/opacity) tool. Both Mop and Spray also
have a real, deterministic DRIP seam now — see §11a. The richer "authentic
spray/drip" *behavior* referenced above (hand tracking, person
segmentation, a wet-drip physics engine) still exists only in the separate
`prototypes/spatial-spraypaint/` prototype, which `blackbook.html`
explicitly does **not** import or depend on (§2) — that prototype's own,
much larger (~1700-line) multi-cap engine (`SprayBrushEngine.ts`/
`SprayCapProfile.ts`/`SprayCapPresets.ts`, ~19 named physical/effect caps
with distance/velocity calibration) is a distinct, unrelated implementation
from Blackbook's own `sprayDeposition.ts` cap profiles described above —
Blackbook borrows only one proven idea from it (a seeded PRNG for
deterministic particle scatter), never its code or cap set. That same
prototype also contains the only spray-sound code in this repository
(`SprayCanAudio.ts`); it remains unimported, and BLACKBOOK has no spray
audio playback wired in today — see §11b.

## 11a. DRIPS (current, established BLACKBOOK Deterministic Drips β0.1)

Mop and Spray can now each generate a bounded, fully deterministic downward
drip when enough local material accumulates during authoring. This is an
AUTHOR-TIME CONSEQUENCE of a gesture, never a running wet-paint simulation:
there is no timer/animation loop, no `Math.random()`, and a saved Artwork's
drip geometry never changes after it's authored, regardless of how long it
stays open or how many times it's reloaded.

**Canonical Mark type**: `LocalMaterialDripMark` (`type: "material-drip"`,
`geometry.format: "local-2d-drip-v1"`,
`shared/member-identity/src/data/artworkTypes.ts`) — a first-class additive
Mark, the same pattern `LocalMaterialErasureMark` already established for
Eraser, never a hidden mutation of the Mop/Spray stroke Mark that produced
it. It carries `originMarkId` (the producing stroke's own persisted Mark
id), `targetMaterialId` (`"mop" | "spray"` — the only two supplies with a
drip seam today), and its own `style` (copied from the origin stroke at the
moment the drip is generated). `ArtworkMark` is now `StrokeMark |
MaterialErasureMark | MaterialDripMark`. Local-2d only — there is no
geographic drip format; Map has no Drip concept.

**Deterministic generation engine**: `music/src/member/dripDeposition.ts`,
a standalone, parameterized module (no dependency on `mopDeposition.ts`/
`sprayDeposition.ts`, to avoid any import cycle) with two tuning constants
— `MOP_DRIP_TUNING` and `SPRAY_DRIP_TUNING` — that make Mop accumulate/run
more readily than Spray (lower load threshold, more/longer drips) without
a second bespoke engine. `mopDeposition.ts`'s `resolveMopDripPlans` and
`sprayDeposition.ts`'s `resolveSprayDripPlans` are the two thin,
material-specific wrappers that feed each engine's own already-resolved
emission points (their existing `densityFactor` — Mop's point-spacing
proxy, Spray's real captured velocity when available) into the shared
engine. This is the FUTURE DRIP SEAM `mopDeposition.ts` had documented
since BLACKBOOK Art Supplies V3 — completed here, not superseded or
redesigned.

**Where accumulation/load is calculated**: `dripDeposition.ts`'s
`computeLocalLoad`/`resolveDripOrigins` — a bounded trailing-window sum of
how far each emission point's own `densityFactor` sits above neutral
(dwelling/slow movement only; a fast/dispersed gesture contributes nothing
and never crosses the threshold, so a drip never appears on every ordinary
gesture). Crossing a material's own `loadThreshold` selects a bounded,
spaced set of drip origins (`maxDripsPerStroke`, `minOriginSpacingRatio`).

**When drip geometry becomes authored/final**: `simulateMaterialDrip`
(same module) computes one origin's own downward, gravity/drag centerline
in a fixed, bounded number of steps (`maxDripSteps`, stopping early once
velocity decays below `minVelocityRatio`) — called exactly ONCE, in
`blackbookRuntime.ts`'s `createDripOperationsFor`, synchronously at
pointerup, immediately after the origin Mop/Spray operation is pushed and
BEFORE any persistence call. The returned points are then persisted
verbatim as the resulting `LocalMaterialDripMark`'s own geometry; rendering
(`strokeSmoothing.ts`'s `strokeMaterialDrip`) only ever replays those
already-fixed points — taper is derived purely from each point's own index
along the (now immutable) list, never a second persisted field, never
re-simulated.

**Deterministic identity/seeding**: `blackbookRuntime.ts`'s
`activeOperation()` pre-assigns Mop/Spray's own real persisted Mark id
(`mapArtworkBridge.ts`'s `createStableMarkId()` — prefers `crypto.randomUUID()`
wherever available, falling back to an RFC 4122 v4 UUID built from
`crypto.getRandomValues()` on a non-secure-context origin where
`randomUUID` itself is unavailable; see SECURE-CONTEXT-INDEPENDENT MARK ID
V1 below — written into `BlackbookStroke.markId` directly,
rather than left to the generic persistence bridge's own fallback
`createMarkId()`) the instant the operation object is created — before a
single point of drip geometry is generated. That id, hashed
(`sprayDeposition.ts`'s existing `hashSeed`), is both the drip's
`originMarkId` and its deterministic PRNG seed, so no async round-trip to
Firestore is ever needed to know a drip's own seed, and the same authored
points + the same origin Mark id always regenerate (at generation time) —
and, once persisted, always replay — byte-identical geometry.

**SECURE-CONTEXT-INDEPENDENT MARK ID V1** (fix, established this batch):
real-device recon (an iPad reaching a dev session over a LAN IP — plain
HTTP, not `localhost`/HTTPS, i.e. not a secure context) found Mop and
Spray silently producing no Mark at all: `crypto.randomUUID()` is
secure-context-gated and `undefined` in that context, and both of
`blackbookRuntime.ts`'s own Mop/Spray Mark-id call sites (`activeOperation()`'s
pre-assignment above, and `createDripOperationsFor`'s own derivative drip
Mark id) called it unconditionally — throwing before the Mark was ever
pushed to `operations`, on both the live-preview (`render()`) and commit
(`pointerup`) paths. `mapArtworkBridge.ts`'s `createStableMarkId()` is the
one shared fix: prefers `crypto.randomUUID()` wherever it's actually
available (identical ids/format, zero behavior change in every
already-working environment), falling back to an equivalent RFC 4122 v4
UUID built from `crypto.getRandomValues()` (which carries no secure-context
restriction) only when `randomUUID` itself is unavailable. All three
Mark-id call sites in this codebase — Mop/Spray's own pre-assignment, the
derivative drip Mark, and the generic persistence bridge's `createMarkId`
fallback (which Pencil/Pen/Marker/Eraser rely on) — now go through this one
helper. No pointer/pressure/timing/deposition/drip behavior changed; this
is purely an id-generation robustness fix, not a new spatial-input or
iPad-specific code path.

**How Spray and Mop differ**: both route through the exact same
`resolveMaterialDripPlans`/`simulateMaterialDrip` engine; only their own
`DripTuning` constant differs (lower threshold, more/longer drips for Mop;
materially higher threshold, fewer/shorter drips for Spray — a wet
applicator pools and runs more readily than an aerosol coverage field at
the same dwell). Spray's own effective (cap-`footprintRadiusScale`d) radius
feeds the engine, so a Fat Cap's wider footprint also scales its drip
gravity/wobble consistently with its wider deposition.

**Lifecycle**: a drip and its origin stroke are always pushed onto
`blackbookRuntime.ts`'s `operations` array contiguously (origin first,
drips immediately after, both synchronous — nothing else can be authored
in between) and persisted as independent Marks through the same generic
`ArtworkRepository.appendOwnedArtworkMark`/`removeOwnedArtworkMark` path
every other Mark already uses — no drip-specific persistence branch.
**Undo** (`popLastGesture`) removes the trailing run of `material-drip`
operations together with the one ordinary operation beneath them as ONE
logical step, so a drip is never orphaned when its originating gesture is
undone; an ordinary non-drip-producing gesture still undoes exactly one
operation, unchanged. **CLEAR**/**CLEAR→Undo** (`replaceArtworkMarks`) and
**PAGES/Artwork switching** (`marksToOperations`/`applyActiveArtwork`) both
already generically round-trip the full `marks`/`operations` array
regardless of Mark type, so drips clear/restore/switch exactly like every
other Mark, with no special-casing added. **DELETE** removes the whole
Artwork document, drips included, same as any other Mark. **Eraser**
cannot interact with a drip today — `canEraseMaterial` only ever targets
`"graphite"` (Pencil), so Mop/Spray content (and therefore their drips) has
no eraser interaction in current architecture, drip or not; this is a
pre-existing scope boundary, not something this batch narrowed.

**Bounds**: `maxDripsPerStroke` (3 for Mop, 2 for Spray) and
`maxDripSteps` (18 / 12) keep both drip count and per-drip point count
bounded independently of gesture length; `firestore.rules`'
`hasValidMaterialDripMark` additionally hard-caps `geometry.points.size()`
at 64 as a schema-level safety ceiling, generously above either tuning.

**Legacy compatibility**: an Artwork with no drip Marks decodes and
renders completely unchanged — `decodeArtworkData`'s `marks` mapping only
ever adds a `"material-drip"` branch, never altering how `"stroke"`/
`"material-erasure"` decode. Drips are never synthesized onto historical
Artwork merely because it's opened.

**Tuning/debt**: `MOP_DRIP_TUNING`/`SPRAY_DRIP_TUNING` are internal
constants only — no per-supply/per-cap/per-material override exists yet
beyond Mop-vs-Spray's own two presets and Spray's existing cap-footprint
scaling (both already parameterized seams this build reused rather than
duplicated). No user-facing Drip settings panel exists, per this batch's
own explicit scope.

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

## 11b. SPRAY INSTRUMENT EXPRESSION PASS (current, established this batch)

Scope: make Spray behave like an expressive instrument rather than a
variable-width brush, and make it testable. **Not** a generic brush
rewrite, **not** the ~19 historical cap concepts — see this batch's own
brief for the full constraint set.

**Input classification** (`sprayDeposition.ts`'s own module doc is the
canonical copy of this): MEASURED — `x`/`y`, optional `tMs` (Spray only),
optional `pressure` (Spray only, gated on a real per-stroke variance
check). DERIVED — `densityFactor`/`flowFactor` (pre-existing), plus two
new local, backward-only signals added this pass: `tailFlareFactor`
(deceleration ratio of the last two segments — the RELEASE signal behind
flare/rattle) and per-emission `instability` (direction-change angle
between two consecutive short segments — the WET SPUTTER proxy). FUTURE
SPATIAL (can X/Y/Z, wall distance, pitch/yaw/roll, angular velocity of the
can) — still not implemented; `resolveSpraySoundState` reports it
explicitly `{ available: false }` rather than fabricating a value.

**Cap profile model, generalized**: `SprayCapProfile` gained seven new
per-cap fields (`motionFootprintRange`, `flareResponse`, `dustResponse`,
`speckleResponse`, `instabilityResponse`, `directionalResponse`,
`nibAngleDeg`) that replace what were previously hardcoded engine
constants (e.g. the core's own `clamp(meanDensity, 0.8, 1.2)` width clamp
is now `clamp(meanDensity, 1 - cap.motionFootprintRange, 1 +
cap.motionFootprintRange)`, with Stock's own value — 0.2 — reproducing the
prior literal exactly, zero behavior change for any already-persisted
Mark). **Two new caps**, the smallest representative set beyond
Stock/Fat this batch's own brief allows:

- `STUDIORICH_PRECISION_CAP` — narrow footprint, near-zero
  `motionFootprintRange`/`flareResponse` so it genuinely "cannot become a
  fat cap through gesture," for sustained hairline/detail work.
- `STUDIORICH_CALLIGRAPHY_CAP` — the one cap with `directionalResponse >
  0`: its CORE width depends on the gesture's own whole-stroke dominant
  travel direction relative to a fixed `nibAngleDeg` (chisel-nib axis),
  computed ONCE per gesture (never oscillated mid-stroke, so "artist
  technique — which direction they drag — causes the variation," per this
  batch's brief, not an automatic wobble). Every other cap has
  `directionalResponse: 0` and is byte-identical to before this field
  existed.

All four caps remain a plain data registry (`SPRAY_CAP_PROFILES`) the
engine reads generically — a future cap is still a new profile object, not
a new rendering branch.

**New deposition behavior, all bounded/deterministic/cap-gated** (0 for a
0-valued response field means zero behavior change):

- **FLARE** — a decelerating release at the gesture's own tail
  (`tailFlareFactor`, local to the last two segments) spawns extra,
  wider-flung particles there, scaled by `cap.flareResponse`. Fat responds
  dramatically; Precision never flares at all.
- **DUST** — fast/dispersed emissions (low `densityFactor`) spawn a few
  extra, faint, far-flung particles beyond the normal footprint, scaled by
  `cap.dustResponse` — emerges from the same aerosol model, not a separate
  decorative stamp.
- **SPECKLE** — dwelled emissions (high `densityFactor`, short of this
  material's own drip threshold) spawn a few extra, larger, denser coarse
  droplets mixed into the fine field, scaled by `cap.speckleResponse`
  (deliberately exceeds the ordinary per-particle radius ceiling — see the
  dedicated calibration-radius test's own documented exception).
- **WET SPUTTER character** — local direction-change `instability` widens
  per-particle count/radius/alpha variance, scaled by
  `cap.instabilityResponse`.

**Sound state, derivable but not played** (`resolveSpraySoundState`):
BLACKBOOK has no spray audio playback today (§11's own note) and building
one is out of this pass's bounded scope. This function instead derives,
from the exact same gesture/material signals driving the visual
deposition above, a pure/deterministic `SpraySoundState` — `aerosolIntensity`
(flow/density), `sputterActive`/`sputterIntensity` (from `instability`,
gated per-cap), `rattleActive`/`rattleIntensity` (mixing-ball rattle —
gated on the SAME release/whip-snap signal flare uses, "visible
justification in the resulting mark," never active merely because spray
is on), `materialLoadNormalized` (reuses `dripDeposition.ts`'s own
`resolveDripOrigins`, never a second load derivation), and `spatial: {
available: false }`. No `AudioContext`, no I/O — fully unit-testable
without ever playing a sound. A future playback layer keying off this
state, and wiring real spray audio into BLACKBOOK at all, remain
unimplemented.

**Dev-only Spray Test / Calibration surface**: `music/blackbook-spray-test.html`,
following this repo's existing `*-debug.html` dev-surface convention
(`station-3d-debug.html`, `home-dev.html`). A byte-for-byte copy of
`blackbook.html`'s own markup/CSS (same element ids) plus one addition — a
purely decorative, `pointer-events: none`, non-persisted overlay labeling
the calibration gestures (01 CLEAN LINE … 13 WHIP/SNAP, plus a large
unrestricted TAG zone) from this batch's own brief. It loads
`blackbookRuntime.ts` completely unchanged and reuses BLACKBOOK's real
persistence/page model as-is (use NEW to start a dedicated test page, then
DELETE it afterward) — no parallel drawing engine, no second persistence
path.

**What this pass deliberately leaves unfinished**: true per-segment
(within-one-stroke) variable core width — the engine's one continuous
`moveTo`/`lineTo` pass per core layer (the fix for the historical
"dotted-pattern" regression, §11a's Revision 4) means width varies per
PASS/per-gesture, not per point along one pass, without risking that
regression; Calligraphy's directional response is therefore whole-gesture,
not continuously oscillating within a single stroke (also the correct
behavior per this batch's own "artist technique causes the variation, not
automatic oscillation" instruction). No real can-distance/orientation
input; no spray audio playback; no per-cap settings UI beyond the
existing minimal four-button selector.

## 11c. RENDER SCHEDULING & COMPOSITING (current, established across two performance batches)

Real iPad + Apple Pencil testing exposed two successive problems in
`blackbookRuntime.ts`'s own `render()`/compositing pipeline — unrelated to
deposition math, persistence, or auth — now fixed and recorded here so a
future change to this pipeline doesn't reintroduce either.

**Problem 1 (DRAWING LATENCY V1):** `render()` replayed every committed
operation's full deterministic deposition from scratch, plus the entire
in-progress gesture from point zero, on every single pointer dispatch —
cheap for Pencil/Pen/Marker/Eraser (one smoothed path + one `stroke()`),
catastrophic for Mop/Spray (particle/dab generation), and scaling with
total session marks × gesture length. Fixed by splitting rendering into
two parallel five-canvas layer sets:

- `committedLayers` — already-committed Marks' already-rendered pixels.
  Rebuilt in full only on an explicit Mark-set change (Undo, CLEAR,
  CLEAR-undo, Pages/artwork switching, sign-out) or a detected camera/
  viewport change (a pan/zoom/size signature compared every `render()`
  call, rather than hunting down every individual pan/zoom/resize call
  site); updated incrementally (one `drawOperation` call) on the ordinary
  single-commit path.
- `livePreviewLayers` (one shared scratch canvas, Mop/Spray only) — the
  active gesture's own deposition computed/painted only for a bounded
  trailing WINDOW of newly-arrived points each frame (one point of
  overlap for segment continuity), never the whole gesture-so-far. This
  is an explicit INTERACTION representation, not the canonical Mark —
  core-pass jitter stays seam-free across window boundaries (a fixed
  shared seed), while the particle field's own PRNG stream restarts at
  each window boundary (a disclosed, transient, live-only cosmetic
  approximation). `pointerup` always re-runs the unmodified, unwindowed
  generators on the complete, final points and bakes that canonical
  result into `committedLayers` in the same synchronous call that
  discards the live preview — no gap, jump, or duplication at commit.

**Problem 2 (DRAWING LATENCY V2a — a regression Problem 1's own fix
introduced):** compositing `committedLayers` into `materialLayers`
every `render()` call was done UNCONDITIONALLY for all five materials,
even ones with no active gesture that frame — a flat compositing tax
(10 full-canvas `drawImage` calls + 5 `clearRect`) paid identically by
every tool, including Pencil/Pen/Marker/Eraser, which never needed the
cache's deposition-skipping benefit. Fixed: only the ONE material
actually being drawn into this frame (if any) goes through the
`materialLayers` compositing hop; every other material's cached pixels
are blitted straight from `committedLayers` onto the main canvas,
skipping `materialLayers` entirely for that frame. **The lesson for any
future change here: a per-frame compositing step must be scoped to
"only what changed," never applied unconditionally "for correctness" —
that's exactly how this regression was introduced the first time.**

**Problem 2b (DRAWING LATENCY V2b — the actual shared bottleneck):**
even with Problem 1 fixed, EVERY tool still called `render()`
synchronously, directly inside the `pointermove` handler, once per
dispatched event, with no scheduling at all. Apple Pencil's dispatch
rate can exceed how fast one full, synchronous render can complete,
producing a growing event backlog — the visible line falls behind the
physical Pencil position the faster/longer a gesture runs. Fixed by
`renderScheduler.ts` (`createRenderScheduler`), a tiny, dependency-free,
unit-tested module: `scheduleRender()` (used by `pointermove`, wheel-zoom,
and the canvas `ResizeObserver` — every high-frequency trigger) requests
at most one pending `requestAnimationFrame` callback, coalescing any
number of triggers within one frame interval into a single render;
`renderNow()` (used by every discrete action — `pointerdown`/`pointerup`,
Undo, CLEAR, Pages/artwork switching, sign-out, tool/button clicks, FIT,
resize-complete) cancels any pending scheduled frame and renders
synchronously, guaranteeing no stale callback ever repaints obsolete
gesture/Mark-set state after a discrete action invalidates it. Point
capture (`activePoints.push`, `getCoalescedEvents`) is completely
unaffected — this only changes WHEN the already-captured points get
painted, never how many are captured or what gets computed.

**Problem 3 (SPRAY LIVE PREVIEW PERFORMANCE V1 — the one remaining
material-specific bottleneck under Problem 2b's scheduler):** even with
V1/V2a/V2b fixed, Apple Pencil retesting showed Spray's own live-preview
window still visibly trailed the Pencil while every other tool (including
Mop) kept up — Spray's per-particle fill used `createRadialGradient()` +
3 `addColorStop()` calls, several times more expensive per particle than a
flat fill. Fixed, Spray-only, inside the existing windowed live-preview
mechanism from Problem 1 (no scheduling change): `drawOperation` takes a
`renderMode: "canonical" | "livePreview"` parameter (default `"canonical"`,
so every pre-existing call site — the committed-cache bake, reload — is
unaffected); `advanceLivePreview`'s own windowed call is the only caller
that passes `"livePreview"`, which `strokeSpray` (`strokeSmoothing.ts`)
turns into `particleRendering: "flat"` — the exact same
`resolveSprayParticlePlan` output (same positions, same count, same radius/
alpha, same deposition plan), painted with a single flat `fill()` instead
of a per-particle gradient. Like the PRNG-restart approximation above, this
was a disclosed, transient, live-only cosmetic approximation at the time:
`pointerup` always baked the canonical soft-gradient particle fill in one
synchronous call. Mop and every other material never read `renderMode` and
are unaffected. **Superseded by Problem 4 below** — `pointerup`'s own
synchronous canonical bake turned out to itself be the next bottleneck, and
fixing it also replaced the windowed particle field this paragraph
describes with the incremental one Problem 4 introduces; `renderMode`/
`particleRendering` and `fillSprayParticleFlat` are unchanged and still
exist exactly as described here.

**Problem 4 (SPRAY POINTER-UP RECONCILIATION V1 — the pointer-up stall
Problem 3 left untouched, plus the live/canonical divergence that made its
swap visible):** live Spray (Problem 3) and every other tool's live
preview now tracked the Apple Pencil in real time, but lifting the pointer
on a Spray stroke produced a new, separate ~5s visible stall, and the
stroke's appearance visibly changed the instant that stall resolved.
Recon (dev-only instrumentation, timing waterfall) isolated both:

1. **The stall was `pointerup`'s own synchronous canonical bake, never
   persistence.** `drawOperation(operation, committedLayers)` — called
   synchronously, directly inside the `pointerup` handler — ran Spray's
   canonical particle paint (`createRadialGradient()` per particle) for
   the COMPLETE, final gesture in one blocking call: 18,000–26,000
   gradient fills for a typical fast continuous stroke (Spray's
   `maxEmissionPoints` ceiling is 3000 per cap vs. Mop's 260 — an ~11.5x
   asymmetry before even multiplying by particles-per-emission), measured
   structurally as the entire source of the stall. `persistence.persistStroke`
   is `void`-called (fire-and-forget) immediately after and was never the
   bottleneck.
2. **Live and canonical Spray were computing genuinely different particle
   sets, not just rendering them differently.** The windowed live preview
   (Problem 1/3) called `resolveSprayParticlePlan` fresh once per
   animation frame, each call re-seeding `createSeededRandom(seed)` from
   scratch for that window's own slice, plus a deliberate 1-point window
   overlap (for segment continuity) that double-emitted at each seam.
   Canonical made ONE call across the whole stroke with one continuous
   PRNG stream. Measured on a representative stroke: the live-cumulative
   particle count ran ~19.3% higher than canonical — so pointer-up's swap
   wasn't merely slow, it was swapping in a measurably different
   deposition.

**Fix, in `sprayDeposition.ts`:** the emission-walk and particle-generation
loops (`resolveSprayEmissionPoints`/`resolveSprayParticlePlan`'s own
former bodies) were factored into resumable primitives —
`advanceSprayEmissionPoints`/`advanceSprayParticles`/
`finalizeSprayParticles`, built around a new `createSeededRandomStream`
(the same mulberry32-family generator as `createSeededRandom`, but
exposing its own `state` so a caller can snapshot it after N draws and
resume the EXACT same sequence later). A `SprayEmissionCursor`/
`SprayParticleCursor` threaded across many calls — one per animation
frame, fed the FULL growing `points` every time, never a slice — produces
a particle sequence that is byte-identical to one continuous canonical
call, because it IS that same call, just paid for incrementally. The one
whole-gesture-dependent value this engine has (the tail FLARE,
`tailFlareFactor`, which can only be evaluated once the gesture's true end
is known) is deliberately never part of the per-frame `advance` step —
only `finalizeSprayParticles`, called once, at pointer-up, adds it.
`resolveSprayEmissionPoints`/`resolveSprayParticlePlan` themselves now
delegate to these primitives with a `null` (fresh) cursor, so every
existing caller (canonical bake-from-scratch, reload) is byte-identical
to before by construction, not by a second parallel implementation that
could drift.

**Fix, in `blackbookRuntime.ts`:** `advanceLivePreview`'s Spray branch
(`advanceSprayLivePreview`) now threads a gesture-scoped
`sprayEmissionCursor`/`sprayParticleCursor` through the above every frame,
painting only the newly-added particles (flat fill, unchanged from
Problem 3) onto the never-cleared live-preview canvas — core passes are
untouched (same per-window slice, routed through `strokeSpray`'s own
core-pass logic via a `particles: []` override that suppresses only its
particle half). `pointerup`'s Spray branch (`beginSprayCanonicalBake`) no
longer calls `drawOperation` synchronously at all: it resolves the
complete, final particle list (cheap — `finalizeSprayParticles` only
catches up on the last few points the live preview hadn't reached, plus
the one-time flare), copies the live preview's own already-shown pixels
into a dedicated `pendingCanvas` (zero-cost — the artist's eye was already
on exactly those pixels), and queues a `PendingSprayBake` that
`runSprayBakeFrame` drains across many animation frames, each bounded to
`SPRAY_BAKE_FRAME_BUDGET_MS` (a time budget checked via `performance.now()`,
not a guessed particle-count-per-frame constant — real per-particle
gradient-fill cost on-device was never measured synthetically). `render()`
composites every in-flight `pendingCanvas` on top of `committedLayers.spray`
(whether or not Spray is the actively-drawn material that frame) for as
long as any bake remains queued, so the stroke never disappears or jumps
mid-bake; once a bake's `bakeCanvas` (gradient-filled, painted on a
separate blank canvas so it never layers additively on top of the flat
`pendingCanvas`) is complete, it's merged into `committedLayers.spray` in
one `drawImage` and the queue entry is dropped — FIFO, so merges never
reorder relative to `operations`' own append order. `rebuildCommittedCacheIfNeeded`
drops the whole `pendingSprayBakes` queue as its first step whenever it
runs (Undo, CLEAR, Pages switching, resize): the full replay below it
either excludes a removed operation correctly or re-bakes a still-present
one canonically via the unchanged synchronous `drawOperation` path, so a
stale in-flight bake is never wrong either way. Persisted Mark shape,
drip generation/semantics, Undo grouping, and cap behavior are all
completely unaffected — this is a rendering-scheduling fix layered on top
of the same unchanged deterministic generators.

**Development-only diagnostics**: `window.__blackbookRenderDiagnostics`
(gated on `import.meta.env.DEV`, never active in a production build, never
a `console.log`) exposes `scheduleCalls`/`renderNowCalls`/`actualRenders`
counters — the ratio between triggers and actual renders is the live,
on-device-inspectable measure of how much coalescing is happening.

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

## 14. Future physical output / Book POD (direction, not implementation)

Documented here as intended direction only — **not implemented, not
designed, not scheduled**. A future StudioRich OUTPUTS phase (roadmap
concept, not this directory's concern — see the `WOS-share` roadmap) may
eventually let Artwork/Pages/a Collection become an optional physical
output (individual print, poster, physical book — personal BLACKBOOK,
selected-page collection, artist edition, collaborative book, event
book, annual/member archive, station/neighborhood collection,
personalized book). No POD vendor has been selected or researched; no
print/export module, type, or consumer exists anywhere in this codebase
today. Per the roadmap's own sequencing, real POD requirements
(dimensions, page counts, binding, paper, color reproduction, minimum
quantities, fulfillment, unit economics) should only be investigated
once enough real BLACKBOOK work exists to make them concrete — BLACKBOOK
should not be designed around a POD provider's constraints before then.
