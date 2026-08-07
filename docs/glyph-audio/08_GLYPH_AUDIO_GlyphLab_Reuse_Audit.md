# Glyph Audio — GlyphLab Reuse Audit

## Status

This audit is the grounded code review of `apps/glyphlab-reference/`. It is preserved as the implementation evidence for what may be reused, generalized, rewritten, or discarded.

---

## Audit: `apps/glyphlab-reference` as a reference for a beat-first asemic transcription app

The entire app is one file: [App.tsx](apps/glyphlab-reference/src/App.tsx) (817 lines), a Vite+React+Tailwind SPA. No other logic files exist — no components/, hooks/, or lib/ directories. `App.css` and the three files under `src/assets/` are unused Vite-template leftovers (confirmed via grep — never imported). `README.md` is generic Vite boilerplate, not project docs.

### Inspection findings, by area

**Stroke/path data structures** ([App.tsx:3-26](apps/glyphlab-reference/src/App.tsx#L3-L26))
```ts
type Point = { x: number; y: number };
type Stroke = { points: Point[]; mode?: "freehand" | "pen" };
type Glyph = { strokes: Stroke[] };
type GlyphMap = Record<string, Glyph>;
```
Clean and already font-agnostic in shape: a stroke is just an ordered point list with a smoothing-mode flag; a glyph is just a stroke array. No pressure/velocity/timing captured, no closed-path flag beyond the pen tool appending the first point again. `GlyphBounds` ([App.tsx:19-26](apps/glyphlab-reference/src/App.tsx#L19-L26)) is computed on demand via a min/max scan, never cached or persisted. The only font coupling is the **key** used to look glyphs up (`GlyphMap` keyed by literal character), not the value shape.

**Canvas drawing/editing logic** ([App.tsx:294-578](apps/glyphlab-reference/src/App.tsx#L294-L578))
Three working tools — `draw` (freehand, mousemove-accumulated, quadratic-Bezier-smoothed), `pen` (click-to-place nodes, closes when a click lands within 20px of the first node, straight `L` segments), `erase` (proximity hit-test that deletes an entire stroke if any point is within 20px of the click). A fourth `"arc"` tool has a UI button ([App.tsx:670-679](apps/glyphlab-reference/src/App.tsx#L670-L679)) but **no handler** — dead UI, never checked in `handleMouseDown`. No undo/redo, no per-stroke selection/reorder after creation, no stroke-width or pressure control. Grid-snapping (`snap()`, 25px) is applied on every point. The paint loop is one big imperative `useEffect` ([App.tsx:447-578](apps/glyphlab-reference/src/App.tsx#L447-L578)) that fully redraws on every relevant state change — background, grid, center guides, saved strokes, live tool previews.

**Glyph persistence** ([App.tsx:176-193](apps/glyphlab-reference/src/App.tsx#L176-L193))
Single `localStorage` key `"glyphlab-project"`, whole `GlyphMap` re-serialized on every change. No schema version, no migration, no per-glyph granularity, no IndexedDB (unlike this monorepo's own MUSIC app, which already uses IndexedDB for state).

**JSON import/export**
Export only — `exportGlyphs()` ([App.tsx:269-284](apps/glyphlab-reference/src/App.tsx#L269-L284)) downloads the raw `GlyphMap`. **There is no import path anywhere in the file.** If round-tripping matters for the new app, import has to be built from nothing, not ported.

**SVG export** ([App.tsx:244-267](apps/glyphlab-reference/src/App.tsx#L244-L267))
`exportSVG()` grabs the **already-rendered** `#glyph-page` DOM node and serializes it with `XMLSerializer` — a DOM-scrape, not a model-driven export. It is **not AxiDraw-safe as written**: no physical units (viewBox is arbitrary `0 0 1080 1920`, no mm/in), color is presentational (`#f5f5f5` stroke, needs override to plotter-neutral black), no path/travel optimization or stroke ordering, and it's coupled to whatever's on-screen at export time rather than being callable headlessly. The stroke styling itself (`fill="none"`, `round` caps/joins, one `<path>` per stroke) is a reasonable starting point for plotting. `exportPNG()` ([App.tsx:195-242](apps/glyphlab-reference/src/App.tsx#L195-L242)) rasterizes the same on-screen SVG onto a fixed 1080×1920 dark-background canvas — a social/specimen-preview export, irrelevant to plotting.

**Preview rendering** ([App.tsx:118-151](apps/glyphlab-reference/src/App.tsx#L118-L151), [727-813](apps/glyphlab-reference/src/App.tsx#L727-L813))
`buildPageRows()` word-wraps a text string by character count against `PAGE_CHARS_PER_LINE = 20`; the JSX return then walks rows/chars, computes a fixed grid cell (`PAGE_CELL_WIDTH=50`, `PAGE_LINE_HEIGHT=80`), looks up each character's glyph, scales it to fit an `PAGE_GLYPH_BOX=38` box (capped at 0.9×), and emits `<g transform="translate() scale()"><path/></g>`. Unknown characters fall back to a plain monospace `<text>` glyph. This is a full **typesetting engine** — word-wrap, fixed grid, reading order, font fallback — baked directly into JSX with no separation from rendering.

**Reusable UI components**: none exist. Character palette, tool switcher, canvas, textarea, and page preview are all inline JSX in one component tree; state is 100% local `useState`.

**Assumptions tied to A–Z / font construction**:
1. `CHARACTER_SET` ([App.tsx:35-41](apps/glyphlab-reference/src/App.tsx#L35-L41)) hardcodes A–Z/a–z/0–9/punctuation/space as the editable-slot palette.
2. Glyph identity is a literal Unicode character (`GlyphMap: Record<string, Glyph>`), not an abstract symbol id.
3. `currentChar === " "` is special-cased to disable drawing ([App.tsx:316-318](apps/glyphlab-reference/src/App.tsx#L316-L318)) — treats space as "no glyph," whereas in a musical system silence/rest is itself a meaningful unit that deserves its own glyph.
4. `compositionText` is a free-text string; `buildPageRows` wraps by word/character count — a linguistic reading-order model, not a beat/tempo-driven one.
5. Page layout is `rowText.split("")` — one glyph per code unit in a fixed-width grid — the "typeface" mental model, incompatible with duration-driven spacing, measures, or multi-voice stacking.
6. Missing-glyph fallback renders literal system-font `<text>` — a font-fallback concept with no musical analog.
7. Cosmetic but leaky: storage key, export filenames, and header copy ("Experimental Asemic Font System") are all glyphlab-branded.

---

## 1. Reusable modules

Portable near-verbatim, with only naming/config generalization:

- `Point`, `Stroke`, `Glyph`, `GlyphBounds` types ([App.tsx:3-26](apps/glyphlab-reference/src/App.tsx#L3-L26))
- `snap()` ([App.tsx:43-45](apps/glyphlab-reference/src/App.tsx#L43-L45))
- `getGlyphBounds()` ([App.tsx:47-79](apps/glyphlab-reference/src/App.tsx#L47-L79))
- `buildSmoothPathData()` ([App.tsx:81-116](apps/glyphlab-reference/src/App.tsx#L81-L116)) — the core stroke→SVG-path primitive; already fully decoupled from character semantics
- `getMousePos()` screen→canvas mapping logic ([App.tsx:294-313](apps/glyphlab-reference/src/App.tsx#L294-L313))
- The localStorage load/save `useEffect` pair ([App.tsx:176-193](apps/glyphlab-reference/src/App.tsx#L176-L193)) as a pattern for a generic persistence hook
- The draw/pen/erase pointer state machine ([App.tsx:315-445](apps/glyphlab-reference/src/App.tsx#L315-L445)), once the character-gate is removed
- The canvas paint-loop structure (clear → grid → guides → strokes → live preview, [App.tsx:447-578](apps/glyphlab-reference/src/App.tsx#L447-L578)), once colors/sizes are parameterized
- The blob+anchor download pattern shared by all three export functions — worth factoring into one `downloadBlob(content, filename, mime)` utility

## 2. Code that should remain reference-only

- The whole page/composition renderer — `buildPageRows()` + the layout JSX + `PAGE_CHARS_PER_LINE/CELL_WIDTH/LINE_HEIGHT/GLYPH_BOX` ([App.tsx:30-33](apps/glyphlab-reference/src/App.tsx#L30-L33), [118-151](apps/glyphlab-reference/src/App.tsx#L118-L151), [727-813](apps/glyphlab-reference/src/App.tsx#L727-L813)). Study the "sequence → positioned SVG groups" pattern only; a beat-first layout needs duration-driven placement, not word-wrap.
- `exportPNG()` ([App.tsx:195-242](apps/glyphlab-reference/src/App.tsx#L195-L242)) — specimen-sheet rasterizer, unrelated to the plotter pipeline.
- `exportSVG()`'s DOM-scrape approach ([App.tsx:244-267](apps/glyphlab-reference/src/App.tsx#L244-L267)) — instructive as the fastest possible export, but wrong shape for AxiDraw output (see findings above). Don't reuse the "grab `#glyph-page` from the DOM" strategy.
- Character-palette grid and tool-switcher JSX ([App.tsx:618-680](apps/glyphlab-reference/src/App.tsx#L618-L680)) — fine as interaction-affordance reference, but hardwired to `CHARACTER_SET`/string tool names; rebuild as parameterized components.
- The unused `"arc"` tool button — dead code, don't carry forward.
- `App.css`, `src/assets/*` — unused, do not copy.

## 3. Font-specific assumptions to remove

- `CHARACTER_SET` as the palette source of truth.
- `GlyphMap` keyed by literal Unicode character → needs to become `Record<GlyphId, Glyph>` where `GlyphId` is an abstract id minted by the mapping grammar, not a code point.
- `currentChar === " "` space-gate and the `" "` skip in page layout — silence must be a real, drawable musical unit, not a hardcoded no-op.
- `compositionText: string` + character-count word-wrap — replace with a sequence of musical units and beat/duration-driven layout.
- Literal-text fallback for unmapped glyphs — a beat-first system should flag an unmapped unit, not render a system-font character.
- Branding leaks (storage key, filenames, header copy) — parameterize before anything becomes a shared package.

**Per your instruction, I have not extended `CHARACTER_SET` or the alphabet model — this audit only inspects and categorizes the existing code.**

## 4. Reuse destination (no shared package)

Per approved decision (`14_GLYPH_AUDIO_Approved_Decisions.md`, item 18), no `packages/` directory is created for this implementation. All reusable logic below is copied directly into `music/src/`, not extracted into a shared package:

| Reusable logic | Destination inside `music/src/` | Notes |
|---|---|---|
| `Point`/`Stroke`/`Glyph`/`GlyphBounds` types, `snap`, `getGlyphBounds`, `buildSmoothPathData` | `music/src/data/glyphStrokeTypes.ts`, `music/src/logic/glyph/glyphStrokeGeometry.ts` | Zero React/DOM. |
| Pointer state machine, `getMousePos`, paint-loop hook | `music/src/ui/glyph/GlyphGrammarEditor.tsx` | Character-set gate removed; keyed by grammar/glyph id, not a Unicode character. |
| JSON persistence + schema validation | `music/src/logic/glyph/glyphCompositionPersistence.ts` | New — import doesn't exist in the reference. Persisted through `PlayProject`/`MUSIC_STATE_DB`, not a new store. |
| SVG export | `music/src/logic/glyph/glyphSvgExport.ts` | Pure `(LayoutDocument, RenderProfile, glyphs) → svgString`, AxiDraw-safe. Built new; only the download-utility portion of the reference's `exportSVG` carries over conceptually. |
| Character palette UI, `CHARACTER_SET`, text/page layout engine, PNG export | Not carried forward | Typography-only; left in `apps/glyphlab-reference/`, untouched. |
| Audio analysis, musical-unit model, mapping grammar, beat/measure layout | New, no precedent in the reference | See the consolidated implementation plan for the full design. |

If a genuine second consumer of this code ever appears outside MUSIC, extracting a shared package becomes a real, separately-scoped decision at that time — not before.

## 5. Minimal prototype architecture

```
audio analysis → musical units → mapping grammar → glyph generation → layout → SVG export
```

1. **Audio analysis** (new) — decode → onset/beat detection → tempo grid → `AudioEvent[]` (`{time, duration, velocity, timbreBucket?}`). This monorepo already has two relevant, non-overlapping precedents worth checking before building from scratch: the Python `audiolab/` toolchain ([audiolab/docs/AUDIO_ANALYSIS_FORMAT.md](audiolab/docs/AUDIO_ANALYSIS_FORMAT.md)) does track-level BPM/key/energy via librosa but not per-onset events; MUSIC's own `dspFeatureExtraction.ts` does TS-side onset-density/BPM-candidate detection. Neither currently emits an event-level onset list — that's genuinely new work either way, but the tempo/BPM detection code itself is reusable rather than reimplemented.
2. **Musical units** (new) — quantize `AudioEvent[]` against the tempo grid → `MusicalUnit[] = {id, startBeat, durationBeats, voice, intensity}`. Pure, independently testable.
3. **Mapping grammar** (new) — a declarative, user-customizable rule table `MusicalUnit → GlyphId` (by voice + duration bucket + intensity bucket). This is the direct analog of `CHARACTER_SET` but generalized from Unicode code points to musical-feature buckets — and it's the piece that makes the glyph language "reusable, customizable" per your stated goal.
4. **Glyph generation** (mostly reused) — the `Stroke`/`Glyph` model + canvas editor from §1, used to hand-draw/customize the mark for each `GlyphId` the grammar can emit. This is where glyphlab-reference is most directly useful.
5. **Layout** (new, replaces `buildPageRows`) — beat/time-driven placement of `(MusicalUnit, GlyphId)` pairs; positions come from `startBeat`×tempo, not character count. Reuse `getGlyphBounds`'s scale-to-box pattern, not the word-wrap.
6. **SVG export** (new) — pure `(placedGlyphs, pageConfig) → svgString`, monochrome, physical units, no DOM dependency; pen-lift/travel optimization can be a later pass.

## 6. Exact files to copy / extract / rewrite

**Copy near-verbatim** (generalize naming only):
`Point`/`Stroke`/`Glyph`/`GlyphBounds` types, `snap()`, `getGlyphBounds()`, `buildSmoothPathData()`, `getMousePos()` logic, the localStorage effects, `exportGlyphs()`'s download body — all in [App.tsx:1-313](apps/glyphlab-reference/src/App.tsx#L1-L313) region, plus [269-284](apps/glyphlab-reference/src/App.tsx#L269-L284).

**Extract and generalize** (restructure, not verbatim):
`GlyphMap` → `Record<GlyphId, Glyph>`; pointer-handler state machine ([App.tsx:315-445](apps/glyphlab-reference/src/App.tsx#L315-L445)) → hook keyed by abstract glyph id, drop the space-gate; canvas paint effect ([App.tsx:447-578](apps/glyphlab-reference/src/App.tsx#L447-L578)) → parameterized render hook; palette grid + tool switcher JSX ([App.tsx:618-680](apps/glyphlab-reference/src/App.tsx#L618-680)) → components driven by grammar-emitted ids, not `CHARACTER_SET`.

**Rewrite from scratch, reference-only**:
`CHARACTER_SET` ([App.tsx:35-41](apps/glyphlab-reference/src/App.tsx#L35-L41)) — delete; `buildPageRows()` + page-preview JSX + page constants ([App.tsx:30-33](apps/glyphlab-reference/src/App.tsx#L30-L33), [118-151](apps/glyphlab-reference/src/App.tsx#L118-L151), [727-813](apps/glyphlab-reference/src/App.tsx#L727-L813)) — study pattern only; `exportSVG()` ([App.tsx:244-267](apps/glyphlab-reference/src/App.tsx#L244-L267)) — reuse only the blob-download tail, rebuild the document-generation as a pure function; `exportPNG()` ([App.tsx:195-242](apps/glyphlab-reference/src/App.tsx#L195-L242)) — skip entirely unless a specimen-preview export is separately wanted.

**Do not copy**:
`App.css`, `src/assets/hero.png`, `src/assets/react.svg`, `src/assets/vite.svg` (unused template cruft), the dead `"arc"` tool button, `README.md` (generic Vite boilerplate).

No code was modified for this audit.
