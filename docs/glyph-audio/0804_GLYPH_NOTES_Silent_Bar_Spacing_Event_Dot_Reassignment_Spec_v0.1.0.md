# 0804D — Silent Bar Spacing and Event Dot Reassignment

## Context

0804C is complete. The full-duration pulse manuscript, continuous shared-endpoint mmmm paths, square/portrait fitting, drum-event layer, playback highlighting, persistence, and SVG export are working.

This build should not redesign that system. It should make one visual-language correction:

Bars should be represented silently through spacing, not dots.

The current white bar dots should be removed from the default manuscript because dots need to be reserved for actual audible events, especially drums and claps.

## Core grammar

```
pulse
= one hump

connected pulses
= continuous mmmm run

bar boundary
= small silent horizontal gap

phrase boundary
= larger silent horizontal gap

section boundary
= run break, larger gap, or row break according to existing section behavior

drum event
= dot-family mark

clap event
= future ring/halo-dot variant
```

No bar symbol should occupy the drum-event vocabulary.

## Required behavior

1. Change the default bar-boundary behavior from dot punctuation to spacing only.
2. Remove bar dots from the default preview and SVG export.
3. Preserve the exact pulse count.
4. Preserve continuous shared-endpoint hump construction inside each bar.
5. At each bar boundary, insert a deterministic horizontal gap without adding a pulse or event.
6. Keep phrase and section spacing visually larger than bar spacing.
7. Preserve row wrapping, section IDs, full-song coverage, and Fit Canvas behavior.
8. Keep drum dots fully independent and aligned to actual drum-event timestamps.
9. Do not reinterpret drum dots as bar markers.
10. Preserve preview/export parity.
11. Preserve deterministic cache behavior.
12. Keep the current playhead behavior unchanged.

## Recommended spacing hierarchy

```
base pulse spacing
= existing shared-endpoint continuity

bar gap
= 1.5x to 2x base spacing

phrase gap
= approximately 3x base spacing

section gap
= existing large gap / run break / row-break behavior
```

Use existing configuration fields where possible. If the current connection grammar already supports a gap boundary behavior, reuse it rather than introducing a parallel system.

Suggested defaults:

```
barBoundaryBehavior: "smallGap"
phraseBoundaryBehavior: "gap"
sectionBoundaryBehavior: "break"
silenceBoundaryBehavior: "extendedGap"
```

## Important visual rule

```
mmmm  mmmm  mmmm
```

not:

```
mmmm•mmmm•mmmm
```

Dots are now reserved for sound:

- tiny dot = light percussion / hat
- filled dot = stronger drum hit
- ring / halo dot = clap, deferred unless classification already exists
- large dot = accent / crash, deferred unless classification already exists

Do not add drum classification in this build unless the current analyzer already exposes it reliably. The immediate goal is only to reserve the visual vocabulary correctly.

## Diagnostics

- expected pulses
- generated arches
- placed arches
- visible arches
- bar boundaries
- inserted bar gaps
- drum events
- visible drum events
- overflowRight
- overflowBottom
- coverage

## Required invariants

```
expected pulses = generated arches = placed arches = visible arches
bar boundaries = inserted bar gaps
drum events = visible drum events
coverage = 100%
overflowBottom = 0
```

Do not silently drop pulses or drum events.

## Likely files

Data / config:
- music/src/data/glyphConnectionTypes.ts
- music/src/data/glyphCompositionTypes.ts only if the saved default changes require it

Logic:
- music/src/logic/glyph/continuousGlyphRuns.ts
- music/src/logic/glyph/fullCanvasLayout.ts
- music/src/logic/glyph/glyphSvgExport.ts
- related tests

Interface:
- music/src/ui/glyph/GlyphWorkspace.tsx
- music/src/ui/glyph/GlyphFullCanvasPreview.tsx
- music/src/ui/glyph/GlyphDiagnostics.tsx
- GlyphConnectionEditor or equivalent only if the bar-boundary control is exposed there

Build strictly:

Data → Logic → Interface

Do not modify:
- apps/glyphlab-reference/
- Looper files
- stem-library internals
- MAPS, itinerary, orb, overlay, vehicle, or unrelated render code
- packages/

## Corrections incorporated (pre-implementation review)

1. **Row count recomputation.** Once bar gaps increase real accumulated width, row wrapping may occur earlier and increase the number of rows. The auto-fit search must account for both horizontal and vertical effects of the inserted gaps — the old row count must not be preserved if real-width chunking produces more rows.
2. **Saved-composition compatibility.** `GlyphLayerVisibility.barPunctuation` must not be removed outright without migration handling — kept as an optional, deprecated field so a composition saved by 0804C still loads and type-checks; the UI toggle itself is removed.
3. **Segment boundary reason.** `startsNewSegment: boolean` alone is insufficient — accompanied by a `segmentBoundaryReason: "runStart" | "bar" | "phrase" | null` so diagnostics can count bar gaps specifically, support future phrase spacing, and avoid reverse-engineering intent from raw M commands.

## Approved behavior

The intended path construction: a bar boundary produces silent horizontal spacing and a fresh path segment (pen-lift), without creating a dot, stretched connector, extra pulse, or audible-event marker. The empty `<g id="bar-punctuation">` SVG group is kept for stable layer order (§23), though it contains no geometry.

## Completion report requirements

- files created/modified
- old versus new bar behavior
- real-track pulse and gap diagnostics
- drum-event visibility diagnostics
- tests and production build
- live verification
- SVG parity
- remaining limitations
- git status --short
