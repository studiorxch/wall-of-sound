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

**Current — WRITE only**: drawing marks (stroke or material-erasure) via
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
